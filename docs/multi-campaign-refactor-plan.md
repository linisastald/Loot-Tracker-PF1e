ok# Multi-Campaign Refactor — Planning Doc

> Status: **in progress on `feature/multi-campaign`.** Goal is to move from "one
> Docker instance + one PostgreSQL database per campaign" to a **single instance
> that serves many campaigns**, with shared reference data, one login per person,
> and the ability for a DM to create a new campaign in-app.
>
> Progress: service-layer chokepoint refactor DONE (commit 90c3cc2 — all 7
> session/Discord services now go through dbUtils). Phase 1 schema foundation
> in progress (migration 044). See Appendix A for the authoritative table
> classification.

## 1. Goals (from decisions made)

1. **Ops simplicity** — one app + one database to deploy, update, back up.
2. **Truly shared data + one login** — a single `item`/`mod`/`spells` library and
   a single user account across campaigns (not duplicated per deployment).
3. **Cross-campaign features / scale** — host many campaigns; support features
   that span them (a user's characters everywhere, global admin, analytics).
4. **Easy onboarding** — a DM can spin up a new campaign in-app, no infra work.
5. **One login, role per campaign** — a person can be DM in one campaign and a
   Player in another. (Replaces today's single global `users.role`.)

### Non-goals (for now)
- Per-campaign custom forks of reference data editing UX (we'll allow a simple
  global-vs-campaign override, see §4.4, but not a full content-management system).
- Multi-region/sharded databases. One Postgres is fine at this scale.

## 2. Why `campaign_id` + RLS (Option C), not schema-per-tenant (Option B)

Goals #3 and #4 are the deciders.

| Concern | Schema-per-tenant (B) | **campaign_id + RLS (C)** |
|---|---|---|
| Create a new campaign in-app | `CREATE SCHEMA` + replay **all** migrations into it at runtime | **`INSERT INTO campaigns`** — instant, trivial |
| Future migrations | Must loop every campaign schema (unbounded, grows with onboarding) | Run **once** against shared tables |
| Cross-campaign queries (a user's stuff everywhere, admin, analytics) | Hard — must UNION across schemas | **Natural** — one table, drop the campaign filter |
| Query rewrites in this codebase | Minimal (search_path) | **Minimal too, via RLS** — see below |
| Reference data + one login | Shared in `public` schema | Shared tables, `campaign_id` nullable for globals |
| Isolation | Strong (separate schemas) | Strong (DB-enforced by RLS policies) |
| Blast radius | One DB (shared) | One DB (shared) — same |

**The objection to C was "rewrite every query to add `WHERE campaign_id`."**
Row-level security removes that: a Postgres **policy** filters every
`SELECT/UPDATE/DELETE` automatically based on a per-connection session variable,
*whether or not the query has a WHERE clause*. So the ~52 controllers of raw SQL
mostly **don't change**. `SELECT SUM(platinum) FROM gold` becomes campaign-scoped
for free. That is the property that makes C cheap **here**, given everything
already funnels through `dbUtils`.

Schema-per-tenant remains a reasonable fallback if we decide DMs will **not**
self-serve campaign creation and the campaign count stays small. But given the
stated goals, C wins.

## 2.5 Separate physical databases per campaign — considered & rejected

A natural idea: a shared "control-plane" database (login, users, campaigns,
reference catalog) + one database **per campaign** for its game data.

**Why it was rejected:** PostgreSQL has **no native cross-database queries**
(unlike MySQL). Bridging databases requires `postgres_fdw` foreign tables or
app-side stitching, and both carry real costs:
- **No foreign keys across databases** (lose `loot.itemid → item.id` integrity).
- **No atomic transactions** spanning the shared + campaign DB.
- Weaker planner / data pulled over the link for big joins; per-DB FDW setup that
  must track shared-schema changes.

**Where it bites this app:** `loot_view` joins `loot → item → mod` on every loot
page (catalog ~7,700 rows). With the catalog in the shared DB and `loot` in a
campaign DB, that core join is cross-database constantly — the worst place for the
boundary. The only way to keep it pleasant is to **co-locate the catalog inside
each campaign DB** (duplicating reference data + a sync job), which undercuts the
"single shared library" goal.

**Decision input:** the stated appeal of separate DBs was *clean logical
separation only* — not backup/blast-radius isolation or per-campaign portability.
A single database with schemas (B) or `campaign_id`+RLS (C) already provides that
separation **without** the cross-DB tax (cross-schema/same-table joins keep FKs,
atomic transactions, and full planner support). So separate physical databases are
out. If backup isolation or handing off one campaign's DB ever becomes a hard
requirement, revisit — that's the one thing only physical separation buys.

## 2.6 Final model choice: C, with B as the small-scale fallback

Two single-database options remain. They trade *data-model tidiness* against the
*onboarding/scale goals*:

- **B (schema-per-tenant)** matches the "shared bucket + per-campaign bucket"
  mental model most literally and is easiest to eyeball/export one campaign. But
  in-app onboarding = `CREATE SCHEMA` + replay all migrations at runtime; the
  migration runner loops an ever-growing schema set; cross-campaign queries need
  UNIONs. It fights goals #3 and #4.
- **C (`campaign_id` + RLS)** makes a new campaign a single `INSERT`, cross-campaign
  queries trivial, and scales to hundreds. The "feels less separated" worry is
  largely neutralized by RLS: `campaign_id` is set once in `dbUtils` and enforced
  by policies, so everyday queries never mention it — set-and-forget infrastructure
  rather than churn across 52 controllers.

**Chosen: C.** It is the only option that satisfies all four goals (especially DM
self-service + cross-campaign features), and RLS keeps day-to-day code about as
clean as schema-per-tenant. Pick **B instead only if** the campaign set will stay
small and DM-controlled and cross-campaign features are dropped — then its
tidiness wins and the RLS machinery is avoidable.

## 3. Target architecture (Option C)

### 3.1 New tables
```
campaigns(
  id, name, slug UNIQUE, world (e.g. 'Golarion'),
  created_by -> users.id, created_at, is_active
)

user_campaign(            -- membership + per-campaign role
  user_id -> users.id,
  campaign_id -> campaigns.id,
  role,                   -- 'DM' | 'Player'  (per campaign)
  joined_at,
  PRIMARY KEY (user_id, campaign_id)
)
```
`users` stays global; its global `role` column is **deprecated** in favor of
`user_campaign.role`. (Keep the column for one transitional release, then drop.)

### 3.2 Tenant column on campaign-specific tables
Add `campaign_id INTEGER NOT NULL REFERENCES campaigns(id)` to the ~24
campaign-specific tables (loot, gold, characters, appraisal, sold,
consumableuse, identify, ships, outposts, crew, fame, fame_history,
ship_infamy, infamy_history, favored_ports, port_visits, game_sessions,
session_attendance, golarion_current_date, golarion_calendar_notes,
golarion_notes, golarion_weather, invites, …).

- Give it a **default sourced from the session GUC** so inserts don't have to
  pass it explicitly:
  `campaign_id INTEGER NOT NULL DEFAULT current_setting('app.current_campaign', true)::int`
  (the two-arg `missing_ok` form: an unset GUC yields NULL and fails cleanly on
  NOT NULL instead of erroring inside the default expression. During Phase 1 the
  default is a literal `1` so single-campaign deployments keep working; Phase 2
  swaps it to the GUC form.)
- `golarion_current_date` stops being a singleton — its PK becomes `campaign_id`.
- **Per-campaign uniqueness**: constraints that enforced per-deployment
  uniqueness must be campaign-scoped or a second campaign is blocked:
  `golarion_weather` PK → `(campaign_id, year, month, day, region)`;
  `golarion_calendar_notes` UNIQUE → `(campaign_id, year, month, day)`;
  `favored_ports` UNIQUE → `(campaign_id, port_name)`; `session_config` UNIQUE →
  `(campaign_id, setting_name)`; `ship_infamy` gains `UNIQUE(campaign_id)`
  (per-campaign singleton). Invite codes and Discord message IDs stay globally
  unique by design.

### 3.3 The single chokepoint: `dbUtils`
~~Every query already goes through `executeQuery` / `executeTransaction`.~~
**Corrected & fixed:** seven services (sessionService, SessionDiscordService,
AttendanceService, RecurringSessionService, SessionSchedulerService,
discordBrokerService, discordOutboxService) bypassed dbUtils with ~50 raw
`pool.query`/`pool.connect` call sites. They were refactored onto dbUtils in
commit 90c3cc2 (behavior-identical, tests updated), so dbUtils is now truly the
single chokepoint. Only `migrationRunner` and `config/db` still touch the pool
directly — intentionally (see §3.4a). We set the tenant context in dbUtils:
- On each checkout, set the GUC **inside a transaction** (so a pooled connection
  can't leak the previous request's campaign to the next one). Note `SET LOCAL`
  cannot take bind parameters — use
  `SELECT set_config('app.current_campaign', $1, true)` instead. `executeQuery`
  wraps single statements in a tx (BEGIN / set_config / query / COMMIT — 4 round
  trips per query, accepted cost; the MockPool unit tests will see the new call
  shapes and need updating).
- The `campaignId` comes from request context (§3.5), **never** from raw client
  input without validation.
- **Transaction-internal calls must stay on the client**: e.g.
  `sessionService.scheduleSessionEvents` used to run on its own pooled connection
  while called from inside RecurringSessionService transactions — it couldn't see
  uncommitted rows (FK violations, observed in production logs) and under RLS
  would run without the right tenant context. Fixed by moving the calls after
  commit (13d2e40); audit for the same pattern before enabling RLS.

### 3.3a Background services (no request context)
`SessionSchedulerService`, `discordOutboxService`, and `discordBrokerService`
run as background loops — there is no `req.campaignId` for them, and queries
like "find sessions needing reminders" are inherently **cross-campaign**. Design
to settle in Phase 2/3:
- Background jobs run under an explicit **cross-campaign mode** (privileged role
  or sentinel GUC + policy branch, same mechanism as §4.4), iterate the matching
  rows grouped by `campaign_id`, and resolve per-campaign config
  (`campaign_settings`) for each row's campaign when acting on it.
- Inbound Discord (broker) must resolve **channel → campaign** explicitly from
  per-campaign Discord config before doing any tenant-scoped work.

### 3.4 Row-level security
- Run the app as a **non-owner DB role** (RLS is bypassed for table owners /
  superusers — this is the #1 footgun).
- Per campaign-specific table:
  ```
  ALTER TABLE loot ENABLE ROW LEVEL SECURITY;
  CREATE POLICY loot_tenant ON loot
    USING (campaign_id = current_setting('app.current_campaign')::int)
    WITH CHECK (campaign_id = current_setting('app.current_campaign')::int);
  ```
- Reference tables (`item`, `mod`, `spells`, `min_caster_levels`, …): **no RLS**,
  or RLS allowing `campaign_id IS NULL OR campaign_id = current_setting(...)` if we
  adopt the override pattern (§4.4).
- **Views**: FOUR views need `security_invoker = true` on PG16 (`loot_view`,
  `gold_totals_view`, `upcoming_sessions`, `session_attendance_summary`) so the
  underlying tables' RLS applies to the querying role (otherwise a view runs
  with its owner's privileges and bypasses RLS).

### 3.4a Migration runner needs its own privileged connection
Today `migrationRunner` shares the app's pool (`config/db.js`, one set of
`DB_*` env vars) and migrations run automatically at server startup. RLS
requires the app to connect as a **non-owner** role while migrations run as
owner — so Phase 2 must introduce a second credential set (e.g.
`DB_ADMIN_USER`/`DB_ADMIN_PASSWORD`) and a separate admin pool used only by the
migration runner at startup. This is a deployment-config change (compose env +
role creation in the database). `migrationRunner` deliberately stays on a raw
pool (never tenant-scoped).

### 3.5 Auth & campaign selection
- JWT stays **identity-only** (`id, username`) — do **not** bake campaign/role in,
  so membership changes take effect immediately.
- After login the frontend shows a **campaign picker** (the user's
  `user_campaign` rows). The chosen campaign is sent on every request — header
  `X-Campaign-Id` (or a `/c/:slug/...` path).
- Middleware: look up `user_campaign(user_id, campaign_id)`; **reject if not a
  member**; set `req.campaignId` and `req.campaignRole`. `checkRole('DM')` becomes
  "is this user a DM **in this campaign**" using `req.campaignRole`.
- `dbUtils` reads `req.campaignId` (via async-local-storage or explicit pass) to
  set the GUC.

### 3.6 Settings
- Split: **global** settings (`registrations_open`, `theme`) stay in `settings`.
- **Per-campaign** settings (`campaign_name`, `treasure_track`,
  `treasure_modifier`, `discord_*`, `infamy_system_enabled`,
  `auto_appraisal_enabled`, `weather_forecast_days`) move to a
  `campaign_settings(campaign_id, name, value, …)` table with
  `UNIQUE(campaign_id, name)` (today's `UNIQUE(name)` blocks multiple campaigns).

### 3.7 Discord / OAuth
- `discord_id`/`google_id` stay a **global identity** for login.
- Discord *integration* (webhooks, bot, channel) becomes **per-campaign config**
  in `campaign_settings`. Mapping "which campaign does this Discord message
  belong to" is now explicit config, not implied by the deployment.

## 4. Notable design calls

### 4.1 Reference data is shared
One `item`/`mod`/`spells` library for everyone. Simpler ops, one place to fix data.

### 4.2 Per-campaign reference overrides (optional)
If a DM adds a houserule item, do we want it global or campaign-only? Cleanest:
add nullable `campaign_id` to `item`/`mod` — `NULL` = global, else campaign-scoped.
Catalog reads become `WHERE campaign_id IS NULL OR campaign_id = :current`. Defer
if not needed day one, but the column is cheap to add up front.

### 4.3 Aggregates & "totals" come for free
`SUM(gold)`, fame/infamy totals, loot summaries — all auto-scoped by RLS. This is
the main reason C is cheap here. We **audit** the few queries that intentionally
cross campaigns (global admin) and have them run under a role/flag that relaxes
the policy.

### 4.4 Cross-campaign / admin queries
A global admin view ("all users", "all campaigns") needs to bypass RLS
deliberately — via a separate privileged role or `SET app.current_campaign` to a
sentinel + a policy branch. Keep these few and explicit.

## 5. Risks & mitigations
- **RLS bypass via owner role** → app connects as a dedicated **non-owner** role;
  migrations run as owner. Verify with a leak test (query as app role, confirm 0
  cross-campaign rows).
- **GUC leak across pooled connections** → use `SET LOCAL` within a transaction;
  add a defensive reset on release. Test under concurrency.
- **Forgotten `security_invoker` on views** → audit all views; PG16 supports it.
- **Blast radius** → today campaigns are physically isolated; merging means one
  bad migration/outage hits everyone. Mitigate with staging, backups, and careful
  migration review (we already gate migrations).
- **Data-merge correctness** → see §6; biggest practical risk.

## 6. Data migration (merging the existing live databases)
This is its own mini-project and the riskiest part.
1. Stand up the new shared DB with the new schema (campaigns, user_campaign,
   campaign_id columns, RLS).
2. Create a `campaigns` row per existing deployment (ROTR, SNS, …).
3. **Dedupe users** across the source DBs by `email` / `discord_id` / `google_id`
   into one global `users` row; build a per-source `old_user_id -> new_user_id` map.
4. For each source DB, copy campaign-specific tables, stamping `campaign_id` and
   remapping `user_id`/`whohas`/`whoupdated`/`who` via the map. Mind the **legacy
   column names** (`whohas`, `lastupdate`).
5. Reference data: import once into the shared tables (they should be ~identical;
   reconcile any drift; keep custom items as global or campaign-scoped per §4.2).
6. Populate `user_campaign` from who had accounts in which source DB, mapping the
   old global `role` to the per-campaign role.
7. **Resolve the pending sns DST fix BEFORE importing `game_sessions`** (already
   tracked as a release action).
8. Dry-run the whole merge against copies; diff row counts and spot-check
   ownership before cutover.

## 7. Phased rollout

Phase 0 (chokepoint refactor — all services through dbUtils) is DONE (90c3cc2).

1. **Schema foundation** — IN PROGRESS (migration 044): `campaigns`,
   `user_campaign`, `campaign_settings`, `campaign_id` columns with
   `NOT NULL DEFAULT 1` (added with a backfilling default in one step —
   PG fast-defaults make this cheap), campaign-scoped uniqueness reworks,
   `users.is_superadmin`, nullable override columns on item/mod/holidays.
   Ships to existing single-campaign deployments harmlessly (everything is
   campaign_id = 1).
2. **dbUtils GUC + RLS** — non-owner app role, admin pool for the migration
   runner (§3.4a), policies, `security_invoker` views, swap column defaults to
   the GUC form, background-job cross-campaign mode (§3.3a), leak test. Also:
   registration must insert a `user_campaign` row (the 044 backfill only covers
   users existing at migration time).
3. **Auth/campaign-context** — membership middleware, per-campaign role checks,
   campaign picker API.
4. **Frontend** — campaign selector + context, `X-Campaign-Id` on requests,
   per-campaign role in `AuthContext`.
5. **Per-feature audit** — mostly automatic via RLS; explicitly handle admin /
   cross-campaign screens and the reference-override reads.
6. **Data merge** (§6) on a staging copy → validate → cutover.
7. **Collapse Docker** — one app + one db service; retire per-campaign stacks;
   update build/update scripts.

### Phase 1 deploy + review notes (migration 044)
- **Pre-deploy sanity check** on each live DB (migration adds a PK/UNIQUE that
  assumes singleton rows): `SELECT COUNT(*) FROM golarion_current_date;` and
  `SELECT COUNT(*) FROM ship_infamy;` — both must be ≤ 1. If ≥ 2 the migration
  fails safely (transaction rollback, server refuses to start) but needs a
  manual dedupe first.
- **Known pre-existing gap**: `game_sessions` is created by NO sql file in the
  repo (only `database/sessions.sql`, which nothing runs) — the fresh-install
  path (init.sql + migrations) already breaks at migration 015. Both live DBs
  have the table, so 044 is unaffected. Fix init.sql before Phase 6 (which
  stands up a fresh DB and will exercise this path).
- Any **future holiday seed migration** must use
  `ON CONFLICT (name) WHERE campaign_id IS NULL` — 044 replaces the plain
  UNIQUE(name) with partial unique indexes, so a bare `ON CONFLICT (name)`
  no longer finds an arbiter.

## 8. Open questions — status
- **Reference overrides (§4.2)**: DECIDED — `item`/`mod` (and `golarion_holidays`,
  which has `is_custom` rows) get a nullable `campaign_id` in Phase 1 (NULL =
  global). Reads stay global-only until the override UX exists.
- **Admin plane**: DECIDED — `users.is_superadmin` flag added in Phase 1
  (default FALSE; set manually for the operator). Also the bypass identity for
  background jobs (§3.3a) and admin screens (§4.4).
- **Character model**: many characters per user per campaign (schema already
  supports multiples via the `active` flag; S&S parties carry backups). No
  `UNIQUE(user_id, campaign_id)` on characters.
- **Campaign routing**: recommendation `X-Campaign-Id` header for v1 (path
  `/c/:slug/` touches every route for a bookmarking benefit that can be added
  later). Confirm before Phase 3/4.
- **Cutover style**: recommendation pilot-first — migrate one campaign, keep the
  other on the old stack until validated. Confirm before Phase 6.
- **Campaign creation policy** (any logged-in user vs. invite/allow-list only):
  still open; needed before the campaign-creation UI, not before Phase 1-2.

## Appendix A — authoritative table classification

Compiled from `database/init.sql`, `database/sessions.sql`, and
`backend/migrations/*` (2026-06-10). `password_reset_tokens` exists only in
production (no SQL file); `weather_events` in the dbUtils whitelist is stale —
no such table.

**Campaign-scoped (39 — get `campaign_id NOT NULL` + index + RLS):**
characters, ships, outposts, crew, loot, appraisal, gold, sold, consumableuse,
identify, fame, fame_history, invites, session_messages, golarion_current_date,
golarion_calendar_notes, golarion_notes, golarion_weather, ship_infamy,
infamy_history, favored_ports, port_visits, imposition_uses, spellbook,
spellbook_spell, game_sessions, session_attendance, session_reminders,
session_notes, session_tasks, session_task_assignments, session_task_history,
session_completions, session_automations, session_config,
discord_reaction_tracking, discord_outbox, item_search, spellcasting_service.
(Child tables of campaign-scoped parents get their own denormalized
`campaign_id` so RLS policies stay simple/index-friendly.)

**Reference with per-campaign override (nullable `campaign_id`, NULL = global):**
item, mod, golarion_holidays (official rows global-unique by name; custom rows
unique per campaign).

**Strictly global (no campaign_id, no RLS):** users (+ new `is_superadmin`),
spells, min_caster_levels, min_costs, impositions, city, weather_regions,
settings (global subset only — per-campaign keys move to `campaign_settings`),
password_reset_tokens, schema_migrations / schema_migrations_v2 /
migration_history / migration_locks / migration_config.

**New (Phase 1):** campaigns, user_campaign, campaign_settings.

**Views needing `security_invoker` (Phase 2):** loot_view, gold_totals_view,
upcoming_sessions, session_attendance_summary.
