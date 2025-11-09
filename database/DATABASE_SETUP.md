# Database Setup Guide

## Overview

As of version 0.8.0, the Pathfinder 1e Loot Tracker uses a consolidated database schema approach. All database tables, views, indexes, and initial data are defined in a single comprehensive file.

## Schema Files

- **`init_complete.sql`** - The complete, production-ready database schema (USE THIS)
- **`init.sql`** - Legacy partial schema (kept for reference only)
- **`schema.sql`** - Legacy schema file (kept for reference only)

## New Installation

### Option 1: Using PostgreSQL Command Line

```bash
# Create the database
createdb -U postgres loot_tracking

# Run the complete schema
psql -U postgres -d loot_tracking -f database/init_complete.sql
```

### Option 2: Using Docker

```bash
# The Docker container automatically runs init_complete.sql on first startup
docker-compose up -d
```

### Option 3: Manual Setup

1. Connect to PostgreSQL:
```bash
psql -U postgres
```

2. Create the database:
```sql
CREATE DATABASE loot_tracking;
\c loot_tracking
```

3. Run the schema file:
```sql
\i /path/to/database/init_complete.sql
```

## Database Features

The consolidated schema includes:

### Core Systems
- **User Management** - Authentication, roles, and user accounts
- **Character Management** - Player characters with appraisal bonuses and status tracking
- **Loot Management** - Comprehensive item tracking with identification and ownership
- **Gold Management** - Financial transactions and balance tracking

### Advanced Features
- **Fleet Management** - Ships, crew, and outposts for pirate campaigns
- **Weather System** - Golarion regional weather tracking
- **Fame/Infamy System** - Reputation tracking for different ports
- **Calendar System** - Golarion calendar with month/day tracking
- **Discord Integration** - Webhook support for notifications

### Performance Optimization
- **Strategic Indexes** - Over 50 indexes for optimal query performance
- **Materialized Views** - `loot_view` and `gold_totals_view` for complex queries
- **Optimized Constraints** - Foreign keys and check constraints for data integrity

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

## Migration from Older Versions

If upgrading from a version before 0.8.0:

1. **Backup your database** first:
```bash
pg_dump -U postgres -d loot_tracking > backup_$(date +%Y%m%d).sql
```

2. Your existing database already has all migrations applied, no action needed.

3. The application will now skip the migration runner on startup.

## Schema Management

### Important Changes in v0.8.0

- **No more migrations** - The migration system has been removed
- **Single source of truth** - All schema changes go directly in `init_complete.sql`
- **Simplified deployment** - New installations just run one SQL file

### Making Schema Changes

1. Edit `database/init_complete.sql` directly
2. Test changes on a development database
3. For existing production databases, create an ALTER script for the specific changes

## Troubleshooting

### Common Issues

1. **"relation does not exist" errors**
   - Ensure you're using `init_complete.sql`, not the old `init.sql`
   - Check that all CREATE statements completed successfully

2. **Permission denied errors**
   - Ensure your database user has CREATE privileges
   - Grant necessary permissions: `GRANT ALL ON DATABASE loot_tracking TO your_user;`

3. **Duplicate key errors on fresh install**
   - Drop and recreate the database to ensure a clean slate
   - `DROP DATABASE loot_tracking; CREATE DATABASE loot_tracking;`

## Database Structure Overview

### Main Table Categories

1. **Core Tables** (Always Required)
   - users, characters, loot, item, mod, gold, etc.

2. **Feature Tables** (Feature-Specific)
   - ships, crew, outposts (Fleet Management)
   - golarion_weather_*, weather_regions (Weather System)
   - fame_ports, fame_history (Fame/Infamy)

3. **System Tables** (Application Support)
   - settings, session_messages, discord_webhooks
   - identify, consumables, consumableuse

4. **Views** (Performance Optimization)
   - loot_view - Aggregates loot data with summaries
   - gold_totals_view - Calculates financial totals
   - index_usage_stats - Monitors index performance

## Maintenance

### Regular Tasks

1. **Update statistics** (monthly):
```sql
ANALYZE;
```

2. **Check index usage** (quarterly):
```sql
SELECT * FROM index_usage_stats WHERE usage_level = 'UNUSED';
```

3. **Vacuum database** (weekly):
```sql
VACUUM ANALYZE;
```

## Support

For database-related issues:
1. Check the error logs in `backend/logs/`
2. Verify your `.env` configuration
3. Ensure PostgreSQL version 12+ is installed
4. Report issues at: https://github.com/linisastald/Loot-Tracker-PF1e/issues