import os
import re
import psycopg2
from psycopg2 import sql


def is_relevant_file(filename):
    relevant_keywords = ['equip', 'armor', 'weapon', 'item']
    return any(keyword in filename.lower() for keyword in relevant_keywords) and 'equipmod' not in filename.lower()


def extract_item_info(line):
    value = weight = caster_level = None

    cost_match = re.search(r'COST:(\d+)', line)
    if cost_match:
        value = cost_match.group(1)

    weight_match = re.search(r'WT:(\d+(?:\.\d+)?)', line)
    if weight_match:
        weight = weight_match.group(1)

    cl_patterns = [
        r'SPROP:[^|]*\|CL(\d+)',
        r'CL=(\d+)',
        r'CASTER LEVEL=(\d+)',
        r'CASTERLEVEL=(\d+)',
        r'\bCL\s+(\d+)',
    ]

    for pattern in cl_patterns:
        cl_match = re.search(pattern, line, re.IGNORECASE)
        if cl_match:
            caster_level = cl_match.group(1)
            break

    return value, weight, caster_level


def create_flexible_search_pattern(item_name):
    # Remove special characters and convert to lowercase
    cleaned_name = re.sub(r'[^\w\s]', '', item_name.lower())
    # Split into words
    words = cleaned_name.split()
    # Create a pattern that allows for words in any order and optional parentheses
    pattern = r'.*'.join(re.escape(word) for word in words)
    return rf'\b{pattern}\b|\({pattern}\)|\b{pattern}\s*\([^)]*\)'


def search_lst_files(item_name, lst_directory):
    search_pattern = create_flexible_search_pattern(item_name)
    for root, _, files in os.walk(lst_directory):
        for file in files:
            if file.endswith('.lst') and is_relevant_file(file):
                file_path = os.path.join(root, file)
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    for line in f:
                        if re.search(search_pattern, line, re.IGNORECASE):
                            value, weight, caster_level = extract_item_info(line)
                            if value or weight or caster_level:
                                return value, weight, caster_level
    return None, None, None


def update_item_data(cursor, connection, lst_directory):
    # Select items with missing data
    cursor.execute("""
        SELECT id, name, value, weight, casterlevel
        FROM itemtesting
        WHERE value IS NULL OR weight IS NULL OR casterlevel IS NULL
    """)
    items = cursor.fetchall()

    for item in items:
        item_id, name, current_value, current_weight, current_caster_level = item
        print(f"\nProcessing item: {name}")
        print(f"Current data - Value: {current_value}, Weight: {current_weight}, Caster Level: {current_caster_level}")

        value, weight, caster_level = search_lst_files(name, lst_directory)

        if value or weight or caster_level:
            print("Found new data:")
            if value and current_value is None:
                print(f"Value: {value}")
            if weight and current_weight is None:
                print(f"Weight: {weight}")
            if caster_level and current_caster_level is None:
                print(f"Caster Level: {caster_level}")

            confirm = input("Do you want to update this item? (y/n): ").lower()
            if confirm == 'y':
                update_query = "UPDATE itemtesting SET "
                update_params = []
                if value and current_value is None:
                    update_query += "value = %s, "
                    update_params.append(value)
                if weight and current_weight is None:
                    update_query += "weight = %s, "
                    update_params.append(weight)
                if caster_level and current_caster_level is None:
                    update_query += "casterlevel = %s, "
                    update_params.append(caster_level)

                update_query = update_query.rstrip(', ')
                update_query += " WHERE id = %s"
                update_params.append(item_id)

                cursor.execute(update_query, tuple(update_params))
                connection.commit()
                print("Item updated successfully.")
            else:
                print("Update skipped.")
        else:
            print("No new data found. Skipping to next item.")


if __name__ == "__main__":
    lst_directory = "../../itemsnew"  # Replace with your actual directory path

    # Database connection parameters
    db_params = {
        'dbname': 'loot_tracking',
        'user': 'loot_user',
        'password': 'g5Zr7!cXw@2sP9Lk',
        'host': 'localhost'
    }

    # Establish database connection
    try:
        connection = psycopg2.connect(**db_params)
        print("Connected to the database successfully.")

        cursor = connection.cursor()

        update_item_data(cursor, connection, lst_directory)

        print("\nData update process completed.")
    except psycopg2.Error as e:
        print(f"Unable to connect to the database: {e}")
    finally:
        if connection:
            cursor.close()
            connection.close()
            print("Database connection closed.")