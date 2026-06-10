# Phase 2 Testing Checklist

Build under test: `feature/multi-campaign` @ `bb248ad` (or later) — v0.12.2-dev.5+

## 1. Test 2a (deployed normally — RLS is dormant, this is a regression pass)

Startup:
- [x] Logs show `045_enable_rls.sql` applied successfully, server starts (verified 2026-06-10 04:05 UTC, 99ms)
- [x] Logs show `Database pool using owner credentials (RLS not enforced)` — expected for 2a
- [x] (bonus) `Admin database pool created (owner credentials, migration runner only)` — migration runner used its dedicated owner pool; scheduler/outbox/broker all started clean through the new dbUtils wrapper

App regression (everything should behave exactly as before):
- [x] Login, page loads, loot entry insert, gold transaction
- [x] Create a **regular** session
- [x] Create a **recurring** session (overnight times should auto-roll end to next day now)
  - [x] `SELECT * FROM session_reminders WHERE session_id = <new instance id>;` → 3 rows
- [ ] Weather: advance the Golarion date a day or two (exercises the rebuilt weather PK)
  - FOUND + FIXED (next build): setting a date backwards/same-day generated no
    weather — generation only ever ran forward from the old date (pre-existing).
    Retest: SET the date back a few days → current day + forecast get weather.
- [ ] Calendar notes save; Infamy page loads
  - FOUND + FIXED (next build): `Failed to fetch dynamically imported module`
    was a stale cached index.html — the server cached it for a DAY, so every
    deploy broke lazy-loaded pages until a hard refresh. index.html is now
    no-cache (pre-existing; this also caused tonight's earlier stale-bundle
    confusion). One LAST hard refresh needed after the next deploy; after
    that, plain reloads pick up new builds.
- [x] **Register a brand-new user** (invite flow) → got campaign 1 membership row
  - DESIGN DECISION (recorded for Phase 3): general registration should create
    just a user with NO campaign membership; only campaign-scoped invites grant
    membership. Current auto-assign-campaign-1 stays as a stopgap until the
    Phase 3 invite overhaul (nothing reads memberships yet).
- [ ] Snackbars now visible (announce/cancel/etc. show toasts)
  - FOUND + FIXED (next build): "remind failed" toast while Discord posted fine —
    recordReminder inserted the audience value into reminder_type, violating its
    CHECK constraint AFTER the Discord post (pre-existing, previously invisible
    because snackbars never rendered). Retest: remind → success toast, and
    `SELECT reminder_type, is_manual, target_audience FROM session_reminders
    ORDER BY id DESC LIMIT 1;` → 'manual', true, your chosen audience.

## 2. Flip to 2b (enforcement)

1. Edit `database/setup_app_role.sql` — replace `CHANGE_ME` with a real password
   (and optionally rename the `loot_app` role)
2. Run it **as the owner user** (the normal DB_USER):
   ```bash
   docker exec -i test-database psql -U loot_user -d loot_tracking < database/setup_app_role.sql
   ```
3. Add to the app container env:
   ```
   DB_APP_USER=loot_app
   DB_APP_PASSWORD=<the password>
   ```
4. Restart the app container.

**Rollback if anything breaks:** remove the two env vars, restart. Instant revert to owner mode.

## 3. Test 2b (RLS now enforced)

Startup:
- [x] Logs show `Database pool using dedicated app role: loot_app` (verified 2026-06-10 14:22 UTC)
- [x] Migrations still run fine on restart (verified same boot: admin pool created with
  owner credentials, migration check completed, "No pending migrations")

Leak test — the server has no Node and the DB port isn't exposed, so run it
INSIDE the app container (env is already set there). The script isn't in the
dev.5 image (Dockerfile fixed for future builds), so copy it in from the
worktree first. From the `source` dir on the server:
```bash
docker cp ../worktrees/feature-multi-campaign/backend/scripts/rls-leak-test.js pathfinder-test:/app/backend/rls-leak-test.js
docker exec -w /app/backend pathfinder-test node rls-leak-test.js
docker exec pathfinder-test rm /app/backend/rls-leak-test.js
```
(From dev.6+ images it's baked in: `docker exec -w /app/backend pathfinder-test node scripts/rls-leak-test.js`)
- [ ] All checks PASS (it aborts with a warning if accidentally run as owner)

Full app regression under enforcement — same list as section 1, plus:
- [ ] Loot pages (loot_view — security_invoker view through RLS)
- [ ] Gold totals/overview (gold_totals_view)
- [ ] Sessions page upcoming list (upcoming_sessions view)
- [ ] Attendance summary / Discord reaction flow (session_attendance_summary + background services)
- [ ] Let the scheduler run ≥15 min — no errors in logs (background jobs default to campaign 1)
- [ ] Discord outbox sends a message successfully
- [ ] Item search / spellcasting (City Services), Loot generator, Spellbook generator
- [ ] Watch logs for any `0 rows` weirdness or `current_setting`/policy errors

If 2b regression passes: prod can take the same build + flip whenever convenient,
and Phase 3 (campaign middleware + invite overhaul) is unblocked.

## Notes
- 2a vs 2b difference is ONLY the env vars — same image
- Before deploying this branch to **prod**, run the singleton sanity check on each prod DB:
  `SELECT (SELECT COUNT(*) FROM golarion_current_date) AS a, (SELECT COUNT(*) FROM ship_infamy) AS b;` → both ≤ 1
- DST fix on sns still pending before any data merge (Phase 6, not relevant yet)
