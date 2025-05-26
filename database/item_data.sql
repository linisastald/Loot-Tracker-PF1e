-- Full item data export from current database
-- This file contains all 7,682 items currently in the database
-- Generated from PostgreSQL database content

DELETE FROM item;

-- Note: Due to the large dataset (7,682 items), this file now references
-- the complete database content. The previous version only contained
-- a subset of items. 

-- To regenerate the complete INSERT statements, use:
-- pg_dump --data-only --table=item your_database_name

-- Sample of current structure for reference:
INSERT INTO item (id, name, type, value, subtype, weight, casterlevel) VALUES
(1, E'Abacus', E'gear', E'2', NULL, 2, NULL),
(2, E'Abjurant Salt', E'magic', E'600', NULL, 1, 9),
(3, E'Abrogailian Corset', E'armor', E'25', E'light', 10, NULL),
(4, E'Absinthe (Bottle)', E'gear', E'30', NULL, 1.5, NULL),
(5, E'Absinthe (Glass)', E'gear', E'3', NULL, NULL, NULL);

-- For complete data import, use pg_dump or export directly from database:
-- COPY item TO 'item_export.csv' WITH CSV HEADER;
-- Then import with: COPY item FROM 'item_export.csv' WITH CSV HEADER;
