-- Migration 086: audit log with undo
--
-- One campaign-scoped table recording who changed what and when, for loot and
-- gold: status changes, edits, identification, consumable use, wand charges,
-- gold entries, distributions, balances and sales. Each entry keeps a before
-- and an after snapshot so a DM can undo it from the History page; the undo is
-- itself an entry (action 'undo', undo_of = the reversed entry) and the
-- reversed entry is stamped undone_at / undone_by.
--
-- Same shape as migration 053: campaign_id defaults to the app.current_campaign
-- GUC and the tenant policy is identical to migration 045's. The runner wraps
-- this file in a transaction. Idempotent.

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL
        DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int
        REFERENCES campaigns(id) ON DELETE CASCADE,
    -- SET NULL so deleting an account keeps its history
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(32) NOT NULL,
    entity_type VARCHAR(16) NOT NULL,
    entity_ids INTEGER[] NOT NULL DEFAULT '{}',
    before JSONB,
    after JSONB,
    summary VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    undone_at TIMESTAMPTZ,
    undone_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    undo_of INTEGER REFERENCES audit_log(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_campaign_created
    ON audit_log(campaign_id, created_at DESC);
-- Conflict check on undo: later entries touching the same rows
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_ids
    ON audit_log USING GIN (entity_ids);

COMMENT ON TABLE audit_log IS 'Who changed what and when, for loot and gold, with before/after snapshots so a DM can undo an entry (History page).';
COMMENT ON COLUMN audit_log.action IS 'loot.status | loot.restore | loot.update | loot.identify | loot.consume | loot.charges | gold.create | gold.distribute | gold.balance | sale | undo';
COMMENT ON COLUMN audit_log.entity_type IS 'loot | gold: what entity_ids point at (a sale lists its loot ids; its gold row id is in after)';
COMMENT ON COLUMN audit_log.entity_ids IS 'Rows the entry changed; a later entry on the same rows blocks undoing this one';
COMMENT ON COLUMN audit_log.undo_of IS 'For action undo: the entry this one reversed';

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_tenant ON audit_log;
CREATE POLICY audit_log_tenant ON audit_log
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );
