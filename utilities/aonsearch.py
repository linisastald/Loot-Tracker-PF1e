import requests
from bs4 import BeautifulSoup
import psycopg2
import re
import time
from urllib.parse import quote
import math
import threading
import queue

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

# Global queues for managing items
item_queue = queue.Queue()
update_queue = queue.Queue()


def clean_number(number_str):
    if number_str is None:
        return None
    number_str = number_str.strip()
    if number_str in ['—', '-', '–', '']:
        return None

    number_str = re.sub(r'\s*(gp|lbs\.)\s*$', '', number_str, flags=re.IGNORECASE)
    cleaned = re.sub(r'[^\d.,]', '', number_str)
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
    for url in urls:
        full_url = url + quote(item_name)
        try:
            response = requests.get(full_url)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                content = soup.get_text()

                price_match = re.search(r'Price[:\s]+([^;]+)', content)
                cl_match = re.search(r'CL\s+(\d+)th', content)
                weight_match = re.search(r'Weight[:\s]+([\d,.]+ lbs\.)', content)

                if price_match or cl_match or weight_match:
                    price = clean_number(price_match.group(1) if price_match else None)
                    cl = cl_match.group(1) if cl_match else None
                    weight = clean_number(weight_match.group(1) if weight_match else None)

                    result = {}
                    if price is not None:
                        result['price'] = price
                    if cl is not None:
                        result['cl'] = cl
                    if weight is not None:
                        result['weight'] = weight

                    return result if result else None
        except requests.RequestException:
            pass

        time.sleep(1)

    return None


def float_eq(a, b, epsilon=1e-9):
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return math.isclose(float(a), float(b), rel_tol=epsilon)


def process_items():
    while True:
        try:
            item = item_queue.get(timeout=1)
        except queue.Empty:
            break

        item_id, name, current_value, current_weight, current_caster_level = item

        info = get_item_info(name)
        if not info:
            continue

        updates = []
        if 'price' in info and info['price'] is not None:
            if current_value is None or not float_eq(info['price'], current_value):
                updates.append(('Value', current_value, info['price'], 'value'))

        if 'weight' in info and info['weight'] is not None:
            if current_weight is None or not float_eq(info['weight'], current_weight):
                updates.append(('Weight', current_weight, info['weight'], 'weight'))

        if 'cl' in info and info['cl'] is not None:
            if current_caster_level is None:
                updates.append(('Caster Level', current_caster_level, info['cl'], 'casterlevel'))

        if updates:
            update_queue.put((item_id, name, updates, current_value, current_weight, current_caster_level, info))


def update_item_data(cursor, connection):
    cursor.execute("""
        SELECT id, name, value, weight, casterlevel
        FROM item
        WHERE (value IS NULL OR weight IS NULL OR casterlevel IS NULL) and type = 'magic'
        ORDER BY casterlevel DESC
    """)
    items = cursor.fetchall()

    for item in items:
        item_queue.put(item)

    processing_thread = threading.Thread(target=process_items)
    processing_thread.start()

    while processing_thread.is_alive() or not update_queue.empty():
        try:
            item_id, name, updates, current_value, current_weight, current_caster_level, info = update_queue.get(
                timeout=1)
        except queue.Empty:
            continue

        print(f"\nPotential Update item: {name}")
        print("=" * 50)
        print(f"Current data - Value: {current_value}, Weight: {current_weight}, Caster Level: {current_caster_level}")
        print("-" * 40)
        print(f"Information found: Price: {info.get('price')}, Weight: {info.get('weight')}, CL: {info.get('cl')}")
        print("=" * 50)

        updates_needed = False
        update_query = "UPDATE item SET "
        update_params = []

        for attribute, current_value, new_value, column in updates:
            print(f"Current {attribute}: {current_value}")
            print(f"New {attribute}: {new_value}")
            if input(f"Do you want to update {attribute} for {name}? (y/n): ").lower() == 'y':
                update_query += f"{column} = %s, "
                update_params.append(new_value)
                updates_needed = True
            print("-" * 40)

        if updates_needed:
            update_query = update_query.rstrip(', ')
            update_query += " WHERE id = %s"
            update_params.append(item_id)

            cursor.execute(update_query, tuple(update_params))
            connection.commit()
            print("Item updated successfully.")
        else:
            print("No updates made for this item.")

    processing_thread.join()


if __name__ == "__main__":
    try:
        connection = psycopg2.connect(**db_params)
        print("Connected to the database successfully.")

        cursor = connection.cursor()

        update_item_data(cursor, connection)

        print("\nData update process completed.")

    except psycopg2.Error as e:
        print(f"Unable to connect to the database: {e}")
    finally:
        if connection:
            cursor.close()
            connection.close()
            print("Database connection closed.")