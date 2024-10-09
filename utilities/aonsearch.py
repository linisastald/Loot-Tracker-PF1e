import requests
from bs4 import BeautifulSoup
import psycopg2
import re
import time
import random
from urllib.parse import quote
import math

# Database connection parameters
db_params = {
    'dbname': 'loot_tracking',
    'user': 'loot_user',
    'password': 'g5Zr7!cXw@2sP9Lk',
    'host': 'localhost'
}

# List of URLs to search
urls = [
    "https://aonprd.com/MagicWondrousDisplay.aspx?FinalName=",
    "https://aonprd.com/MagicArtifactsDisplay.aspx?ItemName=",
    "https://aonprd.com/MagicWeaponsDisplay.aspx?ItemName=",
    "https://aonprd.com/MagicArmorDisplay.aspx?ItemName=",
    "https://aonprd.com/MagicRingsDisplay.aspx?FinalName=",
    "https://aonprd.com/MagicPotionsDisplay.aspx?ItemName=",
    "https://aonprd.com/MagicCursedDisplay.aspx?ItemName=",
    "https://aonprd.com/MagicIntelligentDisplay.aspx?ItemName=",
    "https://aonprd.com/MagicRodsDisplay.aspx?FinalName=",
    "https://aonprd.com/MagicStavesDisplay.aspx?ItemName=",
    "https://aonprd.com/MagicPlantsDisplay.aspx?FinalName=",
    "https://aonprd.com/EquipmentMiscDisplay.aspx?ItemName=",
    "https://aonprd.com/EquipmentWeaponsDisplay.aspx?ItemName=",
    "https://aonprd.com/EquipmentArmorDisplay.aspx?ItemName=",
    "https://aonprd.com/SpellbookDisplay.aspx?ItemName=",
    "https://aonprd.com/Vehicles.aspx?ItemName=",
    "https://aonprd.com/Relics.aspx?ItemName=",
    "https://www.aonprd.com/MagicAltarsDisplay.aspx?ItemName="
]


def clean_number(number_str):
    if number_str is None:
        return None
    number_str = number_str.strip()
    if number_str in ['—', '-', '–', '']:
        return None
    # Remove any non-numeric characters except . and ,
    cleaned = re.sub(r'[^\d.,]', '', number_str)
    # Replace , with . if there's no . in the string (European format)
    if '.' not in cleaned and ',' in cleaned:
        cleaned = cleaned.replace(',', '.')
    else:
        # Otherwise, remove all commas
        cleaned = cleaned.replace(',', '')
    try:
        return float(cleaned)
    except ValueError:
        return None


def clean_weight(weight_str):
    return clean_number(weight_str)


def clean_value(value_str):
    return clean_number(value_str)


def get_item_info(item_name):
    print(f"\nSearching for information on: {item_name}")
    for url in urls:
        full_url = url + quote(item_name)
        print(f"Checking URL: {full_url}")
        try:
            response = requests.get(full_url)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                content = soup.get_text()

                # Use more specific regex patterns
                price_match = re.search(r'Price[:\s]+([\d,]+ gp)', content)
                cl_match = re.search(r'CL\s+(\d+)th', content)
                weight_match = re.search(r'Weight[:\s]+([\d,]+ lbs\.)', content)

                if price_match or cl_match or weight_match:
                    price = clean_number(price_match.group(1) if price_match else None)
                    cl = cl_match.group(1) if cl_match else None
                    weight = clean_number(weight_match.group(1) if weight_match else None)

                    print("Information found:")
                    print(f"Price: {price}")
                    print(f"CL: {cl}")
                    print(f"Weight: {weight}")

                    return {
                        'price': price,
                        'cl': cl,
                        'weight': weight
                    }
                else:
                    print("No relevant information found on this page.")
            else:
                print(f"Received status code {response.status_code}")
        except requests.RequestException as e:
            print(f"Error fetching {full_url}: {e}")

        # Add a delay between URL checks
        time.sleep(1)

    print("Item not found on any page.")
    return None


def float_eq(a, b, epsilon=1e-9):
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return math.isclose(float(a), float(b), rel_tol=epsilon)


def confirm_update(attribute, current_value, new_value, item_name):
    if new_value is None:
        print(f"New {attribute} is None. Skipping update.")
        return False
    print(f"Current {attribute}: {current_value}")
    print(f"New {attribute}: {new_value}")
    return input(f"Do you want to update {attribute} for {item_name}? (y/n): ").lower() == 'y'


def update_item_data(cursor, connection):
    cursor.execute("""
        SELECT id, name, value, weight, casterlevel
        FROM item
        WHERE (value IS NULL OR weight IS NULL OR casterlevel IS NULL) and type = 'magic'
        ORDER BY casterlevel DESC
    """)
    items = cursor.fetchall()
    not_found = []

    for item in items:
        item_id, name, current_value, current_weight, current_caster_level = item
        print(f"\n{'=' * 50}\nProcessing item: {name}")
        print(f"Current data - Value: {current_value}, Weight: {current_weight}, Caster Level: {current_caster_level}")

        info = get_item_info(name)
        if info is None:
            print(f"No information found for: {name}")
            not_found.append(name)
            continue

        updates_needed = False
        update_query = "UPDATE item SET "
        update_params = []

        if info['price'] is not None and not float_eq(info['price'], current_value):
            if confirm_update("Value", current_value, info['price'], name):
                update_query += "value = %s, "
                update_params.append(info['price'])
                updates_needed = True

        if info['weight'] is not None and not float_eq(info['weight'], current_weight):
            if confirm_update("Weight", current_weight, info['weight'], name):
                update_query += "weight = %s, "
                update_params.append(info['weight'])
                updates_needed = True

        if info['cl'] and not current_caster_level:
            if confirm_update("Caster Level", current_caster_level, info['cl'], name):
                update_query += "casterlevel = %s, "
                update_params.append(info['cl'])
                updates_needed = True

        if updates_needed:
            update_query = update_query.rstrip(', ')
            update_query += " WHERE id = %s"
            update_params.append(item_id)

            cursor.execute(update_query, tuple(update_params))
            connection.commit()
            print("Item updated successfully.")
        else:
            print("No updates made for this item.")

    return not_found


if __name__ == "__main__":
    try:
        connection = psycopg2.connect(**db_params)
        print("Connected to the database successfully.")

        cursor = connection.cursor()

        not_found_items = update_item_data(cursor, connection)

        print("\nData update process completed.")

        if not_found_items:
            print("\nItems not found:")
            for item in not_found_items:
                print(item)
        else:
            print("\nAll items were found and processed.")

    except psycopg2.Error as e:
        print(f"Unable to connect to the database: {e}")
    finally:
        if connection:
            cursor.close()
            connection.close()
            print("Database connection closed.")