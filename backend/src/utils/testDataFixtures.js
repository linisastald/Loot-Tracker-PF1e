// src/utils/testDataFixtures.js
//
// Fixture rows for the test-data generator (controllers/testDataController.js).
// Pure data and row builders: nothing here touches the database. Rows that
// belong to a seeded account or character are built from the ids the
// controller looked up, so each user is paired with their own character.

/** Test accounts, in the order their characters are listed below. */
const TEST_USERNAMES = ['testplayer1', 'testplayer2', 'testplayer3', 'testplayer4'];
const TEST_EMAILS = ['player1@test.com', 'player2@test.com', 'player3@test.com', 'player4@test.com'];

/** One character per test account (same index as TEST_USERNAMES). */
const TEST_CHARACTERS = [
    {name: 'Captain Blackwater', appraisalBonus: 8},
    {name: 'Quartermaster Swift', appraisalBonus: 6},
    {name: 'Navigator Reef', appraisalBonus: 7},
    {name: 'Gunner Ironbeard', appraisalBonus: 5},
];

const TEST_SHIPS = [
    {name: 'The Salty Revenge', location: 'Port Peril', isSquibbing: false, damage: 0},
    {name: 'Crimson Wave', location: 'Bloodcove', isSquibbing: true, damage: 15},
    {name: 'Storm Dancer', location: 'At Sea', isSquibbing: false, damage: 8},
    {name: 'Dead Mans Folly', location: 'Drenchport', isSquibbing: false, damage: 25},
    {name: "The Kraken's Bane", location: 'Sargava', isSquibbing: false, damage: 0},
];

const TEST_OUTPOSTS = [
    {name: 'Rickety Squibs', location: 'Rickety Hinge', accessDate: '2024-01-15'},
    {name: 'Pirates Den', location: 'Tortuga', accessDate: '2024-02-20'},
    {name: 'Smugglers Cove', location: 'Hidden Bay', accessDate: '2024-03-10'},
    {name: 'Port Royal Trading Post', location: 'Port Royal', accessDate: '2024-01-05'},
];

/**
 * Crew rows: [name, race, age, description, location_type, location_id, ship_position, is_alive].
 * The first nine live on the first three test ships, the last four at the four outposts.
 * @param {number[]} shipIds - Ids of TEST_SHIPS[0..2]
 * @param {number[]} outpostIds - Ids of TEST_OUTPOSTS[0..3]
 */
const crewRows = (shipIds, outpostIds) => [
    ['First Mate Rodriguez', 'Human', 35, 'Experienced sailor with a keen eye for trouble', 'ship', shipIds[0], 'First Mate', true],
    ['Bosun Thompson', 'Human', 42, 'Gruff but fair, keeps the crew in line', 'ship', shipIds[0], 'Bosun', true],
    ['Rigger "Nimble" Pete', 'Halfling', 28, 'Quick on the rigging, quicker with a joke', 'ship', shipIds[0], 'Rigger', true],
    ['Cook Martha', 'Human', 38, 'Makes the best hardtack this side of the Shackles', 'ship', shipIds[0], 'Cook', true],
    ['Captain Scarface', 'Human', 45, 'Battle-hardened pirate captain', 'ship', shipIds[1], 'Captain', true],
    ['Gunner Blackpowder', 'Dwarf', 52, 'Expert with cannons and explosives', 'ship', shipIds[1], 'Master Gunner', true],
    ['Lookout Sharp-Eye', 'Elf', 120, 'Can spot a sail on the horizon from leagues away', 'ship', shipIds[1], 'Lookout', true],
    ['Navigator Starweaver', 'Human', 31, 'Reads the stars like a book', 'ship', shipIds[2], 'Navigator', true],
    ['Carpenter Jenkins', 'Human', 39, 'Keeps the ship seaworthy through any storm', 'ship', shipIds[2], 'Carpenter', true],
    ['Dockmaster Willem', 'Human', 48, 'Manages the port operations', 'outpost', outpostIds[0], null, true],
    ['Trader Goldfingers', 'Halfling', 34, 'Deals in rare goods and information', 'outpost', outpostIds[1], null, true],
    ['Guard Captain Steel', 'Human', 41, 'Protects the outpost from threats', 'outpost', outpostIds[2], null, true],
    ['Innkeeper Rosie', 'Human', 44, 'Provides room and board for weary sailors', 'outpost', outpostIds[3], null, true],
];

/** Loot rows are skipped when this seeded row already exists (re-runs must not duplicate them). */
const LOOT_SENTINEL = {name: 'Masterwork Cutlass', sessionDate: '2024-08-01'};

/**
 * Loot rows: [session_date, quantity, name, unidentified, masterwork, type, size, status,
 * itemid, value, whohas, whoupdated, notes].
 * @param {number} dmId - The account that generated the data (whoupdated)
 * @param {number[]} characterIds - One character id per test account, in TEST_USERNAMES order
 */
const lootRows = (dmId, characterIds) => [
    // Recent session loot (unprocessed)
    ['2024-08-01', 1, 'Masterwork Cutlass', false, true, 'weapon', 'medium', 'Unprocessed', null, 315, null, dmId, "Found in captain's quarters"],
    ['2024-08-01', 3, 'Potion of Cure Light Wounds', false, false, 'magic', 'small', 'Unprocessed', null, 150, null, dmId, 'Standard healing potions'],
    ['2024-08-01', 1, 'Unknown Ring', true, false, 'magic', 'tiny', 'Unprocessed', null, null, null, dmId, 'Magical aura detected'],
    ['2024-08-01', 2, 'Bag of Holding (Type I)', false, false, 'magic', 'small', 'Unprocessed', null, 5000, null, dmId, 'Two matching bags found'],
    ['2024-08-01', 50, 'Crossbow Bolts', false, false, 'weapon', 'small', 'Unprocessed', null, 25, null, dmId, 'High quality bolts'],

    // Previous session loot (some kept, some sold)
    ['2024-07-20', 1, 'Chain Shirt +1', false, false, 'armor', 'medium', 'Kept Character', null, 1250, characterIds[0], dmId, 'Enchanted chain armor'],
    ['2024-07-20', 1, 'Rapier +1', false, false, 'weapon', 'medium', 'Kept Character', null, 2320, characterIds[1], dmId, 'Fencing sword with enhancement'],
    ['2024-07-20', 4, 'Pearl', false, false, 'trade good', 'tiny', 'Sold', null, 400, null, dmId, 'High quality pearls'],
    ['2024-07-20', 1, 'Spyglass', false, true, 'gear', 'small', 'Kept Party', null, 1000, null, dmId, 'Masterwork navigation tool'],
    ['2024-07-20', 10, 'Silver Pieces (Foreign)', false, false, 'trade good', 'tiny', 'Sold', null, 150, null, dmId, 'Chelaxian silver coins'],

    // Older session loot
    ['2024-07-05', 1, 'Cloak of Resistance +1', false, false, 'magic', 'medium', 'Kept Character', null, 1000, characterIds[2], dmId, 'Provides protection against various effects'],
    ['2024-07-05', 2, "Alchemist's Fire", false, false, 'gear', 'small', 'Kept Party', null, 40, null, dmId, 'For emergency use'],
    ['2024-07-05', 1, 'Scroll of Fireball', false, false, 'magic', 'tiny', 'Kept Party', null, 375, null, dmId, '5th level caster, 3rd level spell'],
    ['2024-07-05', 6, 'Gems (Various)', false, false, 'trade good', 'tiny', 'Sold', null, 1200, null, dmId, 'Mixed precious stones'],
    ['2024-07-05', 1, 'Cursed Sword', false, false, 'weapon', 'medium', 'Trashed', null, 0, null, dmId, 'Cursed weapon - disposed of safely'],

    // Additional variety
    ['2024-06-15', 1, 'Boots of Elvenkind', false, false, 'magic', 'medium', 'Kept Character', null, 2500, characterIds[0], dmId, 'Silent movement boots'],
    ['2024-06-15', 3, 'Masterwork Dagger', false, true, 'weapon', 'small', 'Sold', null, 906, null, dmId, 'Well-crafted throwing knives'],
    ['2024-06-15', 1, 'Rod of Wonder', true, false, 'magic', 'medium', 'Kept Party', null, null, null, dmId, 'Unpredictable magical effects'],
    ['2024-06-15', 1, 'Plate Armor +2', false, false, 'armor', 'heavy', 'Kept Character', null, 5650, characterIds[3], dmId, 'Heavy magical armor'],
    ['2024-06-15', 20, 'Arrows +1', false, false, 'weapon', 'small', 'Kept Party', null, 164, null, dmId, 'Enchanted arrows'],
];

/** Gold rows are skipped when this seeded row already exists. */
const GOLD_SENTINEL = {transactionType: 'Party Loot Sale', notes: 'Sale of pearls and foreign silver'};

/**
 * Gold rows: [session_date, who, transaction_type, notes, copper, silver, gold, platinum, character_id].
 * @param {number} dmId - The account that generated the data
 * @param {number[]} userIds - One user id per test account, in TEST_USERNAMES order
 * @param {number[]} characterIds - One character id per test account, same order
 */
const goldRows = (dmId, userIds, characterIds) => [
    // Party loot sales
    ['2024-08-02', dmId, 'Party Loot Sale', 'Sale of pearls and foreign silver', 0, 0, 550, 0, null],
    ['2024-07-25', dmId, 'Party Loot Sale', 'Sold gems and art objects', 0, 0, 3600, 3, null],
    ['2024-06-20', dmId, 'Party Loot Sale', 'Various masterwork items', 0, 0, 2506, 2, null],

    // Individual character transactions
    ...characterIds.map((characterId) => ['2024-08-01', dmId, 'Party Payment', 'Share from recent loot sales', 0, 0, 137, 1, characterId]),
    ...characterIds.map((characterId) => ['2024-07-26', dmId, 'Party Payment', 'Share from gem sales', 0, 0, 901, 0, characterId]),

    // Individual purchases, each by the character's own player
    ['2024-07-22', userIds[0], 'Purchase', 'Bought potions and rope', 0, 5, 75, 0, characterIds[0]],
    ['2024-07-15', userIds[1], 'Purchase', 'New weapon and armor repairs', 0, 0, 150, 0, characterIds[1]],
    ['2024-07-10', userIds[2], 'Purchase', 'Spell components and scrolls', 0, 0, 200, 0, characterIds[2]],
    ['2024-07-05', userIds[3], 'Purchase', 'Ship supplies and rations', 0, 8, 45, 0, characterIds[3]],
];

module.exports = {
    TEST_USERNAMES,
    TEST_EMAILS,
    TEST_CHARACTERS,
    TEST_SHIPS,
    TEST_OUTPOSTS,
    LOOT_SENTINEL,
    GOLD_SENTINEL,
    crewRows,
    lootRows,
    goldRows,
};
