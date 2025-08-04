-- Test Data Generation Script for Pathfinder Loot Tracker
-- This script creates test data for the test.kempsonandko.com instance
-- Run this against your test database after it's been initialized

-- First, let's create some test users (players only, DM already exists)
INSERT INTO users (username, password, role, email) VALUES
('testplayer1', '$2b$10$example.hash.here', 'player', 'player1@test.com'),
('testplayer2', '$2b$10$example.hash.here', 'player', 'player2@test.com'),
('testplayer3', '$2b$10$example.hash.here', 'player', 'player3@test.com'),
('testplayer4', '$2b$10$example.hash.here', 'player', 'player4@test.com');

-- Create characters for each test user
-- Note: We'll use user IDs 2-5 assuming DM is ID 1
INSERT INTO characters (name, appraisal_bonus, active, user_id) VALUES
('Captain Blackwater', 8, true, 2),
('Quartermaster Swift', 6, true, 3),
('Navigator Reef', 7, true, 4),
('Gunner Ironbeard', 5, true, 5);

-- Create test ships with various statuses
INSERT INTO ships (name, location, is_squibbing, damage) VALUES
('The Salty Revenge', 'Port Peril', false, 0),
('Crimson Wave', 'Bloodcove', true, 15),
('Storm Dancer', 'At Sea', false, 8),
('Dead Mans Folly', 'Drenchport', false, 25),
('The Kraken''s Bane', 'Sargava', false, 0);

-- Create test outposts
INSERT INTO outposts (name, location, access_date) VALUES
('Rickety Squibs', 'Rickety Hinge', '2024-01-15'),
('Pirates Den', 'Tortuga', '2024-02-20'),
('Smugglers Cove', 'Hidden Bay', '2024-03-10'),
('Port Royal Trading Post', 'Port Royal', '2024-01-05');

-- Create crew members assigned to ships and outposts
INSERT INTO crew (name, race, age, description, location_type, location_id, ship_position, is_alive) VALUES
-- Crew for The Salty Revenge (ship id 1)
('First Mate Rodriguez', 'Human', 35, 'Experienced sailor with a keen eye for trouble', 'ship', 1, 'First Mate', true),
('Bosun Thompson', 'Human', 42, 'Gruff but fair, keeps the crew in line', 'ship', 1, 'Bosun', true),
('Rigger "Nimble" Pete', 'Halfling', 28, 'Quick on the rigging, quicker with a joke', 'ship', 1, 'Rigger', true),
('Cook Martha', 'Human', 38, 'Makes the best hardtack this side of the Shackles', 'ship', 1, 'Cook', true),

-- Crew for Crimson Wave (ship id 2)
('Captain Scarface', 'Human', 45, 'Battle-hardened pirate captain', 'ship', 2, 'Captain', true),
('Gunner Blackpowder', 'Dwarf', 52, 'Expert with cannons and explosives', 'ship', 2, 'Master Gunner', true),
('Lookout Sharp-Eye', 'Elf', 120, 'Can spot a sail on the horizon from leagues away', 'ship', 2, 'Lookout', true),

-- Crew for Storm Dancer (ship id 3)
('Navigator Starweaver', 'Human', 31, 'Reads the stars like a book', 'ship', 3, 'Navigator', true),
('Carpenter Jenkins', 'Human', 39, 'Keeps the ship seaworthy through any storm', 'ship', 3, 'Carpenter', true),

-- Crew at outposts
('Dockmaster Willem', 'Human', 48, 'Manages the port operations', 'outpost', 1, null, true),
('Trader Goldfingers', 'Halfling', 34, 'Deals in rare goods and information', 'outpost', 2, null, true),
('Guard Captain Steel', 'Human', 41, 'Protects the outpost from threats', 'outpost', 3, null, true),
('Innkeeper Rosie', 'Human', 44, 'Provides room and board for weary sailors', 'outpost', 4, null, true),

-- Some deceased/departed crew for realism
('Old Tom', 'Human', 67, 'Veteran sailor who knew these waters well', 'ship', 1, 'Sailor', false),
('Young Billy', 'Human', 19, 'Promising sailor who left for family reasons', 'ship', 2, 'Sailor', true);

-- Update the deceased/departed crew with appropriate dates
UPDATE crew SET death_date = '2024-02-15' WHERE name = 'Old Tom';
UPDATE crew SET departure_date = '2024-03-01', departure_reason = 'Family emergency back home' WHERE name = 'Young Billy';

-- Generate test loot entries
-- We'll create a variety of items with different statuses and values
INSERT INTO loot (session_date, quantity, name, unidentified, masterwork, type, size, status, itemid, value, whohas, whoupdated, notes) VALUES
-- Recent session loot (unprocessed)
('2024-08-01', 1, 'Masterwork Cutlass', false, true, 'weapon', 'medium', 'Unprocessed', 1, 315, null, 1, 'Found in captain''s quarters'),
('2024-08-01', 3, 'Potion of Cure Light Wounds', false, false, 'potion', 'small', 'Unprocessed', 45, 150, null, 1, 'Standard healing potions'),
('2024-08-01', 1, 'Unknown Ring', true, false, 'ring', 'tiny', 'Unprocessed', null, null, null, 1, 'Magical aura detected'),
('2024-08-01', 2, 'Bag of Holding (Type I)', false, false, 'wondrous', 'small', 'Unprocessed', 78, 5000, null, 1, 'Two matching bags found'),
('2024-08-01', 50, 'Crossbow Bolts', false, false, 'ammunition', 'small', 'Unprocessed', 12, 25, null, 1, 'High quality bolts'),

-- Previous session loot (some kept, some sold)
('2024-07-20', 1, 'Chain Shirt +1', false, false, 'armor', 'medium', 'Kept Self', 23, 1250, 2, 1, 'Enchanted chain armor'),
('2024-07-20', 1, 'Rapier +1', false, false, 'weapon', 'medium', 'Kept Self', 8, 2320, 3, 1, 'Fencing sword with enhancement'),
('2024-07-20', 4, 'Pearl', false, false, 'gem', 'tiny', 'Sold', 89, 400, null, 1, 'High quality pearls'),
('2024-07-20', 1, 'Spyglass', false, true, 'tool', 'small', 'Kept Party', 67, 1000, null, 1, 'Masterwork navigation tool'),
('2024-07-20', 10, 'Silver Pieces (Foreign)', false, false, 'treasure', 'tiny', 'Sold', null, 150, null, 1, 'Chelaxian silver coins'),

-- Older session loot
('2024-07-05', 1, 'Cloak of Resistance +1', false, false, 'cloak', 'medium', 'Kept Self', 34, 1000, 4, 1, 'Provides protection against various effects'),
('2024-07-05', 2, 'Alchemist''s Fire', false, false, 'alchemical', 'small', 'Kept Party', 56, 40, null, 1, 'For emergency use'),
('2024-07-05', 1, 'Scroll of Fireball', false, false, 'scroll', 'tiny', 'Kept Party', 91, 375, null, 1, '5th level caster, 3rd level spell'),
('2024-07-05', 6, 'Gems (Various)', false, false, 'gem', 'tiny', 'Sold', null, 1200, null, 1, 'Mixed precious stones'),
('2024-07-05', 1, 'Cursed Sword', false, false, 'weapon', 'medium', 'Trash', 15, 0, null, 1, 'Cursed weapon - disposed of safely'),

-- Even older sessions with variety
('2024-06-15', 1, 'Boots of Elvenkind', false, false, 'boots', 'medium', 'Kept Self', 42, 2500, 2, 1, 'Silent movement boots'),
('2024-06-15', 3, 'Masterwork Dagger', false, true, 'weapon', 'small', 'Sold', 3, 906, null, 1, 'Well-crafted throwing knives'),
('2024-06-15', 1, 'Rod of Wonder', true, false, 'rod', 'medium', 'Kept Party', 88, null, null, 1, 'Unpredictable magical effects'),
('2024-06-15', 1, 'Plate Armor +2', false, false, 'armor', 'heavy', 'Kept Self', 29, 5650, 5, 1, 'Heavy magical armor'),
('2024-06-15', 20, 'Arrows +1', false, false, 'ammunition', 'small', 'Kept Party', 13, 164, null, 1, 'Enchanted arrows'),

-- Add more loot entries with various statuses and characters
('2024-06-01', 1, 'Amulet of Natural Armor +1', false, false, 'amulet', 'tiny', 'Kept Self', 31, 2000, 3, 1, 'Provides natural armor bonus'),
('2024-06-01', 2, 'Wand of Magic Missile', false, false, 'wand', 'small', 'Kept Party', 77, 1500, null, 1, '25 charges remaining'),
('2024-06-01', 1, 'Belt of Giant Strength +2', false, false, 'belt', 'medium', 'Kept Self', 38, 4000, 4, 1, 'Enhances physical strength'),
('2024-06-01', 5, 'Potion of Water Breathing', false, false, 'potion', 'small', 'Kept Party', 47, 375, null, 1, 'Essential for underwater exploration'),
('2024-06-01', 12, 'Art Objects (Various)', false, false, 'art', 'small', 'Sold', null, 2400, null, 1, 'Paintings and sculptures'),

('2024-05-20', 1, 'Ring of Protection +1', false, false, 'ring', 'tiny', 'Kept Self', 26, 2000, 2, 1, 'Deflection bonus to AC'),
('2024-05-20', 3, 'Smokestick', false, false, 'alchemical', 'small', 'Kept Party', 58, 60, null, 1, 'Concealment tools'),
('2024-05-20', 1, 'Handy Haversack', false, false, 'bag', 'medium', 'Kept Self', 71, 2000, 3, 1, 'Magical backpack'),
('2024-05-20', 8, 'Masterwork Tools', false, true, 'tool', 'small', 'Sold', 69, 1600, null, 1, 'Various artisan tools'),
('2024-05-20', 1, 'Decanter of Endless Water', false, false, 'wondrous', 'medium', 'Kept Party', 85, 9000, null, 1, 'Provides unlimited fresh water'),

-- Add some more recent unprocessed items
('2024-08-01', 1, 'Mysterious Compass', true, false, 'wondrous', 'small', 'Unprocessed', null, null, null, 1, 'Points to something other than north'),
('2024-08-01', 4, 'Fine Wine', false, false, 'trade good', 'medium', 'Unprocessed', null, 200, null, 1, 'Expensive vintage from Cheliax'),
('2024-08-01', 1, 'Ship''s Cannon', false, false, 'siege weapon', 'large', 'Unprocessed', null, 6000, null, 1, 'Medium siege weapon'),
('2024-08-01', 6, 'Cannonballs', false, false, 'ammunition', 'medium', 'Unprocessed', null, 60, null, 1, 'For the cannon'),
('2024-08-01', 1, 'Captain''s Log', false, false, 'book', 'small', 'Kept Party', null, 0, null, 1, 'Contains valuable navigation information'),

-- Add some variety with different types and sizes
('2024-07-28', 2, 'Everburning Torch', false, false, 'light', 'small', 'Kept Party', 64, 220, null, 1, 'Never needs fuel'),
('2024-07-28', 1, 'Immovable Rod', false, false, 'rod', 'medium', 'Kept Party', 82, 5000, null, 1, 'Can be fixed in place'),
('2024-07-28', 3, 'Tanglefoot Bag', false, false, 'alchemical', 'small', 'Kept Party', 59, 150, null, 1, 'Entangles enemies'),
('2024-07-28', 1, 'Folding Boat', false, false, 'wondrous', 'small', 'Kept Party', 86, 7200, null, 1, 'Transforms into a boat'),
('2024-07-28', 10, 'Caltrops', false, false, 'weapon', 'small', 'Kept Party', 18, 10, null, 1, 'Area denial weapon');

-- Generate gold transaction data
INSERT INTO gold (session_date, who, transaction_type, notes, copper, silver, gold, platinum, character_id) VALUES
-- Party loot sales
('2024-08-02', 1, 'Party Loot Sale', 'Sale of pearls and foreign silver', 0, 0, 550, 0, null),
('2024-07-25', 1, 'Party Loot Sale', 'Sold gems and art objects', 0, 0, 3600, 3, null),
('2024-06-20', 1, 'Party Loot Sale', 'Various masterwork items', 0, 0, 2506, 2, null),

-- Individual character transactions
('2024-08-01', 1, 'Party Payment', 'Share from recent loot sales', 0, 0, 137, 1, 2),
('2024-08-01', 1, 'Party Payment', 'Share from recent loot sales', 0, 0, 137, 1, 3),
('2024-08-01', 1, 'Party Payment', 'Share from recent loot sales', 0, 0, 137, 1, 4),
('2024-08-01', 1, 'Party Payment', 'Share from recent loot sales', 0, 0, 137, 1, 5),

('2024-07-26', 1, 'Party Payment', 'Share from gem sales', 0, 0, 901, 0, 2),
('2024-07-26', 1, 'Party Payment', 'Share from gem sales', 0, 0, 901, 0, 3),
('2024-07-26', 1, 'Party Payment', 'Share from gem sales', 0, 0, 901, 0, 4),
('2024-07-26', 1, 'Party Payment', 'Share from gem sales', 0, 0, 901, 0, 5),

-- Individual purchases
('2024-07-22', 2, 'Purchase', 'Bought potions and rope', 0, 5, 75, 0, 2),
('2024-07-15', 3, 'Purchase', 'New weapon and armor repairs', 0, 0, 150, 0, 3),
('2024-07-10', 4, 'Purchase', 'Spell components and scrolls', 0, 0, 200, 0, 4),
('2024-07-05', 5, 'Purchase', 'Ship supplies and rations', 0, 8, 45, 0, 5),

-- More party payments from earlier sessions
('2024-06-21', 1, 'Party Payment', 'Share from masterwork tool sales', 0, 0, 401, 0, 2),
('2024-06-21', 1, 'Party Payment', 'Share from masterwork tool sales', 0, 0, 401, 0, 3),
('2024-06-21', 1, 'Party Payment', 'Share from masterwork tool sales', 0, 0, 401, 0, 4),
('2024-06-21', 1, 'Party Payment', 'Share from masterwork tool sales', 0, 0, 401, 0, 5),

-- Individual withdrawals/purchases
('2024-06-15', 2, 'Withdrawal', 'Personal expenses in port', 0, 0, 25, 0, 2),
('2024-06-10', 3, 'Purchase', 'Bought new equipment', 0, 0, 180, 0, 3),
('2024-06-05', 4, 'Withdrawal', 'Shore leave expenses', 0, 0, 30, 0, 4),
('2024-06-01', 5, 'Purchase', 'Cartography supplies', 0, 0, 85, 0, 5),

-- Some larger transactions
('2024-05-25', 1, 'Party Loot Sale', 'Major treasure haul', 0, 0, 1250, 12, null),
('2024-05-26', 1, 'Party Payment', 'Share from major haul', 0, 0, 312, 3, 2),
('2024-05-26', 1, 'Party Payment', 'Share from major haul', 0, 0, 312, 3, 3),
('2024-05-26', 1, 'Party Payment', 'Share from major haul', 0, 0, 312, 3, 4),
('2024-05-26', 1, 'Party Payment', 'Share from major haul', 0, 0, 312, 3, 5),

-- Mixed smaller transactions
('2024-05-20', 2, 'Purchase', 'Alchemical supplies', 50, 2, 12, 0, 2),
('2024-05-18', 3, 'Withdrawal', 'Personal gear maintenance', 0, 0, 15, 0, 3),
('2024-05-15', 4, 'Purchase', 'Spell research materials', 0, 0, 95, 0, 4),
('2024-05-12', 5, 'Purchase', 'Navigation charts', 0, 0, 40, 0, 5),

-- Recent small transactions
('2024-07-30', 2, 'Purchase', 'Rations and basic supplies', 0, 8, 5, 0, 2),
('2024-07-28', 3, 'Purchase', 'Weapon maintenance', 0, 0, 10, 0, 3),
('2024-07-25', 4, 'Withdrawal', 'Port expenses', 0, 0, 20, 0, 4),
('2024-07-22', 5, 'Purchase', 'Ship repair contribution', 0, 0, 75, 0, 5);

-- Print summary of generated data
SELECT 'Test data generation complete!' as status;
SELECT 'Users created: ' || COUNT(*) as summary FROM users WHERE role = 'player';
SELECT 'Characters created: ' || COUNT(*) as summary FROM characters WHERE user_id > 1;
SELECT 'Ships created: ' || COUNT(*) as summary FROM ships;
SELECT 'Outposts created: ' || COUNT(*) as summary FROM outposts;
SELECT 'Crew members created: ' || COUNT(*) as summary FROM crew;
SELECT 'Loot entries created: ' || COUNT(*) as summary FROM loot;
SELECT 'Gold transactions created: ' || COUNT(*) as summary FROM gold;