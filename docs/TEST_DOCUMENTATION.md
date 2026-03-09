# Test Documentation - Pathfinder Loot Tracker PF1e

## Overview

| Metric | Count |
|--------|-------|
| **Total Tests** | 533 |
| **Backend Tests** | 525 |
| **Frontend Tests** | 8 |
| **Test Suites** | 32 backend + 1 frontend = 33 |
| **Backend Framework** | Jest |
| **Frontend Framework** | Vitest + React Testing Library |

### Running Tests

```bash
# Backend (all tests)
cd backend && npx jest --verbose

# Backend (unit tests only - excludes integration)
cd backend && npx jest --config jest.unit.config.js --verbose

# Frontend
cd frontend && npx vitest run
```

---

## Test Architecture

### Mock Strategy

All backend unit tests mock the database layer via `jest.mock('../../utils/dbUtils')`, providing mock implementations of `executeQuery`, `executeTransaction`, `insert`, `getById`, `getMany`, `updateById`, and `deleteById`. This allows tests to run without a PostgreSQL connection.

**Transaction mock pattern:**
```javascript
const mockClient = { query: jest.fn() };
dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));
```

**Pure function tests** (game mechanics, calculations, validation) require no mocks at all.

### File Organization

```
backend/
  src/
    middleware/__tests__/     # Middleware unit tests
    models/__tests__/         # Model unit tests
    services/__tests__/       # Service unit tests
    utils/__tests__/          # Utility unit tests
  tests/
    api/                      # API integration tests
    controllers/              # Controller unit tests
    integration/              # End-to-end workflow tests
    middleware/                # Additional middleware tests
    models/                   # BaseModel tests
frontend/
  src/
    utils/__tests__/          # Frontend utility tests
```

---

## Phase 1: Security & Infrastructure Tests

### `backend/src/middleware/__tests__/auth.test.js` — 10 tests

Tests JWT authentication middleware (`verifyToken`).

| Test | Expected Behavior |
|------|-------------------|
| Extract token from Authorization header | Parses `Bearer <token>` and verifies via `jwt.verify` |
| Extract token from authToken cookie | Falls back to cookie when no Authorization header |
| Prefer header over cookie | Authorization header takes priority when both present |
| Return 401 when no token | Responds with `{ message: 'Access denied. No token provided.' }` |
| Return 401 when no Bearer prefix | Rejects `Authorization: <token>` without Bearer keyword |
| Return 401 for malformed token | Catches `jwt.verify` errors and returns 401 |
| Return 401 for wrong secret | Token signed with different secret fails verification |
| Return 401 for expired token | Returns `{ message: 'Token expired. Please login again.' }` |
| Attach decoded payload to req.user | Sets `req.user = { id, username, role }` for downstream middleware |

---

### `backend/src/middleware/__tests__/checkRole.test.js` — 8 tests

Tests role-based access control middleware.

| Test | Expected Behavior |
|------|-------------------|
| Allow matching single role | `checkRole('DM')` passes when `req.user.role === 'DM'` |
| Allow matching role from array | `checkRole(['DM', 'Admin'])` passes for either role |
| Reject insufficient permissions | Returns 403 `{ message: 'Insufficient permissions' }` |
| Reject missing role | Returns 403 when `req.user.role` is undefined |
| Reject undefined user | Returns 403 when `req.user` is undefined |
| Allow DM role access | DM role is accepted by `checkRole('DM')` |
| Handle unexpected errors | Returns 500 for non-role-related errors |

---

### `backend/src/middleware/__tests__/validation.test.js` — 49 tests

Tests input validation middleware system.

**`validateValue`** (42 tests):
- **String validation**: Required fields, minLength/maxLength enforcement, enum matching, date format validation (`YYYY-MM-DD`), datetime format validation (`YYYY-MM-DDTHH:mm`)
- **Number validation**: Integer parsing from strings, min/max bounds, rejection of non-numeric strings
- **Boolean validation**: Accepts true/false values
- **Array validation**: Type checking for array inputs
- **Object validation**: Type checking for object inputs
- **Path handling**: Parent path prepending for nested field references

**`createValidationMiddleware`** (3 tests): Validates that middleware correctly passes valid input, blocks invalid input with 400 status, and coerces types (string to number).

**`validate` inline helper** (4 tests): Validates body, params, and query parameters independently.

---

### `backend/src/utils/__tests__/controllerFactory.test.js` — 19 tests

Tests controller wrapper, error factories, and response helpers.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `createHandler` | 8 | Wraps async handlers, catches ValidationError→400, NotFoundError→404, AuthorizationError→403, generic→500 |
| Error factories | 3 | `createValidationError`, `createNotFoundError`, `createAuthorizationError` produce correctly typed errors |
| `validateRequiredFields` | 6 | Throws for missing/null/empty fields, accepts `0` and `false` as valid |
| Response helpers | 3 | `sendSuccessResponse` (200), `sendCreatedResponse` (201), `sendSuccessMessage` format correctly |

---

### `frontend/src/utils/__tests__/api.test.ts` — 8 tests

Tests the frontend API utility (axios instance with CSRF token handling).

| Test | Expected Behavior |
|------|-------------------|
| Store CSRF token in localStorage | `setCsrfToken('token')` stores to localStorage |
| Clear token on removal | `setCsrfToken(null)` removes from localStorage |
| Return null when not stored | `getCsrfToken()` returns null when no token exists |
| Export axios instance | Default export is an axios instance |
| withCredentials enabled | Instance has `withCredentials: true` for cookie auth |
| baseURL configured | Points to `/api` (or env-configured URL) |
| Request interceptors registered | CSRF token injection interceptor is present |
| Response interceptors registered | Response unwrapping interceptor is present |

---

## Phase 2: Core Feature Tests

### `backend/src/models/__tests__/Loot.test.js` — 14 tests

Tests loot item CRUD operations using legacy column names (`whohas`, `lastupdate`, `statuspage`).

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `create` | 2 | Inserts with all fields; defaults optional fields (quantity, notes, etc.) to null |
| `findByStatus` | 4 | Queries by status, extracts character-specific appraisals from `believed_value_X` columns, separates summary vs. individual rows |
| `updateStatus` | 3 | Updates status for array of IDs; sets `whohas` when status is "Kept Self"; doesn't set `whohas` for other statuses |
| `splitStack` | 2 | Runs transaction to update original quantity and insert N split rows; handles single split without extra insert |
| `updateEntry` | 2 | Merges updated fields and saves; throws `NotFoundError` when item doesn't exist |
| `getItems` | 1 | Returns all items from loot table |

---

### `backend/src/models/__tests__/Gold.test.js` — 10 tests

Tests gold/currency tracking with denomination breakdown (platinum, gold, silver, copper).

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `create` | 2 | Maps `sessionDate` → `session_date` column; defaults missing denominations to 0 |
| `findAll` | 4 | Returns paginated transactions with total count; applies date range filters; calculates correct offset; handles last page |
| `getBalance` | 1 | Returns summed balance across all denomination columns |
| `getSummaryByType` | 1 | Returns grouped summaries by transaction type |
| `distributeToCharacters` | 2 | Inserts distribution entries in a transaction; defaults missing currency values to 0 |

---

### `backend/src/services/__tests__/salesService.test.js` — 29 tests

Tests item sale workflows.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `filterValidSaleItems` (pure) | 3 | Separates identified items from unidentified; returns all when none unidentified; handles empty array |
| `createGoldEntry` (pure) | 3 | Converts total gold into pp/gp/sp/cp denominations; handles fractional values; handles zero |
| `createSaleResponse` | 3 | Builds response with sold items, kept items, and skipped items |
| `sellAllPendingItems` | 3 | Sells all valid pending items; throws when none pending; throws when all are unidentified |
| `sellSelectedItems` | 3 | Throws for empty input; sells specified items by ID; throws when no matching items found |
| `sellAllExceptItems` | 4 | Throws for non-array keepIds; excludes specified items; sells all when keepIds empty |
| `sellUpToAmount` | 2 | Throws for invalid amount; accumulates items up to max gold amount |
| `getPendingSaleItems` | 1 | Queries items with "Pending Sale" status |
| `getSaleHistory` | 2 | Returns paginated history; applies date filters with defaults |

---

### `backend/src/services/__tests__/goldDistributionService.test.js` — 11 tests

Tests gold distribution among party members.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `getActiveCharacters` | 2 | Returns active characters; throws `ValidationError` when none exist |
| `getCurrentTotals` | 2 | Returns parsed currency totals; defaults null DB values to 0 |
| `calculateDistribution` (pure) | 4 | Divides evenly among characters; floors fractional amounts; adds party share when enabled; throws when nothing to distribute |
| `validateDistribution` (pure) | 3 | Passes for valid distribution; throws for insufficient funds; allows exact zero balance |
| `createDistributionEntries` | 1 | Creates negative gold entries for each character |
| `executeDistribution` | 2 | Orchestrates full distribution flow; includes party share message when enabled |

---

## Phase 3: Game Feature Tests (Pathfinder 1e Mechanics)

### `backend/src/models/__tests__/City.test.js` — 22 tests

Tests settlement/city model with PF1e settlement size mechanics.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `getSettlementSizes` (pure) | 4 | Returns all 6 sizes (Thorp→Metropolis); validates base values (50→16000), purchase limits (500→100000), max spell levels (1→9), population ranges |
| `getValidSizes` (pure) | 1 | Returns array of valid size name strings |
| `getAll` | 1 | Returns all cities ordered by name |
| `findById` | 2 | Returns city when found; returns null when not found |
| `findByName` | 1 | Case-insensitive name search via ILIKE |
| `search` | 1 | Partial match with limit 10 |
| `create` | 3 | Creates with auto-populated settlement-size values; throws for invalid size; handles optional fields |
| `update` | 3 | Updates and recalculates size-based values; throws for invalid size; returns null when not found |
| `delete` | 2 | Returns true on success; false when not found |
| `getOrCreate` | 2 | Returns existing city by name; creates new when not found |

**PF1e Settlement Size Reference (tested values):**

| Size | Base Value | Purchase Limit | Max Spell Level |
|------|-----------|----------------|-----------------|
| Thorp | 50 gp | 500 gp | 1 |
| Hamlet | 200 gp | 1,000 gp | 2 |
| Village | 500 gp | 2,500 gp | 3 |
| Small Town | 1,000 gp | 5,000 gp | 4 |
| Large Town | 2,000 gp | 10,000 gp | 5 |
| Small City | 4,000 gp | 25,000 gp | 6 |
| Large City | 8,000 gp | 50,000 gp | 7 |
| Metropolis | 16,000 gp | 100,000 gp | 8 |

---

### `backend/src/models/__tests__/ItemSearch.test.js` — 35 tests

Tests item availability search with PF1e availability calculation.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `calculateAvailability` (pure) | 30 | Tests full tier system from 95% (at base value) down to 0% (above 5x base value), including all boundary transitions |
| `create` | 2 | Inserts search record; defaults optional fields to null |
| `getAll` | 3 | Returns all searches; applies city_id filter; applies limit |
| `findById` | 2 | Returns search with joined city/item details; returns null when not found |
| `delete` | 2 | Returns true/false based on deletion success |

**PF1e Availability Tiers (tested thresholds):**

| Item Value vs Base Value | Availability % |
|--------------------------|---------------|
| ≤ base value | 95% |
| ≤ 1.25× base value | 75% |
| ≤ 1.5× base value | 60% |
| ≤ 2× base value | 40% |
| ≤ 3× base value | 20% |
| ≤ 4× base value | 10% |
| ≤ 5× base value | 2% |
| > 5× base value | 0% |

---

### `backend/src/models/__tests__/SpellcastingService.test.js` — 22 tests

Tests spellcasting service model with PF1e spell cost and availability rules.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `calculateCost` (pure) | 9 | `spell_level × caster_level × 10 gp` formula; 0-level special: `max(10, caster_level × 5)`; minimum caster levels tested |
| `isSpellAvailable` (pure) | 10 | Standard availability by spell level vs city max; Village special case (maxSpellLevel 3 but only 5% for 1st-level); 9th-level always 1% even in Metropolis |
| `create` | 2 | Auto-calculates cost on insert; correct cost for 0-level spells |
| `getAll` / `findById` / `delete` | 6 | Standard CRUD with filter support |

**PF1e Spell Cost Examples (tested):**

| Spell Level | Caster Level | Expected Cost |
|-------------|-------------|---------------|
| 0 | 1 | 10 gp (minimum) |
| 0 | 5 | 25 gp (CL × 5) |
| 1 | 1 | 10 gp |
| 3 | 5 | 150 gp |
| 5 | 9 | 450 gp |
| 9 | 17 | 1,530 gp |

---

### `backend/src/models/__tests__/Ship.test.js` — 25 tests

Tests ship model for Skulls & Shackles campaign.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `getShipDamageStatus` (pure) | 8 | HP% tiers: Pristine (100%), Minor (75-99%), Moderate (50-74%), Heavy (25-49%), Critical (1-24%), Destroyed (0%), Unknown (missing data) |
| `getValidStatuses` (pure) | 1 | Returns valid ship status array |
| `getAllWithCrewCount` | 1 | Joins crew count; parses JSON fields |
| `getWithCrew` | 2 | Returns ship with crew array; null when not found |
| Weapon format parsing | 4 | Parses new JSON format, legacy `{name:qty}` format, null weapons, malformed JSON |
| JSON field parsing | 2 | Parses string JSON fields; passes through pre-parsed objects |
| `create` | 2 | Creates with defaults; serializes weapon_types to JSON |
| `applyDamage` / `repairShip` | 3 | Reduces HP with `GREATEST(0, ...)` floor; increases with `LEAST(max_hp, ...)` cap; returns null if not found |
| `delete` | 2 | Returns true/false based on rowCount |

**Ship Damage Status Tiers (tested):**

| HP Percentage | Status |
|--------------|--------|
| 100% | Pristine |
| 75-99% | Minor Damage |
| 50-74% | Moderate Damage |
| 25-49% | Heavy Damage |
| 1-24% | Critical Damage |
| 0% | Destroyed |

---

## Phase 4: Remaining Model Tests

### `backend/src/models/__tests__/Crew.test.js` — 16 tests

Tests crew member management.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `getAllWithLocation` | 1 | Returns living crew with ship/outpost names via LEFT JOINs |
| `getByLocation` | 2 | Filters by location type (ship/outpost) and ID; orders by ship_position |
| `getDeceased` | 1 | Returns crew where `is_alive = false` |
| `create` | 3 | Creates with ship position; nullifies `ship_position` when location is outpost; defaults optional fields |
| `update` | 2 | Clears `ship_position` when moving to outpost; returns null when not found |
| `markDead` | 2 | Sets `is_alive = false` with death date; returns null when not found |
| `markDeparted` | 1 | Sets departure date and reason |
| `moveToLocation` | 2 | Sets ship position when moving to ship; clears it when moving to outpost |
| `findById` / `delete` | 4 | Standard find/delete with null/boolean returns |

---

### `backend/src/models/__tests__/Outpost.test.js` — 10 tests

Tests outpost/base management.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `getAllWithCrewCount` | 1 | Returns outposts with crew count via LEFT JOIN and GROUP BY |
| `getWithCrew` | 2 | Returns outpost with attached crew array; null when not found |
| `create` | 2 | Creates with provided data; defaults optional fields to null |
| `update` | 2 | Returns updated outpost; returns null when not found |
| `findById` / `delete` | 3 | Standard find/delete operations |

---

### `backend/src/models/__tests__/Session.test.js` — 9 tests

Tests game session scheduling and attendance tracking.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `getUpcomingSessions` | 2 | Returns future sessions with default limit 10; accepts custom limit |
| `getSessionWithAttendance` | 3 | Returns session with attendance grouped by status (accepted/declined/tentative); returns null when not found; handles empty attendance |
| `updateAttendance` | 1 | Upserts attendance via `INSERT ... ON CONFLICT DO UPDATE` |
| `createSession` | 1 | Creates session within a database transaction |
| `updateDiscordMessage` | 1 | Updates discord_message_id and discord_channel_id columns |
| `findSessionsNeedingNotifications` | 1 | Queries scheduled sessions without Discord messages |

---

### `backend/src/models/__tests__/Appraisal.test.js` — 8 tests

Tests item appraisal system.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `create` | 3 | Creates with valid data; throws when `characterid` missing; throws when `lootid` missing |
| `getByLootId` | 1 | Returns appraisals joined with character names |
| `getAverageByLootId` | 3 | Returns parsed average value; returns null when no appraisals; returns null for empty result set |
| `updateValue` | 1 | Updates `believed_value` by appraisal ID |

---

### `backend/src/models/__tests__/Sold.test.js` — 8 tests

Tests sold item history tracking.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `findAll` | 1 | Returns sold records grouped/summarized by date |
| `findDetailsByDate` | 2 | Returns individual items sold on a specific date; throws when date is missing |
| `getTotalsByPeriod` | 5 | Uses correct PostgreSQL date format for each period: day (`YYYY-MM-DD`), week (`IYYY-IW`), month (`YYYY-MM`), year (`YYYY`); defaults to day for unknown period |

---

## Phase 5: Key Service Tests

### `backend/src/services/__tests__/calculateFinalValue.test.js` — 22 tests

Tests PF1e item value calculation with size multipliers, masterwork bonuses, enhancement values, and special item handling.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| Basic value | 2 | Returns base value as number; handles string input |
| Size multipliers | 5 | 2× Large weapon, 0.5× Tiny weapon, 4× Huge armor, no multiplier for non-weapon/armor, default Medium |
| Masterwork bonus | 3 | +300 gp for masterwork weapon, +150 gp for masterwork armor, none for other types |
| Enhancement plus | 5 | +1 weapon = 2,000 gp, +3 armor = 9,000 gp, sums plus from multiple mods, +5 weapon = 50,000 gp |
| Ammunition | 1 | Enhancement value divided by 50 for ammunition |
| Wand charges | 3 | Multiplies value by charge count; doesn't apply for non-wands; doesn't apply when charges null |
| Mod valuecalc | 3 | Evaluates `valuecalc` expressions from mods; supports `item.wgt` replacement; handles null mods |
| Error handling | 2 | Returns original value on calculation error; handles null itemWeight |

**PF1e Enhancement Plus Value Table (tested):**

| Plus | Weapon Cost | Armor Cost |
|------|------------|------------|
| +1 | 2,000 gp | 1,000 gp |
| +2 | 8,000 gp | 4,000 gp |
| +3 | 18,000 gp | 9,000 gp |
| +4 | 32,000 gp | 16,000 gp |
| +5 | 50,000 gp | 25,000 gp |

---

### `backend/src/services/__tests__/validationService.test.js` — 40 tests

Tests comprehensive input validation service.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `requireDM` | 2 | Passes for DM role; throws `AuthorizationError` for others |
| `validateItems` | 2 | Returns valid array; throws for null/empty/non-array |
| `validateRequiredString` | 2 | Returns trimmed string; throws for empty/null/non-string |
| `validateRequiredNumber` | 5 | Parses from string; enforces min/max; allows zero by default; rejects zero when `allowZero: false` |
| `validateOptionalNumber` | 2 | Returns null for empty/null/undefined; validates when present |
| `validateQuantity` | 1 | Accepts positive integers; rejects zero and negative |
| `validateLootStatus` | 2 | Accepts valid statuses (Pending Sale, Kept Self, etc.); rejects invalid |
| `validateAppraisalRoll` | 2 | Accepts 1-20 range; rejects out of range |
| `validateEmail` | 2 | Validates format and lowercases; rejects invalid format |
| `validateBoolean` | 4 | Returns boolean values directly; parses strings ("true"/"false"/"1"/"0"); defaults null/undefined to false; converts numbers |
| `validateDate` | 4 | Returns parsed date string; throws for required missing; returns null for optional missing; throws for invalid format |
| `sanitizeHtml` | 2 | Escapes `<>&"'` characters; handles null/non-string |
| `validateDescription` | 4 | Returns sanitized trimmed string; enforces maxLength (500); returns null for optional empty; throws for required empty |
| `validatePagination` | 4 | Returns defaults (page=1, limit=20); clamps page minimum to 1; limit 0 falls back to default 20 (falsy); limit capped at 100; calculates correct offset |

---

### `backend/src/services/__tests__/searchService.test.js` — 19 tests

Tests loot search/filter query builder.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `buildItemIdCondition` (pure) | 4 | `"null"` → `IS NULL`, `"notnull"` → `IS NOT NULL`, numeric → parameterized `= $N`, undefined → null |
| `buildModIdCondition` (pure) | 3 | Same null/notnull/undefined pattern for mod IDs |
| `buildValueConditions` (pure) | 5 | Handles null/notnull value filter, min_value, max_value, and combined min+max |
| `buildSearchConditions` (pure) | 6 | Builds ILIKE text search, status, type, character_id conditions; handles boolean filters (`unidentified`, `masterwork`); combines multiple; returns empty for no filters |
| `buildSearchQuery` (pure) | 2 | Builds complete query with WHERE/LIMIT/OFFSET; omits WHERE when no conditions |
| `executeSearch` | 1 | Returns `{ items, total }` from query results |

---

### `backend/src/services/__tests__/appraisalService.test.js` — 11 tests

Tests appraisal calculation with randomized rounding algorithm.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `customRounding` (pure) | 2 | Always returns a number (50 iterations); returns value in reasonable range of input (50 iterations) |
| `calculateBelievedValue` (pure) | 3 | Returns exact value for roll ≥ 20; always returns a number (20 iterations); handles zero actual value |
| `fetchAndProcessAppraisals` | 3 | Returns appraisals with calculated average; returns null average when none exist; handles errors gracefully (returns empty array) |
| `createAppraisal` | 1 | Inserts appraisal record via model |
| `getCharacterAppraisalBonus` | 3 | Returns bonus from DB; returns 0 when character not found; returns 0 when bonus is null |
| `hasCharacterAppraised` | 2 | Returns true when appraisal exists; false when it doesn't |

---

## Phase 6: Utilities & Middleware Tests

### `backend/src/utils/__tests__/apiResponse.test.js` — 10 tests

Tests API response formatting utilities.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `success` | 2 | Default: status 200, `success: true`, message "Operation successful"; custom: accepts data, message, and status code |
| `error` | 2 | Default: status 500, `success: false`, message "An error occurred"; custom: accepts message, status, and error details |
| `validationError` | 4 | String → `{ general: ['message'] }`; Array → `{ general: [...] }`; Object → passed through; empty array → message "Validation error" |
| `send` | 1 | Calls `res.status(code).json(body)` |

---

### `backend/src/utils/__tests__/ServiceResult.test.js` — 19 tests

Tests service result wrapper for standardized business logic responses.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `success` | 2 | Creates with data/message; defaults to null data/message |
| `failure` | 2 | Creates with error code and original error; defaults to `UNKNOWN_ERROR` |
| `validationError` | 1 | Sets `VALIDATION_ERROR` code with field-level errors |
| `notFound` | 2 | `"Session not found: 42"` with identifier; `"User not found"` without |
| `unauthorized` | 2 | Custom message; default "Unauthorized" |
| `wrap` | 2 | Wraps resolved promise → success; rejected promise → failure |
| `isSuccess` / `isFailure` | 4 | Boolean checks; handles null/undefined gracefully |
| `toHttpResponse` | 5 | Maps: success→200, VALIDATION_ERROR→400, NOT_FOUND→404, UNAUTHORIZED→401, UNKNOWN_ERROR→500 |

---

### `backend/src/middleware/__tests__/apiResponseMiddleware.test.js` — 8 tests

Tests Express response enhancement middleware.

| Test | Expected Behavior |
|------|-------------------|
| Call next() | Middleware passes to next handler |
| `res.success(data, message)` | Status 200, `{ success: true, data }` |
| `res.created(data, message)` | Status 201 |
| `res.error(message, code)` | Status 500, `{ success: false, message }` |
| `res.validationError(message)` | Status 400 |
| `res.notFound(message)` | Status 404 |
| `res.unauthorized(message)` | Status 401 |
| `res.forbidden(message)` | Status 403 |

---

### `backend/src/utils/__tests__/timezoneUtils.test.js` — 12 tests

Tests timezone validation and caching.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `VALID_TIMEZONES` | 2 | Includes US timezones (America/New_York, Chicago, Denver, Los_Angeles); includes UTC |
| `isValidTimezone` | 4 | Accepts whitelisted timezones; accepts valid IANA not in whitelist (Europe/London); rejects invalid; rejects null/undefined/non-string |
| `getTimezoneOptions` | 2 | Returns `{ value, label }` objects; Eastern Time option exists |
| `getCampaignTimezone` | 5 | Returns from DB; defaults to America/New_York when not found; defaults for invalid timezone; caches result (single DB call); defaults on DB error |
| `clearTimezoneCache` | 1 | Forces re-fetch (2 DB calls after clear) |

---

### `backend/src/utils/__tests__/rateLimiter.test.js` — 8 tests

Tests sliding-window rate limiter.

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| Constructor | 2 | Defaults: 45 requests, 1000ms window; accepts custom values |
| `acquire` | 3 | Allows requests under limit; tracks timestamps; cleans up expired requests after window |
| `wrap` | 2 | Creates rate-limited function that passes arguments/return values; passes through errors |
| Memory safety | 1 | Trims tracked requests array when it exceeds `MAX_TRACKED_REQUESTS` |

---

## Pre-existing Tests (backend/tests/ directory)

### `backend/tests/middleware/auth.test.js` — 19 tests

Extended auth middleware tests with additional edge cases.

| Area | Tests |
|------|-------|
| Token Validation | 3 (header, cookie, header preference) |
| Token Errors | 5 (no token, invalid, expired, malformed header, generic) |
| User Context | 3 (attach user, handle minimal payload) |
| Edge Cases | 4 (empty header, Bearer without token, empty/null cookies) |
| Security | 3 (don't leak internals, log failures) |

### `backend/tests/models/BaseModel.test.js` — 18 tests

Tests abstract BaseModel class.

| Area | Tests |
|------|-------|
| `findAll` / `findById` | 4 |
| `create` / `update` / `delete` | 7 |
| `exists` / `query` / `transaction` | 5 |
| Constructor | 2 |

### `backend/tests/controllers/authController.test.js` — 15 tests

Tests authentication controller endpoints.

| Area | Tests |
|------|-------|
| `loginUser` | 3 (valid, invalid username, wrong password) |
| `registerUser` | 2 (success, duplicate username) |
| `getUserStatus` / `logoutUser` | 2 |
| `checkForDm` | 2 (exists, none) |
| `generateQuickInvite` | 2 (DM allowed, player rejected) |
| `forgotPassword` / `resetPassword` | 3 |

### `backend/tests/integration/lootManagement.test.js` — 4 tests
### `backend/tests/api/auth.test.js` — 2 tests

Basic integration and API route smoke tests.

---

### `backend/src/utils/__tests__/saleValueCalculator.test.js` — 27 tests

Tests item sale value calculation (pre-existing).

| Area | Tests | Expected Behavior |
|------|-------|-------------------|
| `calculateItemSaleValue` | 12 | Half value for regular items; full value for trade goods; handles null/undefined/string/decimal/zero/negative values; floating point precision |
| `calculateTotalSaleValue` | 13 | Handles null/empty/non-array inputs; single/multiple items; missing/string/invalid quantities; mixed trade goods; large quantities; complex scenarios |
| Error handling | 2 | Graceful exception handling |

---

## Coverage Summary by Domain

| Domain | Files Tested | Total Tests | Key Concerns |
|--------|-------------|-------------|--------------|
| **Security** | auth, checkRole, CSRF | ~37 | JWT extraction, role checks, token management |
| **Validation** | validation middleware, validationService | ~89 | Input sanitization, type coercion, bounds checking |
| **Models** | 11 models | ~148 | CRUD operations, legacy column mapping, transactions |
| **Game Mechanics** | City, ItemSearch, SpellcastingService, Ship, calculateFinalValue | ~126 | PF1e rules accuracy, settlement sizes, item availability, spell costs, damage tiers |
| **Business Logic** | salesService, goldDistribution, appraisalService, searchService | ~70 | Sale workflows, gold distribution, search query building |
| **Utilities** | apiResponse, ServiceResult, rateLimiter, timezoneUtils, saleValueCalculator, controllerFactory | ~95 | Response formatting, rate limiting, timezone caching |
| **Frontend** | api utility | 8 | CSRF token handling, axios configuration |
