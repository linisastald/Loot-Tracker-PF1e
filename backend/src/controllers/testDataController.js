// src/controllers/testDataController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const ValidationService = require('../services/validationService');
const bcrypt = require('bcryptjs');

/**
 * Generate test data for development/testing environments only
 */
const generateTestData = async (req, res) => {
  try {
    // Security check: Only allow on test environment
    const allowedOrigins = process.env.ALLOWED_ORIGINS || '';
    const isTestEnvironment = allowedOrigins.includes('test.kempsonandko.com');
    
    if (!isTestEnvironment) {
      throw controllerFactory.createForbiddenError('Test data generation is only available on test instances');
    }

    // Only DMs can generate test data
    ValidationService.requireDM(req);

    logger.info(`Test data generation initiated by DM ${req.user.id}`, {
      userId: req.user.id,
      timestamp: new Date().toISOString()
    });

    await dbUtils.executeTransaction(async (client) => {
      // Generate password hash for test users
      const testPassword = await bcrypt.hash('testpass123', 10);

      // Create test users
      const usersResult = await client.query(`
        INSERT INTO users (username, password, role, email) 
        SELECT * FROM (VALUES
          ('testplayer1', $1, 'player', 'player1@test.com'),
          ('testplayer2', $1, 'player', 'player2@test.com'),
          ('testplayer3', $1, 'player', 'player3@test.com'),
          ('testplayer4', $1, 'player', 'player4@test.com')
        ) AS v(username, password, role, email)
        WHERE NOT EXISTS (
          SELECT 1 FROM users WHERE username = v.username
        )
        RETURNING id, username
      `, [testPassword]);

      // Get user IDs (or existing ones if users already exist)
      const existingUsers = await client.query(`
        SELECT id FROM users WHERE username IN ('testplayer1', 'testplayer2', 'testplayer3', 'testplayer4')
        ORDER BY username
      `);
      
      const userIds = existingUsers.rows.map(row => row.id);

      // Create characters for test users
      if (userIds.length >= 4) {
        await client.query(`
          INSERT INTO characters (name, appraisal_bonus, active, user_id) 
          SELECT * FROM (VALUES
            ('Captain Blackwater', 8, true, $1::integer),
            ('Quartermaster Swift', 6, true, $2::integer),
            ('Navigator Reef', 7, true, $3::integer),
            ('Gunner Ironbeard', 5, true, $4::integer)
          ) AS v(name, appraisal_bonus, active, user_id)
          WHERE NOT EXISTS (
            SELECT 1 FROM characters WHERE name = v.name
          )
        `, [userIds[0], userIds[1], userIds[2], userIds[3]]);
      }

      // Create test ships
      await client.query(`
        INSERT INTO ships (name, location, is_squibbing, damage)
        SELECT * FROM (VALUES
          ('The Salty Revenge', 'Port Peril', false, 0),
          ('Crimson Wave', 'Bloodcove', true, 15),
          ('Storm Dancer', 'At Sea', false, 8),
          ('Dead Mans Folly', 'Drenchport', false, 25),
          ('The Kraken''s Bane', 'Sargava', false, 0)
        ) AS v(name, location, is_squibbing, damage)
        WHERE NOT EXISTS (
          SELECT 1 FROM ships WHERE name = v.name
        )
      `);

      // Create test outposts
      await client.query(`
        INSERT INTO outposts (name, location, access_date)
        SELECT * FROM (VALUES
          ('Rickety Squibs', 'Rickety Hinge', '2024-01-15'::date),
          ('Pirates Den', 'Tortuga', '2024-02-20'::date),
          ('Smugglers Cove', 'Hidden Bay', '2024-03-10'::date),
          ('Port Royal Trading Post', 'Port Royal', '2024-01-05'::date)
        ) AS v(name, location, access_date)
        WHERE NOT EXISTS (
          SELECT 1 FROM outposts WHERE name = v.name
        )
      `);

      // Get ship and outpost IDs for crew assignment
      const ships = await client.query('SELECT id FROM ships ORDER BY id LIMIT 5');
      const outposts = await client.query('SELECT id FROM outposts ORDER BY id LIMIT 4');
      const shipIds = ships.rows.map(row => row.id);
      const outpostIds = outposts.rows.map(row => row.id);

      // Create crew members (only if we have ships and outposts)
      if (shipIds.length >= 3 && outpostIds.length >= 4) {
        const crewData = [
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
          ['Innkeeper Rosie', 'Human', 44, 'Provides room and board for weary sailors', 'outpost', outpostIds[3], null, true]
        ];

        for (const crew of crewData) {
          await client.query(`
            INSERT INTO crew (name, race, age, description, location_type, location_id, ship_position, is_alive)
            SELECT $1::varchar(255), $2::varchar(100), $3::integer, $4::text, $5::varchar(20), $6::integer, $7::varchar(100), $8::boolean
            WHERE NOT EXISTS (
              SELECT 1 FROM crew WHERE name = $1::varchar(255)
            )
          `, crew);
        }
      }

      // Get character IDs for loot assignment
      const characters = await client.query(`
        SELECT id FROM characters WHERE name IN ('Captain Blackwater', 'Quartermaster Swift', 'Navigator Reef', 'Gunner Ironbeard')
        ORDER BY name
      `);
      const characterIds = characters.rows.map(row => row.id);

      // Create test loot entries (only if we have characters)
      if (characterIds.length >= 4) {
        const lootData = [
        // Recent session loot (unprocessed)
        ['2024-08-01', 1, 'Masterwork Cutlass', false, true, 'weapon', 'medium', 'Unprocessed', 1, 315, null, req.user.id, 'Found in captain\'s quarters'],
        ['2024-08-01', 3, 'Potion of Cure Light Wounds', false, false, 'potion', 'small', 'Unprocessed', null, 150, null, req.user.id, 'Standard healing potions'],
        ['2024-08-01', 1, 'Unknown Ring', true, false, 'ring', 'tiny', 'Unprocessed', null, null, null, req.user.id, 'Magical aura detected'],
        ['2024-08-01', 2, 'Bag of Holding (Type I)', false, false, 'wondrous', 'small', 'Unprocessed', null, 5000, null, req.user.id, 'Two matching bags found'],
        ['2024-08-01', 50, 'Crossbow Bolts', false, false, 'ammunition', 'small', 'Unprocessed', null, 25, null, req.user.id, 'High quality bolts'],
        
        // Previous session loot (some kept, some sold)
        ['2024-07-20', 1, 'Chain Shirt +1', false, false, 'armor', 'medium', 'Kept Self', null, 1250, characterIds[0], req.user.id, 'Enchanted chain armor'],
        ['2024-07-20', 1, 'Rapier +1', false, false, 'weapon', 'medium', 'Kept Self', null, 2320, characterIds[1], req.user.id, 'Fencing sword with enhancement'],
        ['2024-07-20', 4, 'Pearl', false, false, 'gem', 'tiny', 'Sold', null, 400, null, req.user.id, 'High quality pearls'],
        ['2024-07-20', 1, 'Spyglass', false, true, 'tool', 'small', 'Kept Party', null, 1000, null, req.user.id, 'Masterwork navigation tool'],
        ['2024-07-20', 10, 'Silver Pieces (Foreign)', false, false, 'treasure', 'tiny', 'Sold', null, 150, null, req.user.id, 'Chelaxian silver coins'],
        
        // Older session loot
        ['2024-07-05', 1, 'Cloak of Resistance +1', false, false, 'cloak', 'medium', 'Kept Self', null, 1000, characterIds[2], req.user.id, 'Provides protection against various effects'],
        ['2024-07-05', 2, 'Alchemist\'s Fire', false, false, 'alchemical', 'small', 'Kept Party', null, 40, null, req.user.id, 'For emergency use'],
        ['2024-07-05', 1, 'Scroll of Fireball', false, false, 'scroll', 'tiny', 'Kept Party', null, 375, null, req.user.id, '5th level caster, 3rd level spell'],
        ['2024-07-05', 6, 'Gems (Various)', false, false, 'gem', 'tiny', 'Sold', null, 1200, null, req.user.id, 'Mixed precious stones'],
        ['2024-07-05', 1, 'Cursed Sword', false, false, 'weapon', 'medium', 'Trash', null, 0, null, req.user.id, 'Cursed weapon - disposed of safely'],
        
        // Additional variety
        ['2024-06-15', 1, 'Boots of Elvenkind', false, false, 'boots', 'medium', 'Kept Self', null, 2500, characterIds[0], req.user.id, 'Silent movement boots'],
        ['2024-06-15', 3, 'Masterwork Dagger', false, true, 'weapon', 'small', 'Sold', null, 906, null, req.user.id, 'Well-crafted throwing knives'],
        ['2024-06-15', 1, 'Rod of Wonder', true, false, 'rod', 'medium', 'Kept Party', null, null, null, req.user.id, 'Unpredictable magical effects'],
        ['2024-06-15', 1, 'Plate Armor +2', false, false, 'armor', 'heavy', 'Kept Self', null, 5650, characterIds[3], req.user.id, 'Heavy magical armor'],
        ['2024-06-15', 20, 'Arrows +1', false, false, 'ammunition', 'small', 'Kept Party', null, 164, null, req.user.id, 'Enchanted arrows']
      ];

        for (const loot of lootData) {
          await client.query(`
            INSERT INTO loot (session_date, quantity, name, unidentified, masterwork, type, size, status, itemid, value, whohas, whoupdated, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `, loot);
        }

        // Create gold transaction data
        const goldData = [
        // Party loot sales
        ['2024-08-02', req.user.id, 'Party Loot Sale', 'Sale of pearls and foreign silver', 0, 0, 550, 0, null],
        ['2024-07-25', req.user.id, 'Party Loot Sale', 'Sold gems and art objects', 0, 0, 3600, 3, null],
        ['2024-06-20', req.user.id, 'Party Loot Sale', 'Various masterwork items', 0, 0, 2506, 2, null],
        
        // Individual character transactions
        ['2024-08-01', req.user.id, 'Party Payment', 'Share from recent loot sales', 0, 0, 137, 1, characterIds[0]],
        ['2024-08-01', req.user.id, 'Party Payment', 'Share from recent loot sales', 0, 0, 137, 1, characterIds[1]],
        ['2024-08-01', req.user.id, 'Party Payment', 'Share from recent loot sales', 0, 0, 137, 1, characterIds[2]],
        ['2024-08-01', req.user.id, 'Party Payment', 'Share from recent loot sales', 0, 0, 137, 1, characterIds[3]],
        
        ['2024-07-26', req.user.id, 'Party Payment', 'Share from gem sales', 0, 0, 901, 0, characterIds[0]],
        ['2024-07-26', req.user.id, 'Party Payment', 'Share from gem sales', 0, 0, 901, 0, characterIds[1]],
        ['2024-07-26', req.user.id, 'Party Payment', 'Share from gem sales', 0, 0, 901, 0, characterIds[2]],
        ['2024-07-26', req.user.id, 'Party Payment', 'Share from gem sales', 0, 0, 901, 0, characterIds[3]],
        
        // Individual purchases
        ['2024-07-22', userIds[0], 'Purchase', 'Bought potions and rope', 0, 5, 75, 0, characterIds[0]],
        ['2024-07-15', userIds[1], 'Purchase', 'New weapon and armor repairs', 0, 0, 150, 0, characterIds[1]],
        ['2024-07-10', userIds[2], 'Purchase', 'Spell components and scrolls', 0, 0, 200, 0, characterIds[2]],
        ['2024-07-05', userIds[3], 'Purchase', 'Ship supplies and rations', 0, 8, 45, 0, characterIds[3]]
      ];

        for (const gold of goldData) {
          await client.query(`
            INSERT INTO gold (session_date, who, transaction_type, notes, copper, silver, gold, platinum, character_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, gold);
        }
      }

      // Get counts for response
      const counts = await Promise.all([
        client.query('SELECT COUNT(*) FROM users WHERE role = \'player\''),
        client.query('SELECT COUNT(*) FROM characters WHERE user_id > 1'),
        client.query('SELECT COUNT(*) FROM ships'),
        client.query('SELECT COUNT(*) FROM outposts'),
        client.query('SELECT COUNT(*) FROM crew'),
        client.query('SELECT COUNT(*) FROM loot'),
        client.query('SELECT COUNT(*) FROM gold')
      ]);

      const summary = {
        users: parseInt(counts[0].rows[0].count),
        characters: parseInt(counts[1].rows[0].count),
        ships: parseInt(counts[2].rows[0].count),
        outposts: parseInt(counts[3].rows[0].count),
        crew: parseInt(counts[4].rows[0].count),
        loot: parseInt(counts[5].rows[0].count),
        gold: parseInt(counts[6].rows[0].count)
      };

      logger.info('Test data generation completed successfully', {
        userId: req.user.id,
        summary
      });

      return controllerFactory.sendSuccessResponse(res, {
        message: 'Test data generated successfully',
        summary,
        testCredentials: {
          username: 'testplayer1-4',
          password: 'testpass123',
          note: 'Four test users created: testplayer1, testplayer2, testplayer3, testplayer4'
        }
      }, 'Test data generation completed');
    });

  } catch (error) {
    logger.error('Error generating test data:', error);
    throw error;
  }
};

// Export controller functions with factory wrappers
module.exports = {
  generateTestData: controllerFactory.createHandler(generateTestData, {
    errorMessage: 'Error generating test data'
  })
};