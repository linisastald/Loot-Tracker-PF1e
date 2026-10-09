-- Migration: 078_merge_case_duplicate_items.sql
-- Description: Merge five pairs of global catalog items whose names differ only by
-- capitalisation (finding F-0896, owner decision of 2026-10-06: duplicates only; the
-- 61 placeholder rows are left alone). The same five rows are removed from
-- database/item_data.sql, so on a fresh install this migration changes 0 rows.
--
-- For each pair the row spelled like the rest of the catalog is kept ('Chest, Huge'
-- beside 'Chest, Huge Treasure'; 'Bec de Corbin' with subtype 'two handed' like the
-- other polearms). Type, value and weight are equal within every pair.
--
-- References are moved to the kept row first (all campaigns): loot.itemid, and
-- item_search.item_id, which would otherwise lose its rows to ON DELETE CASCADE.
-- loot.name is a separate column and is not touched, so existing loot keeps the
-- name it was entered with.
--
-- RLS: loot and item_search have tenant policies keyed on app.current_campaign. The
-- runner connects as the table owner, but the statements must not depend on that, so
-- the GUC is set to the cross-campaign mode 'all' for this transaction only (as in 073).
--
-- Safety: a pair is merged only when both rows still have the seeded id and name and
-- are global (campaign_id IS NULL). Idempotent: after one run the duplicate row is
-- gone, so nothing matches. One transaction. UNTESTED against a real database.
-- Roll-back preview (prints the NOTICE counts, then rolls everything back):
--   sed 's/^COMMIT;$/ROLLBACK;/' backend/migrations/078_merge_case_duplicate_items.sql | psql -d <db> -v ON_ERROR_STOP=1

BEGIN;

DO $$
DECLARE
    n_pairs INTEGER;
    n_loot INTEGER;
    n_search INTEGER;
    n_deleted INTEGER;
BEGIN
    PERFORM set_config('app.current_campaign', 'all', true);

    CREATE TEMP TABLE _item_merge (
        drop_id INTEGER PRIMARY KEY,
        drop_name TEXT NOT NULL,
        keep_id INTEGER NOT NULL,
        keep_name TEXT NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO _item_merge (drop_id, drop_name, keep_id, keep_name) VALUES
        (503, 'Bec de corbin', 504, 'Bec de Corbin'),
        (1174, 'Chest, huge', 1175, 'Chest, Huge'),
        (1177, 'Chest, large', 1178, 'Chest, Large'),
        (1180, 'Chest, medium', 1181, 'Chest, Medium'),
        (1184, 'Chest, small', 1185, 'Chest, Small');

    -- Keep only the pairs where both rows are still the seeded global rows.
    DELETE FROM _item_merge m
     WHERE NOT EXISTS (SELECT 1 FROM item d
                        WHERE d.id = m.drop_id AND d.name = m.drop_name AND d.campaign_id IS NULL)
        OR NOT EXISTS (SELECT 1 FROM item k
                        WHERE k.id = m.keep_id AND k.name = m.keep_name AND k.campaign_id IS NULL);
    SELECT count(*) INTO n_pairs FROM _item_merge;

    UPDATE loot l
       SET itemid = m.keep_id
      FROM _item_merge m
     WHERE l.itemid = m.drop_id;
    GET DIAGNOSTICS n_loot = ROW_COUNT;

    UPDATE item_search s
       SET item_id = m.keep_id
      FROM _item_merge m
     WHERE s.item_id = m.drop_id;
    GET DIAGNOSTICS n_search = ROW_COUNT;

    DELETE FROM item i
     USING _item_merge m
     WHERE i.id = m.drop_id
       AND i.name = m.drop_name
       AND i.campaign_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM loot l WHERE l.itemid = i.id)
       AND NOT EXISTS (SELECT 1 FROM item_search s WHERE s.item_id = i.id);
    GET DIAGNOSTICS n_deleted = ROW_COUNT;

    RAISE NOTICE 'Migration 078: merged % of 5 duplicate item pairs (% loot rows and % item searches repointed, % rows deleted)',
        n_pairs, n_loot, n_search, n_deleted;
END
$$;

COMMIT;
