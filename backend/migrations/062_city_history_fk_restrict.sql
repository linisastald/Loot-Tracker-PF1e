-- Migration: 062_city_history_fk_restrict.sql
-- Description: S4 / F-0042, F-0268, F-0269, F-0565. The city table is global (no
--   campaign_id, no RLS) but item_search.city_id and spellcasting_service.city_id
--   were ON DELETE CASCADE, and FK cascade actions bypass RLS, so deleting one
--   city wiped every campaign's search/service history. Change both FKs to
--   ON DELETE RESTRICT so a city that has history anywhere cannot be deleted.
--
-- The FK constraints were created implicitly in migration 019, so their names
-- are looked up in pg_constraint rather than assumed. Idempotent: a constraint
-- already set to RESTRICT (confdeltype 'r') is left alone. Runs as the migration
-- owner, which is required to alter FKs on the RLS-enabled tables.
--
-- Reverse (manual): re-add the same FKs with ON DELETE CASCADE.

DO $$
DECLARE
    tbl TEXT;
    con RECORD;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['item_search', 'spellcasting_service'] LOOP
        FOR con IN
            SELECT c.conname, c.confdeltype
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE c.contype = 'f'
              AND n.nspname = current_schema()
              AND t.relname = tbl
              AND c.confrelid = (
                  SELECT cc.oid FROM pg_class cc
                  JOIN pg_namespace nn ON nn.oid = cc.relnamespace
                  WHERE cc.relname = 'city' AND nn.nspname = current_schema()
              )
              AND c.conkey = ARRAY[(
                  SELECT a.attnum FROM pg_attribute a
                  WHERE a.attrelid = t.oid AND a.attname = 'city_id'
              )]
        LOOP
            IF con.confdeltype <> 'r' THEN
                EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', tbl, con.conname);
                EXECUTE format(
                    'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (city_id) REFERENCES city(id) ON DELETE RESTRICT',
                    tbl, con.conname
                );
            END IF;
        END LOOP;
    END LOOP;
END
$$;
