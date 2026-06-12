-- Migration 053: Harrow Point Tracker (Curse of the Crimson Throne flavor module)
--
-- Two campaign-scoped tables backing a gated DM/player feature that tracks each
-- PC's Harrow Point balance for the current chapter of the Adventure Path.
--
--  * harrow_ledger    - append-only point transactions (award/spend/adjust).
--                       A PC's current balance is SUM(delta) filtered to the
--                       current chapter, so "points are lost at the end of a
--                       chapter" falls out for free (old chapters stop summing)
--                       and we get a full audit trail like the loot ledger.
--  * harrow_choosing  - each PC's physical Choosing card per chapter (one row
--                       per character per chapter), plus the "Chosen" boon flag.
--
-- Feature gate + current chapter live in campaign_settings (no new table):
--   harrow_system_enabled  '0'/'1'   show/hide the whole feature
--   harrow_current_chapter '1'..'6'  drives balance scoping and the spend menu
--
-- Both tables follow the established campaign-flavor pattern (mirrors the
-- ships/crew tables): campaign_id NOT NULL defaulting to the app.current_campaign
-- GUC (migration 047 convention) and a tenant RLS policy identical in shape to
-- migration 045. The migration runner wraps this file in a transaction, so no
-- explicit BEGIN/COMMIT. IDEMPOTENT: CREATE TABLE/INDEX IF NOT EXISTS, ENABLE
-- ROW LEVEL SECURITY is a no-op when already enabled, and every CREATE POLICY is
-- preceded by DROP POLICY IF EXISTS.

-- ============================================================================
-- 1. harrow_ledger - append-only point transactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS harrow_ledger (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL
        DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int
        REFERENCES campaigns(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    chapter SMALLINT NOT NULL CHECK (chapter BETWEEN 1 AND 6),
    delta INTEGER NOT NULL,
    reason VARCHAR(255),
    entry_type VARCHAR(16) NOT NULL DEFAULT 'adjust'
        CHECK (entry_type IN ('award', 'spend', 'adjust')),
    -- SET NULL (not the default NO ACTION) so removing a user never blocks on,
    -- or deletes, their historical ledger entries.
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_harrow_ledger_char_chapter
    ON harrow_ledger(campaign_id, character_id, chapter);
CREATE INDEX IF NOT EXISTS idx_harrow_ledger_campaign_chapter
    ON harrow_ledger(campaign_id, chapter);

COMMENT ON TABLE harrow_ledger IS 'Append-only Harrow Point transactions (CotCT). Current-chapter balance = SUM(delta) WHERE chapter = current chapter.';
COMMENT ON COLUMN harrow_ledger.chapter IS 'AP chapter (1-6) this entry counts toward; balance is scoped to the current chapter.';
COMMENT ON COLUMN harrow_ledger.delta IS 'Signed point change: + award, - spend; either sign for an adjust.';
COMMENT ON COLUMN harrow_ledger.entry_type IS 'award | spend | adjust (for filtering/UI).';

-- ============================================================================
-- 2. harrow_choosing - per-character, per-chapter Choosing card
-- ============================================================================

CREATE TABLE IF NOT EXISTS harrow_choosing (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL
        DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int
        REFERENCES campaigns(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    chapter SMALLINT NOT NULL CHECK (chapter BETWEEN 1 AND 6),
    card_name VARCHAR(64),
    is_chosen_boon BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (character_id, chapter)
);

-- The UNIQUE (character_id, chapter) constraint already indexes character_id
-- lookups; add a campaign_id-leading index for the RLS-filtered per-chapter
-- "list all Choosings" read, matching the per-table convention.
CREATE INDEX IF NOT EXISTS idx_harrow_choosing_campaign_chapter
    ON harrow_choosing(campaign_id, chapter);

COMMENT ON TABLE harrow_choosing IS 'Each PC''s physical Choosing card per chapter (CotCT); one row per character per chapter.';
COMMENT ON COLUMN harrow_choosing.card_name IS 'One of the 54 Harrow cards (drives the frontend autocomplete).';
COMMENT ON COLUMN harrow_choosing.is_chosen_boon IS 'Whether this Choosing card granted "The Chosen" automatic boon for the chapter.';

-- ============================================================================
-- 3. Row-Level Security (tenant policies; same shape as migration 045)
-- ============================================================================

ALTER TABLE harrow_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harrow_ledger_tenant ON harrow_ledger;
CREATE POLICY harrow_ledger_tenant ON harrow_ledger
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE harrow_choosing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS harrow_choosing_tenant ON harrow_choosing;
CREATE POLICY harrow_choosing_tenant ON harrow_choosing
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );
