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
DB_PASSWORD = 'g5Zr7!cXw@2sP9Lk'  # Replace this with the actual password

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

def backup_itemtesting_table(conn):
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM itemtesting")
            rows = cur.fetchall()
            with open('itemtesting_backup.sql', 'w') as f:
                for row in rows:
                    f.write(f"INSERT INTO itemtesting VALUES {row};\n")
        print("Backup of itemtesting table created.")
    except psycopg2.Error as e:
        print(f"Error creating backup: {e}")

def drop_tables(conn):
    try:
        with conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS itemtest, itemtest1, itemtesting, itemtestingbak;")
        conn.commit()
        print("Tables dropped successfully.")
    except psycopg2.Error as e:
        print(f"Error dropping tables: {e}")

def remove_loot_itemid(conn):
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE loot SET itemid = NULL;")
        conn.commit()
        print("loot.itemid removed from all rows.")
    except psycopg2.Error as e:
        print(f"Error removing loot.itemid: {e}")

def empty_item_table(conn):
    try:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE item RESTART IDENTITY;")
        conn.commit()
        print("item table emptied and ID sequence reset.")
    except psycopg2.Error as e:
        print(f"Error emptying item table: {e}")

def insert_items_from_master(master_conn, copy_conn):
    try:
        with master_conn.cursor() as master_cur, copy_conn.cursor() as copy_cur:
            master_cur.execute("SELECT * FROM item")
            copy_cur.executemany("INSERT INTO item VALUES (%s, %s, %s, %s, %s, %s)", master_cur)
        copy_conn.commit()
        print("Items inserted from master to copy.")
    except psycopg2.Error as e:
        print(f"Error inserting items: {e}")

def verify_item_data(conn):
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*), MAX(id) FROM item")
            count, max_id = cur.fetchone()
            cur.execute("SELECT id, name FROM item ORDER BY id LIMIT 10")
            sample = cur.fetchall()
        return count, max_id, sample
    except psycopg2.Error as e:
        print(f"Error verifying item data: {e}")
        return None, None, None

def main():
    parser = argparse.ArgumentParser(description="Update and compare PostgreSQL database structures")
    parser.add_argument("--master-port", type=int, default=5432, help="Master DB port")
    args = parser.parse_args()

    master_conn = connect_to_db(args.master_port)
    if not master_conn:
        sys.exit(1)

    # Step 1: Backup itemtesting table and drop tables on master
    backup_itemtesting_table(master_conn)
    drop_tables(master_conn)

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

        # Step 2: Remove loot.itemid
        remove_loot_itemid(copy_conn)

        # Step 3: Empty item table
        empty_item_table(copy_conn)

        # Step 4: Insert items from master to copy
        insert_items_from_master(master_conn, copy_conn)

        # Step 5: Verify item data
        count, max_id, sample = verify_item_data(copy_conn)
        print(f"Verification for {container_name}:")
        print(f"  Item count: {count}")
        print(f"  Max ID: {max_id}")
        print("  Sample data:")
        for row in sample:
            print(f"    {row}")

        # Perform structure comparison
        master_structure = get_db_structure(master_conn)
        copy_structure = get_db_structure(copy_conn)
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

        copy_conn.close()

    master_conn.close()

if __name__ == "__main__":
    main()