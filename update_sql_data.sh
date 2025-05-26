#!/bin/bash

# Script to update SQL data files with current database content
# Database: postgresql://192.168.0.64:5432/loot_tracking

DB_HOST="192.168.0.64"
DB_PORT="5432"
DB_NAME="loot_tracking"
DB_USER="loot_user"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATABASE_DIR="$SCRIPT_DIR/database"

# Array of tables to export
declare -A TABLES=(
    ["item"]="item_data.sql"
    ["mod"]="mod_data.sql"
    ["min_caster_levels"]="min_caster_levels_data.sql"
    ["min_costs"]="min_costs_data.sql"
    ["weather_regions"]="weather_regions_data.sql"
    ["impositions"]="impositions_data.sql"
    ["spells"]="spells_data.sql"
)

echo "Updating SQL data files from database..."

# Export each table
for table in "${!TABLES[@]}"; do
    output_file="${TABLES[$table]}"
    echo "Exporting $table table..."
    
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --data-only --table="$table" --no-owner --no-privileges \
        --inserts --column-inserts > "$DATABASE_DIR/$output_file.tmp"
    
    if [ $? -eq 0 ]; then
        # Add header comment and move to final location
        {
            echo "-- $table data export from current database"
            echo "-- Generated on $(date)"
            echo ""
            cat "$DATABASE_DIR/$output_file.tmp"
        } > "$DATABASE_DIR/$output_file"
        rm "$DATABASE_DIR/$output_file.tmp"
        echo "✓ $output_file updated successfully"
    else
        echo "✗ Failed to export $table table"
        exit 1
    fi
done

echo "Database export completed successfully!"
echo "Files updated:"
for output_file in "${TABLES[@]}"; do
    echo "  - $DATABASE_DIR/$output_file"
done
