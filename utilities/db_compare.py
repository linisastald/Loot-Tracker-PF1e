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

# ... (keep the existing functions: get_docker_container_ids, get_container_port, connect_to_db)

def get_db_structure(conn):
    structure = {'tables': {}, 'indexes': {}}

    try:
        with conn.cursor() as cur:
            # Get tables and columns
            cur.execute("""
                SELECT table_name, column_name, data_type
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

# ... (keep the existing functions: compare_structures, generate_update_sql, get_table_data, compare_table_data, generate_insert_sql)

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

        # Compare data for tables that need exact replication
        for table in TABLES_TO_REPLICATE:
            master_data = get_table_data(master_conn, table)
            copy_data = get_table_data(copy_conn, table)

            missing_in_copy, extra_in_copy = compare_table_data(master_data, copy_data)

            if missing_in_copy or extra_in_copy:
                print(f"\nDifferences found in table {table}:")
                if missing_in_copy:
                    print(f"Rows missing in copy database: {len(missing_in_copy)}")
                if extra_in_copy:
                    print(f"Extra rows in copy database: {len(extra_in_copy)}")

                confirm = input(f"Do you want to make the {table} table in the copy database identical to the master? (y/n): ")
                if confirm.lower() == 'y':
                    try:
                        with copy_conn.cursor() as cur:
                            cur.execute(f"DELETE FROM {table}")
                            columns = [col[0] for col in master_structure['tables'][table]]
                            insert_sql = generate_insert_sql(table, columns, master_data)
                            cur.execute(insert_sql)
                        copy_conn.commit()
                        print(f"Table {table} in copy database now matches the master.")
                    except psycopg2.Error as e:
                        print(f"Error updating table {table}: {e}")
                        copy_conn.rollback()
                else:
                    print(f"Table {table} not updated.")

        copy_conn.close()

    master_conn.close()

if __name__ == "__main__":
    main()