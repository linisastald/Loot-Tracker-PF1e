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

# Database connection parameters
db_params = {
    'dbname': 'loot_tracking',
    'user': 'loot_user',
    'password': 'g5Zr7!cXw@2sP9Lk',
    'host': 'localhost'
}

# List of URLs to display
urls = [
    "Magic - Wondrous",
    "Magic - Artifacts",
    "Magic - Weapons",
    "Magic - Armor",
    "Magic - Rings",
    "Magic - Potions",
    "Magic - Cursed",
    "Magic - Intelligent",
    "Magic - Rods",
    "Magic - Staves",
    "Magic - Plants",
    "Equipment - Misc",
    "Equipment - Weapons",
    "Equipment - Armor",
    "Spellbook",
    "Vehicles",
    "Relics",
    "Magic - Altars"
]

# List of real URLs to search
real_urls = [
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

# Global queues and variables for managing items and UI updates
item_queue = queue.Queue()
update_queue = queue.Queue()
current_search_item = None
current_update_item = None
checked_urls = {}
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


def clean_weight(weight_str):
    return clean_number(weight_str)


def clean_value(value_str):
    return clean_number(value_str)


def float_eq(a, b, epsilon=1e-9):
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return math.isclose(float(a), float(b), rel_tol=epsilon)


def get_item_info(item_name):
    global current_search_item, checked_urls
    current_search_item = item_name
    checked_urls = {url: None for url in urls}

    for i, url in enumerate(real_urls):
        full_url = url + quote(item_name)
        checked_urls[urls[i]] = 'Checking'
        update_ui()
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

                    checked_urls[urls[i]] = 'Found'
                    update_ui()
                    return result if result else None

                checked_urls[urls[i]] = 'Not Found'
            else:
                checked_urls[urls[i]] = 'Error'
        except requests.RequestException:
            checked_urls[urls[i]] = 'Error'

        update_ui()
        time.sleep(1)

    return None


def process_items():
    global processed_items, current_search_item
    while True:
        try:
            item = item_queue.get(timeout=1)
        except queue.Empty:
            break

        try:
            item_id, name, current_value, current_weight, current_caster_level = item
            current_search_item = name
            update_ui()

            info = get_item_info(name)
            if not info:
                processed_items += 1
                update_ui()
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

            processed_items += 1
            update_ui()
        except Exception as e:
            with open("process_error_log.txt", "a") as f:
                f.write(f"Error processing item {current_search_item}: {str(e)}\n")
            processed_items += 1
            update_ui()


def update_ui():
    global term, processed_items, total_items, current_search_item, current_update_item, checked_urls

    with term.location(0, 0):
        print(term.clear())
        print(term.black_on_white(f"Processed: {processed_items}/{total_items}"))
        print(term.move_y(term.height // 2 - 10) + term.center(f"Current Item: {current_search_item}"))

        if current_update_item:
            print(term.move_y(term.height // 2 - 8) + term.center("Current Data:"))
            for key, value in current_update_item['current_data'].items():
                print(term.center(f"{key}: {value}"))

            print(term.move_y(term.height // 2 - 3) + term.center("Found Data:"))
            for key, value in current_update_item['found_data'].items():
                print(term.center(f"{key}: {value}"))

            print(term.move_y(term.height // 2 + 2) + term.center("Updates:"))
            for i, (attribute, _, _, _) in enumerate(current_update_item['updates']):
                print(term.center(f"Update {attribute}? (Y/N)"))

        if checked_urls:
            print(term.move_y(term.height - 10) + term.center("URL Status:"))
            for url, status in checked_urls.items():
                status_color = term.green if status == 'Found' else term.red
                print(term.center(f"{url[:20]}: {status_color(status)}"))


def get_user_input(prompt):
    with term.cbreak(), term.hidden_cursor():
        print(term.move_y(term.height - 2) + term.center(prompt + " (Y/N): "))
        while True:
            key = term.inkey()
            if key.lower() == 'y':
                return True
            elif key.lower() == 'n':
                return False


def update_item_data(cursor, connection):
    global current_update_item, total_items, processed_items, current_search_item

    cursor.execute("""
        SELECT id, name, value, weight, casterlevel
        FROM item
        WHERE (value IS NULL OR weight IS NULL OR casterlevel IS NULL) and type = 'magic'
        ORDER BY casterlevel DESC
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
        except queue.Empty:
            time.sleep(0.1)
            continue

        current_update_item = {
            'name': name,
            'current_data': {
                'Value': current_value,
                'Weight': current_weight,
                'CL': current_caster_level
            },
            'found_data': {
                'Value': info.get('price'),
                'Weight': info.get('weight'),
                'CL': info.get('cl')
            },
            'updates': updates
        }
        update_ui()

        updates_needed = False
        update_query = "UPDATE item SET "
        update_params = []

        for attribute, current_value, new_value, column in updates:
            if get_user_input(f"Update {attribute}?"):
                update_query += f"{column} = %s, "
                update_params.append(new_value)
                updates_needed = True

        if updates_needed:
            update_query = update_query.rstrip(', ')
            update_query += " WHERE id = %s"
            update_params.append(item_id)

            cursor.execute(update_query, tuple(update_params))
            connection.commit()

        current_update_item = None
        update_ui()

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
        print(term.normal + term.clear + f"An error occurred: {e}")
    finally:
        if 'connection' in locals():
            cursor.close()
            connection.close()