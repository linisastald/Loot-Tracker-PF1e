# Pathfinder 1e Loot Tracker

A full-stack web application for managing loot, gold, crew, ships, and campaigns in Pathfinder 1st Edition tabletop RPG sessions. Supports multiple campaigns (for example Rise of the Runelords and Skulls & Shackles) in a single database: every campaign-scoped table carries a `campaign_id`, and PostgreSQL row-level security keeps campaigns isolated from each other.

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
- **Character & User Management** - User accounts with per-campaign roles (DM/Player) plus a superadmin flag
- **Item & Mod Database** - Manage the item and modification database
- **Discord Integration** - Session announcements, RSVP via reactions
- **User Settings** - Password, email, Discord ID, active character selection

## Tech Stack

- **Frontend**: React 19, TypeScript, Material-UI v9, React Router 7, Vite
- **Backend**: Node.js 25, Express, JWT auth (HTTP-only cookies), CSRF protection (double-submit cookie via `csrf-csrf`)
- **Database**: PostgreSQL 16 with automatic migrations (tracked in `schema_migrations_v2`) and row-level security; the app connects as a non-owner role (`DB_APP_USER`)
- **Infrastructure**: Docker (single container serving API + frontend)
- **External**: OpenAI API (item parsing), a separate Discord broker service (`discord-handler/`) for session announcements and RSVP

## Quick Start

### Prerequisites
- Docker
- Git
- Node.js 25 and npm (only to run the tests or work on the code; the image build does not need them on the host)

### Build & Deploy

```bash
# Build dev image (pulls latest from git)
bash build_image.sh

# Build stable/production image
bash build_image.sh --stable

# Build from a feature branch
bash build_image.sh --branch feature/my-feature
```

The script pulls the branch from the remote (so push first), builds `docker/Dockerfile.backend` and tags the image. Dev builds are tagged `vX.Y.Z-dev.N` in git; `--stable` commits the version bump and tags `vX.Y.Z`. Add `--discord-broker` to also build the Discord broker image (`discord-handler/Dockerfile`). Run `bash build_image.sh --help` for every option.

Deployment definitions (for example TrueNAS app definitions) are kept outside git because they hold environment-specific values and secrets. The optional Discord broker runs the image built by `build_image.sh --discord-broker` and is deployed the same way; `.env.discord-broker.example` lists its settings.

### Environment Variables

The main variables are below. `backend/.env.example` and `docker/.env.docker.example` list all of them with comments; generate random secrets with `docker/generate-secrets.sh`.

| Variable           | Description                                                                 |
|--------------------|------------------------------------------------------------------------------|
| `DB_USER`          | PostgreSQL owner username (also used by the migration runner)               |
| `DB_HOST`          | Database host                                                                |
| `DB_NAME`          | Database name                                                                |
| `DB_PASSWORD`      | Database owner password                                                      |
| `DB_PORT`          | Database port (default: 5432)                                                |
| `DB_APP_USER`, `DB_APP_PASSWORD` | Non-owner application role (`loot_app`); set both so row-level security is enforced |
| `JWT_SECRET`       | Secret for JWT token signing                                                 |
| `CSRF_SECRET`      | Secret for CSRF tokens (random per process if unset, which invalidates tokens on every restart) |
| `OPENAI_API_KEY`   | OpenAI API key (optional, for Smart Item Detection)                          |
| `ALLOWED_ORIGINS`  | CORS allowed origins                                                         |
| `FRONTEND_URL`     | Public URL of the app (used in emailed links)                                |
| `EMAIL_SERVICE`, `EMAIL_USER`, `EMAIL_PASS` or `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Outgoing mail for password reset (optional) |
| `DISCORD_BROKER_URL`, `DISCORD_BROKER_SECRET`, `DISCORD_CALLBACK_URL` | Discord broker integration (optional; leave the URL unset to disable) |
| `LOG_DIR`          | Log directory path                                                           |

## Development

### Running Tests

```bash
# Backend unit tests (Jest, database mocked with the MockPool in backend/tests/utils)
cd backend && npx jest --config jest.unit.config.js

# Frontend tests (Vitest) and type check
cd frontend && npx vitest run && npx tsc --noEmit
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
  tests/              # Shared Jest setup and mock pg pool
frontend/
  src/
    components/       # React components (pages, layout, common)
    contexts/         # React contexts (Auth, Campaign, Config)
    hooks/            # Custom hooks
    services/         # API service layer
    utils/            # Utilities (api, auth, date helpers)
database/
  init.sql            # Initial schema
  *_data.sql          # Seed data (items, mods, spells, weather)
  setup_app_role.sql  # Creates the non-owner app role used with row-level security
discord-handler/      # Discord broker service (separate image)
docker/
  Dockerfile.backend  # Production Docker image
  generate-secrets.sh # Random secret generator
build_image.sh        # Build / release script
```

## License

Private project - not licensed for public use.
