# Database Setup Guide

## Overview

The database is PostgreSQL 16. A database is built in two layers:

1. **Initial schema and seed data** - SQL files in `database/`, loaded once into an empty database (see New Installation).
2. **Migrations** - numbered SQL files in `backend/migrations/`, applied automatically by the backend on every start (`backend/src/utils/migrationRunner.js`, called from `startServer` in `backend/index.js`).

Schema changes are made by adding a new migration. Never edit a migration that has been applied.

## Initial Schema Files

Load these in this order into a brand-new database. The repository no longer ships a compose file that mounts them; they are only plain SQL files (with a PostgreSQL container you can mount them into `/docker-entrypoint-initdb.d/` with numeric prefixes to get the same order):

| Order | File | Purpose |
|---|---|---|
| 00 | `00-extensions.sql` | PostgreSQL extensions |
| 01 | `init.sql` | Base schema (tables, views, indexes, campaigns) |
| 02 | `item_data.sql` | Item catalog seed |
| 03 | `mod_data.sql` | Item modifier seed |
| 04 | `min_caster_levels_data.sql` | Minimum caster levels |
| 05 | `min_costs_data.sql` | Minimum item costs by spell level |
| 06 | `spells_data.sql` | Spell list |
| 07 | `weather_regions_data.sql` | Weather regions |
| 08 | `impositions_data.sql` | Impositions |

Other files:

- `setup_app_role.sql` - creates the non-owner `loot_app` role that the application connects as so that row-level security is enforced. Run it as the database owner, passing the password as a psql variable: `psql -U <owner> -d <database> -v app_password="$LOOT_APP_PASSWORD" -f database/setup_app_role.sql`. The script refuses to run without the variable or with the placeholder `CHANGE_ME`.

## New Installation

The repository does not ship a compose file that initialises the database. Load `database/00-extensions.sql`, then `database/init.sql`, then the `*_data.sql` seed files in the order of the table above into an empty database; then start the backend, which applies every migration in `backend/migrations/` that is not yet recorded. For example:

```bash
createdb -U postgres loot_tracking
psql -U postgres -d loot_tracking -f database/00-extensions.sql
psql -U postgres -d loot_tracking -f database/init.sql
for f in item_data mod_data min_caster_levels_data min_costs_data spells_data weather_regions_data impositions_data; do
  psql -U postgres -d loot_tracking -f database/$f.sql
done
# finally start the backend; it applies the migrations
```

## Migrations

- Files live in `backend/migrations/` and are named `NNN_description.sql` (three-digit sequence number). Only files matching that pattern are run; anything else in the directory is ignored.
- Applied migrations are tracked in the `schema_migrations_v2` table (history in `migration_history`). The older `schema_migrations` table is read for backward compatibility.
- Migrations run on startup under a database lock, each in its own transaction (except ones using `CREATE INDEX CONCURRENTLY`). A failing migration stops the server from starting.
- Migrations must be idempotent and safe on both a production database and a fresh install built from `init.sql`.
- Never rename existing columns or tables; production has legacy names (`whohas`, `lastupdate`).
- The old pre-v0.8 `archived/` migrations were removed. They were never run by the runner; their schema is part of `init.sql` and migration 064.
- Manual verification scripts (`PRE_MIGRATION_VERIFICATION.sql`, `POST_MIGRATION_VERIFICATION.sql`) are in `backend/scripts/`. They are run by hand with `psql`, never by the runner.

### Making Schema Changes

1. Add `backend/migrations/<next number>_description.sql` (check the highest existing number first).
2. Make it idempotent (`IF NOT EXISTS`, `DROP ... IF EXISTS`).
3. If fresh installs should also get the change from the start, mirror it in `database/init.sql`; the migration still has to be a no-op on that result.
4. Test on a development database. Migrations run automatically when the backend starts.

## Environment Variables

Create a `.env` file in the backend directory with:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=loot_tracking
DB_USER=your_username
DB_PASSWORD=your_password

# Application Configuration
JWT_SECRET=your_jwt_secret
OPENAI_API_KEY=your_openai_key  # Optional, for item parsing
```

See `CLAUDE.md` and `docker/` for the full list (including the separate admin connection used by the migration runner).

## Troubleshooting

1. **"relation/column does not exist" errors**
   - Check that the backend started and that migrations completed: look at `backend/logs/` and the `schema_migrations_v2` table.
   - Make sure the database was initialised from `init.sql`.

2. **Backend will not start after a deploy**
   - A migration failed. The error is in the backend log; fix forward with a new migration rather than editing the failed one.

3. **Permission denied errors**
   - The migration runner connects as the database owner; the app connects as `loot_app`. Run `setup_app_role.sql` as the owner if grants are missing.

4. **Duplicate key errors on fresh install**
   - Drop and recreate the database (and its data volume, if any) and load the files again to get a clean initialisation.

## Main Table Categories

1. **Core** - users, characters, loot, item, mod, gold, campaigns
2. **Feature** - ships, crew, outposts (fleet management); weather tables; fame tables
3. **System** - settings, game_sessions and the session task tables, identify, consumableuse
4. **Views** - `loot_view`, `gold_totals_view`

## Maintenance

```sql
ANALYZE;          -- monthly
VACUUM ANALYZE;   -- weekly
```

## Support

1. Check the error logs in `backend/logs/`
2. Verify your `.env` configuration
3. Ensure PostgreSQL 16 is installed
4. Report issues at: https://github.com/linisastald/Loot-Tracker-PF1e/issues
