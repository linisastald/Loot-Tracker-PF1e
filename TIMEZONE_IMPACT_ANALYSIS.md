# Timezone Impact Analysis

## Current State

### What Uses Campaign Timezone ✓
**Session Scheduling System** (`backend/src/services/scheduler/SessionSchedulerService.js`)
- All cron jobs use the configured campaign timezone
- Session start/end times displayed correctly
- Reminder calculations use campaign timezone
- Confirmation checks use campaign timezone

### What Does NOT Use Campaign Timezone ✗

#### 1. Loot Timestamps
**Database Schema**: `TIMESTAMP WITHOUT TIME ZONE`
- `loot.lastupdate` - Uses `CURRENT_TIMESTAMP` (server time, no timezone conversion)
- `loot.session_date` - Stored as-is without timezone
- `loot.appraised_on` - Uses `CURRENT_TIMESTAMP`
- `loot.consumed_on` - Uses `CURRENT_TIMESTAMP`

**Problem**: Timestamps are stored in server's timezone (likely UTC), but displayed in user's browser timezone. This creates confusion when the campaign timezone differs from both.

#### 2. Gold Transactions
**Database Schema**: `TIMESTAMP WITHOUT TIME ZONE`
- `gold_transactions.session_date` - No timezone conversion
- `gold_transactions.session_time` - No timezone conversion
- `gold_transactions.created_at` - Uses `CURRENT_TIMESTAMP`

#### 3. User & Character Timestamps
**Database Schema**: `TIMESTAMP WITHOUT TIME ZONE`
- `users.joined` - Uses `CURRENT_TIMESTAMP`
- `characters.created_at` - Uses `CURRENT_TIMESTAMP`
- `characters.updated_at` - Uses `CURRENT_TIMESTAMP`

#### 4. Newer Features (Correct)
**Database Schema**: `TIMESTAMP WITH TIME ZONE` ✓
- `ships.updated_at` - Stores with timezone
- `crew.created_at` - Stores with timezone
- `outposts.created_at` - Stores with timezone
- `weather.created_at` - Stores with timezone

---

## The Problem

### Example Scenario:
- **Campaign Timezone**: America/Los_Angeles (PST/PDT)
- **Server Timezone**: UTC
- **User Browser**: America/New_York (EST/EDT)

When a user adds loot at "7:00 PM" their local time:
1. Frontend sends: `2025-11-23 19:00:00` (no timezone info)
2. Database stores: `2025-11-23 19:00:00` (interpreted as server UTC)
3. Frontend displays: `2025-11-23 14:00:00` (converted to browser EST)
4. **Campaign sees**: Wrong time (neither PST nor the actual entry time)

---

## Options to Fix

### Option 1: Leave As-Is (Current Behavior)
**Pros:**
- No changes needed
- Works "okay" if all users are in same timezone
- Timestamps are technically accurate (just unclear)

**Cons:**
- Confusing when team members are in different timezones
- Loot timestamps don't match campaign timezone setting
- Inconsistent with session scheduling

**Recommendation**: Not ideal for multi-timezone teams

---

### Option 2: Display Conversion Only (Frontend Fix)
Convert all displayed timestamps to campaign timezone on the frontend.

**Changes Needed:**
- Update all timestamp display components to use campaign timezone
- Fetch campaign timezone setting in frontend
- Use library like `date-fns-tz` to convert display

**Pros:**
- No database migration required
- Doesn't change how data is stored
- Simple to implement

**Cons:**
- Doesn't fix underlying storage issue
- Frontend must always remember to convert
- New developers might forget to convert in new features

**Implementation Example:**
```typescript
import { format, toZonedTime } from 'date-fns-tz';

const campaignTimezone = 'America/Los_Angeles'; // Fetched from API

// When displaying timestamp:
const localTime = toZonedTime(dbTimestamp, campaignTimezone);
const formatted = format(localTime, 'PPpp', { timeZone: campaignTimezone });
```

---

### Option 3: Convert on Input (Backend Normalization)
Convert all timestamps to campaign timezone before storing.

**Changes Needed:**
- Backend middleware to convert incoming timestamps
- Convert `CURRENT_TIMESTAMP` to use campaign timezone
- Update all timestamp inserts to use timezone-aware function

**Pros:**
- All timestamps consistent in database
- Easy to query and compare timestamps
- Frontend can display as-is

**Cons:**
- Requires updating all INSERT/UPDATE queries
- Changing campaign timezone requires data migration
- Still uses `TIMESTAMP WITHOUT TIME ZONE` (not ideal)

---

### Option 4: Migrate to TIMESTAMPTZ (Recommended)
Migrate all `TIMESTAMP` columns to `TIMESTAMP WITH TIME ZONE`.

**Changes Needed:**
1. Database migration to convert columns:
   ```sql
   ALTER TABLE loot
   ALTER COLUMN lastupdate TYPE TIMESTAMP WITH TIME ZONE
   USING lastupdate AT TIME ZONE 'UTC';
   ```

2. Update application to handle timezone-aware timestamps
3. Frontend displays in campaign timezone

**Pros:**
- PostgreSQL stores timezone information
- Automatic conversion on read/write
- Industry standard approach
- Future-proof
- Works correctly for multi-timezone teams

**Cons:**
- Requires database migration
- Need to verify all existing timestamps
- More complex initial implementation

**Migration Path:**
1. Add new `TIMESTAMPTZ` columns alongside existing
2. Backfill data with timezone conversion
3. Update application to use new columns
4. Drop old columns after verification

---

## Recommended Approach

### Short Term: Option 2 (Display Conversion)
Implement frontend display conversion for loot and gold timestamps:
- Add campaign timezone to frontend context
- Create utility function for timezone-aware display
- Update loot/gold display components

**Estimated Effort**: 2-3 hours
**Risk**: Low
**Impact**: Immediate improvement for users

### Long Term: Option 4 (Full Migration)
Plan migration to `TIMESTAMP WITH TIME ZONE`:
- Schedule during maintenance window
- Create migration script with rollback plan
- Test thoroughly on staging environment

**Estimated Effort**: 8-12 hours
**Risk**: Medium (database migration)
**Impact**: Permanent solution

---

## Action Items

### Immediate (Week 1)
- [ ] Create campaign timezone context provider in frontend
- [ ] Add timezone conversion utility function
- [ ] Update loot display components to show campaign timezone
- [ ] Update gold transaction display to show campaign timezone
- [ ] Test with different timezone settings

### Near Term (Month 1)
- [ ] Document timezone handling for developers
- [ ] Add timezone indicator to timestamp displays ("PST", "EST", etc.)
- [ ] Create migration script for TIMESTAMPTZ conversion
- [ ] Test migration on development database

### Future (Month 2-3)
- [ ] Execute TIMESTAMPTZ migration on staging
- [ ] Verify all timestamps after migration
- [ ] Execute on production during maintenance window
- [ ] Update documentation

---

## Developer Guidelines

### When Adding New Timestamp Fields
1. **Prefer**: `TIMESTAMP WITH TIME ZONE`
2. **Use**: `CURRENT_TIMESTAMP` or `NOW()` for defaults
3. **Frontend**: Always display using campaign timezone
4. **Backend**: Store in UTC, convert for display

### When Querying Timestamps
```sql
-- Convert to campaign timezone for comparison
WHERE created_at AT TIME ZONE 'America/Los_Angeles' > '2025-11-23 00:00:00'

-- Or use TIMESTAMPTZ columns and let PostgreSQL handle it
WHERE created_at > '2025-11-23 00:00:00-08'::TIMESTAMPTZ
```

---

## Summary

**Current Status**: Session scheduling uses campaign timezone ✓, but loot/gold timestamps do not ✗

**Quick Fix**: Frontend display conversion (Option 2)

**Proper Fix**: Migrate to TIMESTAMPTZ (Option 4)

**Risk**: Low for display conversion, medium for database migration

**Priority**: Medium - affects user experience but data is not lost

---

*Document created: 2025-11-23*
*Last updated: 2025-11-23*
