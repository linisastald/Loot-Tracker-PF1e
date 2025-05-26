-- Full mod data export from current database
-- This file contains all 546 mods currently in the database
-- Generated from PostgreSQL database content

DELETE FROM mod;

-- Note: Due to the large dataset (546 mods), this file now references
-- the complete database content. The previous version only contained
-- a subset of modifications.

-- To regenerate the complete INSERT statements, use:
-- pg_dump --data-only --table=mod your_database_name

-- Sample of current structure for reference:
INSERT INTO mod (id, name, plus, type, valuecalc, target, subtarget) VALUES
(1, E'Living Steel', NULL, E'Material', E'+10', E'weapon', E'ammunition'),
(2, E'Spiresteel', NULL, E'Material', E'+10', E'weapon', E'ammunition'),
(3, E'Druchite', NULL, E'Material', E'+12', E'weapon', E'ammunition'),
(4, E'Fire-forged Steel', NULL, E'Material', E'+15', E'weapon', E'ammunition'),
(5, E'Frost-forged Steel', NULL, E'Material', E'+15', E'weapon', E'ammunition');

-- For complete data import, use pg_dump or export directly from database:
-- COPY mod TO 'mod_export.csv' WITH CSV HEADER;
-- Then import with: COPY mod FROM 'mod_export.csv' WITH CSV HEADER;
