-- Migration: Golarion holidays
-- Description: Adds a golarion_holidays table for in-game holidays/festivals and
-- seeds the canonical official Pathfinder 1e holidays (validated against Paizo
-- sources: Inner Sea World Guide, Inner Sea Gods, Gods & Magic, the Golarion
-- Holidays blog series, and the Rise of the Runelords Player's Guide).
--
-- Dated holidays have month + day set; movable holidays (solstices/equinoxes,
-- weekday-anchored, or "date not specified in canon") have null month/day and a
-- movable_rule describing how the date is determined. Solstice/equinox holidays
-- are seeded with their conventional day AND a movable_rule. region marks
-- holidays observed only in a particular nation. DMs may add custom holidays
-- (is_custom = true); the official rows seeded here are is_custom = false.

CREATE TABLE IF NOT EXISTS golarion_holidays (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    month INTEGER,
    day INTEGER,
    category VARCHAR(50) NOT NULL DEFAULT 'Cultural',
    deity VARCHAR(100),
    region VARCHAR(100),
    description TEXT,
    movable_rule VARCHAR(255),
    is_custom BOOLEAN NOT NULL DEFAULT false,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golarion_holidays_month_day ON golarion_holidays (month, day);
CREATE INDEX IF NOT EXISTS idx_golarion_holidays_created_by ON golarion_holidays (created_by);

COMMENT ON TABLE golarion_holidays IS 'In-game Golarion holidays/festivals. Dated holidays have month+day; movable ones use movable_rule with null month/day.';
COMMENT ON COLUMN golarion_holidays.movable_rule IS 'How a movable date is determined (e.g. "Winter solstice", "Second Oathday of Rova"); null for fixed-date holidays.';
COMMENT ON COLUMN golarion_holidays.is_custom IS 'True for DM-added holidays; false for canonical official holidays.';

INSERT INTO golarion_holidays (name, month, day, category, deity, region, description, movable_rule) VALUES
    ('Foundation Day', 1, 1, 'Civic', NULL, 'Absalom', 'Marks Aroden raising the Starstone and founding Absalom in 1 AR; the start of the year.', NULL),
    ('Vault Day', 1, 6, 'Religious', 'Abadar', NULL, 'Abadaran festival celebrating wealth and the First Vault.', NULL),
    ('Ruby Prince''s Birthday', 1, 20, 'Civic', NULL, 'Osirion', 'Celebrates the birthday of Osirion''s Ruby Prince.', NULL),
    ('Merrymead', 2, 2, 'Cultural', NULL, 'Druma', 'A spring-anticipation feast drinking the previous year''s stored alcohol.', NULL),
    ('Treaty of Egorian', 2, 19, 'Civic', NULL, 'Cheliax', 'Commemorates a Chelish treaty.', NULL),
    ('Day of Bones', 3, 5, 'Religious', 'Pharasma', NULL, 'Honors Pharasma, Lady of Graves; the dead are remembered and graves tended.', NULL),
    ('Conquest Day', 3, 26, 'Civic', NULL, 'Nex', 'A regional Nexian holiday.', NULL),
    ('Currentseve', 4, 7, 'Religious', 'Gozreh', NULL, 'Seafarers and rivermen make offerings to Gozreh for safe passage in the coming year.', NULL),
    ('Taxfest', 4, 15, 'Religious', 'Abadar', NULL, 'Priests of Abadar accompany tax collectors, then sponsor free public celebrations.', NULL),
    ('Ascendance Night', 5, 2, 'Religious', 'Norgorber', NULL, 'Marks the quiet apotheosis of the Reaper of Reputation.', NULL),
    ('Burning Blades', 6, 10, 'Religious', 'Sarenrae', NULL, 'The dance of the burning blades celebrates Sarenrae''s healing light.', NULL),
    ('Sunwrought Festival', 6, 21, 'Religious', 'Sarenrae', NULL, 'Longest day: dances, fireworks, kite-flying, and a reenactment of Sarenrae''s battle with Rovagug.', 'Summer solstice'),
    ('Ritual of Stardust', 6, 21, 'Religious', 'Desna', NULL, 'Night-long bonfire songs; the faithful cast sand and powdered gems into the flames.', 'Summer solstice'),
    ('First Crusader Day', 8, 8, 'Civic', NULL, 'Mendev', 'A Mendevian holiday tied to the Worldwound crusades.', NULL),
    ('Armasse', 8, 16, 'Religious', 'Aroden', NULL, 'Commoners are trained to fight and heroic tales are told so others may learn from them.', NULL),
    ('Day of the Inheritor', 9, 19, 'Religious', 'Iomedae', NULL, 'Commemorates Iomedae''s church adopting the bereft faithful of the dead god Aroden.', NULL),
    ('Swallowtail Festival', 9, 23, 'Religious', 'Desna', 'Varisia', 'First day of autumn; storytelling, feasting, and the mass release of swallowtail butterflies in Desna''s honor.', 'Autumnal equinox'),
    ('Ascendance Day', 10, 6, 'Religious', 'Iomedae', NULL, 'Anniversary of Iomedae passing the Test of the Starstone and ascending to godhood.', NULL),
    ('Abjurant Day', 11, 8, 'Religious', 'Nethys', NULL, 'Communal strengthening of magical defenses and teaching magic to children.', NULL),
    ('Evoking Day', 11, 18, 'Religious', 'Nethys', NULL, 'Fireworks and magical duels, both mock and real.', NULL),
    ('Transmutatum', 11, 28, 'Religious', 'Nethys', NULL, 'A festival of self-improvement and transformation.', NULL),
    ('Ascension Day', 12, 11, 'Religious', 'Cayden Cailean', NULL, 'Celebrates Cayden Cailean''s drunken ascension via the Test of the Starstone.', NULL),
    ('Crystalhue', 12, 21, 'Religious', 'Shelyn', NULL, 'Shortest day: creation of art, exchange of small gifts and rainbow imagery, and new courtships.', 'Winter solstice'),
    ('Night of the Pale', 12, 31, 'Cultural', NULL, NULL, 'Last day of the year; the recent dead are said to return, so people lay charms and stay indoors until dawn.', NULL),
    ('Signing Day', NULL, NULL, 'Civic', NULL, NULL, 'Marks Andoran, Cheliax, Galt, and Isger''s independence from Taldor.', 'Second Oathday of Rova'),
    ('Harvest Feast', NULL, NULL, 'Seasonal', NULL, NULL, 'Celebrates the harvest and the end of the year''s fieldwork.', 'Second Moonday of Lamashan'),
    ('Market''s Door', NULL, NULL, 'Religious', 'Abadar', NULL, 'Priests bless markets selling the first fall harvest; the date varies yearly.', 'Variable (autumn)'),
    ('Remembrance Moon', NULL, NULL, 'Civic', NULL, 'Lastwall', 'Mourns those who died in the Shining Crusade against the Whispering Tyrant.', 'Full moon'),
    ('Candlemark', NULL, NULL, 'Religious', 'Sarenrae', NULL, 'A personal anniversary of when a worshipper joined Sarenrae''s faith.', 'Personal (winter solstice)')
ON CONFLICT (name) DO NOTHING;
