# TIMESTAMP to TIMESTAMPTZ Migration Plan

## What Happens to Existing Data?

### The Migration Command
```sql
ALTER TABLE loot
ALTER COLUMN lastupdate TYPE TIMESTAMP WITH TIME ZONE
USING lastupdate AT TIME ZONE 'UTC';
```

### Step-by-Step Breakdown

**Before Migration:**
```
Column: lastupdate TIMESTAMP
Value:  2025-11-23 19:00:00
Meaning: "Some point in time, but we don't know what timezone"
```

**During Migration:**
PostgreSQL:
1. Reads the value: `2025-11-23 19:00:00`
2. Interprets it according to `AT TIME ZONE 'UTC'` clause
3. Converts to: `2025-11-23 19:00:00+00` (UTC timezone)
4. Stores internally as UTC with timezone info

**After Migration:**
```
Column: lastupdate TIMESTAMP WITH TIME ZONE
Value:  2025-11-23 19:00:00+00
Meaning: "November 23, 2025 at 7:00 PM UTC"
```

---

## The Critical Question

**What timezone are your existing timestamps ACTUALLY in?**

This depends on how the data was inserted:

### Scenario A: Database Server in UTC (Most Common)
If your PostgreSQL server is in UTC timezone:
- `CURRENT_TIMESTAMP` inserts UTC time
- **Migration**: Use `AT TIME ZONE 'UTC'` ✓ Correct!
- **Result**: Data stays accurate

### Scenario B: Database Server in EST/PST/Other
If your PostgreSQL server is in Eastern time:
- `CURRENT_TIMESTAMP` inserts EST/EDT time
- **Migration**: Use `AT TIME ZONE 'America/New_York'` ✓
- **Result**: Data stays accurate

### Scenario C: Mixed Sources (Problem!)
If timestamps came from different sources:
- Some from server (UTC or local time)
- Some from frontend (user's browser time)
- **Migration**: 🚨 DANGER - data might be inconsistent!
- **Result**: Need to audit before migrating

---

## How to Check Your Current Timezone

### Step 1: Check PostgreSQL Server Timezone
```sql
SHOW timezone;
```

**Expected Output:**
- `UTC` - Server is in UTC
- `America/New_York` - Server is in Eastern time
- `localtime` - Server uses OS timezone

### Step 2: Check Sample Data
```sql
-- Get a few recent loot entries
SELECT id, name, lastupdate
FROM loot
ORDER BY lastupdate DESC
LIMIT 5;
```

**Manual Verification:**
1. Compare the timestamps to when you actually added the items
2. Are they in UTC? Your local time? Campaign time?
3. This tells you what timezone the data is actually stored in

### Step 3: Check Server OS Timezone (if using Docker)
```bash
# Inside the PostgreSQL container
date
# Or
cat /etc/timezone
```

---

## Migration Scenarios

### Scenario 1: All Timestamps in UTC (Recommended)
**Verification:**
```sql
SHOW timezone;  -- Returns 'UTC'
```

**Migration:**
```sql
-- Safe migration - data is already in UTC
ALTER TABLE loot
ALTER COLUMN lastupdate TYPE TIMESTAMP WITH TIME ZONE
USING lastupdate AT TIME ZONE 'UTC';

ALTER TABLE loot
ALTER COLUMN session_date TYPE TIMESTAMP WITH TIME ZONE
USING session_date AT TIME ZONE 'UTC';

ALTER TABLE loot
ALTER COLUMN appraised_on TYPE TIMESTAMP WITH TIME ZONE
USING appraised_on AT TIME ZONE 'UTC';

ALTER TABLE loot
ALTER COLUMN consumed_on TYPE TIMESTAMP WITH TIME ZONE
USING consumed_on AT TIME ZONE 'UTC';
```

**Result:** All timestamps preserve their actual UTC time, display correctly in any timezone.

---

### Scenario 2: All Timestamps in Server's Local Time
**Verification:**
```sql
SHOW timezone;  -- Returns 'America/New_York' or similar
```

**Migration:**
```sql
-- Replace 'America/New_York' with your server's actual timezone
ALTER TABLE loot
ALTER COLUMN lastupdate TYPE TIMESTAMP WITH TIME ZONE
USING lastupdate AT TIME ZONE 'America/New_York';
```

**Result:** Timestamps converted from EST/EDT to TIMESTAMPTZ.

---

### Scenario 3: Mixed or Unknown (Requires Audit)
**If you're not sure, DO NOT MIGRATE yet!**

**Steps:**
1. Create a test table with sample data
2. Try migration with different timezone assumptions
3. Compare results to known actual times
4. Document which timezone assumption is correct

**Test Script:**
```sql
-- Create test table
CREATE TABLE loot_test AS SELECT * FROM loot LIMIT 100;

-- Try UTC assumption
ALTER TABLE loot_test
ALTER COLUMN lastupdate TYPE TIMESTAMP WITH TIME ZONE
USING lastupdate AT TIME ZONE 'UTC';

-- Check results
SELECT id, name, lastupdate FROM loot_test LIMIT 10;

-- If wrong, drop and try again with different timezone
DROP TABLE loot_test;
```

---

## Example: Real Data Comparison

### Before Migration
```sql
SELECT id, name, lastupdate
FROM loot
WHERE id = 12345;

-- Result:
-- id    | name           | lastupdate
-- 12345 | +1 Longsword   | 2025-11-20 14:30:00
```

**You Added This Item:** November 20, 2025 at 2:30 PM Eastern Time

### Migration Option A: Assume UTC
```sql
ALTER TABLE loot_test
ALTER COLUMN lastupdate TYPE TIMESTAMP WITH TIME ZONE
USING lastupdate AT TIME ZONE 'UTC';

SELECT id, name, lastupdate AT TIME ZONE 'America/New_York' as eastern_time
FROM loot_test
WHERE id = 12345;

-- Result:
-- id    | name           | eastern_time
-- 12345 | +1 Longsword   | 2025-11-20 09:30:00
```
**Wrong!** Shows 9:30 AM instead of 2:30 PM

### Migration Option B: Assume Eastern
```sql
ALTER TABLE loot_test
ALTER COLUMN lastupdate TYPE TIMESTAMP WITH TIME ZONE
USING lastupdate AT TIME ZONE 'America/New_York';

SELECT id, name, lastupdate AT TIME ZONE 'America/New_York' as eastern_time
FROM loot_test
WHERE id = 12345;

-- Result:
-- id    | name           | eastern_time
-- 12345 | +1 Longsword   | 2025-11-20 14:30:00
```
**Correct!** Shows 2:30 PM as expected

**Conclusion:** Your data is stored in Eastern time, use `AT TIME ZONE 'America/New_York'`

---

## Safe Migration Process

### Phase 1: Investigation (SAFE - No Changes)
```sql
-- 1. Check server timezone
SHOW timezone;

-- 2. Get current timestamp from server
SELECT NOW(), CURRENT_TIMESTAMP;

-- 3. Sample your data
SELECT id, name, lastupdate,
       lastupdate AT TIME ZONE 'UTC' as if_utc,
       lastupdate AT TIME ZONE 'America/New_York' as if_eastern
FROM loot
ORDER BY lastupdate DESC
LIMIT 5;
```

**Manually verify** which column matches when you actually added those items.

### Phase 2: Test Migration (SAFE - Test Table Only)
```sql
-- Create test table
CREATE TABLE loot_migration_test AS
SELECT * FROM loot
WHERE lastupdate > NOW() - INTERVAL '7 days'
LIMIT 100;

-- Try migration (replace 'UTC' with your determined timezone)
ALTER TABLE loot_migration_test
ALTER COLUMN lastupdate TYPE TIMESTAMP WITH TIME ZONE
USING lastupdate AT TIME ZONE 'UTC';

-- Verify results
SELECT id, name,
       lastupdate,
       lastupdate AT TIME ZONE 'America/New_York' as campaign_time
FROM loot_migration_test
ORDER BY lastupdate DESC
LIMIT 10;

-- Compare to original
SELECT id, name, lastupdate
FROM loot
WHERE id IN (SELECT id FROM loot_migration_test LIMIT 10);
```

**Manually verify** the converted times match your records.

### Phase 3: Backup (REQUIRED)
```bash
# Before any production migration, create a backup
pg_dump -U postgres -d loot_tracker > backup_before_timestamp_migration.sql
```

### Phase 4: Production Migration
**Only after Phase 1-3 confirm the correct timezone!**

```sql
-- Begin transaction for safety
BEGIN;

-- Migrate loot table
ALTER TABLE loot
ALTER COLUMN lastupdate TYPE TIMESTAMP WITH TIME ZONE
USING lastupdate AT TIME ZONE 'UTC';  -- Replace 'UTC' with your verified timezone

ALTER TABLE loot
ALTER COLUMN session_date TYPE TIMESTAMP WITH TIME ZONE
USING session_date AT TIME ZONE 'UTC';

-- Verify sample data
SELECT id, name, lastupdate FROM loot ORDER BY lastupdate DESC LIMIT 5;

-- If everything looks good:
COMMIT;

-- If something is wrong:
ROLLBACK;
```

---

## Rollback Plan

If migration goes wrong:

### Option A: PostgreSQL Transaction Rollback
```sql
ROLLBACK;  -- Only works if you haven't committed
```

### Option B: Restore from Backup
```bash
# Stop application
# Restore database
psql -U postgres -d loot_tracker < backup_before_timestamp_migration.sql
# Restart application
```

### Option C: Reverse Migration
```sql
-- Convert back to TIMESTAMP (loses timezone info)
ALTER TABLE loot
ALTER COLUMN lastupdate TYPE TIMESTAMP
USING lastupdate AT TIME ZONE 'UTC';
```

---

## Recommendation

**Before migrating, run this diagnostic query:**

```sql
-- Diagnostic Query - Run this first!
SELECT
    'Server Timezone' as info_type,
    current_setting('timezone') as value
UNION ALL
SELECT
    'Current Server Time (NOW)',
    NOW()::text
UNION ALL
SELECT
    'Sample Loot Time',
    lastupdate::text
FROM loot
ORDER BY lastupdate DESC
LIMIT 1;
```

**Send me the output** and I can tell you exactly which timezone to use in your migration!

---

## Summary

**Question:** What happens to existing data?
**Answer:** Data is **preserved** but **reinterpreted** with timezone information.

**Critical Step:** Determine what timezone your existing timestamps are ACTUALLY in.

**Safe Approach:**
1. Check server timezone
2. Sample and verify data
3. Test on copy of table
4. Backup database
5. Migrate with correct timezone assumption
6. Verify results
7. Rollback if wrong

**DO NOT GUESS** the timezone - verify with real data first!

---

*Last Updated: 2025-11-23*
