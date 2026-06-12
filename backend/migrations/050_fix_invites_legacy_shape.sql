-- Migration 050: repair the legacy invites table shape (production drift)
--
-- Production's invites table predates the canonical init.sql definition: it
-- has id / is_used / created_at columns with NO defaults and NO NOT NULL,
-- and "invites_pkey" is a plain UNIQUE index rather than a PRIMARY KEY
-- constraint. The phase-3b invite code relies on the canonical shape:
--   - Invite.create() omits id/is_used/created_at and expects defaults,
--     so on the legacy table every new invite gets NULL for all three;
--   - the active-invites list filters is_used = FALSE, which NULL never
--     matches (invites invisible in the UI);
--   - redemption/deactivation consume the code via UPDATE ... WHERE id = $1,
--     which can never match a NULL id (codes unredeemable).
--
-- Fresh installs (database/init.sql) already match the target shape; every
-- step below is guarded to be a no-op there. The migration runner executes
-- this as the table owner, so RLS does not filter the backfills.

DO $$
BEGIN
    -- ------------------------------------------------------------------
    -- 1. id: attach a sequence default, backfill NULLs, NOT NULL, real PK
    --    (guarded on "id has no default" = the legacy shape)
    -- ------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1
        FROM pg_attribute a
                 JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = 'invites'::regclass
          AND a.attname = 'id'
    ) THEN
        CREATE SEQUENCE IF NOT EXISTS invites_id_seq;

        -- Start past any ids that do exist (legacy prod has none, but be safe)
        PERFORM setval('invites_id_seq',
                       GREATEST(COALESCE((SELECT MAX(id) FROM invites), 0), 1),
                       true);

        UPDATE invites SET id = nextval('invites_id_seq') WHERE id IS NULL;

        ALTER TABLE invites ALTER COLUMN id SET DEFAULT nextval('invites_id_seq');
        ALTER SEQUENCE invites_id_seq OWNED BY invites.id;
    END IF;

    ALTER TABLE invites ALTER COLUMN id SET NOT NULL;

    -- Promote the existing unique index to a true PRIMARY KEY when no PK
    -- constraint exists (ADD CONSTRAINT ... USING INDEX adopts it in place).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'invites'::regclass AND contype = 'p'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM pg_class c
                     JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = 'invites_pkey' AND c.relkind = 'i'
              AND n.nspname = 'public'
        ) THEN
            ALTER TABLE invites ADD CONSTRAINT invites_pkey PRIMARY KEY USING INDEX invites_pkey;
        ELSE
            ALTER TABLE invites ADD PRIMARY KEY (id);
        END IF;
    END IF;

    -- ------------------------------------------------------------------
    -- 2. is_used: backfill from the legacy "used" signal, default, NOT NULL
    -- ------------------------------------------------------------------
    UPDATE invites
    SET is_used = (used_by IS NOT NULL OR used_at IS NOT NULL)
    WHERE is_used IS NULL;

    ALTER TABLE invites ALTER COLUMN is_used SET DEFAULT FALSE;
    ALTER TABLE invites ALTER COLUMN is_used SET NOT NULL;

    -- ------------------------------------------------------------------
    -- 3. created_at: default for new rows; backfill NULLs so the list's
    --    ORDER BY created_at DESC keeps stable ordering (used_at where we
    --    have it, else NOW() - legacy rows' true creation time is gone)
    -- ------------------------------------------------------------------
    UPDATE invites
    SET created_at = COALESCE(used_at, NOW())
    WHERE created_at IS NULL;

    ALTER TABLE invites ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
END $$;

COMMENT ON COLUMN invites.is_used IS 'Single-use consumption flag; NOT NULL DEFAULT FALSE (repaired from legacy NULLs by migration 050)';
