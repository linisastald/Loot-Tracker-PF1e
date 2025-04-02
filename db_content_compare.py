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
import json

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger('db_content_compare')


def load_config():
    """Load configuration from config file or environment variables"""
    config = {
        'DB_HOST': 'localhost',
        'DB_NAME': 'loot_tracking',
        'DB_USER': 'loot_user',
        'DB_PASSWORD': 'g5Zr7!cXw@2sP9Lk',  # Will be loaded from environment or config file
        'CONTAINER_FILTER': 'loot_db',  # Filter for identifying relevant containers
        'TABLES_TO_COMPARE': ['impositions', 'item', 'mod', 'spells']
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

    # Convert tables_to_compare to list if it's a string
    if isinstance(config['TABLES_TO_COMPARE'], str):
        config['TABLES_TO_COMPARE'] = [t.strip() for t in config['TABLES_TO_COMPARE'].split(',')]

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
        logger.error("Error running docker command: {}".format(e))
        return []
    except Exception as e:
        logger.error("Unexpected error in get_docker_container_ids: {}".format(e))
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
                port_match = re.search(r':(\d+)', result.stdout.strip())
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


def get_table_primary_keys(conn, tables):
    """Get primary key columns for each table"""
    primary_keys = {}

    try:
        with conn.cursor() as cur:
            for table in tables:
                cur.execute("""
                    SELECT a.attname
                    FROM pg_index i
                    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                    WHERE i.indrelid = %s::regclass
                    AND i.indisprimary;
                """, (table,))

                pk_columns = [row[0] for row in cur.fetchall()]
                if pk_columns:
                    primary_keys[table] = pk_columns
                else:
                    # If no primary key, use all columns as identifier
                    cur.execute("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = %s 
                        ORDER BY ordinal_position
                    """, (table,))
                    primary_keys[table] = [row[0] for row in cur.fetchall()]

        return primary_keys
    except psycopg2.Error as e:
        logger.error("Error fetching primary keys: {}".format(e))
        return {}


def get_table_columns(conn, table):
    """Get columns for a table"""
    columns = []

    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = %s
                ORDER BY ordinal_position
            """, (table,))

            columns = [row[0] for row in cur.fetchall()]

        return columns
    except psycopg2.Error as e:
        logger.error("Error fetching columns for table {}: {}".format(table, e))
        return []


def get_table_data(conn, table, columns):
    """Get all data from a table"""
    data = {}

    try:
        with conn.cursor() as cur:
            # Build a parameterized query to select all rows
            query = sql.SQL("SELECT {} FROM {}").format(
                sql.SQL(', ').join(sql.Identifier(col) for col in columns),
                sql.Identifier(table)
            )

            cur.execute(query)
            rows = cur.fetchall()

            # Create an index based on a tuple of all column values (simple but unique)
            for row in rows:
                row_dict = dict(zip(columns, row))
                # Use primary key or id as a key if it exists
                if 'id' in row_dict:
                    key = row_dict['id']
                else:
                    # Otherwise convert row to JSON string to use as key
                    key = json.dumps(row_dict, default=str)
                data[key] = row_dict

        return data
    except psycopg2.Error as e:
        logger.error("Error fetching data for table {}: {}".format(table, e))
        return {}


def compare_table_data(master_data, copy_data, primary_keys, table):
    """Compare data between master and copy tables"""
    differences = {
        'missing_in_copy': [],
        'different_in_copy': []
    }

    # Compare master data with copy data
    for key, master_row in master_data.items():
        if key not in copy_data:
            differences['missing_in_copy'].append(master_row)
        else:
            copy_row = copy_data[key]
            if master_row != copy_row:
                differences['different_in_copy'].append({
                    'master': master_row,
                    'copy': copy_row
                })

    return differences


def generate_insert_sql(table, columns, row_data):
    """Generate SQL INSERT statement for a row"""
    values = []
    for col in columns:
        val = row_data.get(col)
        if val is None:
            values.append("NULL")
        elif isinstance(val, (int, float)):
            values.append(str(val))
        elif isinstance(val, bool):
            values.append("TRUE" if val else "FALSE")
        elif isinstance(val, list):
            # Handle PostgreSQL array format
            array_elements = []
            for element in val:
                if element is None:
                    array_elements.append("NULL")
                elif isinstance(element, (int, float)):
                    array_elements.append(str(element))
                elif isinstance(element, bool):
                    array_elements.append("TRUE" if element else "FALSE")
                else:
                    # Escape single quotes in string values
                    s = str(element).replace("'", "''")
                    array_elements.append('"{}"'.format(s))
            values.append("ARRAY[{}]".format(', '.join(array_elements)))
        else:
            # Escape single quotes in string values
            s = str(val).replace("'", "''")
            values.append("'{}'".format(s))

    return "INSERT INTO {} ({}) VALUES ({});".format(
        table,
        ', '.join(columns),
        ', '.join(values)
    )


def generate_update_sql(table, columns, pk_columns, row_data):
    """Generate SQL UPDATE statement for a row"""
    # Build SET clause
    set_clauses = []
    for col in columns:
        if col not in pk_columns:  # Don't update primary key
            val = row_data.get(col)
            if val is None:
                set_clauses.append("{} = NULL".format(col))
            elif isinstance(val, (int, float)):
                set_clauses.append("{} = {}".format(col, val))
            elif isinstance(val, bool):
                set_clauses.append("{} = {}".format(col, val))
            elif isinstance(val, list):
                # Handle PostgreSQL array format
                array_elements = []
                for element in val:
                    if element is None:
                        array_elements.append("NULL")
                    elif isinstance(element, (int, float)):
                        array_elements.append(str(element))
                    elif isinstance(element, bool):
                        array_elements.append("TRUE" if element else "FALSE")
                    else:
                        # Escape single quotes in string values
                        s = str(element).replace("'", "''")
                        array_elements.append('"{}"'.format(s))
                set_clauses.append("{} = ARRAY[{}]".format(col, ', '.join(array_elements)))
            else:
                # Escape single quotes in string values
                s = str(val).replace("'", "''")
                set_clauses.append("{} = '{}'".format(col, s))

    # Build WHERE clause
    where_clauses = []
    for pk in pk_columns:
        val = row_data.get(pk)
        if val is None:
            where_clauses.append("{} IS NULL".format(pk))
        elif isinstance(val, (int, float)):
            where_clauses.append("{} = {}".format(pk, val))
        elif isinstance(val, bool):
            where_clauses.append("{} = {}".format(pk, val))
        elif isinstance(val, list):
            # Handle PostgreSQL array format in WHERE clause
            array_elements = []
            for element in val:
                if element is None:
                    array_elements.append("NULL")
                elif isinstance(element, (int, float)):
                    array_elements.append(str(element))
                elif isinstance(element, bool):
                    array_elements.append("TRUE" if element else "FALSE")
                else:
                    # Escape single quotes in string values
                    s = str(element).replace("'", "''")
                    array_elements.append('"{}"'.format(s))
            where_clauses.append("{} = ARRAY[{}]".format(pk, ', '.join(array_elements)))
        else:
            # Escape single quotes in string values
            s = str(val).replace("'", "''")
            where_clauses.append("{} = '{}'".format(pk, s))

    return "UPDATE {} SET {} WHERE {};".format(
        table,
        ', '.join(set_clauses),
        ' AND '.join(where_clauses)
    )


def generate_update_sqls(differences, table, columns, primary_keys):
    """Generate SQL statements to update the copy database"""
    sql_statements = []
    pk_cols = primary_keys.get(table, ['id'])

    # Generate INSERT statements for missing rows
    for row in differences['missing_in_copy']:
        sql_statements.append(generate_insert_sql(table, columns, row))

    # Generate UPDATE statements for different rows
    for diff in differences['different_in_copy']:
        sql_statements.append(generate_update_sql(table, columns, pk_cols, diff['master']))

    return sql_statements


def display_differences(differences, table):
    """Display the differences in a readable format"""
    if not differences['missing_in_copy'] and not differences['different_in_copy']:
        logger.info("No differences found in table {}".format(table))
        return

    logger.info("Differences in table {}:".format(table))

    if differences['missing_in_copy']:
        logger.info("  - Missing rows: {}".format(len(differences['missing_in_copy'])))
        # Display some sample missing rows (limited to avoid flooding the console)
        sample_size = min(3, len(differences['missing_in_copy']))
        for i in range(sample_size):
            row = differences['missing_in_copy'][i]
            logger.info("    Sample {}: {}".format(i + 1, row))

    if differences['different_in_copy']:
        logger.info("  - Different rows: {}".format(len(differences['different_in_copy'])))
        # Display some sample different rows
        sample_size = min(3, len(differences['different_in_copy']))
        for i in range(sample_size):
            diff = differences['different_in_copy'][i]
            logger.info("    Sample {}:".format(i + 1))
            logger.info("      Master: {}".format(diff['master']))
            logger.info("      Copy:   {}".format(diff['copy']))


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
                        logger.info("Executing statement {}/{}".format(i + 1, len(sql_statements)))
                        logger.debug("SQL: {}".format(statement))
                        cur.execute(statement)
                        executed += 1
                    except psycopg2.Error as e:
                        logger.error("Error executing: {}".format(statement))
                        logger.error("Error message: {}".format(e))
                        errors.append((statement, str(e)))
                        # We'll continue with the next statement, but the transaction will be rolled back later
                        raise

        logger.info("All {} statements executed successfully.".format(executed))
        return True
    except Exception:
        logger.error("Encountered errors. Transaction rolled back. {} statements were attempted.".format(executed))
        for stmt, err in errors:
            logger.error("Statement: {}".format(stmt))
            logger.error("Error: {}".format(err))
            logger.error("-" * 50)
        return False


def main():
    parser = argparse.ArgumentParser(description="Compare PostgreSQL specific tables' contents")
    parser.add_argument("--master-port", type=int, default=5432, help="Master DB port")
    parser.add_argument("--config", type=str, default="config.ini", help="Path to config file")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    parser.add_argument("--dry-run", action="store_true", help="Generate SQL without executing")
    parser.add_argument("--tables", type=str, help="Comma-separated list of tables to compare")
    args = parser.parse_args()

    # Set logging level based on verbosity
    if args.verbose:
        logger.setLevel(logging.DEBUG)

    # Load configuration
    config = load_config()

    # Override tables to compare if specified in command line
    if args.tables:
        config['TABLES_TO_COMPARE'] = [t.strip() for t in args.tables.split(',')]

    logger.info("Tables to compare: {}".format(', '.join(config['TABLES_TO_COMPARE'])))

    # Connect to master database
    with db_connection(config['DB_HOST'], args.master_port, config['DB_NAME'],
                       config['DB_USER'], config['DB_PASSWORD'], "Master DB") as master_conn:
        if not master_conn:
            logger.error("Failed to connect to master database. Exiting.")
            sys.exit(1)

        # Get table primary keys
        logger.info("Fetching table primary keys from master database...")
        primary_keys = get_table_primary_keys(master_conn, config['TABLES_TO_COMPARE'])

        # Get Docker containers
        containers = get_docker_container_ids(config)
        if not containers:
            logger.warning("No matching Docker containers found.")
            sys.exit(0)

        for container_id, container_name in containers:
            logger.info("\nProcessing container: {}".format(container_name))
            container_port = get_container_port(container_id)

            if not container_port:
                logger.error("Unable to get port for container {}. Skipping.".format(container_name))
                continue

            # Connect to copy database
            with db_connection(config['DB_HOST'], container_port, config['DB_NAME'],
                               config['DB_USER'], config['DB_PASSWORD'],
                               "Copy DB ({})".format(container_name)) as copy_conn:
                if not copy_conn:
                    continue

                all_sql_statements = []
                differences_found = False

                # Compare each table
                for table in config['TABLES_TO_COMPARE']:
                    logger.info("Comparing table: {}".format(table))

                    # Get columns for the table
                    columns = get_table_columns(master_conn, table)
                    if not columns:
                        logger.warning("No columns found for table {}. Skipping.".format(table))
                        continue

                    # Get data from both databases
                    master_data = get_table_data(master_conn, table, columns)
                    copy_data = get_table_data(copy_conn, table, columns)

                    if not master_data:
                        logger.warning("No data found in master database for table {}. Skipping.".format(table))
                        continue

                    # Compare data
                    differences = compare_table_data(master_data, copy_data, primary_keys, table)

                    # Display differences
                    display_differences(differences, table)

                    # Generate SQL statements
                    if differences['missing_in_copy'] or differences['different_in_copy']:
                        differences_found = True
                        sql_statements = generate_update_sqls(differences, table, columns, primary_keys)
                        all_sql_statements.extend(sql_statements)

                        logger.info("Generated {} SQL statements for table {}".format(len(sql_statements), table))

                if not differences_found:
                    logger.info("No differences found between master and copy databases for the specified tables.")
                else:
                    logger.info("\nGenerated a total of {} SQL statements".format(len(all_sql_statements)))

                    if args.verbose:
                        logger.info("SQL statements:")
                        for stmt in all_sql_statements:
                            logger.info(stmt)

                    if args.dry_run:
                        logger.info("Dry run mode - SQL not executed.")
                    else:
                        confirm = input(
                            "\nDo you want to apply these changes to the copy database ({})? (y/n): ".format(
                                container_name))
                        if confirm.lower() == 'y':
                            success = execute_sql_statements(copy_conn, all_sql_statements)
                            if success:
                                logger.info("Changes applied successfully.")
                            else:
                                logger.error("Errors occurred while applying changes. Please check the logs.")
                        else:
                            logger.info("Changes not applied.")


if __name__ == "__main__":
    main()