-- Migration: 064_ships_extended_columns.sql
-- Description: Make sure the ships table has every extended column that
--              backend/src/models/Ship.js reads and writes.
--
-- Background: these columns were created by ARCHIVED migrations 02, 03, 05 and 06
-- (backend/migrations/archived) and by database/init_complete.sql. Production has
-- them. A database built from database/init.sql + the active migrations did not,
-- so ship create/update failed with "column does not exist". database/init.sql is
-- corrected in the same change; this migration brings already-initialised fresh
-- databases in line. Everything is IF NOT EXISTS, so it is a no-op on production
-- and on installs created from the corrected init.sql.
--
-- Existing columns are never altered (on production weapons may predate the JSONB
-- definition; this migration does not touch an existing column's type).

BEGIN;

ALTER TABLE ships ADD COLUMN IF NOT EXISTS ship_type VARCHAR(50);
ALTER TABLE ships ADD COLUMN IF NOT EXISTS size VARCHAR(20) DEFAULT 'Colossal';
ALTER TABLE ships ADD COLUMN IF NOT EXISTS cost INTEGER DEFAULT 0;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS max_speed INTEGER DEFAULT 30;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS acceleration INTEGER DEFAULT 15;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS propulsion VARCHAR(100);
ALTER TABLE ships ADD COLUMN IF NOT EXISTS min_crew INTEGER DEFAULT 1;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS max_crew INTEGER DEFAULT 10;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS cargo_capacity INTEGER DEFAULT 10000;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS max_passengers INTEGER DEFAULT 10;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS decks INTEGER DEFAULT 1;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS ramming_damage VARCHAR(20) DEFAULT '1d8';

ALTER TABLE ships ADD COLUMN IF NOT EXISTS base_ac INTEGER DEFAULT 10;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS touch_ac INTEGER DEFAULT 10;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS hardness INTEGER DEFAULT 0;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS max_hp INTEGER DEFAULT 100;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS current_hp INTEGER DEFAULT 100;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS cmb INTEGER DEFAULT 0;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS cmd INTEGER DEFAULT 10;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS saves INTEGER DEFAULT 0;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS initiative INTEGER DEFAULT 0;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS legacy_damage INTEGER;

ALTER TABLE ships ADD COLUMN IF NOT EXISTS plunder INTEGER DEFAULT 0;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS infamy INTEGER DEFAULT 0;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS disrepute INTEGER DEFAULT 0;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS sails_oars VARCHAR(100);
ALTER TABLE ships ADD COLUMN IF NOT EXISTS sailing_check_bonus INTEGER DEFAULT 0;

ALTER TABLE ships ADD COLUMN IF NOT EXISTS weapons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS officers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS improvements JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS cargo_manifest JSONB
    DEFAULT '{"items": [], "passengers": [], "impositions": []}'::jsonb;

ALTER TABLE ships ADD COLUMN IF NOT EXISTS ship_notes TEXT;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS captain_name VARCHAR(255);
ALTER TABLE ships ADD COLUMN IF NOT EXISTS flag_description TEXT;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';

-- Constraints (added only when missing, by name)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ships_hp_check' AND conrelid = 'ships'::regclass) THEN
        ALTER TABLE ships ADD CONSTRAINT ships_hp_check CHECK (current_hp >= 0 AND current_hp <= max_hp);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ships_ac_check' AND conrelid = 'ships'::regclass) THEN
        ALTER TABLE ships ADD CONSTRAINT ships_ac_check
            CHECK (base_ac >= 0 AND base_ac <= 50 AND touch_ac >= 0 AND touch_ac <= 50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ships_crew_check' AND conrelid = 'ships'::regclass) THEN
        ALTER TABLE ships ADD CONSTRAINT ships_crew_check CHECK (min_crew >= 0 AND max_crew >= min_crew);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ships_capacity_check' AND conrelid = 'ships'::regclass) THEN
        ALTER TABLE ships ADD CONSTRAINT ships_capacity_check CHECK (cargo_capacity >= 0 AND max_passengers >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ships_campaign_stats_check' AND conrelid = 'ships'::regclass) THEN
        ALTER TABLE ships ADD CONSTRAINT ships_campaign_stats_check
            CHECK (plunder >= 0 AND infamy >= 0 AND disrepute >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ships_status_check' AND conrelid = 'ships'::regclass) THEN
        ALTER TABLE ships ADD CONSTRAINT ships_status_check
            CHECK (status IN ('PC Active', 'Active', 'Docked', 'Lost', 'Sunk'));
    END IF;
END $$;

-- Indexes. GIN indexes only when the column really is JSONB (production's
-- weapons column predates the JSONB definition on some installs).
CREATE INDEX IF NOT EXISTS idx_ships_status ON ships(status);

DO $$
DECLARE
    col text;
BEGIN
    FOREACH col IN ARRAY ARRAY['weapons', 'officers', 'improvements', 'cargo_manifest'] LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'ships'
              AND column_name = col AND data_type = 'jsonb'
        ) THEN
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON ships USING GIN (%I)',
                CASE col WHEN 'cargo_manifest' THEN 'idx_ships_cargo' ELSE 'idx_ships_' || col END, col);
        END IF;
    END LOOP;
END $$;

COMMENT ON COLUMN ships.status IS 'Ship status: PC Active, Active, Docked, Lost, Sunk (replaces legacy pc_active)';

COMMIT;
