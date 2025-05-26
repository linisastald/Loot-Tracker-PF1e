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
# from tabulate import tabulate - using custom table formatting instead
from typing import Dict, List, Tuple, Any, Optional


def format_table(data, headers, tablefmt='grid'):
    """Custom table formatting to replace tabulate"""
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
        # Pad row to match header count
        while len(formatted_row) < len(headers):
            formatted_row.append("")
        result.append(row_format.format(*formatted_row[:len(headers)]))
    
    result.append(separator)
    return "\n".join(result)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger('db_compare')


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

    # Validate required configuration
    if not config['DB_PASSWORD']:
        logger.error("Database password not found in config file or environment variables")
        sys.exit(1)

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
                        # Mark test containers but don't exclude them
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
                logger.warning(
                    "Retry {}/{} getting port for container {}".format(attempt + 1, max_retries, container_id))
                time.sleep(retry_delay)
        except subprocess.CalledProcessError as e:
            logger.error("Error getting port for container {}: {}".format(container_id, e))
            if attempt < max_retries - 1:
                logger.warning("Retry {}/{}".format(attempt + 1, max_retries))
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
            logger.error(
                "Attempt {}/{}: Unable to connect to {}: {}".format(attempt + 1, max_retries, connection_name, e))
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


def get_db_structure(conn):
    """Get database structure (tables, columns, indexes)"""
    structure = {'tables': {}, 'indexes': {}, 'column_details': {}}

    try:
        with conn.cursor() as cur:
            # Get tables and columns with detailed information including proper array types
            cur.execute("""
                SELECT table_name, column_name, 
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
                                   'integer[]'  -- fallback default
                               )
                           ELSE data_type 
                       END as data_type,
                       is_nullable, column_default,
                       character_maximum_length, numeric_precision, numeric_scale,
                       ordinal_position
                FROM information_schema.columns c
                WHERE table_schema = 'public'
                ORDER BY table_name, ordinal_position
            """)
            for row in cur.fetchall():
                table, column, data_type, nullable, default, char_len, num_prec, num_scale, position = row
                if table not in structure['tables']:
                    structure['tables'][table] = []
                    structure['column_details'][table] = {}
                
                # Build complete column definition - only add precision for types that support it
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
                # For integer, bigint, smallint, array types, etc. - don't add precision
                
                structure['tables'][table].append((column, col_def))
                structure['column_details'][table][column] = {
                    'data_type': data_type,
                    'nullable': nullable,
                    'default': default,
                    'position': position,
                    'full_definition': col_def
                }

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
        logger.error("Error fetching database structure: {}".format(e))

    return structure


def get_table_data(conn, table):
    """Get all data from a table"""
    try:
        with conn.cursor() as cur:
            # Properly quote table name to handle reserved words
            quoted_table = '"{}"'.format(table)
            cur.execute("SELECT * FROM {}".format(quoted_table))
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            return columns, rows
    except psycopg2.Error as e:
        logger.error("Error fetching data from table {}: {}".format(table, e))
        return [], []


def get_primary_key(conn, table):
    """Get primary key column(s) for a table"""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT a.attname
                FROM pg_index i
                JOIN pg_attribute a ON a.attrelid = i.indrelid
                                    AND a.attnum = ANY(i.indkey)
                WHERE i.indrelid = %s::regclass
                AND i.indisprimary
                ORDER BY a.attnum
            """, (table,))
            return [row[0] for row in cur.fetchall()]
    except psycopg2.Error as e:
        logger.error("Error getting primary key for table {}: {}".format(table, e))
        return []


def compare_structures(master, copy):
    """Compare master and copy database structures"""
    differences = {
        'missing_tables': [],
        'missing_columns': {},
        'missing_indexes': {},
        'extra_indexes': {}
    }

    # Check for missing tables
    for table in master['tables']:
        if table not in copy['tables']:
            differences['missing_tables'].append(table)

    # Check for missing columns
    for table in master['tables']:
        if table in copy['tables']:
            master_columns = {col: dtype for col, dtype in master['tables'][table]}
            copy_columns = {col: dtype for col, dtype in copy['tables'][table]}
            
            missing_cols = []
            for col, dtype in master_columns.items():
                if col not in copy_columns:
                    missing_cols.append((col, dtype))
            
            if missing_cols:
                differences['missing_columns'][table] = missing_cols

    # Check for missing and extra indexes
    for table in master['indexes']:
        master_indexes = {idx_name: idx_def for idx_name, idx_def in master['indexes'][table]}
        copy_indexes = {}
        if table in copy['indexes']:
            copy_indexes = {idx_name: idx_def for idx_name, idx_def in copy['indexes'][table]}
        
        # Missing indexes
        missing_idxs = []
        for idx_name, idx_def in master_indexes.items():
            if idx_name not in copy_indexes:
                missing_idxs.append((idx_name, idx_def))
        if missing_idxs:
            differences['missing_indexes'][table] = missing_idxs
            
        # Extra indexes (in copy but not in master)
        extra_idxs = []
        for idx_name, idx_def in copy_indexes.items():
            if idx_name not in master_indexes:
                extra_idxs.append((idx_name, idx_def))
        if extra_idxs:
            differences['extra_indexes'][table] = extra_idxs

    # Check for extra indexes in tables that exist in copy but not master structure
    for table in copy['indexes']:
        if table not in master['indexes'] and table not in differences['missing_tables']:
            differences['extra_indexes'][table] = copy['indexes'][table]

    return differences


def compare_table_data(master_data, copy_data, primary_keys):
    """Compare data between master and copy tables"""
    master_columns, master_rows = master_data
    copy_columns, copy_rows = copy_data
    
    # Handle column order differences
    if master_columns != copy_columns:
        logger.info("Column order/content differs between master and copy - normalizing for comparison")
        logger.debug("Master columns: {}".format(master_columns))
        logger.debug("Copy columns: {}".format(copy_columns))
        
        # Find common columns
        common_columns = [col for col in master_columns if col in copy_columns]
        master_only = [col for col in master_columns if col not in copy_columns]
        copy_only = [col for col in copy_columns if col not in master_columns]
        
        if master_only:
            logger.info("Columns only in master: {}".format(master_only))
        if copy_only:
            logger.info("Columns only in copy: {}".format(copy_only))
        
        # Create index mappings for reordering
        master_indices = [master_columns.index(col) for col in common_columns]
        copy_indices = [copy_columns.index(col) for col in common_columns]
        
        logger.debug("Common columns: {}".format(common_columns))
        logger.debug("Master indices for common columns: {}".format(master_indices))
        logger.debug("Copy indices for common columns: {}".format(copy_indices))
        
        # Reorder rows to match common column order
        def reorder_row(row, indices):
            return tuple(row[i] if i < len(row) else None for i in indices)
        
        master_rows_normalized = [reorder_row(row, master_indices) for row in master_rows]
        copy_rows_normalized = [reorder_row(row, copy_indices) for row in copy_rows]
        
        logger.debug("Using {} common columns for comparison".format(len(common_columns)))
        if master_rows_normalized and copy_rows_normalized:
            logger.debug("First master row normalized: {}".format(master_rows_normalized[0][:3]))
            logger.debug("First copy row normalized: {}".format(copy_rows_normalized[0][:3]))
    else:
        master_rows_normalized = master_rows
        copy_rows_normalized = copy_rows
    
    # Convert rows to sets for comparison (handling unhashable types)
    def row_to_hashable(row):
        return tuple(str(item) if item is not None else 'NULL' for item in row)
    
    master_set = {row_to_hashable(row) for row in master_rows_normalized}
    copy_set = {row_to_hashable(row) for row in copy_rows_normalized}
    
    # Find rows in copy that are not in master
    new_in_copy = []
    for i, row in enumerate(copy_rows):
        if master_columns != copy_columns:
            row_normalized = reorder_row(row, copy_indices)
        else:
            row_normalized = row
        row_hash = row_to_hashable(row_normalized)
        if row_hash not in master_set:
            new_in_copy.append(row)
    
    logger.debug("Master has {} rows, Copy has {} rows, {} new in copy".format(
        len(master_rows), len(copy_rows), len(new_in_copy)))
    
    return new_in_copy


def generate_structure_sql(differences, master_structure):
    """Generate SQL statements for structural changes"""
    sql_statements = []

    # Create missing tables
    for table in differences['missing_tables']:
        columns = master_structure['tables'].get(table, [])
        column_definitions = []
        
        for column, data_type in columns:
            # Get additional column info
            col_info = master_structure['column_details'][table][column]
            # Properly quote table and column names to handle reserved words
            quoted_column = '"{}"'.format(column)
            col_def = "{} {}".format(quoted_column, col_info['full_definition'])
            
            if col_info['nullable'] == 'NO':
                col_def += " NOT NULL"
            if col_info['default']:
                # Handle different default value types
                default_val = col_info['default']
                if default_val.startswith('nextval('):
                    # Handle sequence defaults
                    col_def += " DEFAULT {}".format(default_val)
                elif default_val.upper() in ('CURRENT_TIMESTAMP', 'NOW()'):
                    # Handle timestamp defaults
                    col_def += " DEFAULT {}".format(default_val)
                elif '::' in default_val:
                    # Handle PostgreSQL type casts (e.g., '{}'::jsonb)
                    col_def += " DEFAULT {}".format(default_val)
                elif default_val.startswith('ARRAY['):
                    # Handle PostgreSQL array literals
                    col_def += " DEFAULT {}".format(default_val)
                elif default_val.startswith("'") and default_val.endswith("'"):
                    # Already quoted string
                    col_def += " DEFAULT {}".format(default_val)
                elif default_val.replace('.', '').replace('-', '').isdigit():
                    # Numeric default
                    col_def += " DEFAULT {}".format(default_val)
                else:
                    # String that needs quoting
                    col_def += " DEFAULT '{}'".format(default_val.replace("'", "''"))
                
            column_definitions.append(col_def)

        # Properly quote table name
        quoted_table = '"{}"'.format(table)
        sql_statements.append(
            "CREATE TABLE {} ({});".format(quoted_table, ', '.join(column_definitions))
        )

    # Add missing columns
    for table, columns in differences['missing_columns'].items():
        for column, data_type in columns:
            col_info = master_structure['column_details'][table][column]
            # Properly quote table and column names
            quoted_table = '"{}"'.format(table)
            quoted_column = '"{}"'.format(column)
            col_def = col_info['full_definition']
            
            if col_info['nullable'] == 'NO':
                col_def += " NOT NULL"
            if col_info['default']:
                # Handle different default value types (same logic as above)
                default_val = col_info['default']
                if default_val.startswith('nextval('):
                    col_def += " DEFAULT {}".format(default_val)
                elif default_val.upper() in ('CURRENT_TIMESTAMP', 'NOW()'):
                    col_def += " DEFAULT {}".format(default_val)
                elif '::' in default_val:
                    # Handle PostgreSQL type casts (e.g., '{}'::jsonb)
                    col_def += " DEFAULT {}".format(default_val)
                elif default_val.startswith('ARRAY['):
                    # Handle PostgreSQL array literals
                    col_def += " DEFAULT {}".format(default_val)
                elif default_val.startswith("'") and default_val.endswith("'"):
                    col_def += " DEFAULT {}".format(default_val)
                elif default_val.replace('.', '').replace('-', '').isdigit():
                    col_def += " DEFAULT {}".format(default_val)
                else:
                    col_def += " DEFAULT '{}'".format(default_val.replace("'", "''"))
                
            sql_statements.append(
                "ALTER TABLE {} ADD COLUMN {} {};".format(quoted_table, quoted_column, col_def)
            )

    # Drop extra indexes
    for table, indexes in differences['extra_indexes'].items():
        for idx_name, idx_def in indexes:
            # Properly quote index name
            quoted_idx = '"{}"'.format(idx_name)
            sql_statements.append("DROP INDEX IF EXISTS {};".format(quoted_idx))

    # Create missing indexes
    for table, indexes in differences['missing_indexes'].items():
        for idx_name, idx_def in indexes:
            # Convert to CREATE INDEX IF NOT EXISTS
            if 'CREATE INDEX' in idx_def and 'IF NOT EXISTS' not in idx_def:
                idx_def = idx_def.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS', 1)
            elif 'CREATE UNIQUE INDEX' in idx_def and 'IF NOT EXISTS' not in idx_def:
                idx_def = idx_def.replace('CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX IF NOT EXISTS', 1)
            sql_statements.append("{};".format(idx_def))

    return sql_statements


def generate_data_sql(table, columns, new_rows, primary_keys):
    """Generate SQL for inserting new data rows"""
    if not new_rows:
        return []

    sql_statements = []
    
    def format_value(val):
        if val is None:
            return "NULL"
        elif isinstance(val, str):
            return "'{}'".format(val.replace("'", "''"))
        elif isinstance(val, list):
            formatted_items = [format_value(item) for item in val]
            return "ARRAY[{}]".format(','.join(formatted_items))
        elif isinstance(val, bool):
            return str(val).upper()
        else:
            return str(val)

    # Properly quote table and column names
    quoted_table = '"{}"'.format(table)
    quoted_columns = ['"{}"'.format(col) for col in columns]
    column_names = ', '.join(quoted_columns)
    
    for row in new_rows:
        values = ', '.join(format_value(val) for val in row)
        
        if primary_keys:
            # Use UPSERT for tables with primary keys
            quoted_pk_columns = ['"{}"'.format(pk) for pk in primary_keys]
            pk_columns = ', '.join(quoted_pk_columns)
            non_pk_columns = [col for col in columns if col not in primary_keys]
            
            if non_pk_columns:
                quoted_non_pk = ['"{}"'.format(col) for col in non_pk_columns]
                update_clause = ', '.join(
                    "{} = EXCLUDED.{}".format(qcol, qcol) for qcol in quoted_non_pk
                )
                sql = """INSERT INTO {} ({}) VALUES ({}) 
                        ON CONFLICT ({}) DO UPDATE SET {};""".format(
                    quoted_table, column_names, values, pk_columns, update_clause
                )
            else:
                sql = """INSERT INTO {} ({}) VALUES ({}) 
                        ON CONFLICT ({}) DO NOTHING;""".format(
                    quoted_table, column_names, values, pk_columns
                )
        else:
            # Simple INSERT for tables without primary keys
            sql = "INSERT INTO {} ({}) VALUES ({});".format(
                quoted_table, column_names, values
            )
        
        sql_statements.append(sql)

    return sql_statements


def create_id_mapping(master_conn, copy_conn, table, primary_key_col):
    """Create mapping of old IDs to new IDs when data is merged"""
    mapping = {}
    
    try:
        # This is a placeholder for ID mapping logic
        # In practice, you'd implement logic to match records by name/description
        # and track when IDs change during the merge process
        
        # For now, return empty mapping
        return mapping
        
    except Exception as e:
        logger.error("Error creating ID mapping for table {}: {}".format(table, e))
        return {}


def update_id_references(conn, id_mappings):
    """Update foreign key references when IDs change"""
    # This would implement the logic to update references
    # based on the ID mappings created during data synchronization
    
    # Placeholder for now
    pass


def display_structural_changes(differences):
    """Display structural differences in formatted tables"""
    print("\n" + "="*80)
    print("STRUCTURAL CHANGES REQUIRED")
    print("="*80)
    
    if differences['missing_tables']:
        print("\n📋 MISSING TABLES:")
        table_data = [[table] for table in differences['missing_tables']]
        print(format_table(table_data, headers=['Table Name'], tablefmt='grid'))

    if differences['missing_columns']:
        print("\n📝 MISSING COLUMNS:")
        col_data = []
        for table, columns in differences['missing_columns'].items():
            for column, data_type in columns:
                col_data.append([table, column, data_type])
        if col_data:
            print(format_table(col_data, headers=['Table', 'Column', 'Data Type'], tablefmt='grid'))

    if differences['extra_indexes']:
        print("\n🗑️  EXTRA INDEXES TO REMOVE:")
        idx_data = []
        for table, indexes in differences['extra_indexes'].items():
            for idx_name, idx_def in indexes:
                idx_data.append([table, idx_name])
        if idx_data:
            print(format_table(idx_data, headers=['Table', 'Index Name'], tablefmt='grid'))

    if differences['missing_indexes']:
        print("\n🔍 MISSING INDEXES TO CREATE:")
        idx_data = []
        for table, indexes in differences['missing_indexes'].items():
            for idx_name, idx_def in indexes:
                idx_data.append([table, idx_name])
        if idx_data:
            print(format_table(idx_data, headers=['Table', 'Index Name'], tablefmt='grid'))


def display_data_changes(table, new_rows, columns):
    """Display data changes in formatted tables"""
    if not new_rows:
        return
        
    print("\n" + "="*80)
    print("DATA CHANGES REQUIRED - Table: {}".format(table.upper()))
    print("="*80)
    print("\n📊 NEW ROWS TO ADD TO MASTER:")
    print("Found {} new rows".format(len(new_rows)))
    
    if len(new_rows) <= 10:  # Show all rows if 10 or fewer
        print(format_table(new_rows, headers=columns, tablefmt='grid'))
    else:  # Show first 5 and last 5 if more than 10
        print("First 5 rows:")
        print(format_table(new_rows[:5], headers=columns, tablefmt='grid'))
        print("\n... ({} more rows) ...\n".format(len(new_rows) - 10))
        print("Last 5 rows:")
        print(format_table(new_rows[-5:], headers=columns, tablefmt='grid'))


def execute_transaction(conn, sql_statements, description):
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
                        raise  # Re-raise to trigger transaction rollback
                
                logger.info("Successfully executed {} {} statements".format(len(sql_statements), description))
                return True
                
    except psycopg2.Error as e:
        logger.error("Error executing {} changes: {}".format(description, e))
        logger.error("Transaction rolled back")
        return False


def check_for_changes(master_conn, copy_conn, tables_to_check):
    """Check if there are any remaining differences"""
    master_structure = get_db_structure(master_conn)
    copy_structure = get_db_structure(copy_conn)
    
    structural_diffs = compare_structures(master_structure, copy_structure)
    
    # Check for structural changes
    has_structural_changes = any([
        structural_diffs['missing_tables'],
        structural_diffs['missing_columns'],
        structural_diffs['missing_indexes'],
        structural_diffs['extra_indexes']
    ])
    
    # Check for data changes
    has_data_changes = False
    for table in tables_to_check:
        if table in master_structure['tables'] and table in copy_structure['tables']:
            master_data = get_table_data(master_conn, table)
            copy_data = get_table_data(copy_conn, table)
            primary_keys = get_primary_key(copy_conn, table)
            
            new_rows = compare_table_data(master_data, copy_data, primary_keys)
            if new_rows:
                has_data_changes = True
                break
    
    return has_structural_changes or has_data_changes, structural_diffs


def synchronize_database(master_conn, copy_conn, container_name, is_test=False):
    """Synchronize a single copy database with the master"""
    tables_to_sync = ['item', 'mod', 'spells']  # Tables to sync data bidirectionally
    max_iterations = 10
    iteration = 0
    
    logger.info("Starting synchronization for {}".format(container_name))
    
    while iteration < max_iterations:
        iteration += 1
        logger.info("\n--- Iteration {} ---".format(iteration))
        
        # Get current structures
        master_structure = get_db_structure(master_conn)
        copy_structure = get_db_structure(copy_conn)
        
        # Compare structures
        structural_diffs = compare_structures(master_structure, copy_structure)
        
        # Check for structural changes needed
        has_structural_changes = any([
            structural_diffs['missing_tables'],
            structural_diffs['missing_columns'],
            structural_diffs['missing_indexes'],
            structural_diffs['extra_indexes']
        ])
        
        # Collect data changes (skip for test databases)
        data_changes = {}
        if not is_test:  # Only sync data from production databases
            for table in tables_to_sync:
                if table in master_structure['tables'] and table in copy_structure['tables']:
                    master_data = get_table_data(master_conn, table)
                    copy_data = get_table_data(copy_conn, table)
                    primary_keys = get_primary_key(copy_conn, table)
                    
                    new_rows = compare_table_data(master_data, copy_data, primary_keys)
                    if new_rows:
                        data_changes[table] = {
                            'new_rows': new_rows,
                            'columns': master_data[0],
                            'primary_keys': primary_keys
                        }
        else:
            logger.info("Skipping data synchronization for test database: {}".format(container_name))
        
        # If no changes needed, we're done
        if not has_structural_changes and not data_changes:
            logger.info("✅ No more changes needed. Synchronization complete!")
            return True
        
        # Display changes
        if has_structural_changes:
            display_structural_changes(structural_diffs)
        
        for table, changes in data_changes.items():
            display_data_changes(table, changes['new_rows'], changes['columns'])
        
        # Ask for confirmation
        print("\n" + "="*80)
        response = input("Apply these changes to {}? (y/n/q): ".format(container_name)).strip().lower()
        
        if response == 'q':
            logger.info("User requested to quit")
            return False
        elif response != 'y':
            logger.info("User declined changes")
            return False
        
        # Execute structural changes first
        if has_structural_changes:
            structure_sql = generate_structure_sql(structural_diffs, master_structure)
            if not execute_transaction(copy_conn, structure_sql, "structural"):
                logger.error("Failed to apply structural changes")
                return False
        
        # Execute data changes (copy to master)
        for table, changes in data_changes.items():
            data_sql = generate_data_sql(table, changes['columns'], 
                                       changes['new_rows'], changes['primary_keys'])
            if not execute_transaction(master_conn, data_sql, "data for {}".format(table)):
                logger.error("Failed to apply data changes for table {}".format(table))
                return False
        
        # Update ID references if needed
        # This would be implemented based on specific business logic
        # update_id_references(copy_conn, id_mappings)
        
        logger.info("Iteration {} completed successfully".format(iteration))
    
    logger.warning("Maximum iterations ({}) reached".format(max_iterations))
    return False


def main():
    parser = argparse.ArgumentParser(description="Enhanced PostgreSQL database synchronization")
    parser.add_argument("--master-port", type=int, default=5432, help="Master DB port")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without executing")
    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

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

                if args.dry_run:
                    logger.info("DRY RUN MODE - Changes will be displayed but not executed")
                    # In dry run, show both structural and data changes
                    master_structure = get_db_structure(master_conn)
                    copy_structure = get_db_structure(copy_conn)
                    differences = compare_structures(master_structure, copy_structure)
                    
                    # Show structural changes
                    if any(differences.values()):
                        display_structural_changes(differences)
                    else:
                        logger.info("No structural differences found")
                    
                    # Show data changes for sync tables
                    tables_to_sync = ['item', 'mod', 'spells']
                    data_changes_found = False
                    
                    for table in tables_to_sync:
                        if table in master_structure['tables'] and table in copy_structure['tables']:
                            logger.info("Checking data for table: {}".format(table))
                            master_data = get_table_data(master_conn, table)
                            copy_data = get_table_data(copy_conn, table)
                            primary_keys = get_primary_key(copy_conn, table)
                            
                            logger.info("Master {} has {} rows, Copy {} has {} rows".format(
                                table, len(master_data[1]), table, len(copy_data[1])))
                            
                            # Quick sanity check - compare first few rows
                            if len(master_data[1]) > 0 and len(copy_data[1]) > 0:
                                logger.debug("First master row: {}".format(master_data[1][0][:3]))
                                logger.debug("First copy row: {}".format(copy_data[1][0][:3]))
                            
                            # Skip data sync preview for test databases
                            if is_test:
                                logger.info("Skipping data sync check for test database: {}".format(table))
                                continue
                                
                            new_rows = compare_table_data(master_data, copy_data, primary_keys)
                            if new_rows:
                                display_data_changes(table, new_rows, master_data[0])
                                data_changes_found = True
                            else:
                                logger.info("No new rows found in {} copy database".format(table))
                    
                    if not data_changes_found:
                        logger.info("No data synchronization changes found")
                else:
                    # Execute full synchronization
                    if synchronize_database(master_conn, copy_conn, container_name, is_test):
                        success_count += 1
                        logger.info("✅ Successfully synchronized {}".format(container_name))
                    else:
                        logger.error("❌ Failed to synchronize {}".format(container_name))
                        break  # Stop on first failure as requested

        if not args.dry_run:
            logger.info("\n" + "="*100)
            logger.info("SYNCHRONIZATION SUMMARY")
            logger.info("="*100)
            logger.info("Successfully synchronized: {}/{}".format(success_count, total_count))
            
            if success_count == total_count:
                logger.info("🎉 All databases synchronized successfully!")
            else:
                logger.warning("⚠️  Some databases failed to synchronize")


if __name__ == "__main__":
    main()
