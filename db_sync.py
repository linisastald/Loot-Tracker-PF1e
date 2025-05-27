#!/usr/bin/env python3

import psycopg2
from psycopg2 import sql
import subprocess
import sys
import re
import logging
import os
import configparser
from contextlib import contextmanager
import time
import json
from datetime import datetime
from typing import Dict, List, Tuple, Any, Optional, Set

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger('db_sync')

class DatabaseSync:
    def __init__(self, config):
        self.config = config
        self.lookup_tables = {
            'impositions': {'key_fields': ['name'], 'id_field': 'id'},
            'item': {'key_fields': ['name', 'type'], 'id_field': 'id'},
            'min_caster_levels': {'key_fields': ['spell_level', 'item_type'], 'id_field': None},
            'min_costs': {'key_fields': ['spell_level'], 'id_field': None},
            'mod': {'key_fields': ['name', 'type'], 'id_field': 'id'},
            'spells': {'key_fields': ['name'], 'id_field': 'id'},
            'weather_regions': {'key_fields': ['region_name'], 'id_field': None}
        }
        
        # Tables that contribute data back to master (excluding test)
        self.contributing_tables = ['item', 'mod']
        
        # Tables that reference item/mod IDs
        self.reference_tables = {
            'loot': {
                'itemid': 'item',
                'modids': 'mod'  # Array field
            }
        }

    def load_config(self):
        """Load configuration from config file or environment variables"""
        config = {
            'DB_HOST': 'localhost',
            'DB_NAME': 'loot_tracking',
            'DB_USER': 'loot_user',
            'DB_PASSWORD': 'g5Zr7!cXw@2sP9Lk',
            'MASTER_PORT': 5432,
            'CONTAINER_FILTER': 'loot_db'
        }

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

    def get_docker_containers(self):
        """Get Docker containers matching the filter"""
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
                        if self.config['CONTAINER_FILTER'] in name:
                            is_test = 'test' in name.lower()
                            containers.append((container_id, name, is_test))
                            
            return containers
        except subprocess.CalledProcessError as e:
            logger.error(f"Error running docker command: {e}")
            return []

    def get_container_port(self, container_id):
        """Get the mapped port for a container"""
        try:
            result = subprocess.run(['docker', 'port', container_id, '5432'],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    universal_newlines=True, check=True)
            if result.stdout:
                port_match = re.search(r':(\d+)$', result.stdout.strip())
                if port_match:
                    return port_match.group(1)
        except subprocess.CalledProcessError as e:
            logger.error(f"Error getting port for container {container_id}: {e}")
        return None

    @contextmanager
    def db_connection(self, host, port, dbname, user, password, connection_name="DB"):
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
                logger.info(f"Connected to {connection_name} on port {port}")
                break
            except psycopg2.Error as e:
                logger.error(f"Attempt {attempt + 1}/{max_retries}: Unable to connect to {connection_name}: {e}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)

        if conn is None:
            logger.error(f"Failed to connect to {connection_name} after {max_retries} attempts")
            yield None
        else:
            try:
                yield conn
            finally:
                conn.close()

    def backup_database(self, conn, backup_name):
        """Create a backup of the database"""
        try:
            backup_file = f"backup_{backup_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
            
            # Use pg_dump via subprocess
            dump_cmd = [
                'pg_dump',
                '-h', self.config['DB_HOST'],
                '-p', str(self.config['MASTER_PORT']),
                '-U', self.config['DB_USER'],
                '-d', self.config['DB_NAME'],
                '-f', backup_file,
                '--no-password'
            ]
            
            # Set password in environment
            env = os.environ.copy()
            env['PGPASSWORD'] = self.config['DB_PASSWORD']
            
            result = subprocess.run(dump_cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
            
            if result.returncode == 0:
                logger.info(f"Database backup created: {backup_file}")
                return backup_file
            else:
                logger.error(f"Backup failed: {result.stderr}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating backup: {e}")
            return None

    def get_database_structure(self, conn):
        """Get complete database structure"""
        structure = {'tables': {}, 'indexes': {}, 'column_details': {}}

        try:
            with conn.cursor() as cur:
                # Get tables and columns with detailed information
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
                    
                    if table not in structure['tables']:
                        structure['tables'][table] = []
                        structure['column_details'][table] = {}
                    
                    # Build column definition
                    col_def = self._build_column_definition(data_type, char_len, num_prec, num_scale)
                    
                    structure['tables'][table].append((position, column, col_def))
                    structure['column_details'][table][column] = {
                        'data_type': data_type,
                        'nullable': nullable,
                        'default': default,
                        'position': position,
                        'full_definition': col_def
                    }
                
                # Sort columns by position and remove position info
                for table in structure['tables']:
                    structure['tables'][table].sort(key=lambda x: x[0])
                    structure['tables'][table] = [(col, dtype) for pos, col, dtype in structure['tables'][table]]

                # Get indexes
                cur.execute("""
                    SELECT tablename, indexname, indexdef
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                    AND indexname NOT LIKE '%_pkey'
                    ORDER BY tablename, indexname
                """)
                for table, index, indexdef in cur.fetchall():
                    if table not in structure['indexes']:
                        structure['indexes'][table] = []
                    structure['indexes'][table].append((index, indexdef))
                    
        except psycopg2.Error as e:
            logger.error(f"Error fetching database structure: {e}")

        return structure

    def _build_column_definition(self, data_type, char_len, num_prec, num_scale):
        """Build complete column definition with proper precision handling"""
        col_def = data_type
        
        if data_type in ('character varying', 'varchar', 'char', 'character'):
            if char_len:
                col_def += f"({char_len})"
        elif data_type in ('numeric', 'decimal'):
            if num_prec and num_scale:
                col_def += f"({num_prec},{num_scale})"
            elif num_prec:
                col_def += f"({num_prec})"
        elif data_type in ('time', 'timestamp', 'timestamptz', 'interval'):
            if num_prec:
                col_def += f"({num_prec})"
        
        return col_def

    def compare_structures(self, master_structure, copy_structure):
        """Compare database structures and generate SQL fixes"""
        differences = {
            'missing_tables': [],
            'missing_columns': {},
            'column_order_issues': {},
            'missing_indexes': {},
            'extra_indexes': {}
        }

        # Check for missing tables
        for table in master_structure['tables']:
            if table not in copy_structure['tables']:
                differences['missing_tables'].append(table)

        # Check for missing columns and order issues
        for table in master_structure['tables']:
            if table in copy_structure['tables']:
                master_columns = [col for col, _ in master_structure['tables'][table]]
                copy_columns = [col for col, _ in copy_structure['tables'][table]]
                
                # Missing columns
                missing_cols = []
                for col, dtype in master_structure['tables'][table]:
                    if col not in copy_columns:
                        missing_cols.append((col, dtype))
                
                if missing_cols:
                    differences['missing_columns'][table] = missing_cols
                
                # Column order issues
                if master_columns != copy_columns and set(master_columns) == set(copy_columns):
                    differences['column_order_issues'][table] = {
                        'master_order': master_columns,
                        'copy_order': copy_columns
                    }

        # Check indexes
        for table in master_structure['indexes']:
            master_indexes = {idx_name: idx_def for idx_name, idx_def in master_structure['indexes'][table]}
            copy_indexes = {}
            if table in copy_structure['indexes']:
                copy_indexes = {idx_name: idx_def for idx_name, idx_def in copy_structure['indexes'][table]}
            
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

    def generate_structure_sql(self, differences, master_structure):
        """Generate SQL to fix structural differences"""
        sql_statements = []
        
        # Create missing tables
        for table in differences['missing_tables']:
            columns = master_structure['tables'].get(table, [])
            column_definitions = []
            
            for column, data_type in columns:
                col_info = master_structure['column_details'][table][column]
                quoted_column = f'"{column}"'
                col_def = f"{quoted_column} {col_info['full_definition']}"
                
                if col_info['nullable'] == 'NO':
                    col_def += " NOT NULL"
                if col_info['default']:
                    col_def += f" DEFAULT {self._format_default(col_info['default'])}"
                    
                column_definitions.append(col_def)

            quoted_table = f'"{table}"'
            sql_statements.append(f"CREATE TABLE {quoted_table} ({', '.join(column_definitions)});")

        # Add missing columns
        for table, columns in differences['missing_columns'].items():
            for column, data_type in columns:
                col_info = master_structure['column_details'][table][column]
                quoted_table = f'"{table}"'
                quoted_column = f'"{column}"'
                col_def = col_info['full_definition']
                
                if col_info['nullable'] == 'NO':
                    col_def += " NOT NULL"
                if col_info['default']:
                    col_def += f" DEFAULT {self._format_default(col_info['default'])}"
                    
                sql_statements.append(f"ALTER TABLE {quoted_table} ADD COLUMN {quoted_column} {col_def};")

        # Drop extra indexes
        for table, indexes in differences['extra_indexes'].items():
            for idx_name, idx_def in indexes:
                quoted_idx = f'"{idx_name}"'
                sql_statements.append(f"DROP INDEX IF EXISTS {quoted_idx};")

        # Create missing indexes
        for table, indexes in differences['missing_indexes'].items():
            for idx_name, idx_def in indexes:
                if 'CREATE INDEX' in idx_def and 'IF NOT EXISTS' not in idx_def:
                    idx_def = idx_def.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS', 1)
                elif 'CREATE UNIQUE INDEX' in idx_def and 'IF NOT EXISTS' not in idx_def:
                    idx_def = idx_def.replace('CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX IF NOT EXISTS', 1)
                sql_statements.append(f"{idx_def};")

        return sql_statements

    def _format_default(self, default_val):
        """Format default values for SQL statements"""
        if default_val.startswith('nextval('):
            return default_val
        elif default_val.upper() in ('CURRENT_TIMESTAMP', 'NOW()'):
            return default_val
        elif '::' in default_val:
            return default_val
        elif default_val.startswith('ARRAY['):
            return default_val
        elif default_val.startswith("'") and default_val.endswith("'"):
            return default_val
        elif default_val.replace('.', '').replace('-', '').isdigit():
            return default_val
        else:
            return f"'{default_val.replace(chr(39), chr(39)+chr(39))}'"

    def get_table_data(self, conn, table):
        """Get all data from a table"""
        try:
            with conn.cursor() as cur:
                quoted_table = f'"{table}"'
                cur.execute(f"SELECT * FROM {quoted_table}")
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()
                return columns, rows
        except psycopg2.Error as e:
            logger.error(f"Error fetching data from table {table}: {e}")
            return [], []

    def build_lookup_key(self, row_dict, table):
        """Build a lookup key for a table row based on key fields"""
        key_fields = self.lookup_tables[table]['key_fields']
        key_values = []
        
        for field in key_fields:
            value = row_dict.get(field)
            if value is None:
                key_values.append('NULL')
            else:
                key_values.append(str(value))
        
        return '|'.join(key_values)

    def find_new_rows(self, master_data, copy_data, table):
        """Find rows in copy that don't exist in master"""
        master_columns, master_rows = master_data
        copy_columns, copy_rows = copy_data
        
        # Build master lookup
        master_lookup = {}
        for row in master_rows:
            row_dict = dict(zip(master_columns, row))
            lookup_key = self.build_lookup_key(row_dict, table)
            master_lookup[lookup_key] = row_dict
        
        # Find new rows in copy
        new_rows = []
        for row in copy_rows:
            row_dict = dict(zip(copy_columns, row))
            lookup_key = self.build_lookup_key(row_dict, table)
            
            if lookup_key not in master_lookup:
                # Reorder to match master column order
                reordered_row = []
                for col in master_columns:
                    reordered_row.append(row_dict.get(col))
                new_rows.append(tuple(reordered_row))
        
        return new_rows

    def generate_insert_sql(self, table, columns, rows):
        """Generate INSERT statements for new rows"""
        if not rows:
            return []

        # Check if this table has an auto-generated ID field
        exclude_id = table in self.lookup_tables and self.lookup_tables[table]['id_field']
        
        # Filter out ID column if it's auto-generated
        if exclude_id:
            id_field = self.lookup_tables[table]['id_field']
            insert_columns = [col for col in columns if col != id_field]
        else:
            insert_columns = columns

        sql_statements = []
        quoted_table = f'"{table}"'
        quoted_columns = [f'"{col}"' for col in insert_columns]
        column_names = ', '.join(quoted_columns)
        
        for row in rows:
            # Build values excluding ID if auto-generated
            if exclude_id:
                id_field = self.lookup_tables[table]['id_field']
                id_index = columns.index(id_field)
                values_data = [val for i, val in enumerate(row) if i != id_index]
            else:
                values_data = row
                
            values = []
            for val in values_data:
                if val is None:
                    values.append("NULL")
                elif isinstance(val, str):
                    values.append(f"'{val.replace(chr(39), chr(39)+chr(39))}'")
                elif isinstance(val, dict):
                    # Handle JSON/JSONB fields
                    json_str = json.dumps(val).replace(chr(39), chr(39)+chr(39))
                    values.append(f"'{json_str}'")
                elif isinstance(val, (datetime, time.struct_time)):
                    # Handle datetime objects
                    if hasattr(val, 'isoformat'):
                        values.append(f"'{val.isoformat()}'")
                    else:
                        values.append(f"'{str(val)}'")
                elif isinstance(val, list):
                    # Handle PostgreSQL arrays
                    array_elements = []
                    for element in val:
                        if element is None:
                            array_elements.append("NULL")
                        elif isinstance(element, str):
                            array_elements.append(f"'{element.replace(chr(39), chr(39)+chr(39))}'")
                        else:
                            array_elements.append(str(element))
                    values.append(f"ARRAY[{', '.join(array_elements)}]")
                elif isinstance(val, bool):
                    values.append(str(val).upper())
                else:
                    values.append(str(val))
            
            values_str = ', '.join(values)
            sql_statements.append(f"INSERT INTO {quoted_table} ({column_names}) VALUES ({values_str});")
        
        return sql_statements

    def collect_id_mappings_individual(self, conn, table, columns, new_rows, insert_sql):
        """Execute inserts individually and collect ID mappings for tables with generated IDs"""
        id_mappings = {}
        
        if table not in self.lookup_tables or not self.lookup_tables[table]['id_field']:
            return id_mappings
        
        id_field = self.lookup_tables[table]['id_field']
        
        try:
            with conn:
                with conn.cursor() as cur:
                    for i, sql_stmt in enumerate(insert_sql):
                        # Execute insert and get the new ID
                        sql_without_semicolon = sql_stmt.rstrip(';')
                        cur.execute(sql_without_semicolon + f" RETURNING {id_field}")
                        new_id = cur.fetchone()[0]
                        
                        # Get the old ID from the original row
                        if i < len(new_rows):
                            old_row = new_rows[i]
                            old_row_dict = dict(zip(columns, old_row))
                            if id_field in old_row_dict and old_row_dict[id_field] is not None:
                                old_id = old_row_dict[id_field]
                                id_mappings[old_id] = new_id
                                logger.debug(f"ID mapping: {table}.{old_id} -> {new_id}")
                                
        except psycopg2.Error as e:
            logger.error(f"Error collecting ID mappings for {table}: {e}")
            
        return id_mappings

    def collect_id_mappings(self, conn, table, new_rows_with_columns, insert_sql):
        """Execute inserts and collect ID mappings for tables with generated IDs"""
        id_mappings = {}
        
        if table not in self.lookup_tables or not self.lookup_tables[table]['id_field']:
            return id_mappings
        
        id_field = self.lookup_tables[table]['id_field']
        columns, rows = new_rows_with_columns
        
        try:
            with conn.cursor() as cur:
                for i, sql_stmt in enumerate(insert_sql):
                    # Execute insert and get the new ID
                    cur.execute(sql_stmt + f" RETURNING {id_field}")
                    new_id = cur.fetchone()[0]
                    
                    # Get the old ID from the original row
                    if i < len(rows):
                        old_row = rows[i]
                        old_row_dict = dict(zip(columns, old_row))
                        if id_field in old_row_dict and old_row_dict[id_field] is not None:
                            old_id = old_row_dict[id_field]
                            id_mappings[old_id] = new_id
                            logger.debug(f"ID mapping: {table}.{old_id} -> {new_id}")
                            
        except psycopg2.Error as e:
            logger.error(f"Error collecting ID mappings for {table}: {e}")
            
        return id_mappings

    def update_references(self, conn, id_mappings, table_type):
        """Update references to changed IDs"""
        if table_type not in self.reference_tables:
            return []
        
        sql_statements = []
        reference_info = self.reference_tables[table_type]
        
        try:
            with conn.cursor() as cur:
                for ref_table, ref_mapping in reference_info.items():
                    for ref_column, ref_table_name in ref_mapping.items():
                        if ref_table_name == table_type and id_mappings:
                            if ref_column.endswith('s'):  # Array field like modids
                                # Update array references
                                for old_id, new_id in id_mappings.items():
                                    update_sql = f"""
                                        UPDATE "{ref_table}" 
                                        SET "{ref_column}" = array_replace("{ref_column}", {old_id}, {new_id})
                                        WHERE {old_id} = ANY("{ref_column}")
                                    """
                                    sql_statements.append(update_sql)
                            else:
                                # Update single ID references
                                for old_id, new_id in id_mappings.items():
                                    update_sql = f"""
                                        UPDATE "{ref_table}" 
                                        SET "{ref_column}" = {new_id}
                                        WHERE "{ref_column}" = {old_id}
                                    """
                                    sql_statements.append(update_sql)
                                    
        except psycopg2.Error as e:
            logger.error(f"Error updating references for {table_type}: {e}")
            
        return sql_statements

    def sync_lookup_data(self, master_conn, copy_conn, table):
        """Synchronize lookup table data from master to copy"""
        master_data = self.get_table_data(master_conn, table)
        copy_data = self.get_table_data(copy_conn, table)
        
        if not master_data[0]:  # No columns
            return []
        
        # Build copy lookup
        copy_columns, copy_rows = copy_data
        copy_lookup = set()
        
        for row in copy_rows:
            row_dict = dict(zip(copy_columns, row))
            lookup_key = self.build_lookup_key(row_dict, table)
            copy_lookup.add(lookup_key)
        
        # Find missing rows in copy
        master_columns, master_rows = master_data
        missing_rows = []
        
        for row in master_rows:
            row_dict = dict(zip(master_columns, row))
            lookup_key = self.build_lookup_key(row_dict, table)
            
            if lookup_key not in copy_lookup:
                missing_rows.append(row)
        
        if missing_rows:
            logger.info(f"Found {len(missing_rows)} missing rows in {table}")
            return self.generate_insert_sql(table, master_columns, missing_rows)
        
        return []

    def format_summary_table(self, data, headers):
        """Format summary data as a table"""
        if not data:
            return "No changes found"
        
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

    def execute_sql_transaction(self, conn, sql_statements, description, dry_run=False):
        if not sql_statements:
            logger.info(f"No {description} changes to execute")
            return True
        
        if dry_run:
            logger.info(f"DRY RUN - Would execute {len(sql_statements)} {description} statements:")
            for i, statement in enumerate(sql_statements, 1):
                logger.info(f"  {i}. {statement}")
            return True
            
        try:
            with conn:
                with conn.cursor() as cur:
                    logger.info(f"Executing {len(sql_statements)} {description} statements...")
                    for i, statement in enumerate(sql_statements, 1):
                        logger.debug(f"Executing {i}/{len(sql_statements)}: {statement[:100]}...")
                        cur.execute(statement)
                    
                    logger.info(f"Successfully executed {len(sql_statements)} {description} statements")
                    return True
                    
        except psycopg2.Error as e:
            logger.error(f"Error executing {description}: {e}")
            logger.error("Transaction rolled back")
            return False

    def synchronize_databases(self, dry_run=False):
        """Main synchronization logic"""
        config = self.load_config()
        self.config = config
        
        # Password validation removed - using hardcoded fallback from config

        # Get Docker containers
        containers = self.get_docker_containers()
        if not containers:
            logger.warning("No matching Docker containers found")
            return True

        logger.info(f"Found {len(containers)} containers to synchronize")
        
        # Initialize summary tracking for dry run
        if dry_run:
            structure_summary = {}
            data_summary = {}
            lookup_summary = {}
            container_names = [name for _, name, _ in containers]
        
        # Connect to master database
        with self.db_connection(config['DB_HOST'], config['MASTER_PORT'], config['DB_NAME'],
                               config['DB_USER'], config['DB_PASSWORD'], "Master DB") as master_conn:
            if not master_conn:
                logger.error("Failed to connect to master database")
                return False

            # Create master backup (skip in dry run)
            if not dry_run:
                backup_file = self.backup_database(master_conn, "master")
                if not backup_file:
                    logger.error("Failed to create master backup")
                    return False
            else:
                logger.info("DRY RUN - Would create master database backup")

            # Get master structure
            master_structure = self.get_database_structure(master_conn)
            
            # Phase 1: Structure synchronization
            logger.info("\n=== Phase 1: Structure Synchronization ===")
            
            for container_id, container_name, is_test in containers:
                logger.info(f"\nProcessing container: {container_name} ({'TEST' if is_test else 'PRODUCTION'})")
                
                container_port = self.get_container_port(container_id)
                if not container_port:
                    logger.error(f"Unable to get port for {container_name}")
                    continue

                with self.db_connection(config['DB_HOST'], container_port, config['DB_NAME'],
                                       config['DB_USER'], config['DB_PASSWORD'], 
                                       f"Copy DB ({container_name})") as copy_conn:
                    if not copy_conn:
                        continue

                    # Compare structures
                    copy_structure = self.get_database_structure(copy_conn)
                    differences = self.compare_structures(master_structure, copy_structure)
                    
                    # Track structure changes for dry run summary
                    if dry_run:
                        for table in set(list(differences['missing_tables']) + 
                                        list(differences['missing_columns'].keys()) + 
                                        list(differences['missing_indexes'].keys()) + 
                                        list(differences['extra_indexes'].keys())):
                            if table not in structure_summary:
                                structure_summary[table] = {'master': 'n/a'}
                            
                            changes = []
                            if table in differences['missing_tables']:
                                changes.append('table missing')
                            if table in differences['missing_columns']:
                                changes.append(f"{len(differences['missing_columns'][table])} columns added")
                            if table in differences['missing_indexes']:
                                changes.append(f"{len(differences['missing_indexes'][table])} indexes added")
                            if table in differences['extra_indexes']:
                                changes.append(f"{len(differences['extra_indexes'][table])} indexes removed")
                            
                            structure_summary[table][container_name] = ', '.join(changes) if changes else 'no changes'
                    
                    # Generate and execute structure fixes
                    structure_sql = self.generate_structure_sql(differences, master_structure)
                    if structure_sql:
                        if not dry_run:
                            logger.info(f"Applying {len(structure_sql)} structural changes to {container_name}")
                        if not self.execute_sql_transaction(copy_conn, structure_sql, "structural", dry_run):
                            logger.error(f"Failed to apply structural changes to {container_name}")
                            return False
                    else:
                        if dry_run and container_name not in [v for v in structure_summary.values() for v in v.keys()]:
                            # Mark containers with no structure changes
                            pass
                        elif not dry_run:
                            logger.info(f"No structural changes needed for {container_name}")

            # Phase 2: Data collection and master updates
            logger.info("\n=== Phase 2: Data Collection and Master Updates ===")
            
            all_id_mappings = {}
            
            for table in self.contributing_tables:
                logger.info(f"\nProcessing data for table: {table}")
                all_new_rows = []
                
                # Track data changes for dry run summary
                if dry_run:
                    if table not in data_summary:
                        data_summary[table] = {'master': '0 rows added'}
                
                # Collect new data from all non-test containers
                for container_id, container_name, is_test in containers:
                    if is_test:
                        logger.info(f"Skipping data collection from test container: {container_name}")
                        if dry_run:
                            data_summary[table][container_name] = 'skipped (test)'
                        continue
                        
                    container_port = self.get_container_port(container_id)
                    if not container_port:
                        continue

                    with self.db_connection(config['DB_HOST'], container_port, config['DB_NAME'],
                                           config['DB_USER'], config['DB_PASSWORD'], 
                                           f"Copy DB ({container_name})") as copy_conn:
                        if not copy_conn:
                            continue

                        master_data = self.get_table_data(master_conn, table)
                        copy_data = self.get_table_data(copy_conn, table)
                        
                        new_rows = self.find_new_rows(master_data, copy_data, table)
                        if new_rows:
                            logger.info(f"Found {len(new_rows)} new rows in {container_name}.{table}")
                            all_new_rows.extend(new_rows)
                            
                        # Track for dry run summary
                        if dry_run:
                            data_summary[table][container_name] = f"{len(new_rows)} rows retrieved"

                # Add new rows to master and collect ID mappings
                if all_new_rows:
                    master_data = self.get_table_data(master_conn, table)
                    insert_sql = self.generate_insert_sql(table, master_data[0], all_new_rows)
                    
                    if dry_run:
                        data_summary[table]['master'] = f"{len(all_new_rows)} rows added"
                    else:
                        logger.info(f"Adding {len(all_new_rows)} new rows to master.{table}")
                        
                    # For tables with auto-generated IDs, execute individually to collect mappings
                    if table in self.lookup_tables and self.lookup_tables[table]['id_field'] and not dry_run:
                        id_mappings = self.collect_id_mappings_individual(master_conn, table, master_data[0], all_new_rows, insert_sql)
                        if id_mappings:
                            all_id_mappings[table] = id_mappings
                            logger.info(f"Successfully added {len(all_new_rows)} rows and collected {len(id_mappings)} ID mappings for {table}")
                        else:
                            logger.info(f"Successfully added {len(all_new_rows)} rows to {table}")
                    else:
                        # For non-ID tables or dry run, use normal transaction
                        if self.execute_sql_transaction(master_conn, insert_sql, f"data for {table}", dry_run):
                            if dry_run:
                                logger.info(f"DRY RUN - Would collect ID mappings for {table}")
                        else:
                            logger.error(f"Failed to add new rows to master.{table}")
                            return False
                elif dry_run:
                    # No new rows found across all containers
                    for container_id, container_name, is_test in containers:
                        if not is_test and container_name not in data_summary[table]:
                            data_summary[table][container_name] = '0 rows retrieved'

            # Update references in all containers for ID changes
            if all_id_mappings or dry_run:
                logger.info("\n=== Updating ID References ===")
                
                for container_id, container_name, is_test in containers:
                    container_port = self.get_container_port(container_id)
                    if not container_port:
                        continue

                    with self.db_connection(config['DB_HOST'], container_port, config['DB_NAME'],
                                           config['DB_USER'], config['DB_PASSWORD'], 
                                           f"Copy DB ({container_name})") as copy_conn:
                        if not copy_conn:
                            continue

                        if dry_run:
                            logger.info(f"DRY RUN - Would update ID references in {container_name}")
                        else:
                            for table, id_mappings in all_id_mappings.items():
                                ref_sql = self.update_references(copy_conn, id_mappings, table)
                                if ref_sql:
                                    logger.info(f"Updating {len(ref_sql)} references in {container_name}")
                                    if not self.execute_sql_transaction(copy_conn, ref_sql, f"references for {table}", dry_run):
                                        logger.error(f"Failed to update references in {container_name}")
                                        return False

            # Phase 3: Sync all lookup data to all containers
            logger.info("\n=== Phase 3: Lookup Data Synchronization ===")
            
            for container_id, container_name, is_test in containers:
                logger.info(f"\nSyncing lookup data to {container_name}")
                
                container_port = self.get_container_port(container_id)
                if not container_port:
                    continue

                with self.db_connection(config['DB_HOST'], container_port, config['DB_NAME'],
                                       config['DB_USER'], config['DB_PASSWORD'], 
                                       f"Copy DB ({container_name})") as copy_conn:
                    if not copy_conn:
                        continue

                    all_sync_sql = []
                    
                    # Track lookup changes for dry run
                    if dry_run:
                        for table in self.lookup_tables:
                            if table not in lookup_summary:
                                lookup_summary[table] = {'master': 'n/a'}
                    
                    for table in self.lookup_tables:
                        sync_sql = self.sync_lookup_data(master_conn, copy_conn, table)
                        if sync_sql:
                            logger.info(f"Found {len(sync_sql)} rows to sync for {table}")
                            all_sync_sql.extend(sync_sql)
                            
                            # Track for dry run
                            if dry_run:
                                lookup_summary[table][container_name] = f"{len(sync_sql)} rows synced"
                        elif dry_run:
                            lookup_summary[table][container_name] = "no changes"

                    if all_sync_sql:
                        if not dry_run:
                            logger.info(f"Syncing {len(all_sync_sql)} total rows to {container_name}")
                        if not self.execute_sql_transaction(copy_conn, all_sync_sql, "lookup data sync", dry_run):
                            logger.error(f"Failed to sync lookup data to {container_name}")
                            return False
                    else:
                        logger.info(f"No lookup data sync needed for {container_name}")

        # Display summary tables for dry run
        if dry_run:
            logger.info("\n" + "="*80)
            logger.info("DRY RUN SUMMARY")
            logger.info("="*80)
            
            # Structure changes table
            if structure_summary:
                logger.info("\n📋 STRUCTURE CHANGES:")
                headers = ['Table', 'Master'] + container_names
                structure_data = []
                
                for table, changes in structure_summary.items():
                    row = [table, changes.get('master', 'n/a')]
                    for container_name in container_names:
                        row.append(changes.get(container_name, 'no changes'))
                    structure_data.append(row)
                
                print(self.format_summary_table(structure_data, headers))
            else:
                logger.info("\n📋 STRUCTURE CHANGES: No structural changes needed")
            
            # Data changes table
            if data_summary:
                logger.info("\n📊 DATA CHANGES (Contributing Tables):")
                headers = ['Table', 'Master'] + container_names
                data_data = []
                
                for table, changes in data_summary.items():
                    row = [table, changes.get('master', '0 rows added')]
                    for container_name in container_names:
                        row.append(changes.get(container_name, '0 rows retrieved'))
                    data_data.append(row)
                
                print(self.format_summary_table(data_data, headers))
            else:
                logger.info("\n📊 DATA CHANGES: No data changes needed")
                
            # Lookup sync table
            if lookup_summary:
                logger.info("\n🔄 LOOKUP DATA SYNCHRONIZATION:")
                headers = ['Table', 'Master'] + container_names
                lookup_data = []
                
                for table, changes in lookup_summary.items():
                    row = [table, changes.get('master', 'n/a')]
                    for container_name in container_names:
                        row.append(changes.get(container_name, 'no changes'))
                    lookup_data.append(row)
                
                print(self.format_summary_table(lookup_data, headers))
            else:
                logger.info("\n🔄 LOOKUP DATA SYNCHRONIZATION: No lookup sync needed")

        logger.info("\n=== Synchronization Complete ===")
        if not dry_run:
            logger.info(f"Master backup created: {backup_file}")
        return True

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Database synchronization script")
    parser.add_argument("--dry-run", action="store_true", 
                       help="Show what would be done without executing changes")
    parser.add_argument("--verbose", "-v", action="store_true", 
                       help="Enable verbose logging")
    args = parser.parse_args()
    
    if args.verbose:
        logger.setLevel(logging.DEBUG)
    
    if args.dry_run:
        logger.info("🔍 DRY RUN MODE - No changes will be executed")
    
    sync = DatabaseSync({})
    
    try:
        success = sync.synchronize_databases(dry_run=args.dry_run)
        if success:
            if args.dry_run:
                logger.info("✅ Dry run completed - review proposed changes above")
            else:
                logger.info("✅ Database synchronization completed successfully")
            return 0
        else:
            logger.error("❌ Database synchronization failed")
            return 1
    except Exception as e:
        logger.error(f"Unexpected error during synchronization: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
