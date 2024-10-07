import os
import re
import psycopg2
from psycopg2 import sql


def deduplicate_items(cursor):
    # Remove exact duplicates
    cursor.execute("""
        DELETE FROM itemtesting
        WHERE id IN (
            SELECT id
            FROM (
                SELECT id,
                       ROW_NUMBER() OVER (PARTITION BY name, type, subtype, value, weight, casterlevel
                                          ORDER BY id) as row_num
                FROM itemtesting
            ) t
            WHERE t.row_num > 1
        )
    """)
    exact_duplicates_removed = cursor.rowcount
    print(f"Removed {exact_duplicates_removed} exact duplicates.")

    # Remove entries with null values when there's a matching non-null entry
    cursor.execute("""
        DELETE FROM itemtesting
        WHERE id IN (
            SELECT t1.id
            FROM itemtesting t1
            JOIN itemtesting t2 ON t1.name = t2.name 
                                AND COALESCE(t1.type, '') = COALESCE(t2.type, '')
                                AND COALESCE(t1.subtype, '') = COALESCE(t2.subtype, '')
            WHERE t1.id != t2.id
                AND (
                    (t1.value IS NULL AND t2.value IS NOT NULL) OR
                    (t1.weight IS NULL AND t2.weight IS NOT NULL) OR
                    (t1.casterlevel IS NULL AND t2.casterlevel IS NOT NULL)
                )
                AND NOT (
                    (t2.value IS NULL AND t1.value IS NOT NULL) OR
                    (t2.weight IS NULL AND t1.weight IS NOT NULL) OR
                    (t2.casterlevel IS NULL AND t1.casterlevel IS NOT NULL)
                )
        )
    """)
    null_entries_removed = cursor.rowcount
    print(f"Removed {null_entries_removed} entries with null values where a non-null entry exists.")

    # Find and report conflicts
    cursor.execute("""
        SELECT t1.id, t2.id, t1.name, 
               t1.type, t1.subtype, t1.value, t1.weight, t1.casterlevel,
               t2.type, t2.subtype, t2.value, t2.weight, t2.casterlevel
        FROM itemtesting t1
        JOIN itemtesting t2 ON t1.name = t2.name AND t1.id < t2.id
        WHERE t1.type != t2.type 
           OR t1.subtype != t2.subtype 
           OR t1.value != t2.value 
           OR t1.weight != t2.weight 
           OR t1.casterlevel != t2.casterlevel
    """)

    conflicts = cursor.fetchall()
    if conflicts:
        print("\nConflicts found (not removed):")
        for conflict in conflicts:
            print(f"Conflict for item '{conflict[2]}':")
            print(
                f"  ID {conflict[0]}: Type: {conflict[3]}, Subtype: {conflict[4]}, Value: {conflict[5]}, Weight: {conflict[6]}, CasterLevel: {conflict[7]}")
            print(
                f"  ID {conflict[1]}: Type: {conflict[8]}, Subtype: {conflict[9]}, Value: {conflict[10]}, Weight: {conflict[11]}, CasterLevel: {conflict[12]}")
            print()

    total_removed = exact_duplicates_removed + null_entries_removed
    print(f"\nTotal entries removed: {total_removed}")
    print(f"Total conflicts found (not removed): {len(conflicts)}")

    return total_removed

def is_relevant_file(filename):
    relevant_keywords = ['equip', 'armor', 'weapon', 'item']
    return any(keyword in filename.lower() for keyword in relevant_keywords) and 'equipmod' not in filename.lower()


def is_item_line(line, filename):
    if "abilities" in filename.lower():
        return False
    if '.MOD' in line or 'TYPE:Service' in line:
        return False
    item_indicators = ['TYPE:', 'COST:', 'WT:', 'PROFICIENCY:', 'EQMOD:', 'SPROP:', 'SIZE:',
                       'RANGE:', 'DAMAGE:', 'CRITMULT:', 'CRITRANGE:', 'WIELD:', 'CONTAINS:',
                       'BASEITEM:', 'SPELLFAILURE:', 'ACCHECK:', 'MAXDEX:', 'MODS:', 'SLOTS:',
                       'ALTDAMAGE:', 'ALTEQMOD:', 'ALTCRITMULT:', 'ALTTYPE:', 'ALTCRITRANGE:']

    spell_indicators = ['CLASSES:', 'SCHOOL:', 'SUBSCHOOL:', 'DESCRIPTOR:', 'COMPS:',
                        'CASTTIME:', 'RANGE:', 'TARGETAREA:', 'DURATION:', 'SAVEINFO:', 'SPELLRES:']

    ability_indicators = ['CATEGORY:Special Ability', 'TYPE:SkillSpecialization', 'ABILITY:']
    has_item_indicator = any(indicator in line for indicator in item_indicators)
    has_spell_indicator = any(indicator in line for indicator in spell_indicators)
    has_ability_indicator = any(indicator in line for indicator in ability_indicators)
    if has_ability_indicator:
        return False
    is_weapon_or_armor = 'TYPE:Weapon' in line or 'TYPE:Armor' in line
    starts_with_name_and_type = not line.startswith('#') and '\tTYPE:' in line
    return (has_item_indicator and not has_spell_indicator) or is_weapon_or_armor or starts_with_name_and_type


def get_item_name(line):
    copy_match = re.search(r'\.COPY=(.+?)(\t|$)', line)
    if copy_match:
        return copy_match.group(1).strip()

    output_name_match = re.search(r'OUTPUTNAME:([^\t]+)', line)
    if output_name_match and '[NAME]' not in output_name_match.group(1):
        return output_name_match.group(1).strip()

    return line.split('\t')[0].strip()


def map_item_type(type_str):
    type_str = type_str.lower()
    types = type_str.split('.')

    if any('weapon' in t for t in types) or \
            any(t in ['melee', 'ranged', 'ammunition'] for t in types) or \
            'simple' in type_str or 'martial' in type_str or \
            'gladiatormelee' in type_str or 'weaponry' in type_str:
        return 'weapon'

    if any('armor' in t for t in types) or \
            any(t in ['light', 'medium', 'heavy', 'shield'] for t in types) or \
            ('slot_armor' in type_str):
        return 'armor'

    if 'artifact' in type_str or \
            any(t in ['magic', 'potion', 'scroll', 'wand', 'rod', 'staff', 'ring', 'amulet'] for t in types):
        return 'magic'

    if any(t in ['trade good', 'gem', 'art'] for t in types):
        return 'trade good'

    if 'goods' in type_str and 'trade good' not in type_str:
        return 'gear'

    return None


def map_item_subtype(main_type, type_str):
    type_str = type_str.lower()
    types = type_str.split('.')

    if main_type == 'weapon':
        if any(t in ['light', 'onehanded', 'one-handed', 'onehand', 'one hand'] for t in types):
            return 'one handed'
        elif any(t in ['twohanded', 'two-handed', 'twohand', 'two hand'] for t in types):
            return 'two handed'
        elif any(t in ['ranged', 'thrown', 'projectile'] for t in types):
            return 'ranged'
        elif 'ammunition' in type_str or 'ammo' in type_str:
            return 'ammunition'
        else:
            return 'light'  # Default to light if no other subtype is found

    elif main_type == 'armor':
        if 'light' in type_str:
            return 'light'
        elif 'medium' in type_str:
            return 'medium'
        elif 'heavy' in type_str:
            return 'heavy'
        elif 'shield' in type_str:
            return 'shield'
        else:
            return None  # No specific subtype found for armor

    elif main_type == 'magic':
        if 'artifact' in type_str:
            return 'artifact'
        elif 'wand' in type_str:
            return 'wand'
        elif 'potion' in type_str:
            return 'potion'
        elif 'scroll' in type_str:
            return 'scroll'
        else:
            return None  # No specific subtype found for magic item

    return None  # Return None for other main types


def extract_item_info(line, lstsource):
    name = get_item_name(line)
    type_match = re.search(r'TYPE:([^\t]+)', line)
    type_str = type_match.group(1) if type_match else ''
    type_parts = type_str.split('.')
    item_type = type_parts[0] if type_parts else ''
    og_subtype = '.'.join(type_parts[1:]) if len(type_parts) > 1 else ''

    mapped_type = map_item_type(type_str)
    mapped_subtype = map_item_subtype(mapped_type, type_str) if mapped_type else None

    cost_match = re.search(r'COST:(\d+)', line)
    value = cost_match.group(1) if cost_match else None

    weight_match = re.search(r'WT:(\d+(?:\.\d+)?)', line)
    weight = weight_match.group(1) if weight_match else None

    caster_level = None
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

    return (name, mapped_type, item_type, mapped_subtype, og_subtype, value, weight, caster_level, lstsource)


def insert_item(cursor, item_info):
    insert_query = sql.SQL("""
        INSERT INTO itemtesting (name, type, ogtype, subtype, ogsubtype, value, weight, casterlevel, lstsource)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """)
    cursor.execute(insert_query, item_info)


def process_lst_file(file_path, cursor):
    items_with_cl = 0
    total_items = 0
    lstsource = os.path.basename(file_path)  # Extract filename without path

    with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
        for line in file:
            line = line.strip()
            if line and not line.startswith('#'):
                if is_item_line(line, file_path):
                    total_items += 1
                    item_info = extract_item_info(line, lstsource)
                    if item_info[0] and '.MOD' not in item_info[0]:
                        if item_info[7]:  # Check if caster level is not None
                            items_with_cl += 1
                        insert_item(cursor, item_info)

    print(f"File: {file_path}")
    print(f"Total items processed: {total_items}")
    print(f"Items with caster level: {items_with_cl}")
    print("--------------------")

    return total_items, items_with_cl

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

        # Process the directory and insert data
        cursor = connection.cursor()
        total_items_processed = 0
        total_items_with_cl = 0

        for root, _, files in os.walk(lst_directory):
            for file in files:
                if file.endswith('.lst') and is_relevant_file(file):
                    file_path = os.path.join(root, file)
                    items_processed, items_with_cl = process_lst_file(file_path, cursor)
                    total_items_processed += items_processed
                    total_items_with_cl += items_with_cl

        print("\nProcessing Summary:")
        print(f"Total items processed: {total_items_processed}")
        print(f"Total items with caster level: {total_items_with_cl}")

        # Perform deduplication
        print("\nPerforming deduplication...")
        deduplicated_count = deduplicate_items(cursor)
        print(f"Deduplication complete. {deduplicated_count} duplicate rows removed.")

        connection.commit()
        cursor.close()

        print("Data processing, insertion, and deduplication completed.")
    except psycopg2.Error as e:
        print(f"Unable to connect to the database: {e}")
    finally:
        if connection:
            connection.close()
            print("Database connection closed.")