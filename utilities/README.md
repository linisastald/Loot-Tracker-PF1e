# Database Utilities

One-off maintenance scripts, run by hand. They are not part of the application image
(`utilities/` is excluded by `.dockerignore`) and nothing in the build or test pipeline runs them.

## Scripts

### `update_mod_caster_levels.py`

Fills in `mod.casterlevel` for global Power-type weapon/armor special abilities by reading
the caster level from d20pfsrd.com.

Safety properties:

- **Dry run by default.** Without `--apply` it scrapes and reports, and writes nothing.
- `--apply` writes in a single transaction after you type the database name to confirm.
- Only global catalog rows (`campaign_id IS NULL`) whose `casterlevel` is still NULL are updated.
- Scraped values outside 1-30 are rejected.
- Aborts if the `mod.casterlevel` column does not exist in the target database.
- HTTP requests use a 10 second timeout, a 1 second delay and an identifying user agent.
- Credentials come only from environment variables; the target database is the one you name.

Environment variables:

| Variable | Required | Default |
|---|---|---|
| `DB_PASSWORD` | yes | - |
| `DB_HOST` | no | `localhost` |
| `DB_PORT` | no | `5432` |
| `DB_NAME` | no | `loot_tracking` |
| `DB_USER` | no | `loot_user` |

```bash
export DB_PASSWORD=...        # PowerShell: $env:DB_PASSWORD="..."
python utilities/update_mod_caster_levels.py            # dry run
python utilities/update_mod_caster_levels.py --apply    # write, after typed confirmation
```

The script needs `requests`, `beautifulsoup4` and `psycopg2` (no requirements file is kept).

## Removed scripts

These were deleted during the 2026-10 code review because they were superseded, could not
run against the current schema, or were destructive without safeguards. They remain in git history.

- `aonsearch.py`, `aonsearchv2.py`, `aonsearchpart1.py`, `aonsearchpart2.py` - successive versions
  of an Archives of Nethys item scraper. They overwrote `item.value` with the full AoN price,
  which conflicts with the per-charge wand and "wizard/cleric first" consumable pricing now
  in the catalog, and the part1/part2 pipeline needed an `itemupdate` staging table that no
  schema file creates.
- `itemsearch.py`, `lstreaderandinput.py`, `lstspellsgrab.py` - PCGen `.lst` importers reading a
  directory outside the repo and writing to tables or columns that no longer exist
  (`itemtesting`, `spells.mincasterlevel`). The catalog now ships as `database/item_data.sql`,
  `database/mod_data.sql` and `database/spells_data.sql`.
- `database_manager.py`, `db_compare.py` - Docker-container database comparison and sync tools.
  `database_manager.py` was mostly stubs; `db_compare.py` deleted rows and rewrote tables as the
  owner role (bypassing row-level security) on every container named `*loot_db`, a layout that
  predates the single multi-campaign database. Schema changes go through `backend/migrations`.
- `generate_test_data.sql`, `run_test_data.md` - superseded by the superadmin-only
  `POST /api/test-data/generate` endpoint (`backend/src/controllers/testDataController.js`).
- `itemupdate.py` - removed earlier (destructive one-off migration).

## Security note

Never commit passwords or other secrets. Use environment variables only.
