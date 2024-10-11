import psycopg2
from psycopg2 import sql
import sys
from blessed import Terminal

# Database connection parameters
db_params = {
    'dbname': 'loot_tracking',
    'user': 'loot_user',
    'password': 'g5Zr7!cXw@2sP9Lk',
    'host': 'localhost'
}

term = Terminal()


def connect_to_db():
    try:
        return psycopg2.connect(**db_params)
    except psycopg2.Error as e:
        print(f"Unable to connect to the database: {e}")
        sys.exit(1)


def fetch_updates(cursor):
    cursor.execute("""
        SELECT iu.id, iu.itemid, iu.name, i.value, iu.value, i.weight, iu.weight, i.casterlevel, iu.casterlevel, iu.source
        FROM itemupdate iu
        JOIN item i ON iu.itemid = i.id
        WHERE iu.value IS NOT NULL OR iu.weight IS NOT NULL OR iu.casterlevel IS NOT NULL
        and (iu.name not ilike 'update%' and iu.name not ilike 'skip%')
    """)
    return cursor.fetchall()


def format_value(value):
    if value is None:
        return "None"
    if isinstance(value, float):
        # Convert to int if it's a whole number
        if value.is_integer():
            return str(int(value))
        return f"{value:.2f}".rstrip('0').rstrip('.')
    return str(value)


def display_item(item):
    id, itemid, name, old_value, new_value, old_weight, new_weight, old_cl, new_cl, source = item
    print(f"\nItem: {name} (ID: {itemid})")
    print(f"Source: {source}")
    print("\n{:<15} {:<15} {:<5} {:<15}".format("Attribute", "Current Data", "", "New Data"))
    print("-" * 55)

    attributes = [
        ("Value:", old_value, new_value),
        ("Weight:", old_weight, new_weight),
        ("Caster Level:", old_cl, new_cl)
    ]

    for attr, old, new in attributes:
        old_formatted = format_value(old)
        new_formatted = format_value(new)
        if old != new and new is not None:
            new_formatted = term.bold_red(new_formatted)
        print("{:<15} {:<15} {:<5} {:<15}".format(attr, old_formatted, "->", new_formatted))


def get_user_choice():
    while True:
        choice = input("\nEnter your choices (v/w/c/a/s/q): ").lower()
        if set(choice).issubset({'v', 'w', 'c', 'a', 's', 'q'}):
            return choice
        print("Invalid input. Please use v, w, c, a, s, or q.")


def update_item(cursor, item, choice):
    id, itemid, name, old_value, new_value, old_weight, new_weight, old_cl, new_cl, _ = item
    updates = []
    params = []

    if 'v' in choice or 'a' in choice:
        if new_value is not None:
            updates.append(sql.SQL("value = %s"))
            params.append(new_value)
    if 'w' in choice or 'a' in choice:
        if new_weight is not None:
            updates.append(sql.SQL("weight = %s"))
            params.append(new_weight)
    if 'c' in choice or 'a' in choice:
        if new_cl is not None:
            updates.append(sql.SQL("casterlevel = %s"))
            params.append(new_cl)

    if updates:
        query = sql.SQL("UPDATE item SET {} WHERE id = %s").format(sql.SQL(", ").join(updates))
        cursor.execute(query, params + [itemid])
        print(f"Updated item: {name}")
        return True
    else:
        print(f"No updates applied for item: {name}")
        return False


def update_itemupdate_name(cursor, item_id, prefix):
    cursor.execute(
        "UPDATE itemupdate SET name = %s || ' ' || name WHERE id = %s",
        (prefix, item_id)
    )


def is_item_unchanged(item):
    _, _, _, old_value, new_value, old_weight, new_weight, old_cl, new_cl, _ = item
    return all([
        old_value == new_value or new_value is None,
        old_weight == new_weight or new_weight is None,
        old_cl == new_cl or new_cl is None
    ])


def main():
    connection = connect_to_db()
    cursor = connection.cursor()

    try:
        updates = fetch_updates(cursor)
        total_items = len(updates)

        for index, item in enumerate(updates, 1):
            with term.fullscreen():
                print(term.clear)
                print(f"Item {index} of {total_items}")
                display_item(item)

                if is_item_unchanged(item):
                    print("\nThis item has no valid changes. Skipping automatically.")
                    update_itemupdate_name(cursor, item[0], "SKIP")
                    connection.commit()
                    continue

                print("\nChoices:")
                print("v - Update Value")
                print("w - Update Weight")
                print("c - Update Caster Level")
                print("a - Update All")
                print("s - Skip this item")
                print("q - Quit")

                choice = get_user_choice()

                if 'q' in choice:
                    break
                elif 's' in choice:
                    update_itemupdate_name(cursor, item[0], "SKIP")
                else:
                    if update_item(cursor, item, choice):
                        update_itemupdate_name(cursor, item[0], "UPDATE")
                    else:
                        update_itemupdate_name(cursor, item[0], "SKIP")

                connection.commit()

        print("Update process completed.")

    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    main()