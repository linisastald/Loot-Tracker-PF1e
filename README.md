# Pathfinder 1e Loot Tracker

A full-stack web application for managing loot, gold, crew, ships, and campaigns in Pathfinder 1st Edition tabletop RPG sessions. Supports multiple campaign instances (Rise of the Runelords, Skulls & Shackles) with separate databases.

## Features

### Loot Management
- **Loot Entry** - Add items and gold with Smart Item Detection (OpenAI-powered item parsing)
- **Loot Management** - Track unprocessed, kept (party/character), sold, and trashed items
- **Item Splitting** - Split stacks of items between party members
- **Appraisal System** - Characters appraise items using PF1e Appraise skill rules
- **Identification** - Identify magic items via Spellcraft checks (once per item per day, DC+10 detects curses)
- **Consumable Tracking** - Track wands (charges), potions, and scrolls with usage

### Gold & Economy
- **Gold Transactions** - Track party gold in pp/gp/sp/cp with full transaction history
- **Gold Distribution** - Distribute gold evenly among active characters
- **Character Ledger** - Per-character financial overview
- **Sales System** - Sell items individually, in bulk, or up to a gold limit

### City Services (PF1e Rules)
- **Item Availability** - Check if items are available in settlements using d100 rolls against base value thresholds
- **Spellcasting Services** - Calculate costs (spell level x caster level x 10 gp) with spell availability by settlement size
- **Settlement Database** - All eight PF1e settlement sizes (Thorp through Metropolis) with correct base values, purchase limits, and max spell levels per Ultimate Equipment/GameMastery Guide

### Campaign Tools
- **Golarion Calendar** - Full Golarion calendar with correct month names, day counts, and day-of-week calculation
- **Weather System** - Region-based weather generation for Varisia and The Shackles
- **Session Management** - Track game sessions with Discord integration for announcements and reminders
- **Session Tasks** - Task tracking for session prep

### Skulls & Shackles
- **Infamy & Disrepute** - Full S&S infamy system with thresholds, impositions, and favored ports
- **Ship Management** - Track ships with crew assignments
- **Crew Management** - Manage crew members, roles, and locations
- **Outpost Management** - Track outposts and assigned crew

### Administration
- **Character & User Management** - User accounts with role-based access (DM/Player)
- **Item & Mod Database** - Manage the item and modification database
- **Discord Integration** - Session announcements, RSVP via reactions
- **User Settings** - Password, email, Discord ID, active character selection

## Tech Stack

- **Frontend**: React 19, TypeScript, Material-UI v7, Vite
- **Backend**: Node.js, Express, JWT auth (HTTP-only cookies)
- **Database**: PostgreSQL 16 with automatic migrations
- **Infrastructure**: Docker (single container serving API + frontend)
- **External**: OpenAI API (item parsing), Discord webhooks (session notifications)

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Git

### Build & Deploy

```bash
# Build dev image (pulls latest from git)
bash build_image.sh

# Build stable/production image
bash build_image.sh --stable

# Build from a feature branch
bash build_image.sh --branch feature/my-feature
```

See `docs/build_image.md` for full build script documentation.

### Environment Variables

The application requires the following environment variables (set in docker-compose or .env):

| Variable           | Description                                        |
|--------------------|-----------------------------------------------------|
| `DB_USER`          | PostgreSQL username                                 |
| `DB_HOST`          | Database host                                       |
| `DB_NAME`          | Database name                                       |
| `DB_PASSWORD`      | Database password                                   |
| `DB_PORT`          | Database port (default: 5432)                       |
| `JWT_SECRET`       | Secret for JWT token signing                        |
| `OPENAI_API_KEY`   | OpenAI API key (optional, for Smart Item Detection) |
| `ALLOWED_ORIGINS`  | CORS allowed origins                                |
| `LOG_DIR`          | Log directory path                                  |

## Development

### Running Tests

```bash
# Backend tests (Jest, ~533 tests)
cd backend && npm test

# Frontend tests (Vitest, ~17 tests)
cd frontend && npx vitest run
```

### Project Structure

```
backend/
  src/
    api/routes/       # Express route definitions
    controllers/      # Request handlers
    models/           # Database models
    services/         # Business logic
    middleware/       # Auth, CSRF, validation
    utils/            # Helpers (logger, db, controllerFactory)
  migrations/         # SQL migrations (auto-run on startup)
frontend/
  src/
    components/       # React components (pages, layout, common)
    contexts/         # React contexts (Auth, Config)
    hooks/            # Custom hooks
    services/         # API service layer
    utils/            # Utilities (api, auth, date helpers)
database/
  init.sql            # Initial schema
  *_data.sql          # Seed data (items, mods, spells, weather)
docker/
  Dockerfile.backend  # Production Docker image
  docker-compose.yml  # Multi-campaign deployment
```

## License

Private project - not licensed for public use.
