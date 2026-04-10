# Roadmap

Future features and improvements for the Pathfinder 1e Loot Tracker.

## Planned Features

### Crafting System
- Track crafting projects (Craft Wondrous Item, Brew Potion, Scribe Scroll, etc.)
- Calculate crafting costs (half market price), time (1 day per 1,000 gp), and DCs
- Track progress on multi-day crafting projects tied to the Golarion calendar
- Prerequisite checking against character feats/spells

### Spell Book Management
- Track known spells per spellcasting character
- Calculate costs for copying spells into spellbooks (spell level^2 x 10 gp)
- Mark spells as prepared/used per day
- Support for spontaneous casters (spells known vs spells per day)

### Character Sheet Integration
*Low priority - Complex, significant effort, and better dedicated tools exist (Hero Lab, Pathbuilder).*
- Track key character stats (level, HP, saves, key ability scores)
- Wealth by Level comparison (flag when characters are over/under WBL)
- Automatic APL calculation for infamy checks and encounter scaling
- Track character feats relevant to loot (Appraise bonuses, crafting feats)

### Encounter Loot Generator
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
- Shared party inventory separate from individual character loot
- Track consumables used from party stock vs personal stock
- Bag of Holding / Handy Haversack weight tracking
- Encumbrance warnings per character

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
- Responsive layout optimizations for phone-sized screens
- Quick-action buttons for common operations (use consumable, mark item)
- Swipe gestures for loot status changes
- Offline support for basic viewing

## Quality of Life Improvements

### Bulk Operations
*Mostly implemented - Multi-select, bulk appraisal, and bulk identification already exist. Remaining items below.*
- Multi-select items across pages for bulk status changes
- Bulk appraisal (roll once, apply to all selected)
- Bulk identification with automatic DC calculation
- Copy items between campaigns

### Notifications
*Low priority - Discord session reminders already exist. Additional notification channels likely not worth the effort.*
- In-app notifications for session reminders
- Email notifications for upcoming sessions
- Discord DM notifications for player actions (item claimed, gold withdrawn)

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
- GitHub Actions CI/CD pipeline
- Automated database backups
- Staging environment for testing before production
- Health monitoring and alerting
