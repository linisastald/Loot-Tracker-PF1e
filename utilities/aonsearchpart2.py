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
    """)
    return cursor.fetchall()


def display_item(item):
    id, itemid, name, old_value, new_value, old_weight, new_weight, old_cl, new_cl, source = item
    print(f"\nItem: {name} (ID: {itemid})")
    print(f"Source: {source}")
    print("\nCurrent Data:")
    print(f"Value:        {old_value}")
    print(f"Weight:       {old_weight}")
    print(f"Caster Level: {old_cl}")
    print("\nNew Data:")
    print(f"Value:        {new_value}")
    print(f"Weight:       {new_weight}")
    print(f"Caster Level: {new_cl}")


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
        updates.append(sql.SQL("value = %s"))
        params.append(new_value)
    if 'w' in choice or 'a' in choice:
        updates.append(sql.SQL("weight = %s"))
        params.append(new_weight)
    if 'c' in choice or 'a' in choice:
        updates.append(sql.SQL("casterlevel = %s"))
        params.append(new_cl)

    if updates:
        query = sql.SQL("UPDATE item SET {} WHERE id = %s").format(sql.SQL(", ").join(updates))
        cursor.execute(query, params + [itemid])
        print(f"Updated item: {name}")
    else:
        print(f"No updates applied for item: {name}")


def remove_from_itemupdate(cursor, item_id):
    cursor.execute("DELETE FROM itemupdate WHERE id = %s", (item_id,))


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
                elif 's' not in choice:
                    update_item(cursor, item, choice)

                remove_from_itemupdate(cursor, item[0])
                connection.commit()

        print("Update process completed.")

    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    main()