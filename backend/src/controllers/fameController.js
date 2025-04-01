// backend/src/controllers/fameController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Get fame system settings
 */
const getSettings = async (req, res) => {
    try {
        const fameSystemSetting = await dbUtils.executeQuery(
            "SELECT value FROM settings WHERE name = 'fame_system'"
        );

        let fameSystem = 'disabled';
        if (fameSystemSetting.rows.length > 0) {
            fameSystem = fameSystemSetting.rows[0].value;
        }

        controllerFactory.sendSuccessResponse(res, { type: fameSystem }, 'Fame system settings retrieved');
    } catch (error) {
        logger.error('Error getting fame settings:', error);
        throw error;
    }
};

/**
 * Get fame points for a character
 */
const getCharacterFame = async (req, res) => {
    const { characterId } = req.params;

    try {
        // Check if fame is enabled
        const fameSystemSetting = await dbUtils.executeQuery(
            "SELECT value FROM settings WHERE name = 'fame_system'"
        );

        if (fameSystemSetting.rows.length === 0 || fameSystemSetting.rows[0].value === 'disabled') {
            throw controllerFactory.createAuthorizationError('Fame system is not enabled');
        }

        // Get the character details
        const characterQuery = `
            SELECT c.id, c.name, COALESCE(f.points, 0) as fame_points
            FROM characters c
            LEFT JOIN fame f ON c.id = f.character_id
            WHERE c.id = $1
        `;
        const characterResult = await dbUtils.executeQuery(characterQuery, [characterId]);

        if (characterResult.rows.length === 0) {
            throw controllerFactory.createNotFoundError('Character not found');
        }

        const character = characterResult.rows[0];

        // Get fame history
        const historyQuery = `
            SELECT id, points, reason, created_at
            FROM fame_history
            WHERE character_id = $1
            ORDER BY created_at DESC
            LIMIT 10
        `;
        const historyResult = await dbUtils.executeQuery(historyQuery, [characterId]);

        // Calculate prestige points (Fame / 10, rounded down)
        const famePoints = parseInt(character.fame_points) || 0;
        const prestigePoints = Math.floor(famePoints / 10);

        controllerFactory.sendSuccessResponse(res, {
            character: {
                id: character.id,
                name: character.name
            },
            points: famePoints,
            prestige: prestigePoints,
            history: historyResult.rows
        }, 'Character fame retrieved');
    } catch (error) {
        logger.error(`Error getting fame for character ${characterId}:`, error);
        throw error;
    }
};

/**
 * Add fame points to a character (can be done by player or DM)
 */
/**
 * Add fame points to a character (can be done by player or DM)
 */
const addPoints = async (req, res) => {
    const { characterId, points, reason, event } = req.body;
    const userId = req.user.id;

    try {
        // Validate inputs
        // For fame system, character ID is always required
        // For infamy system, it's optional since it applies to the whole ship
        const fameSystemSetting = await dbUtils.executeQuery(
            "SELECT value FROM settings WHERE name = 'fame_system'"
        );
        const fameSystem = fameSystemSetting.rows.length > 0 ? fameSystemSetting.rows[0].value : 'fame';

        if (fameSystem === 'fame' && !characterId) {
            throw controllerFactory.createValidationError('Character ID is required');
        }

        if (!points || isNaN(parseInt(points))) {
            throw controllerFactory.createValidationError('Valid points value is required');
        }

        // Check if fame is enabled
        if (fameSystemSetting.rows.length === 0 || fameSystemSetting.rows[0].value === 'disabled') {
            throw controllerFactory.createAuthorizationError('Fame system is not enabled');
        }

        // Handle differently based on fame system type
        if (fameSystem === 'fame') {
            // Verify character exists
            const characterQuery = `SELECT c.id, c.name, c.user_id FROM characters c WHERE c.id = $1`;
            const characterResult = await dbUtils.executeQuery(characterQuery, [characterId]);

            if (characterResult.rows.length === 0) {
                throw controllerFactory.createNotFoundError('Character not found');
            }

            const character = characterResult.rows[0];

            // Check if the user has permission to add points to this character
            // DMs can add points to any character, players can only add to their own
            if (req.user.role !== 'DM' && character.user_id !== userId) {
                throw controllerFactory.createAuthorizationError('You can only add fame points to your own character');
            }

            const pointsToAdd = parseInt(points);

            return await dbUtils.executeTransaction(async (client) => {
                // Check if character has a fame record
                const fameQuery = `SELECT * FROM fame WHERE character_id = $1`;
                const fameResult = await client.query(fameQuery, [characterId]);

                let currentPoints = 0;
                if (fameResult.rows.length > 0) {
                    currentPoints = parseInt(fameResult.rows[0].points) || 0;
                }

                const newPoints = currentPoints + pointsToAdd;

                // Don't allow negative total for fame (unlike infamy which can go negative)
                if (fameSystem === 'fame' && newPoints < 0) {
                    throw controllerFactory.createValidationError('Cannot reduce fame points below 0');
                }

                // Insert or update fame record
                if (fameResult.rows.length === 0) {
                    await client.query(
                        `INSERT INTO fame (character_id, points) VALUES ($1, $2)`,
                        [characterId, newPoints]
                    );
                } else {
                    await client.query(
                        `UPDATE fame SET points = $1 WHERE character_id = $2`,
                        [newPoints, characterId]
                    );
                }

                // Record in history
                await client.query(
                    `INSERT INTO fame_history (character_id, points, reason, event, added_by)
                    VALUES ($1, $2, $3, $4, $5)`,
                    [characterId, pointsToAdd, reason || null, event || null, userId]
                );

                // Calculate prestige/disrepute
                const prestigePoints = Math.floor(newPoints / 10);

                controllerFactory.sendSuccessResponse(res, {
                    character: {
                        id: character.id,
                        name: character.name
                    },
                    previousPoints: currentPoints,
                    pointsAdded: pointsToAdd,
                    newTotal: newPoints,
                    prestige: prestigePoints,
                    fameSystem
                }, `${Math.abs(pointsToAdd)} ${fameSystem} points ${pointsToAdd >= 0 ? 'added to' : 'removed from'} ${character.name}`);
            });
        } else if (fameSystem === 'infamy') {
            // For Infamy, we use a ship-based approach rather than character-based
            const pointsToAdd = parseInt(points);

            return await dbUtils.executeTransaction(async (client) => {
                // Get current ship infamy - use a special record with character_id = 0
                const shipId = 0; // Special ID for the ship
                const fameQuery = `SELECT * FROM fame WHERE character_id = $1`;
                const fameResult = await client.query(fameQuery, [shipId]);

                let currentPoints = 0;
                if (fameResult.rows.length > 0) {
                    currentPoints = parseInt(fameResult.rows[0].points) || 0;
                }

                const newPoints = currentPoints + pointsToAdd;

                // Insert or update fame record
                if (fameResult.rows.length === 0) {
                    await client.query(
                        `INSERT INTO fame (character_id, points) VALUES ($1, $2)`,
                        [shipId, newPoints]
                    );
                } else {
                    await client.query(
                        `UPDATE fame SET points = $1 WHERE character_id = $2`,
                        [newPoints, shipId]
                    );
                }

                // Record in history
                await client.query(
                    `INSERT INTO fame_history (character_id, points, reason, event, added_by)
                    VALUES ($1, $2, $3, $4, $5)`,
                    [shipId, pointsToAdd, reason || null, event || null, userId]
                );

                // Calculate disrepute (Infamy / 10)
                const disrepute = Math.floor(newPoints / 10);

                controllerFactory.sendSuccessResponse(res, {
                    previousPoints: currentPoints,
                    pointsAdded: pointsToAdd,
                    newTotal: newPoints,
                    disrepute: disrepute,
                    fameSystem
                }, `${Math.abs(pointsToAdd)} Infamy points added to ship`);
            });
        }
    } catch (error) {
        logger.error('Error adding fame points:', error);
        throw error;
    }
};

/**
 * Get fame history for a character
 */
const getFameHistory = async (req, res) => {
    const { characterId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    try {
        // Check if fame is enabled
        const fameSystemSetting = await dbUtils.executeQuery(
            "SELECT value FROM settings WHERE name = 'fame_system'"
        );

        if (fameSystemSetting.rows.length === 0 || fameSystemSetting.rows[0].value === 'disabled') {
            throw controllerFactory.createAuthorizationError('Fame system is not enabled');
        }

        // Verify character exists
        const characterQuery = `SELECT id, name FROM characters WHERE id = $1`;
        const characterResult = await dbUtils.executeQuery(characterQuery, [characterId]);

        if (characterResult.rows.length === 0) {
            throw controllerFactory.createNotFoundError('Character not found');
        }

        // Get fame history with user names
        const historyQuery = `
            SELECT fh.id, fh.points, fh.reason, fh.event, fh.created_at,
                   u.username as added_by_name
            FROM fame_history fh
            LEFT JOIN users u ON fh.added_by = u.id
            WHERE fh.character_id = $1
            ORDER BY fh.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const historyResult = await dbUtils.executeQuery(historyQuery, [
            characterId,
            parseInt(limit),
            parseInt(offset)
        ]);

        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM fame_history
            WHERE character_id = $1
        `;
        const countResult = await dbUtils.executeQuery(countQuery, [characterId]);
        const total = parseInt(countResult.rows[0].total);

        controllerFactory.sendSuccessResponse(res, {
            history: historyResult.rows,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: total > (parseInt(offset) + parseInt(limit))
            }
        }, 'Fame history retrieved');
    } catch (error) {
        logger.error(`Error getting fame history for character ${characterId}:`, error);
        throw error;
    }
};

/**
 * Get fame events list
 */
const getFameEvents = async (req, res) => {
    try {
        // Check if fame is enabled
        const fameSystemSetting = await dbUtils.executeQuery(
            "SELECT value FROM settings WHERE name = 'fame_system'"
        );

        if (fameSystemSetting.rows.length === 0 || fameSystemSetting.rows[0].value === 'disabled') {
            throw controllerFactory.createAuthorizationError('Fame system is not enabled');
        }

        const fameSystem = fameSystemSetting.rows[0].value;
        const isInfamy = fameSystem === 'infamy';

        // These would typically come from a database, but for simplicity we'll hardcode them
        const events = [
            { id: 'acquire_treasure', name: 'Acquire a noteworthy treasure from a worthy foe', points: 1 },
            { id: 'critical_hits', name: 'Confirm two successive critical hits in a CR-appropriate encounter', points: 1 },
            { id: 'consecrate_temple', name: 'Consecrate a temple to your deity', points: 1 },
            { id: 'craft_magic_item', name: 'Craft a powerful magic item', points: 1 },
            { id: 'gain_level', name: 'Gain a level in a PC class', points: 1 },
            { id: 'disarm_traps', name: 'Locate and disarm three or more CR-appropriate traps in a row', points: 1 },
            { id: 'discovery', name: 'Make a noteworthy historical, scientific, or magical discovery', points: 1 },
            { id: 'legendary_item', name: 'Own a legendary item or artifact', points: 1 },
            { id: 'medal', name: 'Receive a medal or similar honor from a public figure', points: 1 },
            { id: 'return_relic', name: 'Return a significant magic item or relic to its owner', points: 1 },
            { id: 'sack_stronghold', name: 'Sack the stronghold of a powerful noble', points: 1 },
            { id: 'defeat_higher_cr', name: 'Single-handedly defeat an opponent with a CR higher than your level', points: 1 },
            { id: 'win_tough_combat', name: 'Win a combat encounter with a CR of your APL +3 or more', points: 1 },
            { id: 'defeat_defamer', name: 'Defeat in combat a person who publicly defamed you', points: 2 },
            { id: 'craft_masterwork', name: 'Succeed at a DC 30 or higher Craft check to create a work of art or masterwork item', points: 2 },
            { id: 'public_diplomacy', name: 'Succeed at a DC 30 or higher public Diplomacy or Intimidate check', points: 2 },
            { id: 'public_perform', name: 'Succeed at a DC 30 or higher public Perform check', points: 2 },
            { id: 'complete_adventure', name: 'Complete an adventure with a CR appropriate for your APL', points: 3 },
            { id: 'earn_title', name: 'Earn a formal title (lady, lord, knight, and so on)', points: 3 },
            { id: 'defeat_rival', name: 'Defeat a key rival in combat', points: 5 },
            // Negative events
            { id: 'petty_crime', name: 'Be convicted of a petty crime', points: -1 },
            { id: 'disreputable_company', name: 'Keep company with someone of disreputable character', points: -1 },
            { id: 'nonviolent_crime', name: 'Be convicted of a serious nonviolent crime', points: -2 },
            { id: 'flee_encounter', name: 'Publicly flee an encounter of a CR lower than your APL', points: -3 },
            { id: 'attack_innocents', name: 'Attack innocent people', points: -5 },
            { id: 'violent_crime', name: 'Be convicted of a serious violent crime', points: -5 },
            { id: 'public_defeat', name: 'Publicly lose an encounter of a CR equal to or lower than your APL', points: -5 },
            { id: 'murder', name: 'Be convicted of murder', points: -8 },
            { id: 'treason', name: 'Be convicted of treason', points: -10 }
        ];

        controllerFactory.sendSuccessResponse(res, {
            events,
            fameSystem
        }, 'Fame events retrieved');
    } catch (error) {
        logger.error('Error fetching fame events:', error);
        throw error;
    }
};

// Define validation rules
const addPointsValidation = {
    requiredFields: ['characterId', 'points']
};

// Create handlers with validation and error handling
module.exports = {
    getSettings: controllerFactory.createHandler(getSettings, {
        errorMessage: 'Error getting fame settings'
    }),

    getCharacterFame: controllerFactory.createHandler(getCharacterFame, {
        errorMessage: 'Error getting character fame'
    }),

    addPoints: controllerFactory.createHandler(addPoints, {
        errorMessage: 'Error adding fame points',
        validation: addPointsValidation
    }),

    getFameHistory: controllerFactory.createHandler(getFameHistory, {
        errorMessage: 'Error getting fame history'
    }),

    getFameEvents: controllerFactory.createHandler(getFameEvents, {
        errorMessage: 'Error fetching fame events'
    })
};