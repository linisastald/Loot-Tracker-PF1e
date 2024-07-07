# Loot and Gold Management System

This is a generated README file for the Loot and Gold Management System. As of 7.7.24 112a, it is untested.

## Features to be Added

### Login
- **Login via Character Name and Password**

### Gold Entry
- **Page Integration**: Combine with Loot Entry for simplicity.
- **Inputs Needed**:
  - Session Date (default: today)
  - Type (string, list)
  - Notes (string)
  - Copper (int)
  - Silver (int)
  - Gold (int)
  - Plat (int)

### Loot Entry
- **Inputs Needed**:
  - Session Date (default: today)
  - Quantity (int)
  - Item Name (string)
  - Unidentified (bool)
  - Type (string, list)
  - Size (string, list)
- **Item Name**: Autofill based on a database of items but allow custom input as well.

### Main Loot View
- **Columns in View**:
  - Quantity
  - Item Name
  - Unidentified
  - Type
  - Size
  - Believed Value (this will be the character that is logged in)
  - Value if Sold
  - Who Has It
  - Average Appraisal
- **Item Actions**:
  - Select items with buttons for Keep Self, Keep Party, Sell, Trash/Give Away, Identify.
- **Condensed View**: Items show a condensed view; for example, if 10 arrows are found in session 1, and 20 in session 2, the view shows 30 arrows. Hovering over items should show details of the number found and session date if there are multiple entries.

### Kept Loot View
- **Columns in View**:
  - Quantity
  - Item Name
  - Type
  - Size
  - Believed Value (this will be the character that is logged in)
  - Who Has It
  - Average Appraisal
- **Party Loot Table**: Shows how much each character has 'taken' from party loot.

### Party Kept Loot
- **Columns in View**:
  - Quantity
  - Item Name
  - Type
  - Size
  - Believed Value (this will be the character that is logged in)
  - Who Has It
  - Average Appraisal
- **Updates**: Allow updates of quantity or change to kept instead of party kept.
- **Potion/Scroll Usage**: One button for when potions or scrolls are used.

### Sold View
- **Record**: Record of what was sold on what day.

### Given Away/Trash View
- **Record**: Record of what was given away/trashed.

### Gold View
- **Transactions**: Show transactions in the last 6 real-time months.
- **Party Gold**: Show total party gold available.
- **Distribute Gold**: Quick way to distribute gold to players with an option to leave gold in party loot.
- **Appraisal Calculation**: Automatically calculate appraisal amounts for each character at the time of input.

## Additional Features (Less Important)
- **Session Tracking**: Who showed on what day.
- **Wealth by Level Check**: (Less important, I think Herolab does it).
- **Spell Book Page**

## Plan
- **Dockerized Deployment**: Each campaign will have its own container, eliminating the need to include features to separate different campaigns.

## Feature Tracking
| Feature                   | Status  |
|---------------------------|---------|
| Login                     | Pending |
| Gold Entry                | Pending |
| Loot Entry                | Pending |
| Main Loot View            | Pending |
| Kept Loot View            | Pending |
| Party Kept Loot           | Pending |
| Sold View                 | Pending |
| Given Away/Trash View     | Pending |
| Gold View                 | Pending |
| Session Tracking          | Pending |
| Wealth by Level Check     | Pending |
| Spell Book Page           | Pending |

---

This README provides a starting point for the development of the Loot and Gold Management System. Further updates and testing are required to ensure all features work as expected.
