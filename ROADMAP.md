# Roadmap

Future features and improvements for the Pathfinder 1e Loot Tracker.

## Planned Features

### Crafting System
- Track crafting projects (Craft Wondrous Item, Brew Potion, Scribe Scroll, etc.)
- Calculate crafting costs (half market price), time (1 day per 1,000 gp), and DCs
- Track progress on multi-day crafting projects tied to the Golarion calendar
- Prerequisite checking against character feats/spells

### Spell Book Management
*A DM-only spellbook generator (spellbooks as loot, `POST /api/loot-generator/spellbook`) already exists. The items below, tracking spells per character, are still planned.*
- Track known spells per spellcasting character
- Calculate costs for copying spells into spellbooks (spell level^2 x 10 gp)
- Mark spells as prepared/used per day
- Support for spontaneous casters (spells known vs spells per day)

### Encounter Loot Generator
*Largely shipped: the DM-only loot generator (`backend/src/api/routes/lootGenerator.js`) generates treasure by CR and commits the result to the loot list. Not implemented: saving templates for common encounter types.*
- Generate random treasure by CR using PF1e treasure tables (CRB Chapter 12)
- Support for individual monster loot, hoard treasure, and NPC gear
- Auto-populate loot entry from generated results
- Save templates for common encounter types

### Enhanced Reporting
- Loot distribution fairness report (gold value received per character over time)
- Session-by-session loot summary with gold totals
- Export reports to PDF or CSV
- Visual charts for gold flow over time

### Party Inventory
*Partially implemented - The app already tracks party loot and consumables. Items below are the missing pieces.*
- Bag of Holding / Handy Haversack weight tracking


### NPC & Merchant Tracking
*Low priority.*
- Save frequently visited merchants with their settlement stats
- Track custom shop inventories that persist between sessions
- NPC contact list with notes and locations
- Merchant reputation/discount tracking

### Campaign Journal
*Partially shipped: the Golarion calendar has a per-campaign Notes tab (a note on a calendar date). The searchable log, loot links and timeline are still planned.*
- Session notes tied to Golarion dates — *shipped as calendar notes*
- Searchable log of events, NPCs met, locations visited
- Link journal entries to loot acquired that session
- Timeline view across the Golarion calendar

### Mobile Improvements
- Swipe gestures for loot status changes

### User Preferences System
- Create `user_preferences` table (key-value per user, like global `settings` table)
- Backend API for get/set preferences per authenticated user
- First preference: **Loot entry bar position** — *shipped differently in 0.14.0: the Add Item/Add Gold/Submit bar is now sticky at both the top and the bottom of the page, so this preference is no longer needed for that purpose.*
- Future preferences: light/dark mode toggle, theme selection, UI density — *per-campaign colour themes with dark backgrounds shipped in 0.13.0 (set by the DM, not per user)*

## Quality of Life Improvements

### Notifications
*Low priority - Discord session reminders already exist. Additional notification channels likely not worth the effort.*
- In-app notifications for session reminders
- Email notifications for upcoming sessions

### Undo/History
*Medium priority - DM-only feature. Would prevent data loss from misclicks.*
- Undo recent actions (status changes, gold transactions)
- Full audit log of who changed what and when
- Restore deleted/trashed items

### Import/Export
*Low priority - Nice to have for backups but not a pressing need.*
- Import items from CSV or JSON
- Export campaign data for backup
- Import from other VTT tools (Foundry, Roll20)
- Share item databases between campaign instances

## Technical Improvements

### First-Run Setup Wizard
*Medium priority - Reduces env var dependency and improves onboarding. Partly there since 0.16.0: the first account on an empty install becomes DM and superadmin automatically, and the frontend URL, registration mode, Discord bot token and OpenAI key are set from the System Admin tab rather than env vars. Still missing: the guided `/setup` flow itself.*
- On first run (no users in DB, or flagged unconfigured), redirect admin to `/setup`
- Setup wizard collects: initial DM account, campaign name, frontend URL, Discord settings
- Writes values to the `settings` table instead of requiring env vars in docker-compose
- Allow re-running setup from admin panel to reconfigure
- Goal: Reduce docker-compose env block to only infrastructure (DB, ports, secrets, CORS)


### Performance
- Server-side pagination for all list views — *shipped for gold history, crew, outposts, ships and infamy; loot and catalog lists still load in full*
- Database query caching for reference data (items, mods, spells)
- WebSocket support for real-time updates across connected clients

### Testing
*Unit coverage is broad after the October 2026 review (about 3,700 backend and 1,360 frontend tests; every page has component tests). Nothing below runs against a real database or browser.*
- Integration tests against a real database (the Jest integration config exists but has no tests)
- End-to-end tests for critical user flows

### Infrastructure
- GitHub Actions CI/CD pipeline (`.github/workflows/` currently holds only a `.gitkeep`)
- Automated database backups
- ~~Staging environment for testing before production~~ — *the test instance on TrueNAS serves this role*
- Health monitoring and alerting — *`/api/health` and the Docker healthcheck exist; alerting does not*

### Database Backup & Restore (DM Settings)
*Low priority — neither the backend `/admin/backup-database` / `/admin/restore-database` routes nor any frontend buttons for them exist today.*
- Implement `POST /api/admin/backup-database` (pg_dump with table excludes)
- Implement `POST /api/admin/restore-database` (multipart upload + pg_restore, with safety checks)
- Backend tests for both endpoints
- Add the System Settings UI once endpoints land

## Deferred from the October 2026 code review

The whole-repository review (shipped as 0.16.0) left these for later. Each was a deliberate decision, not an oversight; none is urgent.

### Features parked at the owner's request
- **DM catalog edits go to the superadmin for approval (B1).** A campaign DM proposes a change to the shared item or mod catalog; the superadmin accepts or rejects it from an approval queue on the System Admin tab. The System Admin page it needs now exists.
- **First-run setup for the superadmin and instance settings** (see First-Run Setup Wizard above). Long term.
- **Per-player calendar notes** signed with the player's name. Nice to have.
- **Skulls & Shackles rules work** when a game is running again: the infamy reroll bonus rule, crew recruitment rolled on the server, ship statistics.
- **Encrypting stored secrets at rest** (OpenAI key and Discord bot token are base64 in the settings table). A later hardening change: AES-256-GCM with an environment key plus a data migration.
- **Separate database login for background jobs**, and campaign checks inside the database rather than only in the app.
- **Multi-stage Dockerfile.** Wanted a deeper review first.
- **Fold every migration into the fresh-install build** so a new database equals production, performance indexes included.

### Data catalog cleanups still open
Found while reviewing the test database; the migrations up to 085 fixed prices, placeholders, case duplicates and the worst junk, and these remain:
- About 150 catalog items with a NULL value, and 11 junk pseudo-weapon rows.
- Mod table: the Sniping duplicate, and the misspellings Fercent (Fervent) and Drowscorge.
- Item type conventions: rows typed "other" that have a real type, and subtype slips.
- Spells: 77 duplicated spell names with conflicting data, and about 348 bestiary spell-like-ability rows with no level or class that are not castable spells. Add a unique index on lower(name) once deduplicated. Potion flags on spells above 3rd level.
- Seed files: the weather_regions seed duplicates rows in the init script; the dumps are non-idempotent and store the importer's local file paths as the spell source. Re-export after cleaning.
- Stale duplicate rows in discord_reaction_tracking.
- campaign_settings has no row-level security policy (every other per-campaign table does).

### Larger refactors (71 findings, each with a written proposal at the time)
- **One validation mechanism** across the roughly 30 controllers, replacing five validation and three DM-check styles; add checkRole('DM') to the routes that enforce it in the handler.
- **SQL out of controllers into models** for auth, admin, user and settings.
- **Shared frontend pieces**: one TabPanel for the seven pages that each define their own; one catalog entity form shared by AddItemMod and ItemManagementDialog; one date formatter per kind (calendar date versus timestamp); one User type and one ApiResponse type; a useActiveCharacters hook for the duplicated status and active-character fetches.
- **Split the large components**: GolarionCalendar (about 1,800 lines), SystemSettings into cards, SystemAdmin's dialogs into components, the four loot wrapper pages into one config-driven page.
- **Backend sharing**: one Golarion-date helper for item search, spellcasting, infamy, identification and weather; a batched weather-existence query; a shared SQL filter builder for ItemSearch and SpellcastingService; one pool-config helper for the two database pools; a Gold.insert helper; either adopt or delete the generic CRUD controller.
- **Schema**: composite (id, campaign_id) foreign keys so a row can never reference another campaign's parent (needs a data audit per key first); convert the naive session timestamp columns to timestamptz (harmless while the database runs in UTC).
- **Build script**: remove unconsumed flags and build arguments, make the dry run non-mutating, and gate versioning on whether the main app is built.
- **Testing**: an injectable route-mounting module so the CSRF matrix in index.js can be tested without a database.
- **Small**: own-character checks on the item-search and spellcasting history endpoints (DM-only listing recommended); drop the year-9000 invite branch once production has no such rows; rows in the sold table before 0.16.0 store the unit price, not the line total.
