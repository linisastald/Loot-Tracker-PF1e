// backend/src/controllers/infamyController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Get the current infamy status for the ship
 */
const getInfamyStatus = async (req, res) => {
    try {
        // Get the current infamy info
        const infamyResult = await dbUtils.executeQuery(
            'SELECT * FROM ship_infamy WHERE id = 1'
        );

        // If there's no record yet, create one
        if (infamyResult.rows.length === 0) {
            await dbUtils.executeQuery(
                'INSERT INTO ship_infamy (id, infamy, disrepute) VALUES (1, 0, 0)'
            );

            return controllerFactory.sendSuccessResponse(res, {
                infamy: 0,
                disrepute: 0,
                threshold: 'None',
                favored_ports: []
            }, 'Infamy status retrieved');
        }

        // Get the current record
        const infamyStatus = infamyResult.rows[0];

        // Get the ship's favored ports
        const favoredPortsResult = await dbUtils.executeQuery(
            'SELECT port_name, bonus FROM favored_ports ORDER BY bonus DESC'
        );

        // Determine threshold based on infamy value
        let threshold = 'None';
        if (infamyStatus.infamy >= 55) threshold = 'Vile';
        else if (infamyStatus.infamy >= 40) threshold = 'Loathsome';
        else if (infamyStatus.infamy >= 30) threshold = 'Notorious';
        else if (infamyStatus.infamy >= 20) threshold = 'Despicable';
        else if (infamyStatus.infamy >= 10) threshold = 'Disgraceful';

        controllerFactory.sendSuccessResponse(res, {
            infamy: infamyStatus.infamy,
            disrepute: infamyStatus.disrepute,
            threshold,
            favored_ports: favoredPortsResult.rows
        }, 'Infamy status retrieved');
    } catch (error) {
        logger.error('Error getting infamy status:', error);
        throw error;
    }
};

/**
 * Get available impositions based on current infamy threshold
 */
const getAvailableImpositions = async (req, res) => {
    try {
        // Get current infamy
        const infamyResult = await dbUtils.executeQuery(
            'SELECT infamy, disrepute FROM ship_infamy WHERE id = 1'
        );

        if (infamyResult.rows.length === 0) {
            return controllerFactory.sendSuccessResponse(res, {
                impositions: [],
                infamy: 0,
                disrepute: 0
            }, 'No infamy yet');
        }

        const { infamy, disrepute } = infamyResult.rows[0];

        // Get available impositions based on infamy thresholds
        const query = `
            SELECT * FROM impositions 
            WHERE threshold_required <= $1
            ORDER BY threshold_required DESC, cost ASC
        `;

        const impositionsResult = await dbUtils.executeQuery(query, [infamy]);

        // Process impositions for display
        const impositions = impositionsResult.rows.map(imp => {
            // Determine if the imposition is available (enough disrepute)
            const isAvailable = disrepute >= imp.cost;

            // Apply price discounts based on thresholds
            let displayCost = imp.cost;

            // Threshold-based discounts
            if (infamy >= 55 && imp.threshold_required <= 10) {
                // Disgraceful impositions are free at Vile threshold
                displayCost = 0;
            } else if (infamy >= 55 && imp.threshold_required <= 30) {
                // Notorious impositions half price at Vile threshold
                displayCost = Math.floor(imp.cost / 2);
            } else if (infamy >= 40 && imp.threshold_required <= 20) {
                // Despicable impositions half price at Loathsome threshold
                displayCost = Math.floor(imp.cost / 2);
            } else if (infamy >= 30 && imp.threshold_required <= 10) {
                // Disgraceful impositions half price at Notorious threshold
                displayCost = Math.floor(imp.cost / 2);
            }

            return {
                ...imp,
                displayCost,
                isAvailable: disrepute >= displayCost
            };
        });

        // Group by threshold category
        const groupedImpositions = {
            disgraceful: impositions.filter(imp => imp.threshold_required <= 10),
            despicable: impositions.filter(imp => imp.threshold_required > 10 && imp.threshold_required <= 20),
            notorious: impositions.filter(imp => imp.threshold_required > 20 && imp.threshold_required <= 30),
            loathsome: impositions.filter(imp => imp.threshold_required > 30 && imp.threshold_required <= 40),
            vile: impositions.filter(imp => imp.threshold_required > 40)
        };

        controllerFactory.sendSuccessResponse(res, {
            impositions: groupedImpositions,
            infamy,
            disrepute
        }, 'Available impositions retrieved');
    } catch (error) {
        logger.error('Error getting available impositions:', error);
        throw error;
    }
};

/**
 * Gain infamy at a port
 */
const gainInfamy = async (req, res) => {
    const { port, skillCheck, skillUsed, plunderSpent, reroll } = req.body;
    const userId = req.user.id;

    try {
        if (!port) {
            throw controllerFactory.createValidationError('Port name is required');
        }

        if (!skillCheck && !plunderSpent) {
            throw controllerFactory.createValidationError('Skill check result or plunder spent is required');
        }

        // Get party's current APL (Average Party Level)
        // For simplicity, we'll use a default value of 5 if not provided
        const apl = req.body.apl || 5;

        // Get current infamy and threshold
        const infamyResult = await dbUtils.executeQuery(
            'SELECT * FROM ship_infamy WHERE id = 1'
        );

        // If no record exists, create one
        let currentInfamy = 0;
        let currentDisrepute = 0;
        let currentThreshold = 0;

        if (infamyResult.rows.length === 0) {
            await dbUtils.executeQuery(
                'INSERT INTO ship_infamy (id, infamy, disrepute) VALUES (1, 0, 0)'
            );
        } else {
            currentInfamy = infamyResult.rows[0].infamy;
            currentDisrepute = infamyResult.rows[0].disrepute;

            // Determine threshold based on infamy value
            if (currentInfamy >= 55) currentThreshold = 55;
            else if (currentInfamy >= 40) currentThreshold = 40;
            else if (currentInfamy >= 30) currentThreshold = 30;
            else if (currentInfamy >= 20) currentThreshold = 20;
            else if (currentInfamy >= 10) currentThreshold = 10;
        }

        // Check if port has reached its maximum infamy for the current threshold
        const portVisitQuery = `
            SELECT SUM(infamy_gained) as total_gained
            FROM port_visits
            WHERE port_name = $1 AND threshold = $2
        `;

        const portVisitResult = await dbUtils.executeQuery(portVisitQuery, [port, currentThreshold]);
        const totalGained = portVisitResult.rows[0]?.total_gained || 0;

        if (totalGained >= 5) {
            throw controllerFactory.createValidationError(
                'This port has reached its maximum Infamy contribution for your current threshold. Visit another port or reach the next threshold.'
            );
        }

        // Calculate DC for the check: 15 + 2 × APL
        const dc = 15 + (2 * apl);

        // Calculate total check result (skill check + plunder bonus)
        const plunderBonus = plunderSpent ? plunderSpent * 2 : 0;
        let totalCheck = (skillCheck || 0) + plunderBonus;

        // Get bonuses from favored ports
        const favoredPortQuery = 'SELECT bonus FROM favored_ports WHERE port_name = $1';
        const favoredPortResult = await dbUtils.executeQuery(favoredPortQuery, [port]);
        const favoredBonus = favoredPortResult.rows[0]?.bonus || 0;

        totalCheck += favoredBonus;

        // Determine how much infamy is gained
        let infamyGained = 0;

        if (totalCheck >= dc + 10) {
            infamyGained = 3;
        } else if (totalCheck >= dc + 5) {
            infamyGained = 2;
        } else if (totalCheck >= dc) {
            infamyGained = 1;
        }

        // If failed and using reroll with plunder
        if (infamyGained === 0 && reroll && plunderSpent >= 3) {
            // Remove 3 plunder for reroll (in actual implementation, this would deduct from available plunder)
            const rerollPlunderBonus = (plunderSpent - 3) * 2;
            const rerollCheck = (skillCheck || 0) + rerollPlunderBonus + favoredBonus;

            if (rerollCheck >= dc + 10) {
                infamyGained = 3;
            } else if (rerollCheck >= dc + 5) {
                infamyGained = 2;
            } else if (rerollCheck >= dc) {
                infamyGained = 1;
            }
        }

        // If still failed, return error
        if (infamyGained === 0) {
            throw controllerFactory.createValidationError(
                'Failed to gain Infamy at this port. Try spending more plunder or using a different skill.'
            );
        }

        // Ensure we don't exceed the 5 infamy per port limit
        infamyGained = Math.min(infamyGained, 5 - totalGained);

        // Update infamy and disrepute
        const newInfamy = currentInfamy + infamyGained;
        const newDisrepute = currentDisrepute + infamyGained;

        await dbUtils.executeQuery(
            'UPDATE ship_infamy SET infamy = $1, disrepute = $2 WHERE id = 1',
            [newInfamy, newDisrepute]
        );

        // Record the port visit
        await dbUtils.executeQuery(
            'INSERT INTO port_visits (port_name, threshold, infamy_gained, skill_used, plunder_spent, user_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [port, currentThreshold, infamyGained, skillUsed, plunderSpent, userId]
        );

        // Record in history
        await dbUtils.executeQuery(
            'INSERT INTO infamy_history (infamy_change, reason, port, user_id) VALUES ($1, $2, $3, $4)',
            [infamyGained, 'Boasting at port', port, userId]
        );

        // Check if a new threshold was reached
        let newThreshold = null;
        if (currentInfamy < 10 && newInfamy >= 10) newThreshold = 'Disgraceful';
        else if (currentInfamy < 20 && newInfamy >= 20) newThreshold = 'Despicable';
        else if (currentInfamy < 30 && newInfamy >= 30) newThreshold = 'Notorious';
        else if (currentInfamy < 40 && newInfamy >= 40) newThreshold = 'Loathsome';
        else if (currentInfamy < 55 && newInfamy >= 55) newThreshold = 'Vile';

        controllerFactory.sendSuccessResponse(res, {
            infamyGained,
            newInfamy,
            newDisrepute,
            newThreshold,
            skillCheck: totalCheck,
            dc
        }, `Gained ${infamyGained} Infamy at ${port}`);
    } catch (error) {
        logger.error('Error gaining infamy:', error);
        throw error;
    }
};

/**
 * Purchase an imposition with disrepute
 */
const purchaseImposition = async (req, res) => {
    const { impositionId } = req.body;
    const userId = req.user.id;

    try {
        if (!impositionId) {
            throw controllerFactory.createValidationError('Imposition ID is required');
        }

        // Get imposition details
        const impositionQuery = 'SELECT * FROM impositions WHERE id = $1';
        const impositionResult = await dbUtils.executeQuery(impositionQuery, [impositionId]);

        if (impositionResult.rows.length === 0) {
            throw controllerFactory.createNotFoundError('Imposition not found');
        }

        const imposition = impositionResult.rows[0];

        // Get current infamy and disrepute
        const infamyResult = await dbUtils.executeQuery(
            'SELECT infamy, disrepute FROM ship_infamy WHERE id = 1'
        );

        if (infamyResult.rows.length === 0) {
            throw controllerFactory.createValidationError('No infamy record found');
        }

        const { infamy, disrepute } = infamyResult.rows[0];

        // Check if the party has enough infamy to use this imposition
        if (infamy < imposition.threshold_required) {
            throw controllerFactory.createValidationError(
                'Your Infamy is too low to purchase this imposition'
            );
        }

        // Calculate actual cost after threshold discounts
        let actualCost = imposition.cost;

        // Apply threshold-based discounts
        if (infamy >= 55 && imposition.threshold_required <= 10) {
            // Disgraceful impositions are free at Vile threshold
            actualCost = 0;
        } else if (infamy >= 55 && imposition.threshold_required <= 30) {
            // Notorious impositions half price at Vile threshold
            actualCost = Math.floor(imposition.cost / 2);
        } else if (infamy >= 40 && imposition.threshold_required <= 20) {
            // Despicable impositions half price at Loathsome threshold
            actualCost = Math.floor(imposition.cost / 2);
        } else if (infamy >= 30 && imposition.threshold_required <= 10) {
            // Disgraceful impositions half price at Notorious threshold
            actualCost = Math.floor(imposition.cost / 2);
        }

        // Check if they have enough disrepute
        if (disrepute < actualCost) {
            throw controllerFactory.createValidationError(
                'Not enough Disrepute to purchase this imposition'
            );
        }

        // Update disrepute
        const newDisrepute = disrepute - actualCost;
        await dbUtils.executeQuery(
            'UPDATE ship_infamy SET disrepute = $1 WHERE id = 1',
            [newDisrepute]
        );

        // Record purchase in history
        await dbUtils.executeQuery(
            'INSERT INTO imposition_uses (imposition_id, cost_paid, user_id) VALUES ($1, $2, $3)',
            [impositionId, actualCost, userId]
        );

        // Record in general history
        await dbUtils.executeQuery(
            'INSERT INTO infamy_history (infamy_change, disrepute_change, reason, user_id) VALUES ($1, $2, $3, $4)',
            [0, -actualCost, `Purchased imposition: ${imposition.name}`, userId]
        );

        controllerFactory.sendSuccessResponse(res, {
            imposition,
            costPaid: actualCost,
            newDisrepute,
            effect: imposition.effect
        }, `Successfully purchased imposition: ${imposition.name}`);
    } catch (error) {
        logger.error('Error purchasing imposition:', error);
        throw error;
    }
};

/**
 * Get infamy history
 */
const getInfamyHistory = async (req, res) => {
    const { limit = 20, offset = 0 } = req.query;

    try {
        // Get history entries with user names
        const historyQuery = `
            SELECT ih.*, u.username as username
            FROM infamy_history ih
            LEFT JOIN users u ON ih.user_id = u.id
            ORDER BY ih.created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const historyResult = await dbUtils.executeQuery(historyQuery, [
            parseInt(limit),
            parseInt(offset)
        ]);

        // Get total count for pagination
        const countQuery = 'SELECT COUNT(*) as total FROM infamy_history';
        const countResult = await dbUtils.executeQuery(countQuery);

        controllerFactory.sendSuccessResponse(res, {
            history: historyResult.rows,
            pagination: {
                total: parseInt(countResult.rows[0].total),
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        }, 'Infamy history retrieved');
    } catch (error) {
        logger.error('Error getting infamy history:', error);
        throw error;
    }
};

/**
 * Get port visit history
 */
const getPortVisits = async (req, res) => {
    try {
        // Get port visits grouped by port and threshold
        const portVisitsQuery = `
            SELECT port_name, threshold, SUM(infamy_gained) as total_gained
            FROM port_visits
            GROUP BY port_name, threshold
            ORDER BY port_name, threshold
        `;

        const portVisitsResult = await dbUtils.executeQuery(portVisitsQuery);

        // Structure the data by port
        const ports = {};
        portVisitsResult.rows.forEach(row => {
            if (!ports[row.port_name]) {
                ports[row.port_name] = {
                    name: row.port_name,
                    thresholds: {}
                };
            }

            ports[row.port_name].thresholds[row.threshold] = row.total_gained;
        });

        controllerFactory.sendSuccessResponse(res, {
            ports: Object.values(ports)
        }, 'Port visits retrieved');
    } catch (error) {
        logger.error('Error getting port visits:', error);
        throw error;
    }
};

/**
 * Set a port as a favored port
 */
const setFavoredPort = async (req, res) => {
    const { port } = req.body;
    const userId = req.user.id;

    try {
        if (!port) {
            throw controllerFactory.createValidationError('Port name is required');
        }

        // Get current infamy
        const infamyResult = await dbUtils.executeQuery(
            'SELECT infamy FROM ship_infamy WHERE id = 1'
        );

        if (infamyResult.rows.length === 0) {
            throw controllerFactory.createValidationError('No infamy record found');
        }

        const { infamy } = infamyResult.rows[0];

        // Determine how many favored ports they can have based on threshold
        let maxFavoredPorts = 0;
        if (infamy >= 55) maxFavoredPorts = 3;
        else if (infamy >= 30) maxFavoredPorts = 2;
        else if (infamy >= 10) maxFavoredPorts = 1;

        // Get current favored ports
        const favoredPortsQuery = 'SELECT * FROM favored_ports ORDER BY bonus DESC';
        const favoredPortsResult = await dbUtils.executeQuery(favoredPortsQuery);
        const favoredPorts = favoredPortsResult.rows;

        // Check if this port is already favored
        const existingPort = favoredPorts.find(p => p.port_name === port);
        if (existingPort) {
            throw controllerFactory.createValidationError('This port is already a favored port');
        }

        // Check if they've reached their limit
        if (favoredPorts.length >= maxFavoredPorts) {
            throw controllerFactory.createValidationError(
                `You can only have ${maxFavoredPorts} favored port(s) at your current Infamy threshold`
            );
        }

        // Determine bonus based on which favored port this is
        let bonus = 2;
        if (favoredPorts.length === 1) bonus = 4;
        else if (favoredPorts.length === 2) bonus = 6;

        // Insert new favored port
        await dbUtils.executeQuery(
            'INSERT INTO favored_ports (port_name, bonus, user_id) VALUES ($1, $2, $3)',
            [port, bonus, userId]
        );

        // If this affects existing port bonuses, update them
        if (favoredPorts.length > 0) {
            // First port gets upgraded to +4 if this is the second port
            // First port gets upgraded to +6 if this is the third port
            // Second port gets upgraded to +4 if this is the third port
            if (favoredPorts.length === 1) {
                await dbUtils.executeQuery(
                    'UPDATE favored_ports SET bonus = $1 WHERE port_name = $2',
                    [4, favoredPorts[0].port_name]
                );
            } else if (favoredPorts.length === 2) {
                await dbUtils.executeQuery(
                    'UPDATE favored_ports SET bonus = $1 WHERE port_name = $2',
                    [6, favoredPorts[0].port_name]
                );

                await dbUtils.executeQuery(
                    'UPDATE favored_ports SET bonus = $1 WHERE port_name = $2',
                    [4, favoredPorts[1].port_name]
                );
            }
        }

        controllerFactory.sendSuccessResponse(res, {
            port,
            bonus,
            favoredPorts: [...favoredPorts, { port_name: port, bonus }]
        }, `${port} set as a favored port with +${bonus} bonus`);
    } catch (error) {
        logger.error('Error setting favored port:', error);
        throw error;
    }
};

/**
 * Sacrifice a crew member or prisoner for disrepute (Despicable 20+ feature)
 */
const sacrificeCrew = async (req, res) => {
    const { crewName } = req.body;
    const userId = req.user.id;

    try {
        if (!crewName) {
            throw controllerFactory.createValidationError('Crew member name is required');
        }

        // Get current infamy
        const infamyResult = await dbUtils.executeQuery(
            'SELECT infamy, disrepute FROM ship_infamy WHERE id = 1'
        );

        if (infamyResult.rows.length === 0) {
            throw controllerFactory.createValidationError('No infamy record found');
        }

        const { infamy, disrepute } = infamyResult.rows[0];

        // Check if they have enough infamy to do this (Despicable 20+ required)
        if (infamy < 20) {
            throw controllerFactory.createValidationError(
                'You need at least 20 Infamy (Despicable threshold) to sacrifice crew members'
            );
        }

        // Check when they last used this feature (can only be used once per week)
        const lastSacrificeQuery = `
            SELECT * FROM infamy_history 
            WHERE reason LIKE 'Sacrificed crew member%' 
            AND created_at > NOW() - INTERVAL '1 week'
        `;

        const lastSacrificeResult = await dbUtils.executeQuery(lastSacrificeQuery);

        if (lastSacrificeResult.rows.length > 0) {
            throw controllerFactory.createValidationError(
                'This feature can only be used once per week'
            );
        }

        // Roll 1d3 for disrepute gain
        const disreputeGain = Math.floor(Math.random() * 3) + 1;

        // Update disrepute
        const newDisrepute = disrepute + disreputeGain;
        await dbUtils.executeQuery(
            'UPDATE ship_infamy SET disrepute = $1 WHERE id = 1',
            [newDisrepute]
        );

        // Record in history
        await dbUtils.executeQuery(
            'INSERT INTO infamy_history (infamy_change, disrepute_change, reason, user_id) VALUES ($1, $2, $3, $4)',
            [0, disreputeGain, `Sacrificed crew member: ${crewName}`, userId]
        );

        controllerFactory.sendSuccessResponse(res, {
            crewName,
            disreputeGained: disreputeGain,
            newDisrepute
        }, `Sacrificed ${crewName} for ${disreputeGain} Disrepute points`);
    } catch (error) {
        logger.error('Error sacrificing crew member:', error);
        throw error;
    }
};

// Define validation rules
const gainInfamyValidation = {
    requiredFields: ['port']
};

const purchaseImpositionValidation = {
    requiredFields: ['impositionId']
};

const setFavoredPortValidation = {
    requiredFields: ['port']
};

const sacrificeCrewValidation = {
    requiredFields: ['crewName']
};

// Create handlers with validation and error handling
module.exports = {
    getInfamyStatus: controllerFactory.createHandler(getInfamyStatus, {
        errorMessage: 'Error getting infamy status'
    }),

    getAvailableImpositions: controllerFactory.createHandler(getAvailableImpositions, {
        errorMessage: 'Error getting available impositions'
    }),

    gainInfamy: controllerFactory.createHandler(gainInfamy, {
        errorMessage: 'Error gaining infamy',
        validation: gainInfamyValidation
    }),

    purchaseImposition: controllerFactory.createHandler(purchaseImposition, {
        errorMessage: 'Error purchasing imposition',
        validation: purchaseImpositionValidation
    }),

    getInfamyHistory: controllerFactory.createHandler(getInfamyHistory, {
        errorMessage: 'Error getting infamy history'
    }),

    getPortVisits: controllerFactory.createHandler(getPortVisits, {
        errorMessage: 'Error getting port visits'
    }),

    setFavoredPort: controllerFactory.createHandler(setFavoredPort, {
        errorMessage: 'Error setting favored port',
        validation: setFavoredPortValidation
    }),

    sacrificeCrew: controllerFactory.createHandler(sacrificeCrew, {
        errorMessage: 'Error sacrificing crew member',
        validation: sacrificeCrewValidation
    })
};