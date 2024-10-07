import os
import re
import psycopg2
from psycopg2 import sql


def get_priority(lstsource):
    priorities = {
        'roleplaying_game': 0,
        'adventure_path': 1,
        'campaign_setting': 2,
        'player_companion': 3
    }
    for path, priority in priorities.items():
        if path in lstsource:
            return priority
    return 4  # Lower priority for any other path


def deduplicate_items(cursor):
    # Remove exact duplicates (keep this part as it is)
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

    # Find all conflicts
    cursor.execute("""
        SELECT t1.id as id1, t2.id as id2, t1.name, 
               t1.type as type1, t1.subtype as subtype1, t1.value as value1, t1.weight as weight1, t1.casterlevel as casterlevel1, t1.lstsource as lstsource1,
               t2.type as type2, t2.subtype as subtype2, t2.value as value2, t2.weight as weight2, t2.casterlevel as casterlevel2, t2.lstsource as lstsource2
        FROM itemtesting t1
        JOIN itemtesting t2 ON t1.name = t2.name AND t1.id < t2.id
        WHERE t1.type != t2.type 
           OR t1.subtype != t2.subtype 
           OR t1.value != t2.value 
           OR t1.weight != t2.weight 
           OR t1.casterlevel != t2.casterlevel
    """)

    conflicts = cursor.fetchall()
    items_to_remove = set()

    # Handle conflicts
    for conflict in conflicts:
        # Skip if either item has already been marked for removal
        if conflict[0] in items_to_remove or conflict[1] in items_to_remove:
            continue

        # First, handle 'profs' conflicts
        if 'profs' in conflict[8].lower():  # lstsource1
            items_to_remove.add(conflict[0])
            continue
        elif 'profs' in conflict[14].lower():  # lstsource2
            items_to_remove.add(conflict[1])
            continue

        # Check if everything except subtype matches
        if (conflict[3] == conflict[9] and  # type
                conflict[5] == conflict[11] and  # value
                conflict[6] == conflict[12] and  # weight
                conflict[7] == conflict[13]):  # casterlevel

            # Prioritize based on subtype
            priority1 = get_subtype_priority(conflict[4])  # subtype1
            priority2 = get_subtype_priority(conflict[10])  # subtype2

            if priority1 < priority2:
                items_to_remove.add(conflict[1])
            elif priority1 > priority2:
                items_to_remove.add(conflict[0])
            else:
                # If subtypes have the same priority, use source priority
                source_priority1 = get_source_priority(conflict[8])  # lstsource1
                source_priority2 = get_source_priority(conflict[14])  # lstsource2

                if source_priority1 < source_priority2:
                    items_to_remove.add(conflict[1])
                elif source_priority1 > source_priority2:
                    items_to_remove.add(conflict[0])
                # If source priorities are also the same, keep both (do nothing)
        else:
            # If other attributes don't match, use source priority
            source_priority1 = get_source_priority(conflict[8])  # lstsource1
            source_priority2 = get_source_priority(conflict[14])  # lstsource2

            if source_priority1 < source_priority2:
                items_to_remove.add(conflict[1])
            elif source_priority1 > source_priority2:
                items_to_remove.add(conflict[0])
            # If source priorities are the same, keep both (do nothing)

    # Remove items
    if items_to_remove:
        cursor.execute("""
            DELETE FROM itemtesting
            WHERE id = ANY(%s)
        """, (list(items_to_remove),))
        removed_count = cursor.rowcount
        print(f"Removed {removed_count} items based on prioritization rules.")

    # Find remaining conflicts
    cursor.execute("""
        SELECT t1.id, t2.id, t1.name, 
               t1.type, t1.subtype, t1.value, t1.weight, t1.casterlevel, t1.lstsource,
               t2.type, t2.subtype, t2.value, t2.weight, t2.casterlevel, t2.lstsource
        FROM itemtesting t1
        JOIN itemtesting t2 ON t1.name = t2.name AND t1.id < t2.id
        WHERE t1.type != t2.type 
           OR t1.subtype != t2.subtype 
           OR t1.value != t2.value 
           OR t1.weight != t2.weight 
           OR t1.casterlevel != t2.casterlevel
    """)

    remaining_conflicts = cursor.fetchall()
    manual_removed = 0

    if remaining_conflicts:
        print("\nManual conflict resolution:")
        for conflict in remaining_conflicts:
            print(f"\nConflict for item '{conflict[2]}':")
            print(
                f"1. ID {conflict[0]}: Type: {conflict[3]}, Subtype: {conflict[4]}, Value: {conflict[5]}, Weight: {conflict[6]}, CasterLevel: {conflict[7]}, Source: {conflict[8]}")
            print(
                f"2. ID {conflict[1]}: Type: {conflict[9]}, Subtype: {conflict[10]}, Value: {conflict[11]}, Weight: {conflict[12]}, CasterLevel: {conflict[13]}, Source: {conflict[14]}")
            print("3. Remove both")

            while True:
                choice = input("Enter your choice (1, 2, or 3): ")
                if choice in ['1', '2', '3']:
                    break
                print("Invalid choice. Please enter 1, 2, or 3.")

            if choice == '1':
                cursor.execute("DELETE FROM itemtesting WHERE id = %s", (conflict[1],))
                manual_removed += 1
            elif choice == '2':
                cursor.execute("DELETE FROM itemtesting WHERE id = %s", (conflict[0],))
                manual_removed += 1
            elif choice == '3':
                cursor.execute("DELETE FROM itemtesting WHERE id IN (%s, %s)", (conflict[0], conflict[1]))
                manual_removed += 2

    print(f"\nManually removed {manual_removed} items.")
    total_removed = exact_duplicates_removed + removed_count + manual_removed
    print(f"Total entries removed: {total_removed}")

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
    original_name = line.split('\t')[0].strip()

    copy_match = re.search(r'\.COPY=(.+?)(\t|$)', line)
    if copy_match:
        return copy_match.group(1).strip()

    output_name_match = re.search(r'OUTPUTNAME:([^\t]+)', line)
    if output_name_match:
        output_name = output_name_match.group(1).strip()

        # Check for [NAME] in OUTPUTNAME
        if '[NAME]' in output_name:
            return original_name

        if output_name.startswith('('):
            # Remove any existing suffix in parentheses from the original name
            original_name_without_suffix = re.sub(r'\s*\([^)]*\)\s*$', '', original_name)
            # Combine the name without suffix and the new output name
            return f"{original_name_without_suffix} {output_name}".strip()
        else:
            # If OUTPUTNAME is a complete name, use it
            return output_name

    return original_name


def map_item_type(type_str):
    type_str = type_str.lower()
    types = type_str.split('.')

    if 'shield' in type_str:
        return 'armor'
    elif any('weapon' in t for t in types) or \
            any(t in ['melee', 'ranged', 'ammunition'] for t in types) or \
            'simple' in type_str or 'martial' in type_str or \
            'gladiatormelee' in type_str or 'weaponry' in type_str:
        return 'weapon'
    elif any('armor' in t for t in types) or \
            any(t in ['light', 'medium', 'heavy'] for t in types):
        return 'armor'
    elif 'artifact' in type_str or \
            any(t in ['magic', 'potion', 'scroll', 'wand', 'rod', 'staff', 'ring', 'amulet'] for t in types):
        return 'magic'
    elif 'goods.trade' in type_str or any(t in ['trade good', 'gem', 'art'] for t in types):
        return 'trade good'
    elif 'goods' in type_str:
        return 'gear'

    return None


def map_item_subtype(main_type, type_str):
    type_str = type_str.lower()
    types = type_str.split('.')

    if main_type == 'armor':
        if 'shield' in type_str:
            return 'shield'
        elif 'light' in type_str:
            return 'light'
        elif 'medium' in type_str:
            return 'medium'
        elif 'heavy' in type_str:
            return 'heavy'
        else:
            return None

    elif main_type == 'weapon':
        if 'ammunition' in type_str or 'ammo' in type_str:
            return 'ammunition'
        elif any(t in ['onehanded', 'one-handed', 'onehand', 'one hand'] for t in types):
            return 'one handed'
        elif any(t in ['twohanded', 'two-handed', 'twohand', 'two hand'] for t in types):
            return 'two handed'
        elif 'light' in type_str:
            return 'light'
        elif 'heavy' in type_str or 'heavy weaponry' in type_str:
            return 'heavy'
        elif 'melee' in type_str:
            return 'melee'
        elif any(t in ['ranged', 'thrown', 'projectile'] for t in types):
            return 'ranged'
        elif 'firearm' in type_str:
            return 'firearm'
        else:
            return None

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
            return None

    return None


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


def get_subtype_priority(subtype):
    priorities = {
        'ammunition': 1,
        'one handed': 2,
        'two handed': 2,
        'light': 2,
        'heavy': 2,
        'melee': 4,
        'ranged': 3,
        'firearm': 3
    }
    return priorities.get(subtype, 5)  # Default priority for unknown subtypes


def get_source_priority(lstsource):
    priorities = {
        'roleplaying_game': 0,
        'adventure_path': 1,
        'campaign_setting': 2,
        'player_companion': 3
    }
    for path, priority in priorities.items():
        if path in lstsource:
            return priority
    return 4  # Lower priority for any other path


def process_lst_file(file_path, cursor):
    items_with_cl = 0
    total_items = 0
    lstsource = file_path  # Extract filename without path

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