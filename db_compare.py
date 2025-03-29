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
        'DB_PASSWORD': 'g5Zr7!cXw@2sP9Lk',  # Will be loaded from environment or config file
        'CONTAINER_FILTER': 'loot_db'  # Filter for identifying relevant containers
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
                        containers.append((container_id, name))
        return containers
    except subprocess.CalledProcessError as e:
        logger.error(f"Error running docker command: {e}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error in get_docker_container_ids: {e}")
        return []


def get_container_port(container_id):
    """Get the mapped port for a container"""
    max_retries = 3
    retry_delay = 2  # seconds

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
                logger.warning(f"Retry {attempt + 1}/{max_retries} getting port for container {container_id}")
                time.sleep(retry_delay)
        except subprocess.CalledProcessError as e:
            logger.error(f"Error getting port for container {container_id}: {e}")
            if attempt < max_retries - 1:
                logger.warning(f"Retry {attempt + 1}/{max_retries}")
                time.sleep(retry_delay)
        except Exception as e:
            logger.error(f"Unexpected error in get_container_port: {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)

    return None


@contextmanager
def db_connection(host, port, dbname, user, password, connection_name="DB"):
    """Create a database connection with retries"""
    conn = None
    max_retries = 3
    retry_delay = 2  # seconds

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
                logger.info(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)

    if conn is None:
        logger.error(f"Failed to connect to {connection_name} after {max_retries} attempts")
        yield None
    else:
        try:
            yield conn
        finally:
            conn.close()
            logger.debug(f"Closed connection to {connection_name}")


def get_db_structure(conn):
    """Get database structure (tables, columns, indexes)"""
    structure = {'tables': {}, 'indexes': {}, 'column_details': {}}

    try:
        with conn.cursor() as cur:
            # Get tables and columns
            cur.execute("""
                SELECT table_name, column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = 'public'
                ORDER BY table_name, ordinal_position
            """)
            for table, column, data_type in cur.fetchall():
                if table not in structure['tables']:
                    structure['tables'][table] = []
                    structure['column_details'][table] = {}
                structure['tables'][table].append((column, data_type))
                structure['column_details'][table][column] = data_type

            # Get indexes
            cur.execute("""
                SELECT tablename, indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = 'public'
            """)
            for table, index, indexdef in cur.fetchall():
                if table not in structure['indexes']:
                    structure['indexes'][table] = []
                structure['indexes'][table].append((index, indexdef))
    except psycopg2.Error as e:
        logger.error(f"Error fetching database structure: {e}")

    return structure


def compare_structures(master, copy):
    """Compare master and copy database structures"""
    differences = {
        'missing_tables': [],
        'missing_columns': {},
        'missing_indexes': {}
    }

    # Check for missing tables
    for table in master['tables']:
        if table not in copy['tables']:
            differences['missing_tables'].append(table)

    # Check for missing columns
    for table in master['tables']:
        if table in copy['tables']:
            master_columns = set(col for col, _ in master['tables'][table])
            copy_columns = set(col for col, _ in copy['tables'][table])
            missing_column_names = master_columns - copy_columns
            if missing_column_names:
                differences['missing_columns'][table] = []
                for col_name in missing_column_names:
                    # Find the data type for this column
                    for col, data_type in master['tables'][table]:
                        if col == col_name:
                            differences['missing_columns'][table].append((col, data_type))
                            break

    # Check for missing indexes
    for table in master['indexes']:
        if table in copy['indexes']:
            master_indexes = set(idx_name for idx_name, _ in master['indexes'][table])
            copy_indexes = set(idx_name for idx_name, _ in copy['indexes'][table])
            missing_index_names = master_indexes - copy_indexes
            if missing_index_names:
                differences['missing_indexes'][table] = []
                for idx_name in missing_index_names:
                    # Find the index definition for this index
                    for name, defn in master['indexes'][table]:
                        if name == idx_name:
                            differences['missing_indexes'][table].append((name, defn))
                            break
        elif table not in differences['missing_tables']:
            differences['missing_indexes'][table] = master['indexes'][table]

    return differences


def fix_array_datatype(data_type):
    """
    Fix PostgreSQL array type notation.
    Convert 'ARRAY' to 'character varying[]' and handle other array types.
    """
    if data_type is None:
        return 'character varying'  # Default to varchar if type is None

    if data_type == 'ARRAY':
        return 'character varying[]'
    # Handle other cases like ARRAY[] or existing proper array notations
    elif isinstance(data_type, str) and 'ARRAY' in data_type:
        # Extract the base type if specified in format "type ARRAY"
        match = re.match(r'(.+)\s+ARRAY$', data_type)
        if match:
            base_type = match.group(1)
            return f"{base_type}[]"
        elif '[' not in data_type:
            # Convert "type ARRAY" to "type[]"
            return data_type.replace('ARRAY', '[]')
    return data_type


def quote_identifier(identifier):
    """Safely quote a SQL identifier without needing a connection"""
    # This is a simplified version - PostgreSQL actually has more complex rules
    # but this covers most cases
    return f'"{identifier.replace("\"", "\"\"")}"'


def generate_update_sql(differences, master_structure):
    """Generate SQL statements to update the copy database"""
    sql_statements = []

    # Create missing tables
    for table in differences['missing_tables']:
        columns = master_structure['tables'].get(table, [])
        column_definitions = []

        for column, data_type in columns:
            # Fix array type notation
            fixed_data_type = fix_array_datatype(data_type)
            # Properly quote column name
            quoted_column = quote_identifier(column)
            column_definitions.append(f"{quoted_column} {fixed_data_type}")

        # Properly quote table name
        quoted_table = quote_identifier(table)
        sql_statements.append(f"CREATE TABLE {quoted_table} ({', '.join(column_definitions)});")

    # Add missing columns
    for table, columns in differences['missing_columns'].items():
        for column, data_type in columns:
            # Fix array type notation for column additions too
            fixed_data_type = fix_array_datatype(data_type)
            # Properly quote table and column names
            quoted_table = quote_identifier(table)
            quoted_column = quote_identifier(column)
            sql_statements.append(
                f"ALTER TABLE {quoted_table} ADD COLUMN IF NOT EXISTS {quoted_column} {fixed_data_type};")

    # Create missing indexes
    for table, indexes in differences['missing_indexes'].items():
        for _, indexdef in indexes:
            # Simple approach - try to create the index directly
            # PostgreSQL 9.5+ will not error if index already exists with IF NOT EXISTS
            if 'CREATE INDEX' in indexdef:
                # Convert to CREATE INDEX IF NOT EXISTS
                indexdef = indexdef.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS')
                sql_statements.append(f"{indexdef};")
            elif 'CREATE UNIQUE INDEX' in indexdef:
                # Convert to CREATE UNIQUE INDEX IF NOT EXISTS
                indexdef = indexdef.replace('CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX IF NOT EXISTS')
                sql_statements.append(f"{indexdef};")

    return sql_statements


def execute_sql_statements(conn, sql_statements):
    """
    Execute SQL statements one by one with proper error handling
    """
    errors = []
    executed = 0

    try:
        # Start a transaction
        with conn:
            with conn.cursor() as cur:
                for i, statement in enumerate(sql_statements):
                    try:
                        logger.info(f"Executing statement {i + 1}/{len(sql_statements)}")
                        logger.debug(f"SQL: {statement}")
                        cur.execute(statement)
                        executed += 1
                    except psycopg2.Error as e:
                        logger.error(f"Error executing: {statement}")
                        logger.error(f"Error message: {e}")
                        errors.append((statement, str(e)))
                        # We'll continue with the next statement, but the transaction will be rolled back later
                        raise

        logger.info(f"All {executed} statements executed successfully.")
        return True
    except Exception:
        logger.error(f"Encountered errors. Transaction rolled back. {executed} statements were attempted.")
        for stmt, err in errors:
            logger.error(f"Statement: {stmt}")
            logger.error(f"Error: {err}")
            logger.error("-" * 50)
        return False


def main():
    parser = argparse.ArgumentParser(description="Compare PostgreSQL database structures")
    parser.add_argument("--master-port", type=int, default=5432, help="Master DB port")
    parser.add_argument("--config", type=str, default="config.ini", help="Path to config file")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    parser.add_argument("--dry-run", action="store_true", help="Generate SQL without executing")
    args = parser.parse_args()

    # Set logging level based on verbosity
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

        logger.info("Fetching master database structure...")
        master_structure = get_db_structure(master_conn)

        # Get Docker containers
        containers = get_docker_container_ids(config)
        if not containers:
            logger.warning("No matching Docker containers found.")
            sys.exit(0)

        for container_id, container_name in containers:
            logger.info(f"\nProcessing container: {container_name}")
            container_port = get_container_port(container_id)

            if not container_port:
                logger.error(f"Unable to get port for container {container_name}. Skipping.")
                continue

            # Connect to copy database
            with db_connection(config['DB_HOST'], container_port, config['DB_NAME'],
                               config['DB_USER'], config['DB_PASSWORD'], f"Copy DB ({container_name})") as copy_conn:
                if not copy_conn:
                    continue

                logger.info(f"Fetching structure for copy database in container {container_name}...")
                copy_structure = get_db_structure(copy_conn)

                logger.info("Comparing database structures...")
                differences = compare_structures(master_structure, copy_structure)

                if not any(differences.values()):
                    logger.info("No differences found between master and copy databases.")
                else:
                    logger.info("Differences found:")
                    if differences['missing_tables']:
                        logger.info(f"Missing tables: {', '.join(differences['missing_tables'])}")
                    if differences['missing_columns']:
                        for table, cols in differences['missing_columns'].items():
                            logger.info(f"Missing columns in {table}: {', '.join(col for col, _ in cols)}")
                    if differences['missing_indexes']:
                        for table, idxs in differences['missing_indexes'].items():
                            logger.info(f"Missing indexes in {table}: {', '.join(idx for idx, _ in idxs)}")

                    sql_statements = generate_update_sql(differences, master_structure)

                    logger.info("\nGenerated SQL to update the copy database:")
                    for stmt in sql_statements:
                        logger.info(stmt)

                    if args.dry_run:
                        logger.info("Dry run mode - SQL not executed.")
                    else:
                        confirm = input(
                            f"\nDo you want to apply these changes to the copy database ({container_name})? (y/n): ")
                        if confirm.lower() == 'y':
                            success = execute_sql_statements(copy_conn, sql_statements)
                            if success:
                                logger.info("Changes applied successfully.")
                            else:
                                logger.error("Errors occurred while applying changes. Please check the logs.")
                        else:
                            logger.info("Changes not applied.")


if __name__ == "__main__":
    main()