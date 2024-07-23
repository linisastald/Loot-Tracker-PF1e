# Loot and Gold Management System

## Features to be Added

### Campaign Settings
- This page will set things like 
  - whose appraisals count for average appraisal
  - Track individual takings from party loot?
  - Number of players

### User Settings
- Theme settings
- Identification setting 

### Wand Tracking
- Easy tracking of wand usage
- if charges = 0, auto move to trash

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

| Feature                  | Priority | Status             | Notes                                                  | 
|--------------------------|----------|--------------------|--------------------------------------------------------|
| Campaign Settings        | High     | In Progress        |                                                        |
| DM Pages                 | High     | In Progress        |                                                        |
| Session Tracking         | Low      | Pending            |                                                        |
| Spell Book Page          | Low      | Pending            |                                                        |
| Google Sheets            | Low      | Pending            |                                                        |
| Attendance Tracker       | V. Low   | Pending            | Include tracking of chores?                            |
| Search Items             | V. Low   | Pending            | Search page that allows finding of items the party had |
| Identify Item Action     | Low      | Pending            |                                                        |
| Stats page               | Low      | Pending            |                                                        |
| Wand Tracking            | V. Low   | Pending            |                                                        |
| Calendar                 | Low      | In Progress        | May save for next major version                        |

## Feature Tracking - Completed Features

| Feature                  | Priority | Status   | Notes                                                  | 
|--------------------------|----------|----------|--------------------------------------------------------|
| Loot Entry               | MVP H    | Complete |                                                        |
| Sold View                | MVP M    | Complete |                                                        |
| User Settings            | High     | Complete |                                                        |
| Item DB                  | Med      | Complete |                                                        |
| DB Redesign              | MVP VH   | Complete |                                                        |
| Login                    | MVP H    | Complete | Registration and Login works                           |
| Gold Entry               | MVP H    | Complete | Ready for bug testing                                  |
| Unprocessed Loot View    | MVP H    | Complete | Ready for bug testing                                  |
| Gold View                | MVP H    | Complete | Ready for bug testing                                  |
| Loot Update              | MVP M    | Complete | Ready for bug testing                                  |
| Kept Loot View           | MVP M    | Complete | Ready for bug testing                                  |
| Party Kept Loot          | MVP M    | Complete | Ready for bug testing                                  |
| Given Away/Trash View    | Med      | Complete |                                                        |
| Apprasial                | High     | Complete | Mostly complete, testing needed                        |
| GPT to Break items down  | Med      | Complete |                                                        |

## Feature Tracking - Will Not Implement Features

| Feature                  | Priority | Status              | Notes                                     | 
|--------------------------|----------|---------------------|-------------------------------------------|
| Wealth by Level Check    | V. Low   | Will Not Implement  |                                           |
| Google Login             | V. Low   | Will Not Implement  | Requires some stuff I dont have setup atm |
