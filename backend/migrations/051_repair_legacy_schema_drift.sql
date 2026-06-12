-- Migration 051: repair remaining legacy schema drift (production audit 2026-06-11)
--
-- A full schema audit of the production database (after migration 050 found
-- the invites drift) showed the same disease across every table from the
-- pre-migration era: 16 tables have no PRIMARY KEY constraint (their "*_pkey"
-- objects are plain unique indexes), and ~10 of them have bare nullable id
-- columns with NO sequence default and NO timestamp/value defaults. The app
-- inserts into several of them relying on defaults, producing NULL ids /
-- NULL created_at exactly like the invites bug:
--   - identify (active: identification flow) - NULL id, NULL identified_at
--   - infamy_history / port_visits / imposition_uses / favored_ports
--     (active: infamy system) - NULL ids, NULL created_at
--   - fame / fame_history / golarion_calendar_notes (dead code paths;
--     repaired for integrity)
--   - spells / impositions / min_caster_levels / min_costs (read-only
--     reference; PK integrity only)
--
-- Also fixes three latent MULTI-CAMPAIGN blockers found by the same audit:
--   - ship_infamy: global uniqueness on (id) + code hardcoding id = 1 means a
--     SECOND campaign can never initialize infamy. Target shape becomes
--     PRIMARY KEY (campaign_id) (like golarion_current_date), id a plain
--     NOT NULL DEFAULT 1 column. Fresh installs had this bug too (init.sql
--     id PK) - updated for parity in the same commit.
--   - favored_ports: UNIQUE (port_name) was global - two campaigns favoring
--     the same port would collide. Rescoped to (campaign_id, port_name).
--   - golarion_calendar_notes: UNIQUE (year, month, day) global - rescoped
--     to (campaign_id, year, month, day).
--   - session_messages: no unique index on message_id at all, so the
--     ON CONFLICT (message_id) upsert in discordController has been failing
--     (caught + warn-logged) - becomes the PRIMARY KEY.
--
-- Idempotent and a no-op on canonical fresh installs (every step guarded).
-- Runs as the table owner via the migration runner, so RLS does not filter
-- the backfills. No CONCURRENTLY: the runner wraps this in one transaction.
--
-- DELIBERATELY NOT CHASED (known residual drift, harmless to the app):
-- missing FKs on the legacy family (orphan-data risk on ADD), non-id NOT
-- NULLs prod lacks vs init.sql (favored_ports.port_name, port_visits
-- threshold/infamy_gained, fame columns, etc.), and fame's UNIQUE
-- (character_id) living as an index instead of a constraint.

-- ============================================================================
-- 1. Serial-id repair: attach sequence defaults, backfill NULL ids, NOT NULL,
--    promote the fake "*_pkey" unique index to a real PRIMARY KEY.
--    (Same pattern as migration 050's invites repair.)
-- ============================================================================
DO $$
DECLARE
    t   text;
    seq text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'fame', 'fame_history', 'favored_ports', 'golarion_calendar_notes',
        'identify', 'imposition_uses', 'impositions', 'infamy_history',
        'port_visits', 'spells'
    ] LOOP
        seq := t || '_id_seq';

        -- Legacy shape = id has no default; canonical installs skip this block
        IF NOT EXISTS (
            SELECT 1
            FROM pg_attribute a
                     JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
            WHERE a.attrelid = ('public.' || t)::regclass
              AND a.attname = 'id'
        ) THEN
            EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', seq);
            EXECUTE format(
                'SELECT setval(%L, GREATEST(COALESCE((SELECT MAX(id) FROM %I), 0), 1), true)',
                seq, t);
            EXECUTE format('UPDATE %I SET id = nextval(%L) WHERE id IS NULL', t, seq);
            EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT nextval(%L)', t, seq);
            EXECUTE format('ALTER SEQUENCE %I OWNED BY %I.id', seq, t);
        END IF;

        EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET NOT NULL', t);

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = ('public.' || t)::regclass AND contype = 'p'
        ) THEN
            IF EXISTS (
                SELECT 1
                FROM pg_class c
                         JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relname = t || '_pkey' AND c.relkind = 'i' AND n.nspname = 'public'
            ) THEN
                EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I PRIMARY KEY USING INDEX %I',
                               t, t || '_pkey', t || '_pkey');
            ELSE
                EXECUTE format('ALTER TABLE %I ADD PRIMARY KEY (id)', t);
            END IF;
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- 2. ship_infamy: PK moves to campaign_id (one infamy row per campaign);
--    id becomes a plain NOT NULL DEFAULT 1 column (legacy code addresses the
--    per-campaign singleton as id = 1 under RLS). Global uniqueness on id
--    would block every campaign after the first from initializing infamy.
-- ============================================================================
DO $$
DECLARE
    pk_on_campaign boolean;
    pkname         text;
BEGIN
    -- Drop any PK that is not exactly (campaign_id) - old fresh installs had id PK
    SELECT c.conname,
           (array_length(c.conkey, 1) = 1
               AND EXISTS (SELECT 1
                           FROM pg_attribute a
                           WHERE a.attrelid = c.conrelid
                             AND a.attnum = c.conkey[1]
                             AND a.attname = 'campaign_id'))
    INTO pkname, pk_on_campaign
    FROM pg_constraint c
    WHERE c.conrelid = 'ship_infamy'::regclass AND c.contype = 'p';

    IF pkname IS NOT NULL AND NOT pk_on_campaign THEN
        EXECUTE format('ALTER TABLE ship_infamy DROP CONSTRAINT %I', pkname);
        pkname := NULL;
    END IF;

    IF pkname IS NULL THEN
        -- Prod's fake unique index on (id) occupies the constraint name
        DROP INDEX IF EXISTS ship_infamy_pkey;
        ALTER TABLE ship_infamy ADD CONSTRAINT ship_infamy_pkey PRIMARY KEY (campaign_id);
    END IF;

    -- id backfill AFTER the index surgery: no global uniqueness on id remains,
    -- so multiple campaigns' rows may all carry id = 1
    UPDATE ship_infamy SET id = 1 WHERE id IS NULL;
    ALTER TABLE ship_infamy ALTER COLUMN id SET DEFAULT 1;
    ALTER TABLE ship_infamy ALTER COLUMN id SET NOT NULL;
END $$;

-- The 044 UNIQUE (campaign_id) is redundant once campaign_id is the PK,
-- as is the plain 044 index on campaign_id
ALTER TABLE ship_infamy DROP CONSTRAINT IF EXISTS ship_infamy_campaign_id_key;
DROP INDEX IF EXISTS idx_ship_infamy_campaign_id;

-- ============================================================================
-- 3. Natural-key PRIMARY KEYs on the remaining PK-less tables
-- ============================================================================
DO $$
BEGIN
    -- min_caster_levels: PK (spell_level)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'min_caster_levels'::regclass AND contype = 'p') THEN
        ALTER TABLE min_caster_levels ALTER COLUMN spell_level SET NOT NULL;
        IF to_regclass('public.min_caster_levels_pkey') IS NOT NULL THEN
            ALTER TABLE min_caster_levels
                ADD CONSTRAINT min_caster_levels_pkey PRIMARY KEY USING INDEX min_caster_levels_pkey;
        ELSE
            ALTER TABLE min_caster_levels ADD PRIMARY KEY (spell_level);
        END IF;
    END IF;

    -- min_costs: PK (item_type, spell_level)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'min_costs'::regclass AND contype = 'p') THEN
        ALTER TABLE min_costs ALTER COLUMN item_type SET NOT NULL;
        ALTER TABLE min_costs ALTER COLUMN spell_level SET NOT NULL;
        IF to_regclass('public.min_costs_pkey') IS NOT NULL THEN
            ALTER TABLE min_costs
                ADD CONSTRAINT min_costs_pkey PRIMARY KEY USING INDEX min_costs_pkey;
        ELSE
            ALTER TABLE min_costs ADD PRIMARY KEY (item_type, spell_level);
        END IF;
    END IF;

    -- session_messages: PK (message_id) - also restores the ON CONFLICT
    -- (message_id) arbiter the Discord announcement upsert needs
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'session_messages'::regclass AND contype = 'p') THEN
        ALTER TABLE session_messages ADD PRIMARY KEY (message_id);
    END IF;

    -- weather_regions: PK (region_name)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'weather_regions'::regclass AND contype = 'p') THEN
        ALTER TABLE weather_regions ADD PRIMARY KEY (region_name);
    END IF;

    -- password_reset_tokens exists ONLY in production (no SQL file creates
    -- it - known fresh-install gap, §7.6 backlog); guard on table existence
    IF to_regclass('public.password_reset_tokens') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'password_reset_tokens'::regclass AND contype = 'p') THEN
        ALTER TABLE password_reset_tokens ADD PRIMARY KEY (id);
    END IF;
END $$;

-- ============================================================================
-- 4. Campaign-scope the two remaining GLOBAL unique keys (multi-campaign
--    collisions). Prod has them as plain unique indexes; fresh installs
--    already have the campaign-scoped constraints from init.sql.
-- ============================================================================
DROP INDEX IF EXISTS favored_ports_port_name_key;
DO $$
BEGIN
    IF to_regclass('public.favored_ports_campaign_port_name_key') IS NULL THEN
        ALTER TABLE favored_ports
            ADD CONSTRAINT favored_ports_campaign_port_name_key UNIQUE (campaign_id, port_name);
    END IF;
END $$;

DROP INDEX IF EXISTS golarion_calendar_notes_year_month_day_key;
DO $$
BEGIN
    IF to_regclass('public.golarion_calendar_notes_campaign_year_month_day_key') IS NULL THEN
        ALTER TABLE golarion_calendar_notes
            ADD CONSTRAINT golarion_calendar_notes_campaign_year_month_day_key
                UNIQUE (campaign_id, year, month, day);
    END IF;
END $$;

-- ============================================================================
-- 5. Column defaults the app relies on (all idempotent; backfills only touch
--    NULLs, so they are no-ops on canonical installs). Legacy rows' true
--    timestamps are unrecoverable - backfilled with NOW() for stable sorting.
-- ============================================================================
ALTER TABLE identify ALTER COLUMN identified_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE identify ALTER COLUMN success SET DEFAULT true;
UPDATE identify SET identified_at = NOW() WHERE identified_at IS NULL;

ALTER TABLE fame ALTER COLUMN points SET DEFAULT 0;
ALTER TABLE fame ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
UPDATE fame SET updated_at = NOW() WHERE updated_at IS NULL;

ALTER TABLE fame_history ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
UPDATE fame_history SET created_at = NOW() WHERE created_at IS NULL;

ALTER TABLE favored_ports ALTER COLUMN bonus SET DEFAULT 2;
ALTER TABLE favored_ports ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
UPDATE favored_ports SET created_at = NOW() WHERE created_at IS NULL;

ALTER TABLE port_visits ALTER COLUMN plunder_spent SET DEFAULT 0;
ALTER TABLE port_visits ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
UPDATE port_visits SET created_at = NOW() WHERE created_at IS NULL;

ALTER TABLE impositions ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
UPDATE impositions SET created_at = NOW() WHERE created_at IS NULL;

ALTER TABLE imposition_uses ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
UPDATE imposition_uses SET created_at = NOW() WHERE created_at IS NULL;

ALTER TABLE infamy_history ALTER COLUMN infamy_change SET DEFAULT 0;
ALTER TABLE infamy_history ALTER COLUMN disrepute_change SET DEFAULT 0;
ALTER TABLE infamy_history ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
UPDATE infamy_history SET created_at = NOW() WHERE created_at IS NULL;

ALTER TABLE ship_infamy ALTER COLUMN infamy SET DEFAULT 0;
ALTER TABLE ship_infamy ALTER COLUMN disrepute SET DEFAULT 0;
ALTER TABLE ship_infamy ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
UPDATE ship_infamy SET infamy = 0 WHERE infamy IS NULL;
UPDATE ship_infamy SET disrepute = 0 WHERE disrepute IS NULL;
UPDATE ship_infamy SET updated_at = NOW() WHERE updated_at IS NULL;
ALTER TABLE ship_infamy ALTER COLUMN infamy SET NOT NULL;
ALTER TABLE ship_infamy ALTER COLUMN disrepute SET NOT NULL;

COMMENT ON TABLE ship_infamy IS 'Per-campaign infamy singleton: PRIMARY KEY (campaign_id), legacy id column fixed at 1 (migration 051)';
