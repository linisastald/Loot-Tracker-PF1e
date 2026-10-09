#!/bin/bash
#
# Regenerate the seed files database/*_data.sql from a live database.
#
# This is a manual maintenance tool: it is not run by the build or the app. The seed files
# are only loaded into an EMPTY database (see database/DATABASE_SETUP.md); existing databases
# get corrections through backend/migrations instead, so after a re-export check that the
# result still agrees with the data migrations (npm test in backend runs those checks).
#
# Safe by default: nothing in the repository is touched unless --write is given. Without it the
# files are written to a new temporary directory and its path is printed so you can diff.
#
# Usage:
#   DB_HOST=... DB_NAME=... DB_USER=... [DB_PORT=5432] [PGPASSWORD=...] ./update_sql_data.sh [--write]
#
# There are no defaults for host, database and user. Use a read-only role, not the owner:
# the account needs SELECT on the exported tables only. Put the password in PGPASSWORD or
# ~/.pgpass, never in this file.
#
# item and mod hold campaign-private rows (campaign_id NOT NULL) next to the global catalog.
# Only global rows (campaign_id IS NULL) are exported, for every campaign, so private homebrew
# can never end up in a seed file; those two tables are written with the fixed column list
# the seeds and their tests expect (no campaign_id column).

set -euo pipefail

WRITE=0
for arg in "$@"; do
    case "$arg" in
        --write) WRITE=1 ;;
        -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
        *) echo "Unknown argument: $arg (use --write or --help)" >&2; exit 2 ;;
    esac
done

: "${DB_HOST:?DB_HOST must be set}"
: "${DB_NAME:?DB_NAME must be set}"
: "${DB_USER:?DB_USER must be set}"
DB_PORT="${DB_PORT:-5432}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "$WRITE" -eq 1 ]; then
    OUT_DIR="$SCRIPT_DIR/database"
else
    OUT_DIR="$(mktemp -d)"
fi

# Tables exported with pg_dump (none of them has a campaign_id column).
DUMP_TABLES=(min_caster_levels min_costs weather_regions impositions spells)

TMP_FILE=""
cleanup() { [ -n "$TMP_FILE" ] && rm -f "$TMP_FILE"; return 0; }
trap cleanup EXIT

PSQL=(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -X -A -t -v ON_ERROR_STOP=1)

# write_file <table> <command...>: run the command into a temp file, then move it into place
# with a header, so a failed export never leaves a partial file behind.
write_file() {
    local table="$1"; shift
    local out="$OUT_DIR/${table}_data.sql"
    TMP_FILE="$(mktemp "$OUT_DIR/.${table}.XXXXXX")"
    echo "Exporting $table ..."
    {
        echo "-- $table data export from a live database"
        echo "-- Generated on $(date)"
        echo ""
        "$@"
    } > "$TMP_FILE"
    mv "$TMP_FILE" "$out"
    TMP_FILE=""
    echo "  -> $out"
}

export_item() {
    "${PSQL[@]}" -c "SELECT 'INSERT INTO public.item (id, name, type, value, subtype, weight, casterlevel) VALUES (' ||
        concat_ws(', ', id, quote_nullable(name), quote_nullable(type), COALESCE(value::text, 'NULL'),
                  quote_nullable(subtype), COALESCE(weight::text, 'NULL'), COALESCE(casterlevel::text, 'NULL')) || ');'
        FROM item WHERE campaign_id IS NULL ORDER BY id"
}

export_mod() {
    "${PSQL[@]}" -c "SELECT 'INSERT INTO public.mod (id, name, plus, type, valuecalc, target, subtarget) VALUES (' ||
        concat_ws(', ', id, quote_nullable(name), COALESCE(plus::text, 'NULL'), quote_nullable(type),
                  quote_nullable(valuecalc), quote_nullable(target), quote_nullable(subtarget)) || ');'
        FROM mod WHERE campaign_id IS NULL ORDER BY id"
}

dump_table() {
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --data-only --table="public.$1" --no-owner --no-privileges --column-inserts
}

echo "Exporting from $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME into $OUT_DIR"
write_file item export_item
write_file mod export_mod
for table in "${DUMP_TABLES[@]}"; do
    write_file "$table" dump_table "$table"
done

if [ "$WRITE" -eq 1 ]; then
    echo "Done. Seed files in $OUT_DIR were overwritten; review with git diff before committing."
else
    echo "Done. Nothing in the repository was changed. Compare with:  diff -r \"$SCRIPT_DIR/database\" \"$OUT_DIR\""
fi
