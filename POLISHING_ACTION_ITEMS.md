# Pathfinder Loot Tracker - Polishing Phase Action Items

**Version:** 0.10.x
**Created:** 2025-11-19
**Status:** Ready for Implementation
**Purpose:** Comprehensive bug fixes, optimizations, and UX improvements

---

## Executive Summary

This document contains **105 action items** identified across three comprehensive reviews:
- **Security & Data Integrity Review:** 25 findings
- **Performance & Optimization Review:** 25 findings
- **UX & Code Quality Review:** 40 findings
- **Documentation & Testing:** 15 findings

### Priority Breakdown

| Priority | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 9 | Security vulnerabilities or blocking UX bugs - fix immediately |
| **HIGH** | 31 | Security concerns, major performance issues, or poor UX |
| **MEDIUM** | 40 | Optimizations and code quality improvements |
| **LOW** | 25 | Best practices and future enhancements |

---

## CRITICAL PRIORITY (Fix Immediately)

### Security

#### S-CRIT-1: Remove Exposed Secrets from Version Control
**Severity:** CRITICAL (10/10)
**Location:** `truenas-configs.bak/test.env`
**Risk:** Database passwords, JWT secret, and OpenAI API key exposed in version control

**Actions Required:**
1. Immediately rotate all credentials:
   - DB_PASSWORD: `g5Zr7!c****` (redacted)
   - JWT_SECRET: `c845a4c7c****` (redacted)
   - OPENAI_API_KEY: `sk-proj-****` (redacted)
   - All Discord tokens
2. Remove files from git history:
   ```bash
   git filter-branch --tree-filter 'rm -rf truenas-configs.bak' HEAD
   # Or use git-filter-repo (preferred)
   ```
3. Add to `.gitignore`:
   ```
   truenas-configs.bak/
   *.env
   *.env.*
   ```
4. Audit all environment files for secrets

**Estimated Time:** 2 hours (immediate action required)

---

#### S-CRIT-2: Implement Discord Signature Verification
**Severity:** CRITICAL (9/10)
**Location:** `backend/src/middleware/discordVerify.js:32-39`
**Risk:** Unauthenticated attackers can send arbitrary Discord webhook requests

**Current Code:**
```javascript
function verifyKey(body, signature, timestamp, publicKey) {
    return true; // Temporarily allow all for testing
}
```

**Fix:**
```javascript
npm install discord-interactions

const { verifyKey } = require('discord-interactions');

function verifyDiscordSignature(body, signature, timestamp, publicKey) {
    try {
        const rawBody = JSON.stringify(body);
        return verifyKey(rawBody, signature, timestamp, publicKey);
    } catch (error) {
        logger.error('Discord signature verification failed:', error);
        return false;
    }
}
```

**Estimated Time:** 1 hour

---

#### S-CRIT-3: Fix SQL Injection in Python Utility Script
**Severity:** CRITICAL (8/10)
**Location:** `utilities/db_compare.py:182, 264-276`
**Risk:** Table names directly interpolated into SQL

**Current Code:**
```python
cur.execute(f"SELECT * FROM {table}")  # SQL Injection!
```

**Fix:**
```python
from psycopg2 import sql

cur.execute(sql.SQL("SELECT * FROM {}").format(sql.Identifier(table)))
```

**Estimated Time:** 30 minutes

---

#### S-CRIT-4: Add Foreign Key Constraints with CASCADE DELETE
**Severity:** CRITICAL (7/10)
**Location:** `database/init.sql` - Multiple tables
**Risk:** Orphaned records corrupt reports and analytics

**Tables Affected:**
- `appraisal.lootid` - missing ON DELETE CASCADE
- `sold.lootid` - missing ON DELETE CASCADE
- `consumableuse.lootid` - missing ON DELETE CASCADE
- `identify.lootid` - missing ON DELETE CASCADE
- `loot.modids` - array column with no FK constraint

**Migration Required:**
```sql
-- Migration 027: Add foreign key constraints

BEGIN;

ALTER TABLE appraisal
  ADD CONSTRAINT appraisal_lootid_fk
  FOREIGN KEY (lootid) REFERENCES loot(id) ON DELETE CASCADE;

ALTER TABLE sold
  ADD CONSTRAINT sold_lootid_fk
  FOREIGN KEY (lootid) REFERENCES loot(id) ON DELETE CASCADE;

ALTER TABLE consumableuse
  ADD CONSTRAINT consumableuse_lootid_fk
  FOREIGN KEY (lootid) REFERENCES loot(id) ON DELETE CASCADE;

ALTER TABLE identify
  ADD CONSTRAINT identify_lootid_fk
  FOREIGN KEY (lootid) REFERENCES loot(id) ON DELETE CASCADE;

-- TODO: Add trigger for modids array constraint validation

COMMIT;
```

**Estimated Time:** 2 hours (includes testing)

---

### UX Bugs

#### UX-CRIT-1: Replace Browser alert() with Material-UI Notifications
**Severity:** CRITICAL (8/10)
**Locations:**
- `frontend/src/components/pages/EntryForm.tsx:352`
- `frontend/src/components/pages/WeatherTest.jsx:62, 65, 97, 101`
- Multiple other locations

**Impact:** Poor UX, breaks accessibility, non-themable

**Fix:** Create notification utility:
```typescript
// frontend/src/utils/notifications.ts
import { enqueueSnackbar } from 'notistack';

export const notifySuccess = (message: string) => {
  enqueueSnackbar(message, { variant: 'success' });
};

export const notifyError = (message: string) => {
  enqueueSnackbar(message, { variant: 'error' });
};

export const notifyWarning = (message: string) => {
  enqueueSnackbar(message, { variant: 'warning' });
};
```

Then replace all `alert()` calls:
```typescript
// Before:
alert("The sum of the split quantities...");

// After:
notifyError("The sum of the split quantities...");
```

**Estimated Time:** 3 hours (find and replace all instances)

---

#### UX-CRIT-2: Add Form Validation on Blur (Not Just Submit)
**Severity:** CRITICAL (7/10)
**Locations:**
- `frontend/src/components/pages/Register.tsx`
- `frontend/src/components/pages/Login.tsx`
- Multiple form components

**Impact:** Users waste time with multiple failed submissions

**Fix:**
```typescript
const [emailError, setEmailError] = useState<string | null>(null);

const validateEmail = (value: string) => {
  if (!value) {
    return "Email is required";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Invalid email format";
  }
  return null;
};

<TextField
  error={!!emailError}
  helperText={emailError}
  onBlur={(e) => setEmailError(validateEmail(e.target.value))}
  onChange={(e) => {
    setEmail(e.target.value);
    if (emailError) setEmailError(validateEmail(e.target.value));
  }}
/>
```

**Estimated Time:** 4 hours (all forms)

---

#### UX-CRIT-3: Add Missing Confirmation Dialogs
**Severity:** CRITICAL (7/10)
**Locations:** Crew management, loot deletion, user deletion

**Impact:** Users accidentally perform destructive actions

**Fix:** Create reusable confirmation dialog:
```typescript
// frontend/src/components/common/ConfirmationDialog.tsx
const ConfirmationDialog: React.FC<Props> = ({
  open,
  title,
  message,
  confirmText = "Confirm",
  onConfirm,
  onCancel
}) => (
  <Dialog open={open} onClose={onCancel}>
    <DialogTitle>{title}</DialogTitle>
    <DialogContent>{message}</DialogContent>
    <DialogActions>
      <Button onClick={onCancel}>Cancel</Button>
      <Button onClick={onConfirm} color="error" variant="contained">
        {confirmText}
      </Button>
    </DialogActions>
  </Dialog>
);
```

**Estimated Time:** 2 hours

---

### Performance

#### PERF-CRIT-1: Fix N+1 Query in Appraisal Service
**Severity:** CRITICAL (9/10)
**Location:** `backend/src/services/appraisalService.js:104-124`
**Impact:** 500ms-5000ms delays for 100 appraisals

**Current Code:**
```javascript
for (const appraisal of appraisals) {
  await dbUtils.executeQuery(
    'UPDATE appraisal SET believedvalue = $1 WHERE id = $2',
    [newBelievedValue, appraisal.id]
  );
}
```

**Fix:** Batch update using CASE statement:
```javascript
if (appraisals.length > 0) {
  const updates = appraisals.map(appraisal => ({
    id: appraisal.id,
    value: calculateBelievedValue(appraisal, newValue)
  }));

  const sql = `
    UPDATE appraisal SET believedvalue = CASE id
      ${updates.map((_, i) => `WHEN $${i*2+1} THEN $${i*2+2}`).join(' ')}
    END
    WHERE id = ANY($${updates.length*2+1})
  `;
  const params = updates.flatMap(u => [u.id, u.value]);
  params.push(updates.map(u => u.id));
  await dbUtils.executeQuery(sql, params);
}
```

**Estimated Time:** 2 hours
**Expected Improvement:** 100-500x faster

---

#### PERF-CRIT-2: Add Pagination to Unbounded Queries
**Severity:** CRITICAL (8/10)
**Locations:**
- `backend/src/models/City.js:29`
- `backend/src/models/Crew.js:34`
- `backend/src/models/Outpost.js:37`

**Impact:** 100-500ms delays loading all records

**Fix:** Add LIMIT/OFFSET:
```javascript
async getAllCities(limit = 100, offset = 0) {
  const query = `
    SELECT * FROM city
    ORDER BY name
    LIMIT $1 OFFSET $2
  `;
  const result = await dbUtils.executeQuery(query, [limit, offset]);
  return result.rows;
}
```

**Estimated Time:** 3 hours (all endpoints)
**Expected Improvement:** 50-200ms per request

---

---

## HIGH PRIORITY

### Security (10 items)

#### S-HIGH-1: Missing Authentication on Unidentified Items Endpoint
**Location:** `backend/src/api/routes/loot.js:42`
**Risk:** Unauthenticated users can enumerate loot
**Fix:** Add `verifyToken` middleware
**Time:** 15 minutes

#### S-HIGH-2: Strengthen Invite Code Generation
**Location:** `backend/src/controllers/authController.js:414`
**Current:** `Math.random().toString(36)` (predictable)
**Fix:** Use `crypto.randomBytes(4).toString('hex')`
**Time:** 10 minutes

#### S-HIGH-3: Account Lockout Information Disclosure
**Location:** `backend/src/controllers/authController.js:228-233`
**Risk:** Error message reveals account existence
**Fix:** Generic message "Invalid credentials or account locked"
**Time:** 20 minutes

#### S-HIGH-4: Password Reset Tokens Not Deleted After Use
**Location:** `backend/src/controllers/authController.js:693-696`
**Current:** Marks used, doesn't delete
**Fix:** `DELETE FROM password_reset_tokens WHERE token = $1`
**Time:** 15 minutes

#### S-HIGH-5: JWT Token Expiration Too Long
**Location:** `backend/src/config/constants.js:11`
**Current:** 24 hours
**Recommendation:** Reduce to 1-4 hours, implement refresh token
**Time:** 2 hours (with refresh token mechanism)

#### S-HIGH-6: Missing Request Validation Middleware
**Location:** Various routes
**Issue:** Manual validation instead of middleware
**Fix:** Apply `validate()` middleware consistently
**Time:** 4 hours

#### S-HIGH-7: Discord Bot Token Exposure Risk
**Location:** `backend/src/controllers/discordController.js:79-88`
**Fix:** Never log Authorization header, use masked versions
**Time:** 1 hour

#### S-HIGH-8: Add Audit Logging
**Issue:** No comprehensive audit log for sensitive operations
**Fix:** Create `audit_log` table, log all privileged actions
**Time:** 4 hours

#### S-HIGH-9: CORS Wildcard Explicit Check
**Location:** `backend/index.js:100-116`
**Fix:** Add warning if `'*'` in ALLOWED_ORIGINS
**Time:** 15 minutes

#### S-HIGH-10: Missing Security Headers
**Location:** `backend/index.js:119-146`
**Fix:** Add additional headers (X-Permitted-Cross-Domain-Policies, Permissions-Policy)
**Time:** 30 minutes

---

### Performance (6 items)

#### PERF-HIGH-1: Active Character Fetched Multiple Times
**Location:** `frontend/src/components/common/CustomLootTable.jsx:117-129`
**Impact:** 20-50 API calls for same data (200-2500ms)
**Fix:** Move fetch to parent component or use context
**Time:** 2 hours
**Expected Improvement:** 80-90% reduction in API calls

#### PERF-HIGH-2: Sequential Mod Lookup in Item Parsing
**Location:** `backend/src/services/itemParsingService.js:91-111`
**Impact:** 5-20 separate queries
**Fix:** Single query with array aggregation
**Time:** 2 hours
**Expected Improvement:** 100-300ms

#### PERF-HIGH-3: Gold Balance Check in Loop
**Location:** `backend/src/controllers/goldController.js:33-35`
**Impact:** SUM query runs 5 times for 5 entries (400-1400ms)
**Fix:** Calculate once, adjust in-memory
**Time:** 1 hour
**Expected Improvement:** 400-1400ms

#### PERF-HIGH-4: Missing Database Indexes for Sessions
**Location:** `database/init.sql`
**Fix:** Add indexes on game_sessions(user_id, session_date)
**Time:** 1 hour
**Expected Improvement:** 5-20x faster queries

#### PERF-HIGH-5: Missing Composite Indexes for Joins
**Location:** `database/performance_indexes.sql`
**Fix:** Add `idx_loot_itemid_status`, `idx_loot_whohas_status_value`
**Time:** 1 hour
**Expected Improvement:** 3-10x for JOIN-heavy queries

#### PERF-HIGH-6: No Pagination on Consumables Endpoint
**Location:** Backend consumables routes
**Fix:** Add pagination with configurable page size
**Time:** 2 hours
**Expected Improvement:** 100-300ms

---

### UX (15 items)

#### UX-HIGH-1: Console Logging Left in Production
**Locations:** `utils/utils.ts:417-467`, `CustomLootTable.jsx:158, 163`
**Impact:** Console pollution, debugging leaks
**Fix:** Remove or gate behind NODE_ENV check
**Time:** 2 hours

#### UX-HIGH-2: Missing Loading States
**Locations:** CrewManagement, Consumables, dialogs
**Fix:** Add CircularProgress spinners
**Time:** 3 hours

#### UX-HIGH-3: Empty States Not Handled
**Locations:** Consumables, GoldTransactions
**Fix:** Skeleton loaders + "no items" message after load
**Time:** 2 hours

#### UX-HIGH-4: Inconsistent Date/Time Formatting
**Locations:** Multiple components
**Fix:** Centralized date formatting utility, tooltip for Golarion calendar
**Time:** 3 hours

#### UX-HIGH-5: Missing Required Field Indicators
**Locations:** All forms
**Fix:** Add asterisks or Material-UI required styling
**Time:** 2 hours

#### UX-HIGH-6: Hard Page Reload After Settings
**Location:** `SystemSettings.jsx:378`
**Current:** `window.location.reload()`
**Fix:** Update state, refetch data
**Time:** 1 hour

#### UX-HIGH-7: Password Strength Indicator
**Location:** `Register.tsx`
**Fix:** Add password strength meter
**Time:** 2 hours

#### UX-HIGH-8: Email Validation on Blur
**Location:** `Register.tsx`
**Fix:** Show inline error if invalid
**Time:** 30 minutes

#### UX-HIGH-9: Accessibility - Missing ARIA Labels
**Locations:** Icon buttons throughout
**Fix:** Add `aria-label` to all icon buttons
**Time:** 3 hours

#### UX-HIGH-10: Keyboard Navigation Issues
**Locations:** Dialogs and modals
**Fix:** Test and fix tab order, add focus indicators
**Time:** 2 hours

#### UX-HIGH-11: Color Contrast Issues
**Locations:** Disabled buttons, helper text
**Fix:** Run WAVE audit, ensure 4.5:1 contrast
**Time:** 2 hours

#### UX-HIGH-12: Missing Error Associations
**Locations:** All forms
**Fix:** Add `aria-describedby` linking errors to inputs
**Time:** 2 hours

#### UX-HIGH-13: Inconsistent Error Handling
**Locations:** Multiple pages
**Fix:** Standardized error handling utility
**Time:** 3 hours

#### UX-HIGH-14: No Retry Logic for Failed API Calls
**Locations:** All API calls
**Fix:** Exponential backoff + "Retry" button
**Time:** 4 hours

#### UX-HIGH-15: No Offline Mode Handling
**Locations:** App-wide
**Fix:** Detect network status, queue operations
**Time:** 6 hours

---

---

## MEDIUM PRIORITY

### Performance (10 items)

#### PERF-MED-1: Excessive Logging in Hot Paths
**Impact:** 5-20ms per request
**Fix:** Conditional logging, sampling
**Time:** 1 hour

#### PERF-MED-2: Inefficient Filter/Map in CustomLootTable
**Location:** `CustomLootTable.jsx:278-329`
**Fix:** Use useMemo and index lookups
**Time:** 2 hours
**Expected Improvement:** 20-100ms

#### PERF-MED-3: Missing React.memo on List Components
**Impact:** 10-50ms per render
**Fix:** Wrap components with React.memo
**Time:** 3 hours

#### PERF-MED-4: Barrel Imports from Material-UI
**Impact:** 50-150KB bundle size
**Fix:** Direct imports instead of barrel
**Time:** 3 hours
**Expected Improvement:** 20-50KB reduction

#### PERF-MED-5: Missing Database Query Caching
**Locations:** settingsController, cityController
**Impact:** 50-200ms per request
**Fix:** In-memory cache with 5-minute TTL
**Time:** 3 hours

#### PERF-MED-6: View Recalculation Performance
**Location:** loot_view definition
**Fix:** Materialized view with trigger refresh
**Time:** 4 hours
**Expected Improvement:** 5-20x faster

#### PERF-MED-7: Missing Code Splitting
**Location:** `App.tsx`
**Fix:** React.lazy() and Suspense for routes
**Time:** 2 hours
**Benefit:** 20-40% faster initial load

#### PERF-MED-8: No gzip Compression
**Location:** `backend/index.js`
**Fix:** Add compression middleware
**Time:** 30 minutes
**Benefit:** 30-70% smaller payloads

#### PERF-MED-9: No Request Deduplication
**Location:** API wrapper
**Fix:** Memoization for concurrent requests
**Time:** 2 hours
**Benefit:** Fewer database queries

#### PERF-MED-10: Missing Pagination on Loot Endpoints
**Location:** `/api/loot` routes
**Fix:** Add LIMIT/OFFSET with default 50
**Time:** 2 hours
**Expected Improvement:** 50-300ms

---

### Code Quality (20 items)

#### CODE-MED-1: Excessive `any` Type in TypeScript
**Locations:** Multiple components
**Fix:** Define proper interfaces, enable strict mode
**Time:** 8 hours

#### CODE-MED-2: Overly Large Components (>800 lines)
**Affected Files:**
- ShipManagement.tsx (1,190 lines)
- Infamy.tsx (1,177 lines)
- SessionManagement.jsx (1,165 lines)
- GoldTransactions.tsx (1,085 lines)
**Fix:** Extract dialogs, create hooks, split into smaller components
**Time:** 12 hours

#### CODE-MED-3: Commented-Out Code
**Locations:** ErrorBoundary, multiple files
**Fix:** Remove all commented code
**Time:** 1 hour

#### CODE-MED-4: TODO/FIXME Without Tracking
**Locations:** Multiple files
**Fix:** Create GitHub issues, use issue numbers in comments
**Time:** 2 hours

#### CODE-MED-5: No PropTypes or TypeScript Validation
**Location:** CustomSplitStackDialog.jsx and others
**Fix:** Convert JSX to TSX with interfaces
**Time:** 8 hours

#### CODE-MED-6: Duplicate Code Patterns
**Issue:** Multiple table implementations, repeated error handling
**Fix:** Create reusable components, extract utilities
**Time:** 10 hours

#### CODE-MED-7: Magic Numbers Not in Constants
**Locations:** Consumables, ship crew, dates
**Fix:** Create constants.ts, move all magic values
**Time:** 3 hours

#### CODE-MED-8: Inconsistent Error Handling Patterns
**Issue:** Different response formats
**Fix:** Standardized API response wrapper
**Time:** 4 hours

#### CODE-MED-9: Missing JSDoc Comments
**Locations:** Complex functions like calculateSpellcraftDC
**Fix:** Add JSDoc to all public functions
**Time:** 6 hours

#### CODE-MED-10: Missing API Documentation
**Fix:** Create Swagger/OpenAPI spec
**Time:** 8 hours

#### CODE-MED-11: Missing Component Documentation
**Fix:** Set up Storybook, document props
**Time:** 10 hours

#### CODE-MED-12: Inconsistent Response Formats
**Issue:** Some use `{data:}`, others `{items:}`
**Fix:** Create response wrapper utility
**Time:** 4 hours

#### CODE-MED-13: Missing Validation on Some Endpoints
**Fix:** Add express-validator to all input endpoints
**Time:** 6 hours

#### CODE-MED-14: Logging Inconsistency
**Fix:** Standardize Winston logger usage
**Time:** 3 hours

#### CODE-MED-15: Inconsistent File Structure
**Issue:** Mix of JSX/TSX files
**Fix:** Convert all to TSX, establish folder structure
**Time:** 8 hours

#### CODE-MED-16: No Environment Variable Documentation
**Fix:** Complete `.env.example` with comments
**Time:** 1 hour

#### CODE-MED-17: Mixed Import Styles
**Issue:** CommonJS and ES6 modules
**Fix:** Standardize on ES6
**Time:** 4 hours

#### CODE-MED-18: Missing Database Schema Documentation
**Fix:** Create ER diagram, document columns
**Time:** 6 hours

#### CODE-MED-19: Missing Form Validation Rules Documentation
**Fix:** Display rules upfront, add tooltips
**Time:** 3 hours

#### CODE-MED-20: Rate Limiter Window Too Short
**Location:** `backend/src/config/constants.js:19`
**Fix:** Increase to 60 seconds or use adaptive limiting
**Time:** 1 hour

---

---

## LOW PRIORITY

### Performance (5 items)

#### PERF-LOW-1: Missing Connection Pool Monitoring
**Fix:** Add request-scoped connection tracking
**Time:** 2 hours

#### PERF-LOW-2: Slow Query Threshold Adjustment
**Current:** 500ms
**Recommendation:** Set to 200-300ms
**Time:** 10 minutes

#### PERF-LOW-3: No Service Worker Caching
**Fix:** Add Workbox or Vite PWA plugin
**Time:** 4 hours

#### PERF-LOW-4: Missing API Response Compression Optimization
**Fix:** Exclude unnecessary fields before sending
**Time:** 3 hours

#### PERF-LOW-5: No View Recalculation Monitoring
**Fix:** Add metrics for view performance
**Time:** 2 hours

---

### Testing & Documentation (15 items)

#### TEST-LOW-1: Missing Tests for Critical Workflows
**Tests Needed:**
- Login/Register flows
- Loot entry submission
- Gold transactions
- Crew management
**Fix:** Create integration and unit tests
**Time:** 20 hours

#### TEST-LOW-2: Missing E2E Tests
**Fix:** Set up Playwright or Cypress
**Time:** 12 hours

#### TEST-LOW-3: Missing Database Migration Tests
**Fix:** Test all migrations up and down
**Time:** 6 hours

#### TEST-LOW-4: No CI/CD Pipeline
**Fix:** Set up GitHub Actions to run tests
**Time:** 4 hours

#### TEST-LOW-5: Missing Performance Tests
**Fix:** Load testing for critical endpoints
**Time:** 6 hours

#### DOC-LOW-1: Missing README Setup Guide
**Fix:** Document local development setup
**Time:** 2 hours

#### DOC-LOW-2: Missing Deployment Guide
**Fix:** Document production deployment steps
**Time:** 3 hours

#### DOC-LOW-3: Missing Architecture Documentation
**Fix:** Document system architecture, data flow
**Time:** 4 hours

#### DOC-LOW-4: Missing Contributing Guide
**Fix:** CONTRIBUTING.md with code standards
**Time:** 2 hours

#### DOC-LOW-5: Missing Changelog
**Fix:** CHANGELOG.md following Keep a Changelog format
**Time:** 2 hours

#### DOC-LOW-6: Missing Security Policy
**Fix:** SECURITY.md with vulnerability reporting process
**Time:** 1 hour

#### DOC-LOW-7: Missing License File
**Fix:** Add LICENSE file (MIT, GPL, etc.)
**Time:** 15 minutes

#### DOC-LOW-8: Missing Code of Conduct
**Fix:** CODE_OF_CONDUCT.md
**Time:** 30 minutes

#### DOC-LOW-9: Missing Issue Templates
**Fix:** GitHub issue templates for bugs, features
**Time:** 1 hour

#### DOC-LOW-10: Missing PR Template
**Fix:** Pull request template
**Time:** 30 minutes

---

### Code Quality (5 items)

#### CODE-LOW-1: TypeScript Migration Not Started
**Fix:** Gradually migrate to TypeScript
**Time:** 40 hours

#### CODE-LOW-2: Missing ESLint Configuration
**Fix:** Add ESLint with TypeScript support
**Time:** 2 hours

#### CODE-LOW-3: Missing Prettier Configuration
**Fix:** Add Prettier for consistent formatting
**Time:** 1 hour

#### CODE-LOW-4: No Pre-commit Hooks
**Fix:** Add Husky + lint-staged
**Time:** 1 hour

#### CODE-LOW-5: Missing EditorConfig
**Fix:** Add .editorconfig for consistent editor settings
**Time:** 15 minutes

---

---

## Implementation Roadmap

### Sprint 1: Critical Security & UX (2 weeks)
**Goal:** Fix all CRITICAL priority items

**Focus:**
- Remove secrets from version control (S-CRIT-1)
- Implement Discord signature verification (S-CRIT-2)
- Fix SQL injection (S-CRIT-3)
- Add foreign key constraints (S-CRIT-4)
- Replace alert() dialogs (UX-CRIT-1)
- Add form validation on blur (UX-CRIT-2)
- Add confirmation dialogs (UX-CRIT-3)
- Fix N+1 query (PERF-CRIT-1)
- Add pagination (PERF-CRIT-2)

**Estimated Effort:** 80 hours (2 developers, 1 week each)

---

### Sprint 2: High Priority Security & Performance (2 weeks)
**Goal:** Address HIGH priority security and performance issues

**Focus:**
- All S-HIGH items (authentication, validation, security headers)
- All PERF-HIGH items (indexes, caching, optimization)
- Critical UX-HIGH items (loading states, error handling, accessibility)

**Estimated Effort:** 100 hours

---

### Sprint 3: Code Quality & UX Polish (2 weeks)
**Goal:** Improve code maintainability and user experience

**Focus:**
- UX-HIGH items (remaining accessibility, offline mode)
- CODE-MED items (TypeScript typing, component refactoring)
- PERF-MED items (code splitting, compression, caching)

**Estimated Effort:** 100 hours

---

### Sprint 4: Testing & Documentation (1 week)
**Goal:** Establish testing foundation and documentation

**Focus:**
- Set up test framework
- Write tests for critical paths
- Create API documentation
- Complete README and guides
- Add missing documentation files

**Estimated Effort:** 60 hours

---

### Sprint 5: Low Priority & Polish (1 week)
**Goal:** Complete remaining improvements

**Focus:**
- LOW priority items
- Performance monitoring
- CI/CD setup
- Final polish

**Estimated Effort:** 40 hours

---

## Total Estimated Effort

| Category | Hours |
|----------|-------|
| **CRITICAL** | 80 |
| **HIGH** | 100 |
| **MEDIUM** | 100 |
| **LOW** | 100 |
| **TOTAL** | **380 hours** |

**Timeline:** 5 sprints (8-10 weeks) with 2 developers
**Budget:** ~$30,000-$40,000 (at $80-100/hour)

---

## Success Metrics

### Performance
- Average API response time < 200ms
- Page load time < 2 seconds
- Time to Interactive < 3 seconds
- Bundle size < 500KB gzipped

### Quality
- Test coverage > 70%
- TypeScript strict mode enabled
- Zero console.log in production
- Zero critical security vulnerabilities

### User Experience
- All forms have inline validation
- All async operations show loading states
- All destructive actions have confirmations
- WCAG 2.1 Level AA compliance

---

## Tracking Progress

**Recommendation:** Create GitHub issues for each action item:
- Tag by priority: `priority:critical`, `priority:high`, `priority:medium`, `priority:low`
- Tag by category: `security`, `performance`, `ux`, `code-quality`, `testing`, `docs`
- Tag by sprint: `sprint:1`, `sprint:2`, etc.
- Use GitHub Projects to track sprint progress

**Example Issue Title Format:**
- `[CRITICAL][Security] S-CRIT-1: Remove exposed secrets from version control`
- `[HIGH][Performance] PERF-HIGH-1: Fix N+1 query in appraisal service`
- `[MEDIUM][UX] UX-MED-3: Add loading states to all async operations`

---

## Notes

- **No new features** should be added during polishing phase
- All changes should be reviewed and tested before merging
- Database migrations must have rollback scripts
- Document all breaking changes
- Update FEATURE_DOCUMENTATION.md as fixes are implemented

---

**Last Updated:** 2025-11-19
**Review Completed By:** Claude Code Agent
**Status:** Ready for Implementation
