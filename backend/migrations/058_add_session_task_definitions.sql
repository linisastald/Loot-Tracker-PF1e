-- Migration 058: DM-editable session task definitions
--
-- The pre/during/post-session task lists that the Tasks page deals out were
-- hardcoded in the frontend. This table makes them per-campaign data the DM can
-- add/edit/delete/reorder from DM Settings -> Task Management.
--
--  * phase          which pool the task belongs to: pre | during | post
--  * quantity       how many copies go into the pool (e.g. two Loot Masters)
--  * min_characters only include the task when at least this many characters
--                   are selected (NULL = always); e.g. "extra chairs" at 6+
--  * is_snack_master whoever draws this (post) task is recorded as Snack
--                   Master for the NEXT session's Discord announcement,
--                   replacing the old fixed-label match in sessions.js
--  * sort_order     display/deal order within the phase
--
-- Follows the campaign-flavor pattern (migrations 047/053): campaign_id NOT NULL
-- defaulting to the app.current_campaign GUC and a tenant RLS policy identical
-- in shape to migration 045. The migration runner wraps this file in a
-- transaction, so no explicit BEGIN/COMMIT. IDEMPOTENT: CREATE TABLE/INDEX IF
-- NOT EXISTS, DROP POLICY IF EXISTS before CREATE POLICY, and the seed only
-- fills campaigns that have no definitions yet.
--
-- The seed passes campaign_id EXPLICITLY (the migration runner sets no GUC).
-- Campaigns created after this migration are seeded by Campaign.create() from
-- backend/src/constants/sessionTaskDefaults.js - keep the two lists in sync.

CREATE TABLE IF NOT EXISTS session_task_definition (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL
        DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int
        REFERENCES campaigns(id) ON DELETE CASCADE,
    phase VARCHAR(10) NOT NULL CHECK (phase IN ('pre', 'during', 'post')),
    name VARCHAR(255) NOT NULL,
    quantity SMALLINT NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
    min_characters SMALLINT CHECK (min_characters IS NULL OR min_characters BETWEEN 1 AND 50),
    is_snack_master BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_task_definition_campaign_phase
    ON session_task_definition(campaign_id, phase, sort_order);

COMMENT ON TABLE session_task_definition IS 'DM-editable pre/during/post-session task lists dealt out by the Tasks page (per campaign).';
COMMENT ON COLUMN session_task_definition.phase IS 'pre | during | post - which task pool this belongs to.';
COMMENT ON COLUMN session_task_definition.quantity IS 'Number of copies placed in the pool (e.g. 2 Loot Masters).';
COMMENT ON COLUMN session_task_definition.min_characters IS 'Only include when at least this many characters are selected; NULL = always.';
COMMENT ON COLUMN session_task_definition.is_snack_master IS 'Assignee of this task is recorded as Snack Master for the next session announcement.';
COMMENT ON COLUMN session_task_definition.sort_order IS 'Display/deal order within the phase.';

-- ----------------------------------------------------------------------------
-- Row-Level Security (tenant policy; same shape as migration 045)
-- ----------------------------------------------------------------------------

ALTER TABLE session_task_definition ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_task_definition_tenant ON session_task_definition;
CREATE POLICY session_task_definition_tenant ON session_task_definition
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

-- ----------------------------------------------------------------------------
-- Seed the previously hardcoded defaults into every existing campaign that has
-- no definitions yet, so behaviour is unchanged until a DM edits the list.
-- ----------------------------------------------------------------------------

INSERT INTO session_task_definition (campaign_id, phase, name, quantity, min_characters, is_snack_master, sort_order)
SELECT c.id, d.phase, d.name, d.quantity, d.min_characters, d.is_snack_master, d.sort_order
FROM campaigns c
CROSS JOIN (VALUES
    ('pre',    'Get Dice Trays',                                          1, NULL, false, 1),
    ('pre',    'Put Initiative name tags on tracker',                     1, NULL, false, 2),
    ('pre',    'Wipe TV',                                                 1, NULL, false, 3),
    ('pre',    'Recap',                                                   1, NULL, false, 4),
    ('pre',    'Bring in extra chairs if needed',                         1, 6,    false, 5),
    ('during', 'Calendar Master',                                         1, NULL, false, 1),
    ('during', 'Loot Master',                                             2, NULL, false, 2),
    ('during', 'Lore Master',                                             1, NULL, false, 3),
    ('during', 'Rule & Battle Master',                                    1, NULL, false, 4),
    ('during', 'Inspiration Master',                                      1, NULL, false, 5),
    ('post',   'Food, Drink, and Trash Clear Check',                      1, NULL, false, 1),
    ('post',   'TV(s) wiped and turned off',                              1, NULL, false, 2),
    ('post',   'Dice Trays and Books put away',                           1, NULL, false, 3),
    ('post',   'Clean Initiative tracker and put away name labels',       1, NULL, false, 4),
    ('post',   'Chairs pushed in and extra chairs put back',              1, NULL, false, 5),
    ('post',   'Windows shut and locked and Post Discord Reminders',      1, NULL, false, 6),
    ('post',   'Ensure no duplicate snacks for next session',             1, NULL, true,  7)
) AS d(phase, name, quantity, min_characters, is_snack_master, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM session_task_definition t WHERE t.campaign_id = c.id
);
