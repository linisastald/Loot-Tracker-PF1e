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

# Global queues and variables
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

                    result = {
                        'price': price,
                        'cl': cl,
                        'weight': weight,
                        'source_url': full_url
                    }

                    logging.info(f"Item info found for {item_name}: {result}")

                    checked_urls[urls[i]] = 'Found'
                    update_ui()
                    return result

                checked_urls[urls[i]] = 'Not Found'
            else:
                checked_urls[urls[i]] = 'Error'
        except requests.RequestException:
            checked_urls[urls[i]] = 'Error'

        update_ui()
        time.sleep(1)

    logging.warning(f"No information found for item: {item_name}")
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
            logging.info(f"Processing item: {name}")
            update_ui()

            info = get_item_info(name)
            if not info:
                logging.warning(f"No information found for item: {name}")
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
                if current_caster_level is None or not float_eq(info['cl'], current_caster_level):
                    updates.append(('Caster Level', current_caster_level, info['cl'], 'casterlevel'))

            if updates:
                logging.info(f"Updates found for item {name}: {updates}")
                update_queue.put((item_id, name, updates, current_value, current_weight, current_caster_level, info))
            else:
                logging.info(f"No updates needed for item {name}")

            processed_items += 1
            update_ui()
        except Exception as e:
            logging.error(f"Error processing item {current_search_item}: {str(e)}", exc_info=True)
            processed_items += 1
            update_ui()


def update_ui():
    global term, processed_items, total_items, current_search_item, current_update_item, checked_urls

    updates_available = []

    logging.debug("Entering update_ui function")

    try:
        with term.location(0, 0):
            print(term.clear())

            # Top progress bar
            progress = int((processed_items / total_items) * 80) if total_items > 0 else 0
            print(f"Checking #{processed_items:<5d} [{'#' * progress}{' ' * (80 - progress)}] Total {total_items:<5d}")
            print(f"Checking Item: {current_search_item}")

            # URL Status
            for url, status in checked_urls.items():
                status_str = "Not checked" if status is None else status
                status_color = term.yellow if status is None else (term.green if status == 'Found' else term.red)
                print(f"{url[:20]:<20} {status_color(status_str):<10}")

            # Next Item
            if not item_queue.empty():
                next_item = item_queue.queue[0][1]  # Get the name of the next item
                print(f"Next Item: {next_item}")

            print("-" * term.width)

            # Update Item section
            if current_update_item:
                logging.debug(f"Current update item: {current_update_item}")
                print(f"Update Item: {current_update_item['name']}")

                # Add the link to the page where the data was found
                if 'source_url' in current_update_item:
                    print(f"Source: {current_update_item['source_url']}")

                print("\nCurrent Data:")
                for key, value in current_update_item['current_data'].items():
                    print(f"{key:<8} {value}")

                print("\nFound Data:")
                for key, value in current_update_item['found_data'].items():
                    print(f"{key:<8} {value}")

                print("\nAvailable updates:")
                if (current_update_item['found_data']['Value'] is not None and
                        current_update_item['found_data']['Value'] != current_update_item['current_data']['Value']):
                    updates_available.append('v')
                    print(
                        f"Update Value (V): {current_update_item['current_data']['Value']} -> {current_update_item['found_data']['Value']}")
                if (current_update_item['found_data']['Weight'] is not None and
                        current_update_item['found_data']['Weight'] != current_update_item['current_data']['Weight']):
                    updates_available.append('w')
                    print(
                        f"Update Weight (W): {current_update_item['current_data']['Weight']} -> {current_update_item['found_data']['Weight']}")
                if (current_update_item['found_data']['CL'] is not None and
                        current_update_item['found_data']['CL'] != current_update_item['current_data']['CL']):
                    updates_available.append('c')
                    print(
                        f"Update CL (C): {current_update_item['current_data']['CL']} -> {current_update_item['found_data']['CL']}")

                if updates_available:
                    print("Update all (A)")
                print("Finish Item (F)")

            # Leave space for input prompt
            print("\n" * 3)

        logging.debug(f"Updates available: {updates_available}")
    except Exception as e:
        logging.error(f"Error in update_ui: {str(e)}")
        logging.error(traceback.format_exc())

    return updates_available


def get_user_input(prompt):
    valid_inputs = ['v', 'w', 'c', 'a', 'f']
    with term.cbreak(), term.hidden_cursor():
        print(term.move_y(term.height - 1) + term.center(prompt + " (V/W/C/A/F): "))
        while True:
            try:
                key = term.inkey(timeout=None)  # Wait indefinitely for input
                logging.debug(f"Raw key pressed: {repr(key)}")
                key = key.lower()
                if key in valid_inputs:
                    logging.debug(f"Valid key pressed: {key}")
                    return key
                else:
                    logging.debug(f"Invalid key pressed: {key}")
                    print(term.move_y(term.height - 1) + term.center(f"Invalid input. Please enter V, W, C, A, or F."))
                    time.sleep(1)  # Show the message for 1 second
                    print(term.move_y(term.height - 1) + term.center(prompt + " (V/W/C/A/F): "))
            except Exception as e:
                logging.error(f"Error in get_user_input: {str(e)}")
                logging.error(traceback.format_exc())
                print(term.move_y(term.height - 1) + term.center(f"An error occurred: {str(e)}"))
                time.sleep(2)
                return None


def update_item_data(cursor, connection):
    global current_update_item, total_items, processed_items, current_search_item

    try:
        items = fetch_items_to_update(cursor)
        total_items = len(items)
        logging.info(f"Total items to update: {total_items}")

        for item in items:
            item_queue.put(item)

        processing_thread = threading.Thread(target=process_items)
        processing_thread.start()

        while processing_thread.is_alive() or not update_queue.empty():
            if not process_update_queue(cursor, connection):
                time.sleep(0.1)

        processing_thread.join()

    except Exception as e:
        handle_critical_error("Error in update_item_data", e)


def fetch_items_to_update(cursor):
    cursor.execute("""
        SELECT id, name, value, weight, casterlevel
        FROM item
        WHERE (value IS NULL OR weight IS NULL OR (casterlevel IS NULL and type = 'magic')) and type = 'magic'
        and (subtype not in ('wand','scroll','potion') or subtype is null)
        ORDER BY random()
    """)
    return cursor.fetchall()


def process_update_queue(cursor, connection):
    global current_update_item

    try:
        item_id, name, updates, current_value, current_weight, current_caster_level, info = update_queue.get(timeout=1)
        logging.info(f"Processing update for item: {name}")
        logging.info(f"Updates: {updates}")
        logging.info(f"Current values: value={current_value}, weight={current_weight}, CL={current_caster_level}")
        logging.info(f"New info: {info}")
    except queue.Empty:
        return False

    current_update_item = create_update_item(name, current_value, current_weight, current_caster_level, info)

    logging.info(f"Current update item set to: {current_update_item}")

    updates_needed, update_fields, update_params = get_user_updates(current_update_item)

    logging.info(f"Updates needed: {updates_needed}")
    logging.info(f"Update fields: {update_fields}")
    logging.info(f"Update params: {update_params}")

    if updates_needed:
        apply_updates(cursor, connection, item_id, name, update_fields, update_params)
    else:
        logging.info(f"No updates needed for {name}")

    update_ui()
    current_update_item = None
    return True


def create_update_item(name, current_value, current_weight, current_caster_level, info, source_url):
    return {
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
        'source_url': source_url
    }


def get_user_updates(current_update_item):
    updates_needed = False
    update_fields = []
    update_params = []

    logging.info(f"Checking for updates in get_user_updates for {current_update_item['name']}")

    if (current_update_item['found_data']['Value'] is not None and
        current_update_item['found_data']['Value'] != current_update_item['current_data']['Value']):
        updates_needed = True
        update_fields.append("value = %s")
        update_params.append(current_update_item['found_data']['Value'])
        logging.info(f"Value update needed: {current_update_item['current_data']['Value']} -> {current_update_item['found_data']['Value']}")

    if (current_update_item['found_data']['Weight'] is not None and
        current_update_item['found_data']['Weight'] != current_update_item['current_data']['Weight']):
        updates_needed = True
        update_fields.append("weight = %s")
        update_params.append(current_update_item['found_data']['Weight'])
        logging.info(f"Weight update needed: {current_update_item['current_data']['Weight']} -> {current_update_item['found_data']['Weight']}")

    if (current_update_item['found_data']['CL'] is not None and
        current_update_item['found_data']['CL'] != current_update_item['current_data']['CL']):
        updates_needed = True
        update_fields.append("casterlevel = %s")
        update_params.append(current_update_item['found_data']['CL'])
        logging.info(f"CL update needed: {current_update_item['current_data']['CL']} -> {current_update_item['found_data']['CL']}")

    logging.info(f"Updates needed: {updates_needed}")
    logging.info(f"Update fields: {update_fields}")
    logging.info(f"Update params: {update_params}")

    return updates_needed, update_fields, update_params


def handle_update_all(info):
    update_fields = []
    update_params = []
    for key, value in [('price', 'value'), ('weight', 'weight'), ('cl', 'casterlevel')]:
        if info.get(key) is not None:
            update_fields.append(f"{value} = %s")
            update_params.append(info[key])
    return bool(update_fields), update_fields, update_params


def handle_single_update(choice, info):
    column = 'value' if choice == 'v' else 'weight' if choice == 'w' else 'casterlevel'
    key = 'price' if choice == 'v' else 'weight' if choice == 'w' else 'cl'
    new_value = info.get(key)
    if new_value is not None:
        return True, f"{column} = %s", new_value
    return False, None, None


def apply_updates(cursor, connection, item_id, name, update_fields, update_params):
    try:
        update_query = f"UPDATE item SET {', '.join(update_fields)} WHERE id = %s"
        update_params.append(item_id)

        logging.debug(f"Executing query: {update_query}")
        logging.debug(f"With parameters: {update_params}")

        cursor.execute(update_query, tuple(update_params))
        connection.commit()
        logging.info(f"Updated item {name} with query: {update_query}")
    except Exception as e:
        handle_database_error(e)


def handle_input_error(e):
    logging.error(f"Error in user input loop: {str(e)}")
    logging.error(traceback.format_exc())
    print(f"An error occurred: {str(e)}")
    print("Press any key to continue...")
    term.inkey()


def handle_database_error(e):
    logging.error(f"Error updating database: {str(e)}")
    logging.error(traceback.format_exc())
    print(f"An error occurred while updating the database: {str(e)}")
    print("Press any key to continue...")
    term.inkey()


def handle_critical_error(message, e):
    logging.error(f"{message}: {str(e)}")
    logging.error(traceback.format_exc())
    print(f"A critical error occurred: {str(e)}")
    print("Press any key to exit...")
    term.inkey()
    sys.exit(1)


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