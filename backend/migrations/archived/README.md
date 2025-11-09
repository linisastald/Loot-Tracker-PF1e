# Archived Database Migrations

These migration files were archived on November 9, 2025, as part of the database schema consolidation effort for version 0.8.0.

## Why Were These Archived?

All production instances have successfully applied these migrations, and the complete database schema has been consolidated into a single source of truth:

**New consolidated schema file:** `/database/init_complete.sql`

## Archived Migrations

The following migrations were applied to production and are now integrated into the consolidated schema:

1. **01_ship_crew_outpost_system.sql** - Added Fleet Management tables (ships, crew, outposts)
2. **02_add_ship_combat_stats.sql** - Added combat statistics to ships
3. **03_add_complete_ship_fields.sql** - Added complete ship fields for Pathfinder 1e
4. **04_weather_system.sql** - Added Golarion weather tracking system
5. **05_fix_missing_ship_columns.sql** - Fixed missing ship columns
6. **06_add_ship_status_column.sql** - Added ship status tracking
7. **07_fix_loot_view.sql** - Fixed loot_view for summary calculations
8. **011_add_performance_indexes.sql** - Added performance indexes
9. **012_standardize_timestamp_columns.sql** - Standardized timestamp column names
10. **013_add_critical_performance_indexes.sql** - Added critical performance indexes
11. **20250108_001_create_gold_totals_view.sql** - Created gold_totals_view

## How to Use the New Schema

For new installations or database recreation:

```bash
# Connect to your PostgreSQL database
psql -U your_username -d your_database

# Run the consolidated schema
\i /path/to/database/init_complete.sql
```

## Important Notes

- These migration files are kept for historical reference only
- They should NOT be run on any database that already has them applied
- The migration runner has been removed from the application startup sequence
- All new schema changes should be made directly to `/database/init_complete.sql`

## Migration History

These migrations were developed and applied between June 2024 and January 2025 as part of the continuous development of the Pathfinder 1e Loot Tracker system.