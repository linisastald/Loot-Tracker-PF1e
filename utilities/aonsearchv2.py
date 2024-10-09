import requests
from bs4 import BeautifulSoup
import psycopg2
import re
import time
from urllib.parse import quote
import math
import threading
import queue
from blessed import Terminal
import logging
import traceback
import sys

# Set up logging
logging.basicConfig(filename='loot_tracker_debug.log', level=logging.DEBUG,
                    format='%(asctime)s - %(levelname)s - %(message)s')

# Database connection parameters
db_params = {
    'dbname': 'loot_tracking',
    'user': 'loot_user',
    'password': 'g5Zr7!cXw@2sP9Lk',
    'host': 'localhost'
}

# URLs to check
urls = [
    ("Magic - Wondrous", "https://aonprd.com/MagicWondrousDisplay.aspx?FinalName="),
    ("Magic - Artifacts", "https://aonprd.com/MagicArtifactsDisplay.aspx?ItemName="),
    ("Magic - Weapons", "https://aonprd.com/MagicWeaponsDisplay.aspx?ItemName="),
    ("Magic - Armor", "https://aonprd.com/MagicArmorDisplay.aspx?ItemName="),
    ("Magic - Rings", "https://aonprd.com/MagicRingsDisplay.aspx?FinalName="),
    ("Magic - Potions", "https://aonprd.com/MagicPotionsDisplay.aspx?ItemName="),
    ("Magic - Cursed", "https://aonprd.com/MagicCursedDisplay.aspx?ItemName="),
    ("Magic - Intelligent", "https://aonprd.com/MagicIntelligentDisplay.aspx?ItemName="),
    ("Magic - Rods", "https://aonprd.com/MagicRodsDisplay.aspx?FinalName="),
    ("Magic - Staves", "https://aonprd.com/MagicStavesDisplay.aspx?ItemName="),
    ("Magic - Plants", "https://aonprd.com/MagicPlantsDisplay.aspx?FinalName="),
    ("Equipment - Misc", "https://aonprd.com/EquipmentMiscDisplay.aspx?ItemName="),
    ("Equipment - Weapons", "https://aonprd.com/EquipmentWeaponsDisplay.aspx?ItemName="),
    ("Equipment - Armor", "https://aonprd.com/EquipmentArmorDisplay.aspx?ItemName="),
    ("Spellbook", "https://aonprd.com/SpellbookDisplay.aspx?ItemName="),
    ("Vehicles", "https://aonprd.com/Vehicles.aspx?ItemName="),
    ("Relics", "https://aonprd.com/Relics.aspx?ItemName="),
    ("Magic - Altars", "https://www.aonprd.com/MagicAltarsDisplay.aspx?ItemName=")
]

# Global variables
item_queue = queue.Queue()
update_queue = queue.Queue()
current_item = None
checked_urls = {url[0]: None for url in urls}
total_items = 0
processed_items = 0

term = Terminal()


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


def float_eq(a, b, epsilon=1e-9):
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return math.isclose(float(a), float(b), rel_tol=epsilon)


def get_item_info(item_name):
    global checked_urls
    for url_name, url in urls:
        full_url = url + quote(item_name)
        checked_urls[url_name] = 'Checking'
        update_ui()
        try:
            response = requests.get(full_url, timeout=10)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                content = soup.get_text()

                price_match = re.search(r'Price[:\s]+([^;]+)', content)
                cl_match = re.search(r'CL\s+(\d+)th', content)
                weight_match = re.search(r'Weight[:\s]+([\d,.]+ lbs\.)', content)

                if price_match or cl_match or weight_match:
                    price = clean_number(price_match.group(1) if price_match else None)
                    cl = int(cl_match.group(1)) if cl_match else None
                    weight = clean_number(weight_match.group(1) if weight_match else None)

                    checked_urls[url_name] = 'Found'
                    update_ui()
                    return {'price': price, 'cl': cl, 'weight': weight, 'source_url': full_url}

            checked_urls[url_name] = 'Not Found'
        except requests.RequestException:
            checked_urls[url_name] = 'Error'
        update_ui()
        time.sleep(1)
    return None


def process_items():
    global processed_items, current_item
    while not item_queue.empty():
        item = item_queue.get()
        item_id, name, current_value, current_weight, current_caster_level = item
        current_item = name
        update_ui()

        info = get_item_info(name)
        if info:
            updates = []
            if 'price' in info and info['price'] is not None and not float_eq(info['price'], current_value):
                updates.append(('Value', current_value, info['price'], 'value'))
            if 'weight' in info and info['weight'] is not None and not float_eq(info['weight'], current_weight):
                updates.append(('Weight', current_weight, info['weight'], 'weight'))
            if 'cl' in info and info['cl'] is not None and info['cl'] != current_caster_level:
                updates.append(('Caster Level', current_caster_level, info['cl'], 'casterlevel'))

            if updates:
                update_queue.put((item_id, name, updates, current_value, current_weight, current_caster_level, info))

        processed_items += 1
        update_ui()


def update_ui():
    with term.location(0, 0):
        print(term.clear())
        progress = int((processed_items / total_items) * 80) if total_items > 0 else 0
        print(f"Checking #{processed_items:<5d} [{'#' * progress}{' ' * (80 - progress)}] Total {total_items:<5d}")
        print(f"Checking Item: {current_item}")

        for url_name, status in checked_urls.items():
            status_str = "Not checked" if status is None else status
            status_color = term.yellow if status is None else (term.green if status == 'Found' else term.red)
            print(f"{url_name[:20]:<20} {status_color(status_str):<10}")

        if not item_queue.empty():
            next_item = item_queue.queue[0][1]
            print(f"Next Item: {next_item}")

        print("-" * term.width)


def get_user_input(prompt):
    print(term.move_y(term.height - 1) + term.center(prompt + " (V/W/C/A/F): "))
    with term.cbreak():
        key = term.inkey()
        return key.lower()


def update_item_data(cursor, connection):
    global total_items, processed_items, current_item

    cursor.execute("""
        SELECT id, name, value, weight, casterlevel
        FROM item
        WHERE (value IS NULL OR weight IS NULL OR (casterlevel IS NULL and type = 'magic')) and type = 'magic'
        and (subtype not in ('wand','scroll','potion') or subtype is null)
        ORDER BY random()
    """)
    items = cursor.fetchall()
    total_items = len(items)

    for item in items:
        item_queue.put(item)

    processing_thread = threading.Thread(target=process_items)
    processing_thread.start()

    while processing_thread.is_alive() or not update_queue.empty():
        try:
            item_id, name, updates, current_value, current_weight, current_caster_level, info = update_queue.get(
                timeout=1)
            print(f"\nUpdate Item: {name}")
            print(f"Source: {info['source_url']}")
            print("\nCurrent Data:")
            print(f"Value    {current_value}")
            print(f"Weight   {current_weight}")
            print(f"CL       {current_caster_level}")
            print("\nFound Data:")
            print(f"Value    {info['price']}")
            print(f"Weight   {info['weight']}")
            print(f"CL       {info['cl']}")
            print("\nAvailable updates:")
            for update in updates:
                print(f"Update {update[0]} ({update[0][0]}): {update[1]} -> {update[2]}")
            print("Update all (A)")
            print("Finish Item (F)")

            choice = get_user_input("Enter your choice for updates")

            if choice == 'a':
                update_fields = [f"{update[3]} = %s" for update in updates]
                update_params = [update[2] for update in updates]
            elif choice in ['v', 'w', 'c']:
                update = next((u for u in updates if u[0][0].lower() == choice), None)
                if update:
                    update_fields = [f"{update[3]} = %s"]
                    update_params = [update[2]]
                else:
                    continue
            elif choice == 'f':
                continue
            else:
                print("Invalid choice. Skipping this item.")
                continue

            if update_fields:
                update_query = f"UPDATE item SET {', '.join(update_fields)} WHERE id = %s"
                cursor.execute(update_query, tuple(update_params + [item_id]))
                connection.commit()
                print(f"Updated item {name}")

        except queue.Empty:
            pass

    processing_thread.join()


if __name__ == "__main__":
    try:
        connection = psycopg2.connect(**db_params)
        cursor = connection.cursor()

        with term.fullscreen(), term.hidden_cursor():
            update_item_data(cursor, connection)

        print(term.normal + term.clear + "Data update process completed. Press any key to exit.")
        term.inkey()

    except KeyboardInterrupt:
        print(term.normal + term.clear + "Script interrupted by user.")
    except Exception as e:
        logging.error(f"An error occurred: {str(e)}", exc_info=True)
        print(term.normal + term.clear + f"An error occurred: {e}")
    finally:
        if 'connection' in locals():
            cursor.close()
            connection.close()
        print("Script execution finished.")