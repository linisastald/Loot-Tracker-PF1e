#!/usr/bin/env python3

import psycopg2
from psycopg2 import sql
import argparse
import subprocess
import sys
from termcolor import colored

# Common variables
DB_HOST = 'localhost'
DB_NAME = 'loot_tracking'
DB_USER = 'loot_user'
DB_PASSWORD = 'g5Zr7!cXw@2sP9Lk'  # Replace this with the actual password

# Tables to not replicate rows
NON_REPLICATED_TABLES = [
    'appraisal', 'characters', 'consumableuse', 'gold', 'identify',
    'invites', 'loot', 'settings', 'sold', 'users'
]


def get_docker_container_ids():
    try:
        result = subprocess.run(['docker', 'ps', '--format', '{{.ID}}\t{{.Names}}'],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                universal_newlines=True, check=True)
        containers = []
        for line in result.stdout.split('\n'):
            if line:
                container_id, name = line.split('\t')
                if name.endswith('loot_db'):
                    containers.append((container_id, name))
        return containers
    except subprocess.CalledProcessError as e:
        print(f"Error running docker command: {e}")
        return []
    except Exception as e:
        print(f"Unexpected error: {e}")
        return []


def get_container_port(container_id):
    try:
        result = subprocess.run(['docker', 'port', container_id, '5432'],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                universal_newlines=True, check=True)
        if result.stdout:
            return result.stdout.split(':')[-1].strip()
    except subprocess.CalledProcessError as e:
        print(f"Error getting port for container {container_id}: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")
    return None


def connect_to_db(port):
    try:
        return psycopg2.connect(
            host=DB_HOST,
            port=port,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
    except psycopg2.Error as e:
        print(f"Unable to connect to database: {e}")
        return None


def get_db_structure(conn):
    structure = {'tables': {}, 'indexes': {}}

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
                structure['tables'][table].append((column, data_type))

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
        print(f"Error fetching database structure: {e}")

    return structure


def compare_structures(master, copy):
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
            master_columns = set(master['tables'][table])
            copy_columns = set(copy['tables'][table])
            missing_columns = master_columns - copy_columns
            if missing_columns:
                differences['missing_columns'][table] = list(missing_columns)

    # Check for missing indexes
    for table in master['indexes']:
        if table in copy['indexes']:
            master_indexes = set(master['indexes'][table])
            copy_indexes = set(copy['indexes'][table])
            missing_indexes = master_indexes - copy_indexes
            if missing_indexes:
                differences['missing_indexes'][table] = list(missing_indexes)
        elif table not in differences['missing_tables']:
            differences['missing_indexes'][table] = master['indexes'][table]

    return differences


def generate_update_sql(differences, master_structure):
    sql_statements = []

    for table in differences['missing_tables']:
        columns = master_structure['tables'].get(table, [])
        column_definitions = ", ".join([f"{column} {data_type}" for column, data_type in columns])
        sql_statements.append(f"CREATE TABLE {table} ({column_definitions});")

    for table, columns in differences['missing_columns'].items():
        for column, data_type in columns:
            sql_statements.append(f"ALTER TABLE {table} ADD COLUMN {column} {data_type};")

    for table, indexes in differences['missing_indexes'].items():
        for _, indexdef in indexes:
            sql_statements.append(indexdef + ";")

    return "\n".join(sql_statements)


def get_table_data(conn, table):
    with conn.cursor() as cur:
        cur.execute(f"SELECT * FROM {table}")
        return cur.fetchall()


def compare_table_data(master_data, copy_data):
    master_set = set(map(tuple, master_data))
    copy_set = set(map(tuple, copy_data))

    missing_in_copy = master_set - copy_set
    missing_in_master = copy_set - master_set

    return list(missing_in_copy), list(missing_in_master)


def generate_insert_sql(table, columns, rows):
    if not rows:
        return ""

    column_names = ", ".join(columns)
    values = []

    def format_value(val):
        if val is None:
            return "NULL"
        elif isinstance(val, str):
            # Escape single quotes by doubling them
            escaped_val = val.replace("'", "''")
            return f"'{escaped_val}'"
        else:
            return str(val)

    for row in rows:
        value_str = ", ".join(map(format_value, row))
        values.append(f"({value_str})")

    values_str = ", ".join(values)
    return f"INSERT INTO {table} ({column_names}) VALUES {values_str};"


def main():
    parser = argparse.ArgumentParser(description="Compare PostgreSQL database structures and data")
    parser.add_argument("--master-port", type=int, default=5432, help="Master DB port")
    args = parser.parse_args()

    master_conn = connect_to_db(args.master_port)
    if not master_conn:
        sys.exit(1)

    master_structure = get_db_structure(master_conn)

    containers = get_docker_container_ids()

    for container_id, container_name in containers:
        print(f"\nProcessing container: {container_name}")
        container_port = get_container_port(container_id)
        if not container_port:
            print(f"Unable to get port for container {container_name}. Skipping.")
            continue

        copy_conn = connect_to_db(container_port)
        if not copy_conn:
            continue

        copy_structure = get_db_structure(copy_conn)

        # Compare structures
        differences = compare_structures(master_structure, copy_structure)

        if not any(differences.values()):
            print("No structural differences found between master and copy databases.")
        else:
            print("Structural differences found:")
            print(differences)

            update_sql = generate_update_sql(differences, master_structure)
            print("\nGenerated SQL to update the copy database structure:")
            print(update_sql)

            confirm = input(
                f"\nDo you want to apply these structural changes to the copy database ({container_name})? (y/n): ")
            if confirm.lower() == 'y':
                try:
                    with copy_conn.cursor() as cur:
                        cur.execute(update_sql)
                    copy_conn.commit()
                    print("Structural changes applied successfully.")
                except psycopg2.Error as e:
                    print(f"Error applying structural changes: {e}")
                    copy_conn.rollback()
            else:
                print("Structural changes not applied.")

        # Compare data
        for table in master_structure['tables']:
            if table not in NON_REPLICATED_TABLES:
                master_data = get_table_data(master_conn, table)
                copy_data = get_table_data(copy_conn, table)

                missing_in_copy, missing_in_master = compare_table_data(master_data, copy_data)

                if missing_in_copy:
                    print(f"\nRows missing in copy database for table {table}:")
                    print(missing_in_copy)

                    columns = [col[0] for col in master_structure['tables'][table]]
                    insert_sql = generate_insert_sql(table, columns, missing_in_copy)

                    confirm = input(
                        f"Do you want to add these missing rows to the copy database ({container_name})? (y/n): ")
                    if confirm.lower() == 'y':
                        try:
                            with copy_conn.cursor() as cur:
                                cur.execute(insert_sql)
                            copy_conn.commit()
                            print(f"Missing rows added to {table} in copy database.")
                        except psycopg2.Error as e:
                            print(f"Error adding missing rows: {e}")
                            print(f"SQL that caused the error: {insert_sql}")
                            print("Detailed error information:")
                            print(f"pgerror: {e.pgerror}")
                            print(f"pgcode: {e.pgcode}")
                            copy_conn.rollback()
                    else:
                        print("Missing rows not added.")

                if missing_in_master:
                    print(colored(f"\nWARNING: Rows found in copy database but missing in master for table {table}:",
                                  "red"))
                    print(colored(str(missing_in_master), "red"))

                    columns = [col[0] for col in master_structure['tables'][table]]
                    insert_sql = generate_insert_sql(table, columns, missing_in_master)

                    confirm = input(colored(f"Do you want to add these rows to the master database? (y/n): ", "red"))
                    if confirm.lower() == 'y':
                        try:
                            with master_conn.cursor() as cur:
                                cur.execute(insert_sql)
                            master_conn.commit()
                            print(f"Rows added to {table} in master database.")
                        except psycopg2.Error as e:
                            print(f"Error adding rows to master: {e}")
                            print(f"SQL that caused the error: {insert_sql}")
                            print("Detailed error information:")
                            print(f"pgerror: {e.pgerror}")
                            print(f"pgcode: {e.pgcode}")
                            master_conn.rollback()
                    else:
                        print("Rows not added to master database.")

        copy_conn.close()

    master_conn.close()


if __name__ == "__main__":
    main()