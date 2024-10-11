import requests
from bs4 import BeautifulSoup
import psycopg2
import re
import time
from urllib.parse import quote
import logging
import sys

# Set up logging
logging.basicConfig(filename='item_search.log', level=logging.INFO,
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
    ("Equipment - Misc", "https://aonprd.com/EquipmentMiscDisplay.aspx?ItemName="),
    ("Equipment - Weapons", "https://aonprd.com/EquipmentWeaponsDisplay.aspx?ItemName="),
    ("Equipment - Armor", "https://aonprd.com/EquipmentArmorDisplay.aspx?ItemName="),
    ("Spellbook", "https://aonprd.com/SpellbookDisplay.aspx?ItemName="),
    ("Vehicles", "https://aonprd.com/Vehicles.aspx?ItemName="),
    ("Relics", "https://aonprd.com/Relics.aspx?ItemName="),
    ("Magic - Altars", "https://www.aonprd.com/MagicAltarsDisplay.aspx?ItemName="),
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
    ("Magic - Plants", "https://aonprd.com/MagicPlantsDisplay.aspx?FinalName=")
]


def clean_number(number_str):
    if number_str is None or number_str.strip() in ['—', '-', '–', '']:
        return None

    # Handle different currency types
    currency_multipliers = {'cp': 0.01, 'sp': 0.1, 'gp': 1}
    for currency, multiplier in currency_multipliers.items():
        if currency in number_str.lower():
            cleaned = re.sub(r'[^\d.,]', '', number_str)
            cleaned = cleaned.replace(',', '')
            try:
                return float(cleaned) * multiplier
            except ValueError:
                return None

    # If no currency specified, assume gp
    cleaned = re.sub(r'[^\d.,]', '', number_str)
    cleaned = cleaned.replace(',', '')
    try:
        return float(cleaned)
    except ValueError:
        return None


def clean_item_name(name):
    # Remove everything after the first parenthesis or comma
    name = re.split(r'[\(,]', name)[0].strip()

    # Handle reversed names
    if ',' in name:
        parts = name.split(',')
        name = ' '.join(parts[::-1]).strip()

    # Remove +X from the end of the name
    name = re.sub(r'\s*\+\d+$', '', name)

    return name


def get_item_info(item_name):
    cleaned_name, original_name = clean_item_name(item_name)
    print(f"Original name: {original_name}")
    print(f"Cleaned name: {cleaned_name}")

    for url_name, url in urls:
        # Properly URL-encode the entire cleaned name
        encoded_name = quote(cleaned_name)
        full_url = url + encoded_name
        print(f"Checking URL: {full_url}")
        try:
            response = requests.get(full_url, timeout=10)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                content = soup.get_text()

                # Price
                price_match = re.search(r'Price[:\s]+([^;]+)', content)
                if price_match:
                    price_str = price_match.group(1)
                    # Check for multiple price points
                    price_points = re.findall(r'([\d,]+\s*(?:cp|sp|gp))', price_str)
                    if price_points:
                        # Use the first price point
                        price = clean_number(price_points[0])
                    else:
                        price = clean_number(price_str)
                else:
                    price = None

                # Weight
                weight_match = re.search(r'Weight[:\s]+([\d,.]+ lbs\.|—)', content)
                weight = clean_number(weight_match.group(1) if weight_match and weight_match.group(1) != '—' else None)

                # Caster Level
                cl_match = re.search(r'CL\s+(\d+)(?:st|nd|rd|th)', content)
                if not cl_match:
                    cl_match = re.search(r'Caster Level[:\s]+(\d+)', content, re.IGNORECASE)
                cl = int(cl_match.group(1)) if cl_match else None

                if price is not None or weight is not None or cl is not None:
                    print(f"Found information at: {full_url}")
                    return {'price': price, 'cl': cl, 'weight': weight, 'source_url': full_url}
            else:
                print(f"No results found at: {full_url}")

        except requests.RequestException as e:
            logging.error(f"Error fetching {full_url}: {e}")

        time.sleep(1)  # Be nice to the server

    # If no results found, try again with everything in parentheses removed
    if '(' in original_name:
        simplified_name = original_name.split('(')[0].strip()
        print(f"No results found. Trying again with simplified name: {simplified_name}")
        return get_item_info(simplified_name)  # Recursive call with simplified name

    print("No information found for this item.")
    return None


def insert_item_update(cursor, item_id, name, info):
    query = """
    INSERT INTO itemupdate (itemid, name, value, weight, casterlevel, source)
    VALUES (%s, %s, %s, %s, %s, %s)
    """
    cursor.execute(query, (
        item_id,
        name,
        info.get('price'),
        info.get('weight'),
        info.get('cl'),
        info.get('source_url')
    ))


def main():
    connection = None
    try:
        connection = psycopg2.connect(**db_params)
        cursor = connection.cursor()

        cursor.execute("""
            SELECT i.id, i.name
            FROM item i
            WHERE (i.value IS NULL OR i.weight IS NULL OR (i.casterlevel IS NULL AND i.type = 'magic'))         
            AND (i.subtype NOT IN ('wand','scroll','potion') OR i.subtype IS NULL)
            AND NOT EXISTS (SELECT 1 FROM itemupdate u WHERE u.itemid = i.id)
            ORDER BY random()
        """)
        items = cursor.fetchall()

        total_items = len(items)
        for index, (item_id, item_name) in enumerate(items, 1):
            print(f"Processing item {index}/{total_items}: {item_name}")
            info = get_item_info(item_name)
            if info:
                insert_item_update(cursor, item_id, item_name, info)
                connection.commit()
                print(f"Updated information for {item_name}")
            else:
                print(f"No information found for {item_name}")

        print("Search completed.")

    except (Exception, psycopg2.Error) as error:
        logging.error(f"Error: {error}")
    finally:
        if connection:
            cursor.close()
            connection.close()


if __name__ == "__main__":
    main()