import os
import re
import psycopg2
from psycopg2 import sql
import sys


def is_relevant_file(filename):
    relevant_keywords = ['equip', 'armor', 'weapon', 'item']
    return any(keyword in filename.lower() for keyword in relevant_keywords) and 'equipmod' not in filename.lower()


def extract_item_info(line):
    value = weight = caster_level = None
    item_name = line.split('\t')[0].strip()

    cost_match = re.search(r'COST:(\d+(?:\.\d+)?)', line)
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

    return item_name, value, weight, caster_level


def create_search_pattern(item_name):
    return rf"^{re.escape(item_name)}($|\t)"


def search_lst_files(item_name, lst_directory):
    search_pattern = create_search_pattern(item_name)
    matches = []
    for root, _, files in os.walk(lst_directory):
        for file in files:
            if file.endswith('.lst') and is_relevant_file(file):
                file_path = os.path.join(root, file)
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    for line in f:
                        if re.match(search_pattern, line, re.IGNORECASE):
                            lst_item_name, value, weight, caster_level = extract_item_info(line)
                            if value or weight or caster_level:
                                matches.append(
                                    (lst_item_name, value, weight, caster_level, os.path.basename(file_path)))
    return matches


def values_are_equal(val1, val2):
    if val1 is None and val2 is None:
        return True
    if val1 is None or val2 is None:
        return False
    try:
        return float(val1) == float(val2)
    except ValueError:
        return str(val1) == str(val2)


def select_match(matches, original_item):
    if not matches:
        return None

    # Check if all matches have the same values as the original item
    all_match = all(
        values_are_equal(match[1], original_item[2]) and
        values_are_equal(match[2], original_item[3]) and
        values_are_equal(match[3], original_item[4])
        for match in matches
    )

    if all_match:
        print(f"All matches for '{original_item[1]}' have the same values as the database. Skipping.")
        return None

    if len(matches) == 1:
        return matches[0]

    print(f"\nMultiple matches found for '{original_item[1]}'.")
    print(
        f"Current database values - Value: {original_item[2]}, Weight: {original_item[3]}, Caster Level: {original_item[4]}")
    print("Please select one:")
    for i, match in enumerate(matches, 1):
        print(f"{i}. {match[0]} (File: {match[4]}, Value: {match[1]}, Weight: {match[2]}, CL: {match[3]})")
    print(f"{len(matches) + 1}. Skip this item")

    while True:
        try:
            choice = int(input("Enter the number of your choice: "))
            if 1 <= choice <= len(matches):
                return matches[choice - 1]
            elif choice == len(matches) + 1:
                return None
            else:
                print("Invalid choice. Please try again.")
        except ValueError:
            print("Invalid input. Please enter a number.")


def confirm_update(attribute, current_value, new_value, source_item, source_file):
    print(f"Current {attribute}: {current_value}")
    print(f"New {attribute}: {new_value} (Source: {source_item} in {source_file})")
    return input(f"Do you want to update {attribute}? (y/n): ").lower() == 'y'


def update_item_data(cursor, connection, lst_directory):
    cursor.execute("""
        SELECT id, name, value, weight, casterlevel
        FROM item
        WHERE value IS NULL OR weight IS NULL OR casterlevel IS NULL
    """)
    items = cursor.fetchall()

    for item in items:
        item_id, name, current_value, current_weight, current_caster_level = item
        matches = search_lst_files(name, lst_directory)

        if not matches:
            continue

        selected_match = select_match(matches, item)
        if selected_match is None:
            continue

        lst_item_name, new_value, new_weight, new_caster_level, source_file = selected_match

        updates_needed = False
        if new_value is not None and not values_are_equal(current_value, new_value):
            updates_needed = True
        if new_weight is not None and not values_are_equal(current_weight, new_weight):
            updates_needed = True
        if new_caster_level is not None and not values_are_equal(current_caster_level, new_caster_level):
            updates_needed = True

        if not updates_needed:
            print(f"No updates needed for: {name}")
            continue

        print(f"\nProcessing item: {name}")
        print(f"Matched LST item: {lst_item_name}")
        print(f"Current data - Value: {current_value}, Weight: {current_weight}, Caster Level: {current_caster_level}")

        update_query = "UPDATE item SET "
        update_params = []

        if new_value is not None and not values_are_equal(current_value, new_value):
            if confirm_update("Value", current_value, new_value, lst_item_name, source_file):
                update_query += "value = %s, "
                update_params.append(new_value)

        if new_weight is not None and not values_are_equal(current_weight, new_weight):
            if confirm_update("Weight", current_weight, new_weight, lst_item_name, source_file):
                update_query += "weight = %s, "
                update_params.append(new_weight)

        if new_caster_level is not None and not values_are_equal(current_caster_level, new_caster_level):
            if confirm_update("Caster Level", current_caster_level, new_caster_level, lst_item_name, source_file):
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