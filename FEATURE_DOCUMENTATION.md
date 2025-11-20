# Pathfinder 1st Edition Loot Tracker - Feature Documentation

**Version:** 0.10.x
**Last Updated:** 2025-11-19
**Purpose:** Comprehensive feature documentation for polishing phase

---

## 1. AUTHENTICATION & USER MANAGEMENT

### 1.1 User Authentication
The application uses JWT token-based authentication with HTTP-only cookies for secure session management. Users can register new accounts (when registration is open), log in with rate limiting protection, and request password resets via email. The system supports role-based access control with DM (Dungeon Master) and Player roles, allowing different levels of access to features. Session status can be checked to verify active authentication, and users can log out to invalidate their session tokens.

### 1.2 Invite System
The invite system provides controlled user registration through generated invite codes. DMs can create quick random invite codes or custom invite codes with specific values. Each invite tracks whether it has been used and can be deactivated to prevent further use. This allows DMs to manage who joins their campaign by distributing unique invite codes rather than leaving registration open to the public.

### 1.3 User Account Management
Users can manage their own accounts by changing passwords and email addresses. Discord ID mapping allows linking Discord accounts to game accounts for integration features. DMs have additional privileges to manage all users in the campaign, including the ability to reset any user's password, delete user accounts, and update system-wide settings. Users can view their current profile information at any time.

---

## 2. CHARACTER MANAGEMENT

### 2.1 Character Creation & Management
Each user can create and manage multiple characters within the campaign. Characters track essential information including name, appraisal bonus for identifying loot, birthday, and deathday (if applicable). Users can mark characters as active or inactive, allowing them to maintain a roster while indicating which characters are currently being played. The system allows deactivating all characters at once for convenience. Character appraisal bonuses are particularly important for the loot identification system.

### 2.2 DM Character Management
DMs have administrative access to view and modify all characters in the campaign. This allows the DM to make corrections, update character information on behalf of players, or manage NPCs as needed. The DM can update any character's details regardless of which user owns the character, providing centralized campaign management capabilities.

---

## 3. LOOT MANAGEMENT SYSTEM

### 3.1 Loot Entry & Basic CRUD
The loot entry system allows players to add items found during adventures. Items can be created individually or in bulk, with an integrated OpenAI API feature to parse item descriptions from text and automatically populate fields like name, value, weight, and magical properties. The system supports searching the loot inventory, updating item details, deleting items, and splitting item stacks into multiple entries for distribution. Each loot entry tracks quantity, value, status (unprocessed, kept, sold, trashed), and which character possesses it.

### 3.2 Item Management
DMs can create reusable item templates that define base items and their properties. This includes creating magical modifications and enchantments that can be applied to items. The item and modification system allows building a custom item database for the campaign, making it easy to add frequently-found items without re-entering all details. This administrative feature helps maintain consistency in item properties across the campaign.

### 3.3 Loot Status Tracking
Each loot item has a status that tracks its lifecycle: unprocessed (newly found), kept-party (shared party treasure), kept-character (assigned to a specific character), sold (converted to gold), or trashed (given away or destroyed). The system supports bulk status updates for efficiency and tracks whether items have been identified yet. This status system helps organize loot processing after each session and maintains a clear record of party wealth distribution.

---

## 4. GOLD & CURRENCY MANAGEMENT

### 4.1 Gold Transactions
The gold transaction system tracks all currency movement in the campaign across all four Pathfinder currency types: copper, silver, gold, and platinum. Each transaction records the amount, type, and context. The system can calculate gold totals by character and provides overviews of party wealth. Special features include distributing gold equally to all party members and distributing proceeds from sold loot. All transactions are recorded for historical tracking and balance verification.

### 4.2 Sold Items Tracking
When items are sold, the system creates a record linking the sold item to its sale value and date. This maintains a complete history of what the party has sold, when it was sold, and for how much. This historical data helps track the party's economic activities and provides an audit trail for gold inflows from item sales.

---

## 5. ITEM APPRAISAL & IDENTIFICATION SYSTEM

### 5.1 Appraisal System
The appraisal system simulates characters attempting to estimate an item's value using their appraisal skill. Each character can attempt one appraisal per item, applying their appraisal bonus to determine how close their estimate is to the actual value. The system records both the appraised value (what the character thinks it's worth) and the actual value, allowing comparison. Appraisal statistics can be reviewed to track character accuracy over time.

### 5.2 Item Identification System
Unidentified magical items must be identified through spellcraft checks before their true properties are known. Characters make identification attempts with spellcraft rolls, and the system tracks success or failure along with the in-game (Golarion) date of identification. This creates a realistic progression where the party must actively work to understand magical items they find. The system maintains a list of all unidentified items for easy reference.

### 5.3 Consumable Items
Consumable items like potions, scrolls, and wands require special tracking for usage. When a consumable is used, the system marks it and updates quantities. Wands track remaining charges, automatically decrementing when used. The consumable inventory shows all consumables with their remaining charges or quantities, helping players manage limited-use magical items effectively.

---

## 6. SALES & LIQUIDATION SYSTEM

### 6.1 Sales Management
The sales system provides DM-controlled workflow for converting loot into gold. Items marked for sale enter a "pending sale" state visible to the DM. The DM can confirm individual sales, sell all selected items at once, sell everything except specific items, or sell up to a maximum value. Sales can be cancelled before confirmation, and the system can calculate what a sale would net without actually executing it. This gives the DM control over when loot gets liquidated and gold enters circulation, maintaining economic balance in the campaign.

---

## 7. LOOT REPORTS & ANALYTICS

### 7.1 Report Generation
The reporting system generates various views of party wealth and inventory. Reports include party-kept loot (communal items), character-kept loot (individual inventories), and items that were trashed or given away. Character ledgers show complete inventories per character. The system tracks counts of unidentified and unprocessed items to help manage post-session loot processing. Statistics and analytics features provide insights into loot value distribution, session-based acquisition patterns, and overall party wealth trends.

### 7.2 Item Search History
Every time players search for items in cities (using the City Services system), the search is recorded with the d100 roll result and whether the item was found. This maintains a complete history of item availability checks, helping the DM track what players have been looking for and whether they've found it. Search records can be deleted to clean up old data.

---

## 8. CREW MANAGEMENT SYSTEM

### 8.1 Crew CRUD Operations
For campaigns involving ships (like Skulls & Shackles), the crew management system tracks all NPCs serving as crew members. Each crew member has a name, race, age, description, and assigned position (captain, first mate, etc.). Crew can be assigned to specific ships or outposts, moved between locations, marked as deceased with death dates, or marked as departed with reasons. The system provides separate views for active crew and deceased crew, maintaining historical records of all crew members throughout the campaign.

### 8.2 Crew Details Tracking
Beyond basic information, the system tracks detailed crew attributes including their specific position on the ship, life status (alive/dead), location type (ship or outpost), and specific location ID. When crew depart or die, the reason and date are recorded. This granular tracking supports complex naval campaigns where crew management is a core gameplay mechanic.

---

## 9. SHIP MANAGEMENT SYSTEM

### 9.1 Ship CRUD Operations
The ship management system maintains records of all vessels owned or encountered by the party. Each ship has detailed specifications based on its type, including statistics relevant to naval combat and travel. Ships can be created, viewed, updated, and deleted. The system tracks the current location of each ship and provides a complete roster of the party's naval assets.

### 9.2 Ship Damage & Status
Ships track damage levels and can be damaged or repaired through the system. Special status tracking includes "squibbing" (heavily damaged and taking on water) and precise location in the game world. Damage tracking is essential for naval combat campaigns where ships can be damaged in battle and require repair at ports. The system maintains the current health status of each vessel.

### 9.3 Ship Types
The system includes predefined ship types with their official Pathfinder 1e specifications. This allows quick creation of ships based on standard types (sloop, frigate, etc.) without manually entering all statistics. Ship type data includes movement rates, cargo capacity, crew requirements, and combat statistics.

---

## 10. OUTPOST MANAGEMENT SYSTEM

### 10.1 Outpost Operations
Outposts represent land-based locations owned or controlled by the party, such as island bases or port facilities. The system tracks outpost name, location, and date of access. Outposts serve as alternative crew assignment locations (complementing ships) and represent the party's growing influence and holdings. The outpost system supports campaigns where players establish bases of operation beyond their ships.

---

## 11. SESSION MANAGEMENT SYSTEM

### 11.1 Basic Session Operations
Game sessions are scheduled events with dates, times, descriptions, and minimum player requirements. The DM creates sessions specifying when the game will run and how many players are needed. Sessions progress through statuses: scheduled (announced), confirmed (enough players committed), cancelled (insufficient players), or completed (game finished). The DM can update session details or delete sessions as needed. This provides a centralized calendar for the gaming group.

### 11.2 Session Attendance & RSVP
Players can RSVP to sessions with different response types: accepted (attending), declined (not attending), tentative (maybe), or special statuses like "late" (arriving late) with specific times. Attendance notes can be added for context. The system integrates with Discord for reaction-based RSVP tracking and provides detailed attendance summaries showing confirmed count, declined count, and maybe count for each session.

### 11.3 Recurring Sessions
For regular gaming groups, recurring session templates automate scheduling. Templates define patterns like "every Tuesday" or "every other Friday" and can generate multiple future session instances at once. When updating a recurring session, changes can optionally apply to all future instances. Deleting a recurring session offers the choice to delete only that instance or all future instances. This eliminates manual session creation for established schedules.

### 11.4 Session Announcements & Reminders
Sessions can be announced to Discord channels with embedded messages showing session details and attendance buttons. Automated reminders send to players who haven't responded or marked themselves as "maybe" at configurable intervals (default 48 hours before). Manual reminders can target specific groups: all players, only non-responders, or only tentative players. A 12-hour cooldown prevents automated reminders from sending too soon after manual ones. All announcements and reminders track their Discord message IDs for updating.

### 11.5 Session Notes & Prep Requests
The notes system allows DMs to add prep requests (things players should prepare before the session), general notes visible to all, or DM-only private notes. Players can also add general notes. Each note includes the author's user and character information, creating a collaborative planning space for each session. This helps coordinate preparation and ensures everyone knows what to bring or prepare.

### 11.6 Session Tasks
Tasks are specific to-do items for sessions, assignable to users with due times. Tasks track status (pending, completed, cancelled) and can be marked complete when finished. This helps organize session preparation activities like bringing snacks, preparing character sheets, or looking up rules. Tasks integrate with the broader task management system.

### 11.7 Enhanced Session View
Enhanced session views aggregate attendance data directly with session information, showing confirmed/declined/maybe counts and listing confirmed player names. This provides quick session overview without needing separate attendance queries. Filtering options include status filtering and upcoming-only views for focused session planning.

---

## 12. DISCORD INTEGRATION

### 12.1 Discord Bot Operations
The Discord integration connects the application to Discord servers, enabling automated messaging and interaction handling. Messages can be sent to configured channels, including embedded rich messages with buttons and reactions. The system handles Discord interaction events (button clicks, reactions) and processes webhook events (message creation, updates, member changes). Integration status can be checked and settings updated through the application.

### 12.2 Discord User Linking
Users link their Discord accounts to their application accounts by providing their Discord ID and username. This mapping enables features like mentioning specific players in announcements, tracking Discord-based attendance responses, and personalizing Discord messages. The system maintains the link between Discord identities and campaign user accounts.

### 12.3 Discord Outbox Pattern
To ensure reliable message delivery, the system uses an outbox pattern where Discord messages are first saved to the database before sending. If sending fails, messages are automatically retried up to 5 times. Message delivery status is tracked, and failed messages can be inspected and manually retried. This prevents lost session announcements or important bot communications due to temporary Discord API issues.

---

## 13. CALENDAR & TIME SYSTEM

### 13.1 Golarion Calendar (In-Game Calendar)
The Golarion calendar tracks in-game time using the official Golarion (Pathfinder setting) calendar system. The current date can be advanced day-by-day as game time progresses, or set manually by the DM for time skips. Notes can be attached to specific calendar dates to record in-game events, NPC birthdays, or scheduled in-world happenings. The calendar provides an immersive timeline for campaign events and helps track seasonal effects, aging, and time-sensitive plot elements.

---

## 14. WEATHER SYSTEM

### 14.1 Weather Simulation
The weather system generates realistic weather for specific regions and dates in the Pathfinder world. Weather includes temperature (low/high), precipitation type (none, rain, snow, sleet), wind speed, humidity, and visibility. Conditions range from Clear and Cloudy to Rainy, Stormy, and Snowy. Weather can be queried for specific dates or date ranges, and the DM can manually override weather for specific dates if needed. Historical weather is stored for consistency.

### 14.2 Weather Regions Configuration
Different regions have distinct weather patterns based on their climate. Each region defines base temperatures, temperature variance, precipitation chances, storm probability, and hurricane likelihood. Seasonal adjustments modify weather patterns throughout the year, creating realistic regional climates. Support for regions like Varisia and The Shackles allows campaign-appropriate weather for different Adventure Paths.

---

## 15. CITY SERVICES SYSTEM

### 15.1 City/Settlement Management
Cities and settlements are tracked with their size category (Village through Metropolis), population, region, and alignment. Economic data includes base value (maximum value of readily available items), purchase limit (most expensive single item normally available), and maximum spell level for spellcasting services. This data follows official Pathfinder 1e settlement rules and determines what items and services are accessible in each location.

### 15.2 Settlement Sizes Configuration
The system includes Pathfinder 1e settlement size categories with their associated economic thresholds. This reference data ensures cities are configured with appropriate values based on their size classification, maintaining game balance and rule compliance.

### 15.3 Item Search in Cities (Availability)
When players want to find specific items in cities, they make availability checks. The system rolls d100 against the item's availability threshold based on city size and item value. Each search is recorded with the roll result and whether the item was found, creating a history of shopping attempts. This implements Pathfinder 1e rules for item availability in settlements of different sizes.

### 15.4 Spellcasting Services
Players can hire NPC spellcasters in cities to cast spells for them. The system tracks available spells with their levels and costs, calculates service costs based on spell level and caster level (following PF1e pricing: spell level × caster level × 10 gp), and checks if the required spell is available in a given city based on its maximum spell level. Service history is maintained for campaign records.

---

## 16. INFAMY SYSTEM (Skulls & Shackles)

### 16.1 Infamy & Disrepute Tracking
The Infamy system is specific to pirate-themed campaigns (Skulls & Shackles Adventure Path). Infamy represents the party's reputation in pirate circles, while Disrepute tracks negative reputation. Each ship tracks its own infamy and disrepute points. All infamy changes are recorded in history with reasons and Golarion dates. Port visits can generate infamy based on threshold values, skills used, and plunder spent. The system maintains a complete audit trail of how infamy was earned or lost.

### 16.2 Favored Ports
Favored ports grant bonuses when gaining infamy (typically +2 per port). Multiple ports can be designated as favored, representing locations where the crew has established particularly strong reputations. The system tracks which ports are favored and applies bonuses automatically when recording port-based infamy gains.

### 16.3 Port Visits Tracking
Each port visit records the location, threshold values for gaining infamy, skills used in port interactions (Intimidate, Diplomacy, etc.), and plunder spent. This creates a detailed log of the crew's activities at various ports, supporting the narrative of the pirate campaign and providing historical context for infamy changes.

### 16.4 Impositions System
Impositions are special abilities unlocked by achieving infamy thresholds. The system tracks available impositions and which ones have been purchased with infamy points. Some impositions require 20+ infamy to unlock. Special abilities include the "Despicable" feature allowing sacrifice of crew members for additional infamy. This implements the official Skulls & Shackles infamy rules.

### 16.5 Infamy History
Complete historical records track every infamy change with reasons, dates, and details. This provides campaign chronology and helps resolve disputes about current infamy totals. The history serves as a narrative log of the crew's rise to notoriety.

---

## 17. FAME SYSTEM

### 17.1 Fame Points Tracking
Fame points represent character renown and heroic reputation (used in some Adventure Paths). The system tracks fame per character, recording who added fame points, when they were added, and the reason. Fame history provides an audit trail of how characters earned their reputation throughout the campaign.

---

## 18. ADMIN & SETTINGS MANAGEMENT

### 18.1 DM Settings & Configuration
DMs access comprehensive settings controlling campaign features. Configuration options include campaign name, Discord integration toggle, infamy system toggle, auto-appraisal toggle (whether items are automatically appraised when added), theme (dark/light mode), registration status (open/closed), and OpenAI API key for item parsing. These settings allow customizing the application to match campaign needs and house rules.

### 18.2 Campaign Settings
Campaign-specific settings include campaign name, weather region selection for the weather system, and average party level configuration. These settings establish the campaign context and affect features like weather simulation and level-appropriate challenge calculation.

### 18.3 User Management
DMs can view all campaign users, reset any user's password (for account recovery), delete user accounts (for inactive players), and update user settings. This administrative control allows the DM to maintain the user roster and handle account issues.

### 18.4 Character Management
DMs access a centralized interface to view all campaign characters and edit any character's details regardless of ownership. This allows correcting errors, updating NPCs, and managing the campaign's character roster from a single location.

### 18.5 System Settings
System-wide configuration controls which features are enabled or disabled, sets global parameters, and manages application behavior. This includes toggling entire subsystems like infamy or automated appraisal based on campaign needs.

---

## 19. GENERAL USER SETTINGS

### 19.1 User Profile Settings
All users can access their profile to view account information, manage their personal characters, view active characters, and configure user preferences. This provides self-service account management for common tasks without requiring DM intervention.

---

## 20. UTILITY & SYSTEM FEATURES

### 20.1 Application Version & Info
Version endpoints provide application version information for troubleshooting and compatibility checking. Runtime configuration endpoints expose non-sensitive configuration data. Health check and API info endpoints support monitoring and documentation.

### 20.2 Health & Status Monitoring
Health check endpoints verify application status, database connectivity, and service availability. Uptime tracking and status reporting support monitoring solutions and help diagnose issues quickly.

### 20.3 CSRF Protection & Security
Cross-Site Request Forgery (CSRF) protection secures all state-changing API requests through token generation and validation. HTTP-only cookies with SameSite policies prevent cookie theft and CSRF attacks. The security system operates transparently for users while blocking malicious requests.

### 20.4 Test Data Generation
Test data generation (available only in test environments) creates realistic sample data for development and testing purposes. This includes generating users, characters, loot items, sessions, and other entities with appropriate relationships and realistic values.

---

## 21. FRONTEND UI FEATURES

### 21.1 Main Pages
The frontend provides dedicated pages for each major feature area: Loot Entry (adding new items), Loot Management (organizing inventory), Gold Transactions (currency tracking), Identify (item identification), Consumables (tracking usage), Item Management (item database), Golarion Calendar (in-game time and weather), Infamy (pirate reputation), Ships (vessel management), Outposts (base management), Crew (NPC management), Sessions (scheduling and attendance), and City Services (shopping and spellcasting). Each page is optimized for its specific workflow.

### 21.2 Settings Pages
User Settings provides personal profile management and character configuration. DM Settings offers comprehensive administrative interfaces for campaign settings, character management, user management, and system configuration. Settings are organized by category for easy navigation.

### 21.3 Authentication Pages
Dedicated pages handle user authentication flows: Login (with remember me option), Register (with invite code), Forgot Password (email-based recovery), and Reset Password (completing recovery). These pages provide secure, user-friendly authentication with appropriate validation and error messages.

### 21.4 Special Components
Additional specialized pages include Tasks (task management system), Weather Test (weather system testing and visualization), and Session Notes (collaborative session planning). These components support specific workflows or debugging needs.

---

## Database Architecture

The application uses PostgreSQL with 31 tables/views organized into logical domains:

- **Users & Auth:** users, characters, invites
- **Loot & Items:** loot, item, mod, sold, appraisal, identify, consumableuse
- **Gold:** gold
- **Ships & Crew:** ships, crew, outposts
- **Sessions:** game_sessions, session_attendance, session_notes, session_tasks, session_reminders, session_messages, discord_reaction_tracking
- **Infamy:** ship_infamy, infamy_history, favored_ports, port_visits, impositions, imposition_uses
- **Fame:** fame, fame_history
- **Calendar:** golarion_current_date, golarion_calendar_notes
- **Weather:** golarion_weather, weather_regions
- **Cities:** city, item_search, spellcasting_service, spells
- **System:** settings, session_config, discord_outbox

---

## Key Integrations

- **OpenAI API** - Intelligent item description parsing
- **Discord Bot** - Session management and community integration
- **PostgreSQL** - Reliable data persistence with ACID compliance
- **JWT** - Secure stateless authentication
- **Material-UI v7** - Modern, responsive component library
- **React Router** - Client-side routing

---

**This documentation represents the complete feature set as of version 0.10.x. No additional features should be added during the polishing phase—focus is on bug fixes, optimization, and user experience refinement.**
