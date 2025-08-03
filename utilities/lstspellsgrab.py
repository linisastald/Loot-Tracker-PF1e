import os
import re
import psycopg2
from psycopg2 import sql
import sys

def is_relevant_file(filename):
    return 'spells' in filename.lower()

def is_spell_line(line):
    return not line.startswith('#') and '\t' in line

def extract_spell_info(line, lstsource):
    parts = line.split('\t')
    name = parts[0].strip()

    type_match = re.search(r'TYPE:([^\t]+)', line)
    spell_type = type_match.group(1) if type_match else None

    school_match = re.search(r'SCHOOL:([^\t]+)', line)
    school = school_match.group(1) if school_match else None

    subschool_match = re.search(r'SUBSCHOOL:([^\t]+)', line)
    subschool = subschool_match.group(1) if subschool_match else None

    classes_match = re.search(r'CLASSES:([^\t]+)', line)
    classes = classes_match.group(1).split(',') if classes_match else []

    domains_match = re.search(r'DOMAINS:([^\t]+)', line)
    domain = domains_match.group(1) if domains_match else None

    casterlevel_match = re.search(r'CASTERLEVEL:([^\t]+)', line)
    mincasterlevel = casterlevel_match.group(1) if casterlevel_match else None

    item_match = re.search(r'ITEM:([^\t]+)', line)
    items = item_match.group(1).split(',') if item_match else []

    return (name, spell_type, school, subschool, classes, domain, mincasterlevel, items, lstsource)

def insert_spell(cursor, spell_info):
    insert_query = sql.SQL("""
        INSERT INTO spells (name, type, school, subschool, class, domain, mincasterlevel, item, source)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """)
    cursor.execute(insert_query, spell_info)

def process_lst_file(file_path, cursor):
    total_spells = 0
    lstsource = file_path

    with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
        for line in file:
            line = line.strip()
            if is_spell_line(line):
                total_spells += 1
                spell_info = extract_spell_info(line, lstsource)
                insert_spell(cursor, spell_info)

    print(f"File: {file_path}")
    print(f"Total spells processed: {total_spells}")
    print("--------------------")

    return total_spells

if __name__ == "__main__":
    lst_directory = "../../itemsnew"  # Replace with your actual directory path

    # Database connection parameters
    db_params = {
        'dbname': 'loot_tracking',
        'user': 'loot_user',
        'password': os.getenv('DB_PASSWORD'),
        'host': 'localhost'
    }
    
    # Validate required environment variables
    if not db_params['password']:
        print("Error: DB_PASSWORD environment variable is not set")
        sys.exit(1)

    # Establish database connection
    try:
        connection = psycopg2.connect(**db_params)
        print("Connected to the database successfully.")

        # Process the directory and insert data
        cursor = connection.cursor()
        total_spells_processed = 0

        for root, _, files in os.walk(lst_directory):
            for file in files:
                if file.endswith('.lst') and is_relevant_file(file):
                    file_path = os.path.join(root, file)
                    spells_processed = process_lst_file(file_path, cursor)
                    total_spells_processed += spells_processed

        print("\nProcessing Summary:")
        print(f"Total spells processed: {total_spells_processed}")

        connection.commit()
        cursor.close()

        print("Data processing and insertion completed.")
    except psycopg2.Error as e:
        print(f"Unable to connect to the database: {e}")
    finally:
        if connection:
            connection.close()
            print("Database connection closed.")