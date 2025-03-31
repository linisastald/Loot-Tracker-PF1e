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

        // Check if the character exists and get their current fame
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

        controllerFactory.sendSuccessResponse(res, {
            character: {
                id: character.id,
                name: character.name
            },
            points: parseInt(character.fame_points) || 0,
            history: historyResult.rows
        }, 'Character fame retrieved');
    } catch (error) {
        logger.error(`Error getting fame for character ${characterId}:`, error);
        throw error;
    }
};

/**
 * Add fame points to a character (DM only)
 */
const addPoints = async (req, res) => {
    const { characterId, points, reason } = req.body;
    const dmUserId = req.user.id;

    try {
        // Validate inputs
        if (!characterId) {
            throw controllerFactory.createValidationError('Character ID is required');
        }

        if (!points || isNaN(parseInt(points))) {
            throw controllerFactory.createValidationError('Valid points value is required');
        }

        // Check if fame is enabled
        const fameSystemSetting = await dbUtils.executeQuery(
            "SELECT value FROM settings WHERE name = 'fame_system'"
        );

        if (fameSystemSetting.rows.length === 0 || fameSystemSetting.rows[0].value === 'disabled') {
            throw controllerFactory.createAuthorizationError('Fame system is not enabled');
        }

        const fameSystem = fameSystemSetting.rows[0].value;

        // Verify character exists
        const characterQuery = `SELECT id, name FROM characters WHERE id = $1`;
        const characterResult = await dbUtils.executeQuery(characterQuery, [characterId]);

        if (characterResult.rows.length === 0) {
            throw controllerFactory.createNotFoundError('Character not found');
        }

        const character = characterResult.rows[0];
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

            // Don't allow negative total
            if (newPoints < 0) {
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
                `INSERT INTO fame_history (character_id, points, reason, added_by)
                 VALUES ($1, $2, $3, $4)`,
                [characterId, pointsToAdd, reason || null, dmUserId]
            );

            controllerFactory.sendSuccessResponse(res, {
                character: {
                    id: character.id,
                    name: character.name
                },
                previousPoints: currentPoints,
                pointsAdded: pointsToAdd,
                newTotal: newPoints,
                fameSystem
            }, `${Math.abs(pointsToAdd)} ${fameSystem} points ${pointsToAdd >= 0 ? 'added to' : 'removed from'} ${character.name}`);
        });
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

        // Get fame history with DM names
        const historyQuery = `
            SELECT fh.id, fh.points, fh.reason, fh.created_at,
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
    })
};