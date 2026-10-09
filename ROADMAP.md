# Roadmap

Future features and improvements for the Pathfinder 1e Loot Tracker. Each section carries its priority.

## Features

### Crafting System
Priority: high
- Track crafting projects (Craft Wondrous Item, Brew Potion, Scribe Scroll, etc.)
- Calculate crafting costs (half market price), time (1 day per 1,000 gp), and DCs
- Track progress on multi-day crafting projects tied to the Golarion calendar
- Prerequisite checking against character feats/spells

### Reporting
Priority: low
- Loot distribution fairness report (gold value received per character over time)
- Session-by-session loot summary with gold totals
- Visual charts for gold flow over time

### Party Inventory
Priority: low
- Bag of Holding / Handy Haversack weight tracking

### Campaign Journal
Priority: high
- Upload a session recording or transcript and attach it to the session (and its Golarion date)
- Transcribe uploaded recordings
- Claude-written session summary from the transcript: what happened, NPCs met, locations visited, loot found, open threads
- DM reviews and edits the summary before it is published to players
- Post the summary (or a short recap) to the Discord channel
- Searchable log across summaries and transcripts
- Link journal entries to loot acquired that session
- Timeline view across the Golarion calendar
- Per-player calendar notes signed with the player's name

### Catalog
Priority: medium
- DM edits to the shared item and mod catalog go to the superadmin for approval, from an approval queue on the System Admin tab

### Skulls & Shackles
Priority: very low
- Infamy reroll bonus rule
- Crew recruitment rolled on the server
- Ship statistics

### Mobile
Priority: medium
- Swipe gestures for loot status changes

### User Preferences
Priority: low
- `user_preferences` table (key-value per user, like the global `settings` table)
- Backend API for get/set preferences per authenticated user
- Light/dark mode toggle, per-user theme selection, UI density

### Notifications
Priority: very low
- In-app notifications for session reminders
- Email notifications for upcoming sessions

### Undo/History
Priority: very high
- Undo recent actions (status changes, gold transactions)
- Full audit log of who changed what and when
- Restore deleted/trashed items

### Import
Priority: very low
- Import items from CSV or JSON
- Import from other VTT tools (Foundry, Roll20)
- Share item databases between campaign instances

### First-Run Setup
Priority: low
- On first run (no users in DB, or flagged unconfigured), redirect the admin to `/setup`
- Setup collects: initial DM account, campaign name, frontend URL, Discord settings
- Allow re-running setup from the System Admin tab to reconfigure
- Reduce the container env block to infrastructure only (DB, ports, secrets, CORS)

### Database Backup & Restore (System Admin)
Priority: medium
- `POST /api/admin/backup-database` (pg_dump with table excludes)
- `POST /api/admin/restore-database` (multipart upload + pg_restore, with safety checks)
- Backend tests for both endpoints
- System Admin UI once the endpoints land

## Data

### Catalog cleanup
Priority: high
- About 150 catalog items with a NULL value, and 11 junk pseudo-weapon rows
- Mod table: the Sniping duplicate, and the misspellings Fercent (Fervent) and Drowscorge
- Rows typed "other" that have a real type, and subtype slips
- 77 duplicated spell names with conflicting data, and about 348 bestiary spell-like-ability rows with no level or class that are not castable spells; add a unique index on lower(name) once deduplicated
- Potion flags on spells above 3rd level
- Stale duplicate rows in discord_reaction_tracking
- Sold rows from before 0.16.0 store the unit price, not the line total
- Drop the year-9000 invite branch once production has no such rows

### Seed files
Priority: high
- The weather_regions seed duplicates rows in the init script
- Seed dumps are non-idempotent and store the importer's local file paths as the spell source; re-export after cleaning
- Fold every migration into the fresh-install build so a new database equals production, performance indexes included

### Schema
Priority: low
- Row-level security policy on campaign_settings (every other per-campaign table has one)
- Composite (id, campaign_id) foreign keys so a row can never reference another campaign's parent (data audit per key first)
- Convert the naive session timestamp columns to timestamptz

## Security
Priority: medium
- Encrypt stored secrets at rest (OpenAI key and Discord bot token): AES-256-GCM with an environment key plus a data migration
- Separate database login for background jobs
- Campaign checks inside the database rather than only in the app
- Own-character checks on the item-search and spellcasting history endpoints (DM-only listing)

## Code

### Backend
Priority: high
- One validation mechanism across the controllers, replacing five validation and three DM-check styles; add checkRole('DM') to the routes that enforce it in the handler
- SQL out of the auth, admin, user and settings controllers into models
- One Golarion-date helper for item search, spellcasting, infamy, identification and weather
- Batched weather-existence query
- Shared SQL filter builder for ItemSearch and SpellcastingService
- One pool-config helper for the two database pools
- Gold.insert helper
- Either adopt or delete the generic CRUD controller
- Injectable route-mounting module so the CSRF matrix in index.js can be tested without a database

### Frontend
Priority: high
- One TabPanel for the seven pages that each define their own
- One catalog entity form shared by AddItemMod and ItemManagementDialog
- One date formatter per kind (calendar date versus timestamp)
- One User type and one ApiResponse type
- useActiveCharacters hook for the duplicated status and active-character fetches
- Split GolarionCalendar (about 1,800 lines), SystemSettings into cards, SystemAdmin's dialogs into components, and the four loot wrapper pages into one config-driven page

### Build and deploy
Priority: medium
- Multi-stage Dockerfile
- Build script: remove unconsumed flags and build arguments, make the dry run non-mutating, gate versioning on whether the main app is built
- GitHub Actions CI pipeline (`.github/workflows/` currently holds only a `.gitkeep`)
- Automated database backups
- Alerting on the health check

## Performance
Priority: medium
- Server-side pagination for the catalog tables in DM Item Management (about 7,600 items and 2,000 spells load in full today); loot pages stay whole-list since they select, sort and group across every row
- Query caching for reference data (items, mods, spells)
- WebSocket support for real-time updates across connected clients

## Testing
Priority: medium
- Integration tests against a real database (the Jest integration config exists but has no tests)
- End-to-end tests for critical user flows
