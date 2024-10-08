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
    cleaned_name = re.sub(r'[^\w\s]', '', item_name.lower())
    words = cleaned_name.split()
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


def confirm_update(attribute, current_value, new_value):
    print(f"Current {attribute}: {current_value}")
    print(f"New {attribute}: {new_value}")
    return input(f"Do you want to update {attribute}? (y/n): ").lower() == 'y'


def update_item_data(cursor, connection, lst_directory):
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

        new_value, new_weight, new_caster_level = search_lst_files(name, lst_directory)

        # Check if all new values are the same as current values
        if (new_value == current_value or new_value is None) and \
                (new_weight == current_weight or new_weight is None) and \
                (new_caster_level == current_caster_level or new_caster_level is None):
            print("No new information found. Skipping this item.")
            continue

        update_query = "UPDATE itemtesting SET "
        update_params = []

        if new_value and new_value != current_value:
            if confirm_update("Value", current_value, new_value):
                update_query += "value = %s, "
                update_params.append(new_value)

        if new_weight and new_weight != current_weight:
            if confirm_update("Weight", current_weight, new_weight):
                update_query += "weight = %s, "
                update_params.append(new_weight)

        if new_caster_level and new_caster_level != current_caster_level:
            if confirm_update("Caster Level", current_caster_level, new_caster_level):
                update_query += "casterlevel = %s, "
                update_params.append(new_caster_level)

        if update_params:
            update_query = update_query.rstrip(', ')
            update_query += " WHERE id = %s"
            update_params.append(item_id)

            cursor.execute(update_query, tuple(update_params))
            connection.commit()
            print("Item updated successfully.")
        else:
            print("No updates made for this item.")


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