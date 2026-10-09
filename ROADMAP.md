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
- Session notes tied to Golarion dates
- Searchable log of events, NPCs met, locations visited
- Link journal entries to loot acquired that session
- Timeline view across the Golarion calendar

### Mobile Improvements
- Swipe gestures for loot status changes

### User Preferences System
- Create `user_preferences` table (key-value per user, like global `settings` table)
- Backend API for get/set preferences per authenticated user
- First preference: **Loot entry bar position** — *shipped differently in 0.14.0: the Add Item/Add Gold/Submit bar is now sticky at both the top and the bottom of the page, so this preference is no longer needed for that purpose.*
- Future preferences: light/dark mode toggle, theme selection, UI density

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
*Medium priority - Reduces env var dependency and improves onboarding.*
- On first run (no users in DB, or flagged unconfigured), redirect admin to `/setup`
- Setup wizard collects: initial DM account, campaign name, frontend URL, Discord settings
- Writes values to the `settings` table instead of requiring env vars in docker-compose
- Allow re-running setup from admin panel to reconfigure
- Goal: Reduce docker-compose env block to only infrastructure (DB, ports, secrets, CORS)


### Performance
- Server-side pagination for all list views
- Database query caching for reference data (items, mods, spells)
- WebSocket support for real-time updates across connected clients

### Testing
- Integration tests for all API endpoints
- Component tests for all page components
- End-to-end tests for critical user flows

### Infrastructure
- GitHub Actions CI/CD pipeline (`.github/workflows/` currently holds only a `.gitkeep`)
- Automated database backups
- Staging environment for testing before production
- Health monitoring and alerting

### Database Backup & Restore (DM Settings)
*Low priority — neither the backend `/admin/backup-database` / `/admin/restore-database` routes nor any frontend buttons for them exist today.*
- Implement `POST /api/admin/backup-database` (pg_dump with table excludes)
- Implement `POST /api/admin/restore-database` (multipart upload + pg_restore, with safety checks)
- Backend tests for both endpoints
- Add the System Settings UI once endpoints land

### Mod Subtarget Selector (DM Item Management → Add Item/Mod)
*Shipped: `AddItemMod.jsx` now filters the Subtarget options by the selected Target (each value appears once per list). Only the frontend-test bullet below may still be open.*
- Filter Subtarget options based on the selected Target (weapon shows one-handed/two-handed/light/ammunition; armor shows light/medium/heavy/shield)
- Keep storing `value="light"` so existing mod rows in the database stay valid
- Add a frontend test covering Subtarget filtering once implemented
