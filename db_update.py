#!/usr/bin/env python3

import psycopg2
from psycopg2 import sql
import argparse
import subprocess
import sys
import re
import logging
import os
import configparser
from contextlib import contextmanager
import time
from typing import Dict, List, Tuple, Any, Optional, Set

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger('db_update')


def format_table(data, headers, tablefmt='grid'):
    """Custom table formatting"""
    if not data:
        return "No data to display"
    
    # Calculate column widths
    col_widths = [len(str(header)) for header in headers]
    for row in data:
        for i, cell in enumerate(row):
            if i < len(col_widths):
                col_widths[i] = max(col_widths[i], len(str(cell)))
    
    # Create format string
    row_format = "|" + "|".join(" {{:<{}}} ".format(width) for width in col_widths) + "|"
    separator = "+" + "+".join("-" * (width + 2) for width in col_widths) + "+"
    
    # Build table
    result = []
    result.append(separator)
    result.append(row_format.format(*headers))
    result.append(separator)
    
    for row in data:
        formatted_row = [str(cell) if cell is not None else "" for cell in row]
        while len(formatted_row) < len(headers):
            formatted_row.append("")
        result.append(row_format.format(*formatted_row[:len(headers)]))
    
    result.append(separator)
    return "\n".join(result)


def load_config():
    """Load configuration from config file or environment variables"""
    config = {
        'DB_HOST': 'localhost',
        'DB_NAME': 'loot_tracking',
        'DB_USER': 'loot_user',
        'DB_PASSWORD': os.getenv('DB_PASSWORD'),
        'CONTAINER_FILTER': 'loot_db'
    }
    
    # Validate required environment variables
    if not config['DB_PASSWORD']:
        logger.error("DB_PASSWORD environment variable is not set")
        raise ValueError("DB_PASSWORD environment variable is required")

    # Try to load from config.ini file
    config_parser = configparser.ConfigParser()
    if os.path.exists('config.ini'):
        config_parser.read('config.ini')
        if 'Database' in config_parser:
            db_config = config_parser['Database']
            for key in config:
                if key in db_config:
                    config[key] = db_config[key]

    # Override with environment variables if available
    for key in config:
        env_value = os.environ.get(key)
        if env_value is not None:
            config[key] = env_value

    return config


def get_docker_container_ids(config):
    """Get IDs of all running containers matching the filter"""
    try:
        result = subprocess.run(['docker', 'ps', '--format', '{{.ID}}\t{{.Names}}'],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                universal_newlines=True, check=True)
        containers = []
        
        for line in result.stdout.split('\n'):
            if line and '\t' in line:
                parts = line.split('\t')
                if len(parts) >= 2:
                    container_id, name = parts[0], parts[1]
                    if config['CONTAINER_FILTER'] in name:
                        is_test = 'test' in name.lower()
                        containers.append((container_id, name, is_test))
                        
        return containers
    except subprocess.CalledProcessError as e:
        logger.error("Error running docker command: {}".format(e))
        return []
    except Exception as e:
        logger.error("Unexpected error in get_docker_container_ids: {}".format(e))
        return []


def get_container_port(container_id):
    """Get the mapped port for a container"""
    max_retries = 3
    retry_delay = 2

    for attempt in range(max_retries):
        try:
            result = subprocess.run(['docker', 'port', container_id, '5432'],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    universal_newlines=True, check=True)
            if result.stdout:
                port_match = re.search(r':(\d+)$', result.stdout.strip())
                if port_match:
                    return port_match.group(1)

            if attempt < max_retries - 1:
                logger.warning("Retry {}/{} getting port for container {}".format(
                    attempt + 1, max_retries, container_id))
                time.sleep(retry_delay)
        except subprocess.CalledProcessError as e:
            logger.error("Error getting port for container {}: {}".format(container_id, e))
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
        except Exception as e:
            logger.error("Unexpected error in get_container_port: {}".format(e))
            if attempt < max_retries - 1:
                time.sleep(retry_delay)

    return None


@contextmanager
def db_connection(host, port, dbname, user, password, connection_name="DB"):
    """Create a database connection with retries"""
    conn = None
    max_retries = 3
    retry_delay = 2

    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(
                host=host,
                port=port,
                dbname=dbname,
                user=user,
                password=password
            )
            logger.info("Connected to {} on port {}".format(connection_name, port))
            break
        except psycopg2.Error as e:
            logger.error("Attempt {}/{}: Unable to connect to {}: {}".format(
                attempt + 1, max_retries, connection_name, e))
            if attempt < max_retries - 1:
                logger.info("Retrying in {} seconds...".format(retry_delay))
                time.sleep(retry_delay)

    if conn is None:
        logger.error("Failed to connect to {} after {} attempts".format(connection_name, max_retries))
        yield None
    else:
        try:
            yield conn
        finally:
            conn.close()
            logger.debug("Closed connection to {}".format(connection_name))


class DatabaseStructure:
    """Class to represent and compare database structures"""
    
    def __init__(self, conn):
        self.tables = {}
        self.indexes = {}
        self.column_details = {}
        self._load_structure(conn)
    
    def _load_structure(self, conn):
        """Load database structure from connection"""
        try:
            with conn.cursor() as cur:
                # Get tables and columns with proper array type handling
                cur.execute("""
                    SELECT table_name, column_name, ordinal_position,
                           CASE 
                               WHEN data_type = 'ARRAY' THEN 
                                   COALESCE(
                                       (SELECT CASE 
                                           WHEN et.typname = 'int4' THEN 'integer[]'
                                           WHEN et.typname = 'int8' THEN 'bigint[]'
                                           WHEN et.typname = 'varchar' THEN 'character varying[]'
                                           WHEN et.typname = 'text' THEN 'text[]'
                                           WHEN et.typname = 'numeric' THEN 'numeric[]'
                                           WHEN et.typname = 'bpchar' THEN 'character[]'
                                           ELSE et.typname || '[]'
                                       END
                                       FROM pg_type t
                                       JOIN pg_type et ON t.typelem = et.oid
                                       WHERE t.typname = replace(c.udt_name, '_', '')),
                                       'integer[]'
                                   )
                               ELSE data_type 
                           END as data_type,
                           is_nullable, column_default,
                           character_maximum_length, numeric_precision, numeric_scale
                    FROM information_schema.columns c
                    WHERE table_schema = 'public'
                    ORDER BY table_name, ordinal_position
                """)
                
                for row in cur.fetchall():
                    table, column, position, data_type, nullable, default, char_len, num_prec, num_scale = row
                    
                    if table not in self.tables:
                        self.tables[table] = []
                        self.column_details[table] = {}
                    
                    # Build column definition
                    col_def = self._build_column_definition(data_type, char_len, num_prec, num_scale)
                    
                    self.tables[table].append((position, column, col_def))
                    self.column_details[table][column] = {
                        'data_type': data_type,
                        'nullable': nullable,
                        'default': default,
                        'position': position,
                        'full_definition': col_def
                    }
                
                # Sort columns by position to ensure consistent ordering
                for table in self.tables:
                    self.tables[table].sort(key=lambda x: x[0])  # Sort by position
                    self.tables[table] = [(col, dtype) for pos, col, dtype in self.tables[table]]  # Remove position

                # Get indexes
                cur.execute("""
                    SELECT tablename, indexname, indexdef
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                    AND indexname NOT LIKE '%_pkey'
                    ORDER BY tablename, indexname
                """)
                for table, index, indexdef in cur.fetchall():
                    if table not in self.indexes:
                        self.indexes[table] = []
                    self.indexes[table].append((index, indexdef))
                    
        except psycopg2.Error as e:
            logger.error("Error fetching database structure: {}".format(e))
    
    def _build_column_definition(self, data_type, char_len, num_prec, num_scale):
        """Build complete column definition with proper precision handling"""
        col_def = data_type
        
        if data_type in ('character varying', 'varchar', 'char', 'character'):
            if char_len:
                col_def += "({})".format(char_len)
        elif data_type in ('numeric', 'decimal'):
            if num_prec and num_scale:
                col_def += "({},{})".format(num_prec, num_scale)
            elif num_prec:
                col_def += "({})".format(num_prec)
        elif data_type in ('time', 'timestamp', 'timestamptz', 'interval'):
            if num_prec:
                col_def += "({})".format(num_prec)
        
        return col_def


class StructureComparison:
    """Compare two database structures and generate fixes"""
    
    def __init__(self, master: DatabaseStructure, copy: DatabaseStructure):
        self.master = master
        self.copy = copy
        self.differences = self._compare()
    
    def _compare(self):
        """Compare structures and identify differences"""
        differences = {
            'missing_tables': [],
            'missing_columns': {},
            'column_order_issues': {},
            'missing_indexes': {},
            'extra_indexes': {}
        }

        # Check for missing tables
        for table in self.master.tables:
            if table not in self.copy.tables:
                differences['missing_tables'].append(table)

        # Check for missing columns and column order issues
        for table in self.master.tables:
            if table in self.copy.tables:
                master_columns = [col for col, _ in self.master.tables[table]]
                copy_columns = [col for col, _ in self.copy.tables[table]]
                
                # Check for missing columns
                missing_cols = []
                for col, dtype in self.master.tables[table]:
                    if col not in copy_columns:
                        missing_cols.append((col, dtype))
                
                if missing_cols:
                    differences['missing_columns'][table] = missing_cols
                
                # Check column order
                if master_columns != copy_columns and set(master_columns) == set(copy_columns):
                    differences['column_order_issues'][table] = {
                        'master_order': master_columns,
                        'copy_order': copy_columns
                    }

        # Check indexes
        for table in self.master.indexes:
            master_indexes = {idx_name: idx_def for idx_name, idx_def in self.master.indexes[table]}
            copy_indexes = {}
            if table in self.copy.indexes:
                copy_indexes = {idx_name: idx_def for idx_name, idx_def in self.copy.indexes[table]}
            
            # Missing indexes
            missing_idxs = []
            for idx_name, idx_def in master_indexes.items():
                if idx_name not in copy_indexes:
                    missing_idxs.append((idx_name, idx_def))
            if missing_idxs:
                differences['missing_indexes'][table] = missing_idxs
                
            # Extra indexes
            extra_idxs = []
            for idx_name, idx_def in copy_indexes.items():
                if idx_name not in master_indexes:
                    extra_idxs.append((idx_name, idx_def))
            if extra_idxs:
                differences['extra_indexes'][table] = extra_idxs

        return differences
    
    def has_differences(self):
        """Check if there are any structural differences"""
        return any([
            self.differences['missing_tables'],
            self.differences['missing_columns'],
            self.differences['column_order_issues'],
            self.differences['missing_indexes'],
            self.differences['extra_indexes']
        ])
    
    def generate_fix_sql(self):
        """Generate SQL to fix structural differences"""
        sql_statements = []
        
        # Create missing tables
        for table in self.differences['missing_tables']:
            columns = self.master.tables.get(table, [])
            column_definitions = []
            
            for column, data_type in columns:
                col_info = self.master.column_details[table][column]
                quoted_column = '"{}"'.format(column)
                col_def = "{} {}".format(quoted_column, col_info['full_definition'])
                
                if col_info['nullable'] == 'NO':
                    col_def += " NOT NULL"
                if col_info['default']:
                    col_def += " DEFAULT {}".format(self._format_default(col_info['default']))
                    
                column_definitions.append(col_def)

            quoted_table = '"{}"'.format(table)
            sql_statements.append(
                "CREATE TABLE {} ({});".format(quoted_table, ', '.join(column_definitions))
            )

        # Add missing columns
        for table, columns in self.differences['missing_columns'].items():
            for column, data_type in columns:
                col_info = self.master.column_details[table][column]
                quoted_table = '"{}"'.format(table)
                quoted_column = '"{}"'.format(column)
                col_def = col_info['full_definition']
                
                if col_info['nullable'] == 'NO':
                    col_def += " NOT NULL"
                if col_info['default']:
                    col_def += " DEFAULT {}".format(self._format_default(col_info['default']))
                    
                sql_statements.append(
                    "ALTER TABLE {} ADD COLUMN {} {};".format(quoted_table, quoted_column, col_def)
                )
        
        # Fix column order issues
        for table, order_info in self.differences['column_order_issues'].items():
            master_order = order_info['master_order']
            copy_order = order_info['copy_order']
            
            logger.info("Fixing column order for table {}: {} -> {}".format(
                table, copy_order, master_order))
            
            # Generate SQL to reorder columns by recreating table
            reorder_sql = self._generate_column_reorder_sql(table, master_order)
            sql_statements.extend(reorder_sql)

        # Drop extra indexes
        for table, indexes in self.differences['extra_indexes'].items():
            for idx_name, idx_def in indexes:
                quoted_idx = '"{}"'.format(idx_name)
                sql_statements.append("DROP INDEX IF EXISTS {};".format(quoted_idx))

        # Create missing indexes with syntax fix
        for table, indexes in self.differences['missing_indexes'].items():
            for idx_name, idx_def in indexes:
                # Fix index name syntax - ensure proper underscore placement
                fixed_idx_def = idx_def
                if 'idx"' in idx_def:
                    # Fix pattern like idx"table"_name to idx_"table"_name
                    fixed_idx_def = idx_def.replace('idx"', 'idx_"')
                
                if 'CREATE INDEX' in fixed_idx_def and 'IF NOT EXISTS' not in fixed_idx_def:
                    fixed_idx_def = fixed_idx_def.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS', 1)
                elif 'CREATE UNIQUE INDEX' in fixed_idx_def and 'IF NOT EXISTS' not in fixed_idx_def:
                    fixed_idx_def = fixed_idx_def.replace('CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX IF NOT EXISTS', 1)
                sql_statements.append("{};".format(fixed_idx_def))

        return sql_statements
    
    def _generate_column_reorder_sql(self, table, master_order):
        """Generate SQL to reorder columns by recreating the table"""
        sql_statements = []
        quoted_table = '"{}"'.format(table)
        temp_table = '"{}"'.format(table + '_temp_reorder')
        old_table = '"{}"'.format(table + '_old')
        
        # Step 1: Get foreign key dependencies (both incoming and outgoing)
        incoming_fks = self._get_incoming_foreign_keys(table)
        outgoing_fks = self._get_outgoing_foreign_keys(table)
        
        # Step 2: Drop incoming foreign key constraints (other tables referencing this one)
        for fk in incoming_fks:
            sql_statements.append(
                "ALTER TABLE \"{}\" DROP CONSTRAINT IF EXISTS \"{}\";".format(
                    fk['table'], fk['constraint_name']
                )
            )
        
        # Step 3: Get current table definition for recreation
        column_definitions = []
        for column in master_order:
            if column in self.master.column_details[table]:
                col_info = self.master.column_details[table][column]
                quoted_column = '"{}"'.format(column)
                col_def = "{} {}".format(quoted_column, col_info['full_definition'])
                
                if col_info['nullable'] == 'NO':
                    col_def += " NOT NULL"
                if col_info['default']:
                    col_def += " DEFAULT {}".format(self._format_default(col_info['default']))
                    
                column_definitions.append(col_def)
        
        # Step 4: Create new table with correct column order
        sql_statements.append(
            "CREATE TABLE {} ({});".format(temp_table, ', '.join(column_definitions))
        )
        
        # Step 5: Copy data preserving all values including serials
        quoted_columns = []
        for column in master_order:
            if column in self.master.column_details[table]:
                quoted_columns.append('"{}"'.format(column))
        
        columns_list = ', '.join(quoted_columns)
        sql_statements.append(
            "INSERT INTO {} ({}) SELECT {} FROM {};".format(
                temp_table, columns_list, columns_list, quoted_table
            )
        )
        
        # Step 6: Get and preserve sequence values for