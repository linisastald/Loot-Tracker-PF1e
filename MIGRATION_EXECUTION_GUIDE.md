# Migration 029 Execution Guide

## Quick Reference

Your diagnostic query confirmed:
- ✅ Server is UTC (`Etc/UTC`)
- ✅ All timestamps are stored in UTC
- ✅ **SAFE TO MIGRATE**

## Execution Steps

### Step 1: Pre-Migration Verification
```bash
# Connect to your database
psql -U postgres -d loot_tracking

# Run pre-migration checks
\i backend/migrations/PRE_MIGRATION_VERIFICATION.sql
```

**Review the output** - confirm all checks pass.

### Step 2: Create Backup
```bash
# Exit psql first (Ctrl+D or \q)

# Create backup with timestamp
pg_dump -U postgres -d loot_tracking > backup_before_migration_029_$(date +%Y%m%d_%H%M%S).sql

# Verify backup was created
ls -lh backup_before_migration_029_*.sql
```

### Step 3: Run Migration (Automatic)
**Option A: Automatic via Application Startup** (Recommended)

The migration will run automatically when you restart the server:

```bash
# Just restart your application
docker-compose restart backend

# Or rebuild and restart
docker-compose down
docker-compose up -d
```

The migration runner will:
1. Detect migration 029
2. Execute it in a transaction
3. Log success or failure
4. Continue to start application if successful

**Option B: Manual Execution** (If you prefer manual control)

```bash
# Connect to database
psql -U postgres -d loot_tracking

# Run migration manually
\i backend/migrations/029_migrate_timestamps_to_timestamptz.sql

# Migration includes:
# - BEGIN transaction
# - All ALTER TABLE statements
# - Verification checks
# - COMMIT
```

### Step 4: Verify Migration
```bash
# Connect to database (if not already connected)
psql -U postgres -d loot_tracking

# Run post-migration verification
\i backend/migrations/POST_MIGRATION_VERIFICATION.sql
```

**Expected Output:**
- All columns show `timestamp with time zone` ✓
- Sample timestamps include `+00` suffix ✓
- Row counts match pre-migration ✓

### Step 5: Test Application
```bash
# Access your application
# Add a new loot item
# Check that timestamp displays correctly
```

## If Something Goes Wrong

### During Automatic Migration
```bash
# Check application logs
docker-compose logs backend | grep -A 10 "migration"

# If migration failed, it will ROLLBACK automatically
# Your data is safe
```

### During Manual Migration
```bash
# If you see an error, immediately run:
ROLLBACK;

# Then restore from backup:
# Exit psql
psql -U postgres -d loot_tracking < backup_before_migration_029_YYYYMMDD_HHMMSS.sql
```

## Success Indicators

✅ Migration completed successfully if you see:
- "NOTICE" messages in migration output showing verification
- POST_MIGRATION_VERIFICATION shows all columns as `timestamptz`
- Application starts without errors
- Loot timestamps display correctly

## What Changed

**Before:**
```sql
lastupdate TIMESTAMP           -- No timezone info
Value: 2025-08-04 01:57:58.382009
```

**After:**
```sql
lastupdate TIMESTAMP WITH TIME ZONE  -- Includes timezone
Value: 2025-08-04 01:57:58.382009+00  -- +00 = UTC
```

**Display Examples:**
```sql
-- Original UTC storage (internal)
lastupdate = 2025-08-04 01:57:58.382009+00

-- Display in Eastern Time
SELECT lastupdate AT TIME ZONE 'America/New_York' FROM loot;
-- Result: 2025-08-03 21:57:58.382009

-- Display in Pacific Time
SELECT lastupdate AT TIME ZONE 'America/Los_Angeles' FROM loot;
-- Result: 2025-08-03 18:57:58.382009
```

## Next Steps After Migration

1. **Frontend Update** - Update components to display timestamps in campaign timezone
2. **Test Thoroughly** - Verify all timestamp displays across the app
3. **Monitor** - Watch for any timezone-related issues

## FAQ

**Q: Will this change how timestamps are stored?**
A: No, they're still stored in UTC. But now PostgreSQL knows they're UTC.

**Q: Will this affect existing timestamps?**
A: No data values change. They just get timezone information added.

**Q: Can I rollback if needed?**
A: Yes, either ROLLBACK during the transaction or restore from backup.

**Q: How long will this take?**
A: Usually < 1 second per table. Total migration should take 1-2 seconds.

**Q: Does this require downtime?**
A: Yes, brief downtime during migration (1-2 seconds). Automatic migration runs during server startup.

**Q: What if I have a lot of data?**
A: Your largest table (loot) has timestamps from Aug 2025. This is small - migration will be fast.

---

**Ready to proceed?** Start with Step 1 (Pre-Migration Verification).
