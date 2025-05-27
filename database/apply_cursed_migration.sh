#!/bin/bash
# Run this script to apply the cursed column migration

# Navigate to the database directory
cd "$(dirname "$0")"

# Apply the migration
psql -h localhost -U postgres -d loot_tracker -f migrations/add_cursed_column.sql

echo "Migration completed: Added cursed column to loot table"
