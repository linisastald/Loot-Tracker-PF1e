# Loot and Gold Management System

This project was orginally generated by GPT for the Loot and Gold Management System. 

## Updates

### 7.10.24 520p 
- Updated to psql16
- recreated DB with new setup

### 7.10.24 155p 
- Redesign of DB in progress

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
- Google Login?

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
- Show total GP made at top


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

### DB Structure

    +--------------------+     +---------------------+
    |       users        |     |     characters      |
    +--------------------+     +---------------------+
    | id (PK)            |     | id (PK)             |
    | username (unique)  |     | name                |
    | password           |     | appraisal_bonus     |
    | role               |     | birthday            |
    | joined             |     | deathday            |
    +--------------------+     | active              |
            |                 | user_id (FK)         |
            |                 +----------------------+
            |                        |
            |                        |
            |                        |
            v                        v
    +--------------------+     +----------------------+
    |        gold        |     |        loot          |
    +--------------------+     +----------------------+
    | id (PK)            |     | id (PK)              |
    | session_date       |     | session_date         |
    | who (FK)           |---->| quantity             |
    | transaction_type   |     | name                 |
    | notes              |     | unidentified         |
    | copper             |     | masterwork           |
    | silver             |     | type                 |
    | gold               |     | size                 |
    | platinum           |     | status               |
    +--------------------+     | itemid (FK)          |
                               | modids               |
                               | charges              |
                               | value                |
                               | whohas (FK)          |
                               | whoupdated (FK)      |
                               | lastupdate           |
                               | notes                |
                               +----------------------+
                                       |
                                       |
                                       |
                                       v
                               +----------------+
                               |      item      |
                               +----------------+
                               | id (PK)        |
                               | name           |
                               | type           |
                               | value          |
                               +----------------+
                                       |
                                       |
                                       |
                                       v
                             +-----------------+
                             |    appraisal    |
                             +-----------------+
                             | id (PK)         |
                             | time            |
                             | characterid (FK)|
                             | lootid (FK)     |
                             | appraisalroll   |
                             | believedvalue   |
                             +-----------------+
                                       |
                                       |
                                       |
                                       v
                               +----------------+
                               |      mod       |
                               +----------------+
                               | id (PK)        |
                               | name           |
                               | plus           |
                               | type           |
                               | valuecalc      |
                               | value          |
                               +----------------+


## Additional Features (Less Important)
- **Session Tracking**: Who showed on what day.
- **Wealth by Level Check**: (Less important, I think Herolab does it).
- **Spell Book Page**

## Plan
- **Dockerized Deployment**: Each campaign will have its own container, eliminating the need to include features to separate different campaigns.

## Feature Tracking
MVP - Required features for release

| Feature                 | Priority | Status             | Notes                                                      | 
|-------------------------|----------|--------------------|------------------------------------------------------------|
| DB Redesign             | MVP VH   | Complete           |                                                            |
| Login                   | MVP H    | In Progress        | Dummy login atm, any details work                          |
| Gold Entry              | MVP H    | In Progress        | Mostly working                                             |
| Loot Entry              | MVP H    | In Progress        | Mostly working                                             |
| Unprocessed Loot View   | MVP H    | In Progress        | Basics in place, buttons might work, but issue with select |
| Gold View               | MVP H    | In Progress        | Basics in place, no distribute yet                         |
| Loot Update             | MVP M    | To Do              |                                                            |
| Item DB                 | MVP M    | In Progress        | Have the items mostly, need to design tables and insert    |
| Kept Loot View          | MVP M    | To Do              |                                                            |
| Party Kept Loot         | MVP M    | To Do              |                                                            |
| Sold View               | MVP M    | To Do              |                                                            |
| Campaign Settings       | High     | Pending            |                                                            |
| DM Pages                | High     | Pending            |                                                            |
| User Settings           | High     | In Progress        |                                                            |
| Given Away/Trash View   | Med      | To Do              |                                                            |
| GPT to Break items down | Med      | Pending            |                                                            |
| Session Tracking        | Low      | Pending            |                                                            |
| Spell Book Page         | Low      | Pending            |                                                            |
| Google Sheets           | Low      | Pending            |                                                            |
| Attendance Tracker      | V. Low   | Pending            | Include tracking of chores?                                |
| Search Items            | V. Low   | Pending            | Search page that allows finding of items the party had     |
| Wealth by Level Check   | V. Low   | Will Not Implement |                                                            |
| Google Login            | V. Low   | Pending            | Requires some stuff I dont have setup atm                  |

