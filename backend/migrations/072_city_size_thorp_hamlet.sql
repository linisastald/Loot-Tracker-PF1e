-- Migration: 072_city_size_thorp_hamlet.sql
-- Description: W17 / F-0265. The city.size CHECK from migration 019 only allows
--   Village..Metropolis, but the app (City model and the City Services page)
--   also offers Thorp and Hamlet, so searching a Thorp or Hamlet failed with a
--   constraint violation (HTTP 500). Widen the CHECK to all eight sizes.
--
-- The original constraint was created inline (implicit name), so it is found in
-- pg_constraint by its definition rather than assumed. Idempotent: a CHECK that
-- already allows 'Thorp' is left alone.
--
-- Reverse (manual): re-add the old CHECK after deleting any Thorp/Hamlet rows.

DO $$
DECLARE
    con RECORD;
    already_wide BOOLEAN := FALSE;
BEGIN
    FOR con IN
        SELECT c.conname, pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.contype = 'c'
          AND n.nspname = current_schema()
          AND t.relname = 'city'
          AND pg_get_constraintdef(c.oid) ILIKE '%size%'
          AND pg_get_constraintdef(c.oid) ILIKE '%Metropolis%'
    LOOP
        IF con.def ILIKE '%Thorp%' THEN
            already_wide := TRUE;
        ELSE
            EXECUTE format('ALTER TABLE city DROP CONSTRAINT %I', con.conname);
        END IF;
    END LOOP;

    IF NOT already_wide THEN
        ALTER TABLE city ADD CONSTRAINT city_size_check CHECK (size IN (
            'Thorp', 'Hamlet', 'Village', 'Small Town', 'Large Town',
            'Small City', 'Large City', 'Metropolis'
        ));
    END IF;
END
$$;
