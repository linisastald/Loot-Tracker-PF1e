-- Migration: Fix PF1e lore accuracy
-- Bloodcove is in the Mwangi Expanse, not The Shackles (Inner Sea World Guide)

UPDATE city SET region = 'Mwangi Expanse' WHERE name = 'Bloodcove' AND region = 'The Shackles';
