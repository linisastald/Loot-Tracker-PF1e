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
        'DB_PASSWORD': 'g5Zr7!cXw@2sP9Lk',
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
            # Generate SQL to reorder columns (PostgreSQL doesn't have direct column reordering)
            # We'll need to recreate the table or use a workaround
            logger.info("Column order issue detected in table {}: {} -> {}".format(
                table, order_info['copy_order'], master_order))
            # For now, we'll log this and handle it separately if needed

        # Drop extra indexes
        for table, indexes in self.differences['extra_indexes'].items():
            for idx_name, idx_def in indexes:
                quoted_idx = '"{}"'.format(idx_name)
                sql_statements.append("DROP INDEX IF EXISTS {};".format(quoted_idx))

        # Create missing indexes
        for table, indexes in self.differences['missing_indexes'].items():
            for idx_name, idx_def in indexes:
                if 'CREATE INDEX' in idx_def and 'IF NOT EXISTS' not in idx_def:
                    idx_def = idx_def.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS', 1)
                elif 'CREATE UNIQUE INDEX' in idx_def and 'IF NOT EXISTS' not in idx_def:
                    idx_def = idx_def.replace('CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX IF NOT EXISTS', 1)
                sql_statements.append("{};".format(idx_def))

        return sql_statements
    
    def _format_default(self, default_val):
        """Format default values properly"""
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
            return "'{}'".format(default_val.replace("'", "''"))


def display_structure_differences(comparison: StructureComparison):
    """Display structural differences in formatted tables"""
    if not comparison.has_differences():
        logger.info("No structural differences found")
        return
    
    print("\n" + "="*80)
    print("STRUCTURAL DIFFERENCES DETECTED")
    print("="*80)
    
    diffs = comparison.differences
    
    if diffs['missing_tables']:
        print("\n📋 MISSING TABLES:")
        table_data = [[table] for table in diffs['missing_tables']]
        print(format_table(table_data, headers=['Table Name']))

    if diffs['missing_columns']:
        print("\n📝 MISSING COLUMNS:")
        col_data = []
        for table, columns in diffs['missing_columns'].items():
            for column, data_type in columns:
                col_data.append([table, column, data_type])
        if col_data:
            print(format_table(col_data, headers=['Table', 'Column', 'Data Type']))
    
    if diffs['column_order_issues']:
        print("\n🔄 COLUMN ORDER ISSUES:")
        order_data = []
        for table, order_info in diffs['column_order_issues'].items():
            master_order = ', '.join(order_info['master_order'])
            copy_order = ', '.join(order_info['copy_order'])
            order_data.append([table, copy_order, master_order])
        if order_data:
            print(format_table(order_data, headers=['Table', 'Current Order', 'Expected Order']))

    if diffs['extra_indexes']:
        print("\n🗑️  EXTRA INDEXES TO REMOVE:")
        idx_data = []
        for table, indexes in diffs['extra_indexes'].items():
            for idx_name, idx_def in indexes:
                idx_data.append([table, idx_name])
        if idx_data:
            print(format_table(idx_data, headers=['Table', 'Index Name']))

    if diffs['missing_indexes']:
        print("\n🔍 MISSING INDEXES TO CREATE:")
        idx_data = []
        for table, indexes in diffs['missing_indexes'].items():
            for idx_name, idx_def in indexes:
                idx_data.append([table, idx_name])
        if idx_data:
            print(format_table(idx_data, headers=['Table', 'Index Name']))


def execute_sql_transaction(conn, sql_statements, description):
    """Execute SQL statements in a single transaction"""
    if not sql_statements:
        logger.info("No {} changes to execute".format(description))
        return True
        
    try:
        with conn:
            with conn.cursor() as cur:
                logger.info("Executing {} changes in transaction...".format(description))
                for i, statement in enumerate(sql_statements, 1):
                    logger.debug("Executing statement {}/{}: {}".format(i, len(sql_statements), statement[:100]))
                    try:
                        cur.execute(statement)
                    except psycopg2.Error as e:
                        logger.error("Error in statement {}/{}: {}".format(i, len(sql_statements), e))
                        logger.error("Full SQL statement: {}".format(statement))
                        raise
                
                logger.info("Successfully executed {} {} statements".format(len(sql_statements), description))
                return True
                
    except psycopg2.Error as e:
        logger.error("Error executing {} changes: {}".format(description, e))
        logger.error("Transaction rolled back")
        return False


def main():
    parser = argparse.ArgumentParser(description="Database structure and data synchronization tool")
    parser.add_argument("--master-port", type=int, default=5432, help="Master database port")
    parser.add_argument("--structure-only", action="store_true", help="Only perform structure synchronization")
    parser.add_argument("--data-only", action="store_true", help="Only perform data synchronization")
    parser.add_argument("--table", type=str, help="Only process specific table (item, mod, spells)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without executing")
    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

    if args.structure_only and args.data_only:
        logger.error("Cannot specify both --structure-only and --data-only")
        sys.exit(1)

    # Load configuration
    config = load_config()

    # Connect to master database
    with db_connection(config['DB_HOST'], args.master_port, config['DB_NAME'],
                       config['DB_USER'], config['DB_PASSWORD'], "Master DB") as master_conn:
        if not master_conn:
            logger.error("Failed to connect to master database. Exiting.")
            sys.exit(1)

        # Get Docker containers
        containers = get_docker_container_ids(config)
        if not containers:
            logger.warning("No matching Docker containers found.")
            sys.exit(0)
        
        logger.info("Found {} matching containers".format(len(containers)))
        for container_id, container_name, is_test in containers:
            container_type = "TEST" if is_test else "PRODUCTION"
            logger.info("  - {} ({})".format(container_name, container_type))

        success_count = 0
        total_count = len(containers)

        for container_id, container_name, is_test in containers:
            container_type = "TEST" if is_test else "PRODUCTION"
            logger.info("\n" + "="*100)
            logger.info("PROCESSING CONTAINER: {} ({})".format(container_name, container_type))
            logger.info("="*100)
            
            container_port = get_container_port(container_id)
            if not container_port:
                logger.error("Unable to get port for container {}. Skipping.".format(container_name))
                continue

            # Connect to copy database
            with db_connection(config['DB_HOST'], container_port, config['DB_NAME'],
                               config['DB_USER'], config['DB_PASSWORD'],
                               "Copy DB ({})".format(container_name)) as copy_conn:
                if not copy_conn:
                    logger.error("Failed to connect to copy database. Skipping.")
                    continue

                # Structure synchronization
                if not args.data_only:
                    logger.info("Checking database structure...")
                    master_structure = DatabaseStructure(master_conn)
                    copy_structure = DatabaseStructure(copy_conn)
                    comparison = StructureComparison(master_structure, copy_structure)
                    
                    if comparison.has_differences():
                        display_structure_differences(comparison)
                        
                        if args.dry_run:
                            logger.info("DRY RUN MODE - Structure changes not executed")
                        else:
                            response = input("\nApply structural changes to {}? (y/n): ".format(container_name))
                            if response.lower() == 'y':
                                fix_sql = comparison.generate_fix_sql()
                                if execute_sql_transaction(copy_conn, fix_sql, "structural"):
                                    logger.info("✅ Structural changes applied successfully")
                                else:
                                    logger.error("❌ Failed to apply structural changes")
                                    continue
                            else:
                                logger.info("Structural changes declined")
                    else:
                        logger.info("✅ Database structure is synchronized")

                # Data synchronization (placeholder for now)
                if not args.structure_only:
                    logger.info("Data synchronization will be implemented next...")
                    # TODO: Implement data synchronization logic

                success_count += 1

        logger.info("\n" + "="*100)
        logger.info("SYNCHRONIZATION SUMMARY")
        logger.info("="*100)
        logger.info("Successfully processed: {}/{}".format(success_count, total_count))


if __name__ == "__main__":
    main()
