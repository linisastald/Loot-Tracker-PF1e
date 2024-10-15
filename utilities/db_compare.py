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

# Tables to check and create if missing
TABLES_TO_CHECK = [
    'appraisal', 'characters', 'consumableuse', 'golarion_calendar_notes',
    'golarion_current_date', 'gold', 'identify', 'invites', 'item', 'loot',
    'mod', 'settings', 'sold', 'spells', 'users'
]

# Tables to replicate content exactly
TABLES_TO_REPLICATE = ['item', 'mod', 'spells']

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
                SELECT table_name, column_name, 
                       CASE WHEN data_type = 'ARRAY' 
                            THEN 'ARRAY'
                            ELSE data_type 
                       END as data_type
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = ANY(%s)
                ORDER BY table_name, ordinal_position
            """, (TABLES_TO_CHECK,))
            for table, column, data_type in cur.fetchall():
                if table not in structure['tables']:
                    structure['tables'][table] = []
                structure['tables'][table].append((column, data_type))

            # Get indexes
            cur.execute("""
                SELECT tablename, indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = 'public' AND tablename = ANY(%s)
            """, (TABLES_TO_CHECK,))
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
        column_definitions = []
        for column, data_type in columns:
            if data_type.upper() == 'ARRAY':
                column_definitions.append(f"{column} character varying[]")  # Assuming it's an array of strings
            else:
                column_definitions.append(f"{column} {data_type}")
        column_definitions_str = ", ".join(column_definitions)
        sql_statements.append(f"CREATE TABLE IF NOT EXISTS {table} ({column_definitions_str});")

    for table, columns in differences['missing_columns'].items():
        for column, data_type in columns:
            if data_type.upper() == 'ARRAY':
                sql_statements.append(f"""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                       WHERE table_name='{table}' AND column_name='{column}') THEN
                            ALTER TABLE {table} ADD COLUMN {column} character varying[];
                        END IF;
                    END $$;
                """)
            else:
                sql_statements.append(f"""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                       WHERE table_name='{table}' AND column_name='{column}') THEN
                            ALTER TABLE {table} ADD COLUMN {column} {data_type};
                        END IF;
                    END $$;
                """)

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
    extra_in_copy = copy_set - master_set

    return list(missing_in_copy), list(extra_in_copy)

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
        elif isinstance(val, list):  # Handle ARRAY type
            return f"ARRAY[{','.join(map(format_value, val))}]"
        else:
            return str(val)

    for row in rows:
        value_str = ", ".join(map(format_value, row))
        values.append(f"({value_str})")

    values_str = ", ".join(values)
    return f"INSERT INTO {table} ({column_names}) VALUES {values_str};"

def reconcile_table_data(master_conn, copy_conn, table, master_structure):
    master_data = get_table_data(master_conn, table)
    copy_data = get_table_data(copy_conn, table)

    missing_in_copy, extra_in_copy = compare_table_data(master_data, copy_data)

    if missing_in_copy or extra_in_copy:
        print(f"\nDifferences found in table {table}:")
        if missing_in_copy:
            print(f"Rows missing in copy database: {len(missing_in_copy)}")
        if extra_in_copy:
            print(f"Extra rows in copy database: {len(extra_in_copy)}")

        confirm = input(f"Do you want to add missing rows to the {table} table in the copy database? (y/n): ")
        if confirm.lower() == 'y':
            try:
                with copy_conn.cursor() as cur:
                    columns = [col[0] for col in master_structure['tables'][table]]
                    insert_sql = generate_insert_sql(table, columns, missing_in_copy)
                    cur.execute(insert_sql)
                copy_conn.commit()
                print(f"Added missing rows to table {table} in copy database.")
            except psycopg2.Error as e:
                print(f"Error updating table {table}: {e}")
                copy_conn.rollback()
        else:
            print(f"Table {table} not updated.")

        if extra_in_copy:
            print(f"\nWARNING: There are {len(extra_in_copy)} extra rows in the copy database for table {table}.")
            print("These rows are not present in the master database.")
            print("You may want to manually review these differences.")
    else:
        print(f"\nNo differences found in table {table}.")

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

            confirm = input(f"\nDo you want to apply these structural changes to the copy database ({container_name})? (y/n): ")
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

        # Compare and reconcile data for tables that need exact replication
        for table in TABLES_TO_REPLICATE:
            reconcile_table_data(master_conn, copy_conn, table, master_structure)

        copy_conn.close()

    master_conn.close()

if __name__ == "__main__":
    main()