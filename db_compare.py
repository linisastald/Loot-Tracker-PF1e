#!/usr/bin/env python3

import psycopg2
from psycopg2 import sql
import argparse
import subprocess
import sys

# Common variables
DB_HOST = 'localhost'
DB_NAME = 'loot_tracking'
DB_USER = 'loot_user'
DB_PASSWORD = 'g5Zr7!cXw@2sP9Lk'  # This is the password from your script


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
    if data_type == 'ARRAY':
        return 'character varying[]'
    # Handle other cases like ARRAY[] or existing proper array notations
    elif isinstance(data_type, str) and 'ARRAY' in data_type:
        if '[' not in data_type:
            # Convert "type ARRAY" to "type[]"
            return data_type.replace('ARRAY', '[]')
    return data_type


def generate_update_sql(differences, master_structure):
    sql_statements = []

    for table in differences['missing_tables']:
        columns = master_structure['tables'].get(table, [])
        column_definitions = []

        for column, data_type in columns:
            # Fix array type notation
            fixed_data_type = fix_array_datatype(data_type)
            column_definitions.append(f"{column} {fixed_data_type}")

        sql_statements.append(f"CREATE TABLE {table} ({', '.join(column_definitions)});")

    for table, columns in differences['missing_columns'].items():
        for column, data_type in columns:
            # Fix array type notation for column additions too
            fixed_data_type = fix_array_datatype(data_type)
            sql_statements.append(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {fixed_data_type};")

    for table, indexes in differences['missing_indexes'].items():
        for index_name, indexdef in indexes:
            # For indexes, we'll check if they exist first to avoid errors
            sql_statements.append(f"""
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname = '{index_name}'
    ) THEN
        {indexdef};
    END IF;
END
$$;
""")

    return "\n".join(sql_statements)


def execute_sql_statements(conn, sql):
    """
    Execute SQL statements one by one with proper error handling
    """
    errors = []
    with conn.cursor() as cur:
        statements = [s.strip() for s in sql.split(';') if s.strip()]

        for i, statement in enumerate(statements):
            try:
                print(f"Executing statement {i + 1}/{len(statements)}")
                cur.execute(statement + ';')
            except psycopg2.Error as e:
                print(f"Error executing: {statement}")
                print(f"Error message: {e}")
                errors.append((statement, str(e)))
                # Don't break on error, continue with next statement

    if not errors:
        conn.commit()
        print("All statements executed successfully.")
        return True
    else:
        conn.rollback()
        print(f"Encountered {len(errors)} errors. Rolling back.")
        for stmt, err in errors:
            print(f"Statement: {stmt}")
            print(f"Error: {err}")
            print("-" * 50)
        return False


def main():
    parser = argparse.ArgumentParser(description="Compare PostgreSQL database structures")
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

        differences = compare_structures(master_structure, copy_structure)

        if not any(differences.values()):
            print("No differences found between master and copy databases.")
        else:
            print("Differences found:")
            print(differences)

            update_sql = generate_update_sql(differences, master_structure)
            print("\nGenerated SQL to update the copy database:")
            print(update_sql)

            confirm = input(f"\nDo you want to apply these changes to the copy database ({container_name})? (y/n): ")
            if confirm.lower() == 'y':
                success = execute_sql_statements(copy_conn, update_sql)
                if success:
                    print("Changes applied successfully.")
                else:
                    print("Some errors occurred while applying changes. Please check the output above.")
            else:
                print("Changes not applied.")

        copy_conn.close()

    master_conn.close()


if __name__ == "__main__":
    main()