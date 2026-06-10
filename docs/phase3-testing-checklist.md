# Phase 3 Testing Checklist (3a campaign middleware + 3b invite overhaul)

Build under test: `feature/multi-campaign` @ `ca96eb4` (or later) — dev.6+
This build ALSO carries earlier unretested fixes — section 0 covers those.
Reminder: one final **hard refresh (Ctrl+Shift+R)** after deploying this build
(last one ever needed — index.html is no-cache from this build onward).

## 0. Carry-over retests (fixed earlier, first build containing them)

- [x] Migrations 046 applies cleanly at startup (`registration_mode` seeded)
- [x] Weather: SET the Golarion date BACK a few days → current day + forecast get weather - works, but requires refresh of page to see 
- [x] Session remind → success snackbar (not "failed"), and:
  ```sql
  SELECT reminder_type, is_manual, target_audience FROM session_reminders ORDER BY id DESC LIMIT 1;
  ```
  → 'manual', true, your chosen audience
- [x] Infamy page loads (no dynamic-import error after the hard refresh)
- [x] Gold withdrawal works from BOTH pages: Gold Transactions form AND Loot Entry gold tab
- [ ] Leak test now baked into the image: `docker exec -w /app/backend pathfinder-test node scripts/rls-leak-test.js` → 15/15 PASS root@DrMoon[...cscrewdriver/config/pathfinder/source]# docker exec -w /app/backend pathfinder-test node scripts/rls-leak-test.js
node:internal/modules/cjs/loader:1478
  throw err;
  ^

Error: Cannot find module '/app/backend/scripts/rls-leak-test.js'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1475:15)
    at wrapResolveFilename (node:internal/modules/cjs/loader:1048:27)
    at defaultResolveImplForCJSLoading (node:internal/modules/cjs/loader:1072:10)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1093:12)
    at Module._load (node:internal/modules/cjs/loader:1261:25)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
    at node:internal/main/run_main_module:33:47 {
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}

Node.js v25.9.0


## 1. Phase 3a — campaign middleware (should be invisible)

Everything behaves exactly as before — the middleware resolves campaign 1 for everyone:
- [x] Login, pages load, loot/gold/sessions all normal (no header sent by the frontend yet)
- [x] DM-only actions still work for the DM account (per-campaign role comes from user_campaign now)
- [x] Player account still blocked from DM pages/actions
- [ ] Campaigns API works (browser devtools or curl with your cookie):
  - `GET /api/campaigns` → your one campaign with your role
  - `GET /api/campaigns/current` → campaignId 1, your role, isSuperadmin false
- [ ] Negative test: send a bogus header — in devtools console on any page:
  ```js
  fetch('/api/campaigns/current', {headers: {'X-Campaign-Id': '999'}, credentials: 'include'}).then(r => r.status)
  ```
  → **403** (not a member). `'abc'` → **400**.

Optional superadmin setup (needed for in-app campaign creation later):
```sql
UPDATE users SET is_superadmin = TRUE WHERE username = '<your account>';
```
- [ ] After setting it: `GET /api/campaigns/current` → isSuperadmin true; header `999` now returns 200 (superadmin override) — both expected

## 2. Phase 3b — invite system

Settings UI:
- [ ] DM Settings shows ONE "Registration" dropdown (Open / Invite only / Closed) — old two toggles gone
- [ ] Current value reflects your old settings (closed registrations map to **Invite only**)
- [ ] Changing it persists across reload

Invite generation (User Management tab):
- [ ] Quick Invite → 8-char code displayed prominently, copy button works
- [ ] Custom invite with N hours → listed with correct expiry
- [ ] Custom invite "never expires" → listed as Never
- [ ] Active invite list shows code / creator / created / expires
- [ ] Deactivate (with confirmation) removes it from the list

Registration modes (use private/incognito windows):
- [ ] Mode **Closed** → register page shows "registration closed", no form
- [ ] Mode **Invite only** → invite field required; submitting garbage code → clear error; THE ORIGINAL BUG: registration without a code must be impossible
- [ ] Mode **Invite only** + valid code → account created, lands in campaign 1 as Player:
  ```sql
  SELECT u.username, uc.campaign_id, uc.role FROM users u
  LEFT JOIN user_campaign uc ON uc.user_id = u.id ORDER BY u.id DESC LIMIT 1;
  ```
- [ ] Used code cannot be redeemed a second time
- [ ] Invite marked used: `SELECT code, is_used, used_by, used_at FROM invites ORDER BY id DESC LIMIT 3;`
- [ ] Mode **Open**, no code → account created with NO membership row (campaign_id NULL in the query above) — new intended behavior
- [ ] Mode **Open** + valid code → account created WITH membership (invited users land in their campaign even when open)
- [ ] Old endpoints gone: `fetch('/api/auth/active-invites').then(r=>r.status)` → 404

## 3. Quick regression (services touched by 3a/3b)

- [ ] Scheduler runs clean ≥15 min (background jobs still default to campaign 1 — 3c work pending)
- [ ] A Discord announce/outbox message goes through
- [ ] Logs: no 'Invalid campaign id', policy, or current_setting errors during the whole session

## Notes
- A user registered in Open mode (no membership) still resolves to campaign 1 via the
  transition fallback, so they can use the app — membership becomes load-bearing in Phase 4.
- 3c (background-job cross-campaign mode + GUC column defaults) is NOT in this build's scope.
- Prod is untouched by all of this until the branch merges + role flip is run there.
