# Loot and Gold Management System

This project was orginally generated by GPT for the Loot and Gold Management System. 

## Updates

### 7.11.24 308a 
- Gold Transations page has distribute buttons, but they are untested as I need to add test characters

### 7.11.24 125a 
- Unprocessed loot page 'complete'
  - Needs bug testing with users

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
- **~~Login via Character Name and Password~~**
- Google Login?

### Loot Entry
- **Item Name**: Autofill based on a database of items but allow custom input as well.
  - Autofill type and other hidden attributes if item is found

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

### Campaign Settings
- This page will set things like 
  - whose appraisals count for average appraisal
  - Track individual takings from party loot?
  - Number of players

### User Settings
- Theme settings
- ~~Appraisal bonus setting~~
- Identification setting 

### DM Pages
- Allow setting what an unidentified item is without revealing to the players
- Sell pending items(maybe better on unprocessed loot page as DM only option?)

## Additional Features (Less Important)
- **Session Tracking**: Who showed on what day.
- **Spell Book Page**
- **Appraisal Calculation**: Automatically calculate appraisal amounts for each character at the time of input.

## Plan
- **Dockerized Deployment**: Each campaign will have its own container, eliminating the need to include features to separate different campaigns.

## Feature Tracking
MVP - Required features for release

| Feature                 | Priority | Status               | Notes                                                  | 
|-------------------------|----------|----------------------|--------------------------------------------------------|
| Loot Entry              | MVP H    | In Progress, but MVP | Mostly working, add auto fill stuff                    |
| Sold View               | MVP M    | To Do                |                                                        |
| User Settings           | High     | In Progress          |                                                        |
| Item DB                 | Med      | In Progress          | Have the items mostly, need to insert                  |
| Campaign Settings       | High     | To Do                |                                                        |
| DM Pages                | High     | To Do                |                                                        |
| GPT to Break items down | Med      | Pending              |                                                        |
| Session Tracking        | Low      | Pending              |                                                        |
| Spell Book Page         | Low      | Pending              |                                                        |
| Google Sheets           | Low      | Pending              |                                                        |
| Attendance Tracker      | V. Low   | Pending              | Include tracking of chores?                            |
| Search Items            | V. Low   | Pending              | Search page that allows finding of items the party had |
| Google Login            | V. Low   | Pending              | Requires some stuff I dont have setup atm              |
| Identify Item Action    | Low      | To Do                |                                                        |
| Stats page              | Low      | To Do                |                                                        |
| DB Redesign             | MVP VH   | Complete             |                                                        |
| Login                   | MVP H    | Complete             | Registration and Login works                           |
| Gold Entry              | MVP H    | Complete             | Ready for bug testing                                  |
| Unprocessed Loot View   | MVP H    | Complete             | Ready for bug testing                                  |
| Gold View               | MVP H    | Complete             | Ready for bug testing                                  |
| Loot Update             | MVP M    | Complete             | Ready for bug testing                                  |
| Kept Loot View          | MVP M    | Complete             | Ready for bug testing                                  |
| Party Kept Loot         | MVP M    | Complete             | Ready for bug testing                                  |
| Given Away/Trash View   | Med      | Complete             |                                                        |
| Wealth by Level Check   | V. Low   | Will Not Implement   |                                                        |
