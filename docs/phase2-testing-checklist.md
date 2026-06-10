# Phase 2 Testing Checklist

Build under test: `feature/multi-campaign` @ `bb248ad` (or later) — v0.12.2-dev.5+

## 1. Test 2a (deployed normally — RLS is dormant, this is a regression pass)

Startup:
- [ ] Logs show `045_enable_rls.sql` applied successfully, server starts
- [ ] Logs show `Database pool using owner credentials (RLS not enforced)` — expected for 2a

App regression (everything should behave exactly as before):
- [ ] Login, page loads, loot entry insert, gold transaction
- [ ] Create a **regular** session
- [ ] Create a **recurring** session (overnight times should auto-roll end to next day now)
  - [ ] `SELECT * FROM session_reminders WHERE session_id = <new instance id>;` → 3 rows
- [ ] Weather: advance the Golarion date a day or two (exercises the rebuilt weather PK)
- [ ] Calendar notes save; Infamy page loads
- [ ] **Register a brand-new user** (invite flow), then:
  ```sql
  SELECT * FROM user_campaign ORDER BY joined_at DESC LIMIT 3;
  ```
  → new user has a campaign 1 membership row
- [ ] Snackbars now visible (announce/cancel/etc. show toasts — new since SnackbarProvider fix)

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
- [ ] Logs show `Database pool using dedicated app role: loot_app`
- [ ] Migrations still run fine on restart (they use the owner credentials — restart twice to prove it)

Leak test (from the dev machine or anywhere with node + env set):
```bash
cd backend && node scripts/rls-leak-test.js
```
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
