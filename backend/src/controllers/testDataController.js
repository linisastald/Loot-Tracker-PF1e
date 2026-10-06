// src/controllers/testDataController.js
const crypto = require('crypto');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const ValidationService = require('../services/validationService');
const {hashPassword} = require('../utils/passwordPolicy');
const fixtures = require('../utils/testDataFixtures');

/** Host of the one deployment where test data may be generated. */
const TEST_INSTANCE_HOSTNAME = 'test.kempsonandko.com';

/** Roles the login endpoint accepts for a per-campaign player account. */
const TEST_USER_ROLE = 'Player';

/**
 * Whether ALLOWED_ORIGINS lists the test instance. Each comma-separated entry
 * is parsed as a URL and its host must equal the test host exactly, so a
 * lookalike host or a path containing the name does not count.
 */
const isTestInstance = () => (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .some((origin) => {
        try {
            return new URL(origin.trim()).hostname === TEST_INSTANCE_HOSTNAME;
        } catch {
            return false;
        }
    });

/** A fresh random password (96 bits, 16 URL-safe characters) for the test accounts. */
const generateTestPassword = () => crypto.randomBytes(12).toString('base64url');

/**
 * Create the test accounts (existing ones are kept), give them the fresh
 * password, and make them Players of the caller's current campaign.
 * @returns {Promise<number[]>} User ids in TEST_USERNAMES order
 */
const seedUsers = async (client, passwordHash, campaignId) => {
    await client.query(`
        INSERT INTO users (username, password, role, email)
        SELECT v.username, $1::varchar(255), '${TEST_USER_ROLE}'::varchar(7), v.email
        FROM unnest($2::varchar(255)[], $3::varchar(255)[]) AS v(username, email)
        WHERE NOT EXISTS (
            SELECT 1 FROM users WHERE username = v.username
        )
    `, [passwordHash, fixtures.TEST_USERNAMES, fixtures.TEST_EMAILS]);

    // Accounts from an earlier run keep their old password otherwise, and the
    // password returned to the caller would not work
    await client.query(
        'UPDATE users SET password = $1, password_changed_at = NOW() WHERE username = ANY($2)',
        [passwordHash, fixtures.TEST_USERNAMES]
    );

    const users = await client.query(
        'SELECT id, username FROM users WHERE username = ANY($1)',
        [fixtures.TEST_USERNAMES]
    );
    const idByUsername = new Map(users.rows.map((row) => [row.username, row.id]));
    const userIds = fixtures.TEST_USERNAMES.map((name) => idByUsername.get(name)).filter((id) => id !== undefined);

    await client.query(
        `INSERT INTO user_campaign (user_id, campaign_id, role)
         SELECT id, $2, $3 FROM unnest($1::integer[]) AS id
         ON CONFLICT DO NOTHING`,
        [userIds, campaignId, 'Player']
    );

    return userIds;
};

/**
 * Ids of the named rows of a table, in the order of `names`.
 * @param {string} table - 'characters', 'ships' or 'outposts' (fixed literals, never user input)
 * @returns {Promise<number[]>} Ids of the rows found, in order; shorter than `names` when some are missing
 */
const idsByName = async (client, table, names) => {
    const result = await client.query(`SELECT id, name FROM ${table} WHERE name = ANY($1)`, [names]);
    const idByName = new Map(result.rows.map((row) => [row.name, row.id]));
    return names.map((name) => idByName.get(name)).filter((id) => id !== undefined);
};

const seedCharacters = async (client, userIds) => {
    await client.query(`
        INSERT INTO characters (name, appraisal_bonus, active, user_id)
        SELECT v.name, v.appraisal_bonus, true, v.user_id
        FROM unnest($1::varchar(255)[], $2::integer[], $3::integer[]) AS v(name, appraisal_bonus, user_id)
        WHERE NOT EXISTS (
            SELECT 1 FROM characters WHERE name = v.name
        )
    `, [
        fixtures.TEST_CHARACTERS.map((c) => c.name),
        fixtures.TEST_CHARACTERS.map((c) => c.appraisalBonus),
        userIds,
    ]);
};

const seedShipsAndOutposts = async (client) => {
    await client.query(`
        INSERT INTO ships (name, location, is_squibbing, damage)
        SELECT * FROM unnest($1::varchar(255)[], $2::varchar(255)[], $3::boolean[], $4::integer[]) AS v(name, location, is_squibbing, damage)
        WHERE NOT EXISTS (
            SELECT 1 FROM ships WHERE name = v.name
        )
    `, [
        fixtures.TEST_SHIPS.map((s) => s.name),
        fixtures.TEST_SHIPS.map((s) => s.location),
        fixtures.TEST_SHIPS.map((s) => s.isSquibbing),
        fixtures.TEST_SHIPS.map((s) => s.damage),
    ]);

    await client.query(`
        INSERT INTO outposts (name, location, access_date)
        SELECT * FROM unnest($1::varchar(255)[], $2::varchar(255)[], $3::date[]) AS v(name, location, access_date)
        WHERE NOT EXISTS (
            SELECT 1 FROM outposts WHERE name = v.name
        )
    `, [
        fixtures.TEST_OUTPOSTS.map((o) => o.name),
        fixtures.TEST_OUTPOSTS.map((o) => o.location),
        fixtures.TEST_OUTPOSTS.map((o) => o.accessDate),
    ]);
};

/** Crew of the seeded ships and outposts (skipped when one of them is missing). */
const seedCrew = async (client) => {
    const shipIds = await idsByName(client, 'ships', fixtures.TEST_SHIPS.slice(0, 3).map((s) => s.name));
    const outpostIds = await idsByName(client, 'outposts', fixtures.TEST_OUTPOSTS.map((o) => o.name));
    if (shipIds.length < 3 || outpostIds.length < 4) {
        return;
    }

    for (const crew of fixtures.crewRows(shipIds, outpostIds)) {
        await client.query(`
            INSERT INTO crew (name, race, age, description, location_type, location_id, ship_position, is_alive)
            SELECT $1::varchar(255), $2::varchar(100), $3::integer, $4::text, $5::varchar(20), $6::integer, $7::varchar(100), $8::boolean
            WHERE NOT EXISTS (
                SELECT 1 FROM crew WHERE name = $1::varchar(255)
            )
        `, crew);
    }
};

/** Loot and gold are plain INSERTs, so each is skipped once its sentinel row exists. */
const seedLootAndGold = async (client, dmId, userIds, characterIds) => {
    const lootSeeded = await client.query(
        'SELECT 1 FROM loot WHERE name = $1 AND session_date = $2::date LIMIT 1',
        [fixtures.LOOT_SENTINEL.name, fixtures.LOOT_SENTINEL.sessionDate]
    );
    if (lootSeeded.rows.length === 0) {
        for (const loot of fixtures.lootRows(dmId, characterIds)) {
            await client.query(`
                INSERT INTO loot (session_date, quantity, name, unidentified, masterwork, type, size, status, itemid, value, whohas, whoupdated, notes)
                VALUES ($1::date, $2::integer, $3::varchar(255), $4::boolean, $5::boolean, $6::varchar(15), $7::varchar(15), $8::varchar(15), $9::integer, $10::numeric, $11::integer, $12::integer, $13::varchar(511))
            `, loot);
        }
    }

    const goldSeeded = await client.query(
        'SELECT 1 FROM gold WHERE transaction_type = $1 AND notes = $2 LIMIT 1',
        [fixtures.GOLD_SENTINEL.transactionType, fixtures.GOLD_SENTINEL.notes]
    );
    if (goldSeeded.rows.length === 0) {
        for (const gold of fixtures.goldRows(dmId, userIds, characterIds)) {
            await client.query(`
                INSERT INTO gold (session_date, who, transaction_type, notes, copper, silver, gold, platinum, character_id)
                VALUES ($1::timestamp, $2::integer, $3::varchar(63), $4::varchar(255), $5::integer, $6::integer, $7::integer, $8::integer, $9::integer)
            `, gold);
        }
    }
};

const countSeeded = async (client) => {
    const counts = await Promise.all([
        client.query('SELECT COUNT(*) FROM users WHERE username = ANY($1)', [fixtures.TEST_USERNAMES]),
        client.query('SELECT COUNT(*) FROM characters WHERE user_id > 1'),
        client.query('SELECT COUNT(*) FROM ships'),
        client.query('SELECT COUNT(*) FROM outposts'),
        client.query('SELECT COUNT(*) FROM crew'),
        client.query('SELECT COUNT(*) FROM loot'),
        client.query('SELECT COUNT(*) FROM gold')
    ]);
    const [users, characters, ships, outposts, crew, loot, gold] = counts.map((result) => parseInt(result.rows[0].count));
    return {users, characters, ships, outposts, crew, loot, gold};
};

/**
 * Generate test data for the test instance only (superadmin, see routes/testData.js).
 * The accounts get a random password per run, returned once in the response and never logged.
 */
const generateTestData = async (req, res) => {
    try {
        // Security check: Only allow on test environment
        if (!isTestInstance()) {
            throw controllerFactory.createAuthorizationError('Test data generation is only available on test instances');
        }

        // Only DMs can generate test data
        ValidationService.requireDM(req);

        logger.info(`Test data generation initiated by DM ${req.user.id}`, {
            userId: req.user.id,
            timestamp: new Date().toISOString()
        });

        const password = generateTestPassword();
        const passwordHash = await hashPassword(password);

        // Run the inserts inside a transaction, but send the HTTP response only
        // after executeTransaction resolves (i.e. after COMMIT). Otherwise the
        // frontend can refetch before the commit is visible to other pool
        // clients (MVCC) and see stale data.
        const summary = await dbUtils.executeTransaction(async (client) => {
            const userIds = await seedUsers(client, passwordHash, req.campaignId);

            if (userIds.length === fixtures.TEST_USERNAMES.length) {
                await seedCharacters(client, userIds);
            }

            await seedShipsAndOutposts(client);
            await seedCrew(client);

            const characterIds = await idsByName(client, 'characters', fixtures.TEST_CHARACTERS.map((c) => c.name));
            if (userIds.length === fixtures.TEST_USERNAMES.length && characterIds.length === fixtures.TEST_CHARACTERS.length) {
                await seedLootAndGold(client, req.user.id, userIds, characterIds);
            }

            return countSeeded(client);
        });

        logger.info('Test data generation completed successfully', {
            userId: req.user.id,
            summary
        });

        return controllerFactory.sendSuccessResponse(res, {
            message: 'Test data generated successfully',
            summary,
            testCredentials: {
                username: 'testplayer1-4',
                password,
                note: 'Four test users created: testplayer1, testplayer2, testplayer3, testplayer4. This password is shown only once and replaces the accounts\' previous one.'
            }
        }, 'Test data generation completed');

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
