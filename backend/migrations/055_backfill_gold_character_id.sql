-- Migration 055: backfill gold.character_id for historical distributions
--
-- Before per-character gold tracking, the gold distribution feature recorded
-- one 'Withdrawal' row per character with the character's name only in the
-- notes text ("Distributed to <name>") — gold.character_id was left NULL.
-- Now that distributions and per-character reporting rely on character_id, this
-- migration attributes those historical rows by matching the name in the notes
-- back to a character in the same campaign.
--
-- Safety:
--   - Only touches rows where character_id IS NULL (idempotent; re-running is a
--     no-op once attributed).
--   - Only matches 'Withdrawal' rows whose notes follow the exact
--     "Distributed to <name>" shape the distributor produced.
--   - Scoped by campaign_id, and only applied when the name resolves to exactly
--     ONE character in that campaign — ambiguous names are left untouched.

DO $$
DECLARE
    updated_count integer;
BEGIN
    UPDATE gold g
       SET character_id = c.id
      FROM characters c
     WHERE g.character_id IS NULL
       AND g.transaction_type = 'Withdrawal'
       AND g.notes LIKE 'Distributed to %'
       AND c.campaign_id = g.campaign_id
       AND c.name = substring(g.notes from '^Distributed to (.*)$')
       AND (
           SELECT COUNT(*)
             FROM characters c2
            WHERE c2.campaign_id = g.campaign_id
              AND c2.name = substring(g.notes from '^Distributed to (.*)$')
       ) = 1;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Migration 055: attributed % historical distribution row(s) to characters', updated_count;
END $$;
