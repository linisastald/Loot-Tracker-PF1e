# Loot and Gold Management System

This project was orginally generated by GPT for the Loot and Gold Management System. 

## Updates

### 7.8.24 213p 
- Loot entry now accepts items and gold, can submit multiple lines
- Unprocessed loot view shows details and condenses items, buttons dont work yet

### 7.7.24 1116p 
- Can load application
- Can input item, but the input page does not have the correct input details
- None of the views show anything



## Features to be Added

### Login
- **Login via Character Name and Password**

### ~~Gold Entry~~ DONE
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
  - Autofill type and other hidden attributes if item is found 

### Unprocessed Loot View
- **Columns in View**:
  - Quantity
  - Item Name
  - Unidentified
  - Type
  - Size
  - Believed Value (this will be the character that is logged in)
  - Value if Sold
  - Who Has It (This might not be needed on this page?)
  - Average Appraisal
- **Item Actions**:
  - Select items with buttons for Keep Self, Keep Party, Sell, Trash/Give Away, Identify.
- **~~Condensed View~~** DONE: Items show a condensed view; for example, if 10 arrows are found in session 1, and 20 in session 2, the view shows 30 arrows. Hovering over items should show details of the number found and session date if there are multiple entries.

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

### Campaign Settings
- This page will set things like 
  - whose appraisals count for average appraisal
  - Track individual takings from party loot?
  - Number of players

### User Settings
- Theme settings
- Appraisal bonus setting
- Identification setting 

### DM Pages
- Allow setting what an unidentified item is without revealing to the players 

## Additional Features (Less Important)
- **Session Tracking**: Who showed on what day.
- **Wealth by Level Check**: (Less important, I think Herolab does it).
- **Spell Book Page**

## Plan
- **Dockerized Deployment**: Each campaign will have its own container, eliminating the need to include features to separate different campaigns.

## Feature Tracking
| Feature               | Priority | Status      | Notes                                                      | 
|-----------------------|----------|-------------|------------------------------------------------------------|
| Login                 | High     | In Progress | Dummy login atm, any details work                          |
| Gold Entry            | High     | In Progress | Mostly working                                             |
| Loot Entry            | High     | In Progress | Mostly working                                             |
| Loot Update           | High     | Pending     |                                                            |
| Unprocessed Loot View | High     | In Progress | Basics in place, buttons might work, but issue with select |
| Kept Loot View        | Med      | Pending     |                                                            |
| Party Kept Loot       | Med      | Pending     |                                                            |
| Sold View             | Med      | Pending     |                                                            |
| Given Away/Trash View | Low      | Pending     |                                                            |
| Gold View             | High     | In Progress | Basics in place, no distribute yet                         |
| Session Tracking      | Low      | Pending     |                                                            |
| Wealth by Level Check | V. Low   | Pending     |                                                            |
| Spell Book Page       | V. Low   | Pending     |                                                            |
| Google Sheets         | V. Low   | Pending     |                                                            |
| Campaign Settings     | Med      | Pending     |                                                            |
| User Settings         | Low      | Pending     |                                                            |
| DM Pages              | Med      | Pending     |                                                            |

---

This README provides a starting point for the development of the Loot and Gold Management System. Further updates and testing are required to ensure all features work as expected.
