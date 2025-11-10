# Pathfinder 1e Loot Tracker - User Experience Guide

**Last Updated:** August 5, 2025

This document outlines the features and expected user workflows for the Pathfinder 1st Edition Loot and Gold Management System. It serves as a reference for understanding how users interact with the application and guides development priorities.

---

## 📋 **APPLICATION OVERVIEW**

The Pathfinder Loot Tracker is a comprehensive web application designed to manage treasure, gold, characters, and campaign elements for Pathfinder 1st Edition tabletop RPG sessions. It supports multiple campaign types with special features for maritime campaigns (Skulls & Shackles).

### **Target Users**
- **Players**: Primary users who manage loot entry, appraisals, gold tracking, and most day-to-day operations
- **Dungeon Masters (DMs)**: Administrative oversight, campaign settings, and conflict resolution - NOT primary data entry

---

## 🚀 **FUNDAMENTAL DESIGN PHILOSOPHY**

**KEY INSIGHT:** This application is designed to **reduce DM workload** by empowering players to manage loot processes themselves. Unlike traditional DM-centric tools, this system puts the responsibility on players to:

- Enter loot items as they're discovered
- Manage their own appraisals and identifications  
- Coordinate loot distribution among themselves
- Track infamy, gold, and other campaign elements
- Handle most day-to-day treasure management

The DM's role shifts from **data entry** to **oversight and adjudication**, only getting involved when players need guidance or conflict resolution.

---

## 🎯 **CORE FEATURES & USER WORKFLOWS**

### **1. Authentication & User Management**

#### **1.1 User Registration & Login**
**Feature:** Account creation, password management, login/logout
**How I Think Users Use This:**
```
INITIAL SETUP:
1. DM creates account first, gets admin privileges
2. DM shares registration link/info with players
3. Players create accounts with character names
4. DM verifies player accounts and assigns to characters
```
**USER'S ACTUAL EXPERIENCE:**
1. DM creates account first and gets DM/Admin privs. 
2. DM shares regitration link with players
3. Players create accounts with any username
4. Characters insert their characters in settings page

#### **1.2 Role-Based Access Control**
**Feature:** DM vs Player permissions, restricted admin functions
**How I Think Users Use This:**
```
PERMISSION WORKFLOW:
1. DMs can modify any loot, create items, manage sales
2. Players can only view their assigned loot
3. Both can see party loot but only DM can assign it
4. Settings and admin functions DM-only
```
**USER'S ACTUAL EXPERIENCE:**
1. DMs can modify any loot, create items, manage sales
2. Players can insert loot, modify in a limited way, change loot status, etc
3. Any one can assign loot status, but primarly players would handle it
4. App settings and admin functions DM-only

#### **1.3 User Settings & Preferences**
**Feature:** Personal dashboard customization, notification preferences
**How I Think Users Use This:**
```
CUSTOMIZATION:
1. Players set their preferred character view
2. Configure Discord notification preferences
3. Set dashboard layout preferences
4. Manage personal display settings
```
**USER'S ACTUAL EXPERIENCE:**
This section references features that don't exist today - these are potential future enhancements.

**Current Settings Available:** Change password, change email, update characters
**Future Additions:** No major additions needed at this time

---

### **2. Loot Management System**

#### **2.1 Loot Entry & Creation**
**Feature:** Add new loot items with full property details
**How I Think Users Use This:**
```
DURING SESSION (PLAYER-DRIVEN):
1. DM announces: "You find a +1 longsword and 500 gold pieces"
2. Players immediately enter the items into the app
3. Players use quick entry for simple items
4. Players use AI parsing for complex magical items from books
5. Players coordinate to avoid duplicate entries
```
**USER'S ACTUAL EXPERIENCE:**
Correct. Additionally, players may be told they find unidentified items, which they enter using a special unidentified workflow.

**Unidentified Entry Process:** The loot entry dialog has a prominent checkbox for 'unidentified' items.

**UI IMPROVEMENT IDEA:** When someone selects "magic" under type, highlight the unidentified checkbox asking "Do you mean unidentified?" to prevent common user error.

#### **2.2 Unprocessed Loot Management**
**Feature:** View and manage newly added items before assignment
**How I Think Users Use This:**
```
PLAYER-LED WORKFLOW:
1. Players review all "Unprocessed" items from session
2. Party discusses who wants what items
3. Players update item statuses themselves (Kept Party/Character)
4. Players coordinate distributions without DM involvement
```
**USER'S ACTUAL EXPERIENCE:**
Looks pretty close, they can also set pending sale status or trash status

#### **2.3 Party Loot Pool**
**Feature:** Shared loot that hasn't been assigned to specific characters
**How I Think Users Use This:**
```
PLAYER SELF-MANAGEMENT:
1. Players mark items "Kept Party" when unsure who should get them
2. Players browse party pool during downtime
3. Players negotiate among themselves who gets what
4. Players assign items to themselves after group agreement
5. No DM involvement needed for most decisions
```
**USER'S ACTUAL EXPERIENCE:**
"Kept Party" is for items that belong to the party collectively, not individual players. Players can still claim items from this status, but it's mainly for consumables like potions or important campaign items that benefit the whole group.

#### **2.4 Character-Specific Loot**
**Feature:** Items assigned to individual characters
**How I Think Users Use This:**
```
PERSONAL INVENTORY:
1. Players view their assigned items
2. Track personal wealth and equipment
3. Plan character upgrades and purchases
4. Reference during gameplay for available gear
```
**USER'S ACTUAL EXPERIENCE:**
Players don't use the app for planning upgrades and purchases. They also shouldn't be using this for reference during gameplay. They should be transferring claimed items to their character sheets (separate program/tool) for actual gameplay reference.

#### **2.5 Loot Search & Filtering**
**Feature:** Find specific items by name, type, value, status, character
**How I Think Users Use This:**
```
SEARCH SCENARIOS:
1. DM looking for specific item type for encounter
2. Player checking if party has certain equipment
3. Finding items by value range for selling
4. Locating unidentified magical items
5. Filtering by character to review assignments
```
**USER'S ACTUAL EXPERIENCE:**
Scenario 1 doesnt happen. The others do

#### **2.6 Item Stack Splitting**
**Feature:** Divide item stacks into smaller quantities
**How I Think Users Use This:**
```
DISTRIBUTION SCENARIOS:
1. Split consumables (potions, arrows) among party
2. Divide trade goods for individual sale
3. Separate coin stacks for character assignment
4. Portion bulk materials for crafting
```
**USER'S ACTUAL EXPERIENCE:**
Scenario 3 doesnt happen, the others do

#### **2.7 Bulk Loot Operations**
**Feature:** Update multiple items simultaneously (status changes, assignments)
**How I Think Users Use This:**
```
EFFICIENCY WORKFLOW:
1. Select multiple items for sale processing
2. Batch assign items to same character
3. Mass status update after party decisions
4. Bulk operations for large treasure hoards
```
**USER'S ACTUAL EXPERIENCE:**
Looks right

---

### **3. Gold & Currency Management**

#### **3.1 Currency Tracking**
**Feature:** Track platinum, gold, silver, copper with automatic totals
**How I Think Users Use This:**
```
WEALTH MANAGEMENT:
1. DM adds currency from treasure finds
2. System maintains running totals
3. Tracks individual denominations separately
4. Shows total party wealth in gold equivalent
```
**USER'S ACTUAL EXPERIENCE:**
1. Players add currency when DM announces it was found
2. Everything else correct

#### **3.2 Gold Distribution**
**Feature:** Divide party gold equally among active characters
**How I Think Users Use This:**
```
PLAYER-INITIATED DISTRIBUTION:
1. Players decide when they want gold distributed
2. Any player can trigger distribution (with party agreement)
3. Players coordinate timing around shopping trips
4. DM doesn't need to manage or initiate distributions
```
**USER'S ACTUAL EXPERIENCE:**
This is correct

#### **3.3 Party Loot Fund**
**Feature:** Reserve portion of distribution for party expenses
**How I Think Users Use This:**
```
PARTY FUND USAGE:
1. Reserve share during distribution
2. Use for group equipment (rope, supplies)
3. Party magical items (bags of holding)
4. Group expenses (ship repairs, bribes)
```
**USER'S ACTUAL EXPERIENCE:**
Correct

#### **3.4 Currency Conversion**
**Feature:** Automatically convert smaller denominations to larger ones
**How I Think Users Use This:**
```
CURRENCY BALANCING:
1. Convert excess copper/silver to gold
2. Clean up after large sales
3. Simplify wealth tracking
4. Prepare for character payments
```
**USER'S ACTUAL EXPERIENCE:**
This is a DM-only feature meant to simplify large coin amounts into gold.

**Potential Enhancement:** Feature could be enhanced with math validation to prevent negative currency amounts, but this is not a current priority.

#### **3.5 Transaction History**
**Feature:** Complete log of all gold transactions with dates and notes
**How I Think Users Use This:**
```
RECORD KEEPING:
1. Track major treasure finds
2. Review distribution history
3. Reference for character disputes
4. Campaign wealth progression analysis
```
**USER'S ACTUAL EXPERIENCE:**
This is correct

---


### **4. Character Management**

#### **4.1 Character Creation & Setup**
**Feature:** Create character profiles with names, roles, and basic information
**How I Think Users Use This:**
```
CAMPAIGN INITIALIZATION:
1. DM creates character entries for all party members
2. Links characters to player user accounts
3. Sets character roles/classes for reference
4. Establishes character hierarchy for loot priority
```
**USER'S ACTUAL EXPERIENCE:**
1. Players create their characters when they first log in
2. This is done auto since the character is theirs
3. Doesnt exist
4. doesnt exist

#### **4.2 Appraisal Skill Management**
**Feature:** Set individual character bonuses for appraisal and identification rolls
**How I Think Users Use This:**
```
SKILL TRACKING:
1. DM enters each character's Appraise skill bonus
2. System automatically applies bonuses to rolls
3. Updates when characters level up or gain items
4. Affects item identification success rates
```
**USER'S ACTUAL EXPERIENCE:**
1. Players keep up to date with inserting the correct appraise bonus for their characters
2. Correct
3. This is a manual update by the player

#### **4.3 Active/Inactive Status**
**Feature:** Mark characters as active or inactive for distributions and gameplay
**How I Think Users Use This:**
```
SESSION MANAGEMENT:
1. Mark characters inactive when players can't attend
2. Only active characters get gold distributions
3. Inactive characters don't count for party calculations
4. Reactivate when players return to campaign
```
**USER'S ACTUAL EXPERIENCE:**
1. Active vs inactive is more if the character is currently in the campaign then if in a particular session
2. Correct
3. Correct
4. No

#### **4.4 Character-Based Filtering**
**Feature:** Filter all loot and gold views by specific character
**How I Think Users Use This:**
```
INDIVIDUAL TRACKING:
1. Players view only their character's items
2. DM reviews individual character wealth
3. Check what specific character contributed to party
4. Plan character-specific rewards or gear
```
**USER'S ACTUAL EXPERIENCE:**
1. Players can view any loot
2. Anyone can view character wealth
3. correct
4. No planning

---

### **5. Item Database & Creation**

#### **5.1 Base Item Database**
**Feature:** Comprehensive database of core Pathfinder items with properties and values
**How I Think Users Use This:**
```
REFERENCE LOOKUP:
1. DM searches for standard equipment during session
2. Quick value reference for common items
3. Base template for creating magical versions
4. Property reference (weight, type, subtype)
```
**USER'S ACTUAL EXPERIENCE:**
The item database is used for many features, primarily item entry, value lookup, and caster level determination for magical items. There are likely other uses throughout the system that could be documented in the future.

#### **5.2 Magical Modification System**
**Feature:** Add enchantments and modifications to base items
**How I Think Users Use This:**
```
CUSTOM MAGIC ITEMS:
1. Start with base item (longsword)
2. Add magical mods (+1 enhancement, flaming)
3. System calculates total value
4. Create unique magical items for loot
```
**USER'S ACTUAL EXPERIENCE:**
Correct

#### **5.3 AI Item Parsing**
**Feature:** Paste item descriptions and have AI extract properties
**How I Think Users Use This:**
```
BOOK/MODULE INTEGRATION:
1. Copy item description from PDF/book
2. Paste into AI parser
3. System extracts name, properties, value
4. Review and adjust before saving
5. Adds to campaign item database
```
**USER'S ACTUAL EXPERIENCE:**
AI item parsing is specifically for when the DM gives a player an already identified magical item with complex modifications, such as a "+1 Ice Burst Longsword." Since the system can't automatically understand and parse complex item names into component parts, the AI breaks the description into individual base item + modifications, then creates the item with proper item ID and mod IDs.

#### **5.4 Manual Item Creation**
**Feature:** Manually create items with full control over all properties
**How I Think Users Use This:**
```
CUSTOM CREATION:
1. Unique campaign-specific items
2. Homebrew magical items
3. Special quest rewards
4. Items AI parsing can't handle properly
```
**USER'S ACTUAL EXPERIENCE:**
Points 1 and 2 are correct, the others arent 

#### **5.5 Item Templates & Favorites**
**Feature:** Save commonly used items for quick reuse
**How I Think Users Use This:**
```
EFFICIENCY TOOLS:
1. Save "standard adventuring gear" bundles
2. Template for common magical items
3. Quick access to frequently awarded items
4. Consistent pricing for similar items
```
**USER'S ACTUAL EXPERIENCE:**
❗ **FEATURE DOESN'T EXIST:** This feature is not currently implemented in the system. 

---

### **6. Appraisal & Identification System**

#### **6.1 Item Appraisal**
**Feature:** Determine monetary value of unknown items through skill checks
**How I Think Users Use This:**
```
PLAYER-DRIVEN VALUE DISCOVERY:
1. Players find items without known values
2. Players with Appraise skill roll their own dice
3. Players enter their own dice roll results
4. System applies their character bonuses automatically
5. Players discover item values without DM involvement
```
**USER'S ACTUAL EXPERIENCE:**
1. Players don't know the value of an item when they first get it
2. Any player can attempt to appraise using the button in the app (system handles dice rolling automatically)
3. System applies the character's appraisal bonus to each individual item roll
4. System provides the believed value based on the roll result

#### **6.2 Magical Item Identification**
**Feature:** Identify magical properties and abilities of unknown magic items
**How I Think Users Use This:**
```
PLAYER-LED IDENTIFICATION:
1. Players add unidentified magical items to loot
2. Players attempt their own Spellcraft checks
3. Players enter their dice results
4. Success reveals item name and properties to all players
5. Players track their daily attempts themselves
```
**USER'S ACTUAL EXPERIENCE:**
1. Players add unidentified magical items
2. Players enter their Spellcraft bonus in their character settings
3. System rolls dice automatically for each item and adds the character's bonus
4. Success reveals the item's name and properties to all players
5. System tracks when the last attempt was and only allows attempts once per game day per item

**Technical Note:** Uses the same automatic dice rolling system as appraisal, but with different skill bonus (Spellcraft vs Appraise) and different outcomes (identification vs value).

#### **6.3 Daily Attempt Limits**
**Feature:** Limit identification attempts per character per game day
**How I Think Users Use This:**
```
GAME BALANCE:
1. Prevents endless re-rolling on same item
2. Each character gets one attempt per day
3. Encourages multiple characters to try
4. Adds time pressure to identification
```
**USER'S ACTUAL EXPERIENCE:**
Correct

#### **6.4 Automatic Bonus Application**
**Feature:** System applies character skill bonuses to rolls automatically
**How I Think Users Use This:**
```
STREAMLINED ROLLING:
1. DM just enters the d20 roll result
2. System adds character's skill bonus
3. Calculates DC success automatically
4. Shows final result with modifiers
```
**USER'S ACTUAL EXPERIENCE:**
This was already discussed in some of the places it is used. The app doesnt do most of the rolls a player makes in a session, just the ones for the stuff in the app

#### **6.5 Identification Results Tracking**
**Feature:** Track what's been identified, by whom, and when
**How I Think Users Use This:**
```
RECORD KEEPING:
1. See which characters attempted identification
2. Track successful vs failed attempts
3. Know when items were last attempted
4. Historical record for campaign notes
```
**USER'S ACTUAL EXPERIENCE:**
Correct

---

### **7. Campaign-Specific Features (Skulls & Shackles)**

#### **7.1 Ship Management**
**Feature:** Track multiple ships with names, status, and capabilities
**How I Think Users Use This:**
```
FLEET MANAGEMENT:
1. Add party's main ship with full details
2. Track captured vessels and their fate
3. Set ship status (Active, Docked, Lost, Sunk)
4. Reference ship stats during naval encounters
```
**USER'S ACTUAL EXPERIENCE:**
Correct

#### **7.2 Crew Management**
**Feature:** Maintain roster of crew members with roles, skills, and status
**How I Think Users Use This:**
```
CREW OPERATIONS:
1. Add crew members recruited during adventures
2. Assign roles (Navigator, Gunner, Cook, etc.)
3. Track crew skills for various ship operations
4. Manage crew loyalty and morale
```
**USER'S ACTUAL EXPERIENCE:**
Points 1 and 2 are correct. 3 and 4 may be future features

#### **7.3 Outpost Management**
**Feature:** Establish and manage pirate outposts and bases
**How I Think Users Use This:**
```
BASE BUILDING:
1. Establish outposts in strategic locations
2. Track outpost development and resources
3. Manage defenses and facilities
4. Use as campaign story elements
```
**USER'S ACTUAL EXPERIENCE:**
Correct

#### **7.4 Weather System**
**Feature:** Golarion calendar with weather patterns affecting travel
**How I Think Users Use This:**
```
ENVIRONMENTAL PLANNING:
1. Check weather for planned voyages
2. Weather affects travel time and encounters
3. Storm seasons impact naval activities
4. Calendar tracking for campaign events
```
**USER'S ACTUAL EXPERIENCE:**
Correct

#### **7.5 Infamy Tracking**
**Feature:** Track party's pirate reputation and infamy points
**How I Think Users Use This:**
```
PLAYER-MANAGED REPUTATION:
1. DM announces infamy gains during session
2. Players enter infamy points themselves
3. Players track their reputation progression
4. Players reference infamy for NPC interactions
5. DM doesn't need to manage infamy tracking
```
**USER'S ACTUAL EXPERIENCE:**
1. Players call for infamy gain (when they do something infamous)
2. Players roll dice themselves and enter the total including bonuses on infamy page
3. System determines total infamy gained for the roll and tracks location of gain
4. Players can spend dispositions they have access to
5. DM doesn't need to get involved

**Note:** Disposition system details are available in the codebase for reference.

---

### **8. Session Management**

#### **8.1 Session Scheduling**
**Feature:** Create and manage upcoming game sessions with dates and times
**How I Think Users Use This:**
```
ADVANCE PLANNING:
1. DM schedules sessions weeks in advance
2. Sets consistent weekly/monthly schedule
3. Adjusts for holidays and conflicts
4. Players can see upcoming sessions
```
**USER'S ACTUAL EXPERIENCE:**
Correct

#### **8.2 Player Attendance Tracking**
**Feature:** Record which players attended each session
**How I Think Users Use This:**
```
ATTENDANCE MANAGEMENT:
1. Mark players present/absent for each session
2. Track attendance patterns over time
3. Plan around consistent vs sporadic players
4. Reference for character activity decisions
```
**USER'S ACTUAL EXPERIENCE:**
Correct

#### **8.3 Session Notifications & Reminders**
**Feature:** Automated reminders sent to Discord or other channels
**How I Think Users Use This:**
```
COMMUNICATION:
1. Automatic reminders sent before sessions
2. Session cancellation notifications
3. Discord integration for group chat
4. Reduces "did we have a session today?" confusion
```
**USER'S ACTUAL EXPERIENCE:**
Correct

#### **8.4 Session-Linked Loot & Gold**
**Feature:** Associate loot discoveries and gold with specific session dates
**How I Think Users Use This:**
```
HISTORICAL TRACKING:
1. See what was found in each session
2. Link major treasure discoveries to story events
3. Track party progression over time
4. Reference for campaign journaling
```
**USER'S ACTUAL EXPERIENCE:**
Correct, but not in place yet

---

### **9. Reporting & Analytics**

#### **9.1 Loot Status Reports**
**Feature:** View comprehensive reports of all loot by status categories
**How I Think Users Use This:**
```
INVENTORY MANAGEMENT:
1. Review all "Unprocessed" items needing decisions
2. Check "Pending Sale" items ready for market
3. See "Kept Party" items available for distribution
4. Track "Sold" items for profit analysis
```
**USER'S ACTUAL EXPERIENCE:**
correct

#### **9.2 Character Wealth Ledgers**
**Feature:** Individual character reports showing all loot and gold transactions
**How I Think Users Use This:**
```
INDIVIDUAL TRACKING:
1. Character-specific wealth summaries
2. Personal loot collection overviews
3. Gold transaction history per character
4. Wealth progression over time
```
**USER'S ACTUAL EXPERIENCE:**
correct

#### **9.3 Sales & Profit Analysis**
**Feature:** Track sales history, profit margins, and economic trends
**How I Think Users Use This:**
```
ECONOMIC PLANNING:
1. Total sales revenue tracking
2. Profit analysis on sold items
3. Market trends for different item types
4. Economic impact on campaign
```
**USER'S ACTUAL EXPERIENCE:**
❗ **FEATURE NOT NEEDED:** This feature doesn't exist and isn't needed for the campaign style.

#### **9.4 Party Wealth Summaries**
**Feature:** Overview reports of total party wealth and assets
**How I Think Users Use This:**
```
CAMPAIGN BALANCE:
1. Total party wealth progression
2. Wealth distribution among characters
3. Asset allocation (cash vs items)
4. Campaign economic health check
```
**USER'S ACTUAL EXPERIENCE:**
correct

#### **9.5 Export & Data Analysis**
**Feature:** Export data to CSV/Excel for external analysis
**How I Think Users Use This:**
```
EXTERNAL ANALYSIS:
1. Export for spreadsheet analysis
2. Create custom charts and graphs
3. Campaign journaling and documentation
4. Share data with other tools
```
**USER'S ACTUAL EXPERIENCE:**
❗ **FEATURE DOESN'T EXIST:** This feature is not currently implemented.

---

### **10. Integration Features**

#### **10.1 Discord Webhook Integration**
**Feature:** Automated notifications sent to Discord channels
**How I Think Users Use This:**
```
REAL-TIME UPDATES:
1. Notify when loot is added during sessions
2. Announce gold distributions to the group
3. Session reminders and schedule changes
4. Major campaign event notifications
```
**USER'S ACTUAL EXPERIENCE:**
Discord is only for session reminders and scheduling

#### **10.2 OpenAI API Integration**
**Feature:** AI-powered parsing of item descriptions into structured data
**How I Think Users Use This:**
```
AI-ASSISTED ENTRY:
1. Copy/paste item descriptions from PDFs
2. AI extracts properties, values, descriptions
3. Quick conversion of book items to database
4. Consistent formatting and data structure
```
**USER'S ACTUAL EXPERIENCE:**
Not at all. Only used for parsing items as previously described

#### **10.3 Data Import/Export**
**Feature:** Bulk import/export of campaign data
**How I Think Users Use This:**
```
DATA MANAGEMENT:
1. Import items from other campaigns
2. Backup campaign data
3. Share data between DMs
4. Campaign migration and archiving
```
**USER'S ACTUAL EXPERIENCE:**
Backup use only - not used for sharing between campaigns or DMs.

#### **10.4 API Endpoints for Custom Tools**
**Feature:** REST API for building custom integrations
**How I Think Users Use This:**
```
CUSTOM DEVELOPMENT:
1. Build custom mobile apps
2. Integration with other campaign tools
3. Automated data processing scripts
4. Third-party tool connections
```
**USER'S ACTUAL EXPERIENCE:**
The API is only used internally by the frontend - not for external integrations or custom tools.
---

## 🔄 **TYPICAL USER JOURNEYS**

### **Pre-Session (DM)**
```
1. Review scheduled session (minimal - players manage most prep)
2. Check DM settings if needed
3. Prepare for any adjudication needed
```

### **During Session (Player-Driven)**
```
1. DM announces: "You find X items and Y gold"
2. Players immediately enter loot into the app
3. Players coordinate who enters what to avoid duplicates
4. Players make appraisal/identification rolls and enter results
5. Players update item statuses as decisions are made
6. Players add gold and infamy as announced by DM
```

### **Post-Session (Player-Led)**
```
1. Players finish entering any missed loot
2. Players coordinate loot distribution among themselves
3. Players initiate gold distribution when ready
4. Players update item statuses (keep/sell/party)
5. Players manage their own character progression
```

### **Between Sessions (Player-Centric)**
```
1. Players review and organize their loot
2. Players coordinate equipment purchases
3. Players plan character upgrades
4. Players manage party loot pool
5. Players handle identification attempts
6. DM occasionally checks in but isn't actively managing
```

---

## 💭 **DEVELOPMENT VALIDATION QUESTIONS**

*[These sections are for the user to fill in based on actual usage patterns]*

### **What Features Get Used Most?**
Loot entry and processing. Identification

### **What Workflows Feel Natural?**
Unsure at this time

### **What's Missing?**
Unsure at this time

### **User Pain Points**
**Unidentified Item Confusion:** When players find unidentified items, the DM will say "it's magical," so players mark the item type as "magical" instead of using the proper "unidentified" marker. This creates workflow problems.

**Proposed Solution:** When someone selects "magic" under type, highlight the unidentified checkbox asking "Do you mean unidentified?" to prevent this common user error.

### **Success Stories**
It has simplified things considerably 

---

## 🎯 **NEXT STEPS**

After completing the user input sections above, this document will serve as a reference for:

1. **Feature Prioritization** - Focus development on most-used features
2. **UX Improvements** - Streamline workflows that feel clunky
3. **New Feature Development** - Address identified gaps
4. **User Onboarding** - Create guides based on actual usage patterns
5. **Performance Optimization** - Optimize the user journeys that matter most

---

**Instructions for Completion:**
*Please fill in all the "USER'S ACTUAL EXPERIENCE" and "SPACE FOR USER INPUT" sections based on your real-world usage of the system. Be specific about what works, what doesn't, and how you and your players actually interact with each feature.*