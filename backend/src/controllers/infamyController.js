// backend/src/controllers/infamyController.js
//
// Skulls & Shackles Infamy / Disrepute system. Infamy only grows through port
// boasting and DM adjustments; Disrepute is the spendable pool (impositions,
// crew sacrifice). All SQL lives in models/Infamy.js; the threshold and
// discount tables live in utils/infamyRules.js.
//
// Every mutation runs in ONE transaction that first locks the campaign's
// ship_infamy row (Infamy.getOrCreate with lock), so concurrent requests
// cannot overspend disrepute or plunder, pass the once-per-day / per-port
// limits twice, or leave history out of step with the totals. Mutations are
// rejected while the campaign's infamy_system_enabled setting is not '1'.

const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const campaignSettings = require('../utils/campaignSettings');
const partyLevel = require('../utils/partyLevel');
const golarionCalendar = require('../utils/golarionCalendar');
const rules = require('../utils/infamyRules');
const Infamy = require('../models/Infamy');
const { hasDmRights } = require('../utils/roleUtils');

const MAX_SKILL_CHECK = 100;
const MAX_HISTORY_PAGE = 100;
const DEFAULT_HISTORY_PAGE = 20;
const MAX_PORT_INFAMY = 5;
const REROLL_PLUNDER = 3;

const { createValidationError } = controllerFactory;

/** Reject the request when the infamy system is disabled for this campaign. */
const requireEnabled = async () => {
  const raw = await campaignSettings.getCampaignSetting('infamy_system_enabled', { defaultValue: '0' });
  if (raw !== '1') {
    throw controllerFactory.createAuthorizationError('The infamy system is not enabled for this campaign');
  }
};

/**
 * Parse an optional integer body value into [0, max]. Missing values become
 * `fallback`; anything that is not a whole number in range is a 400.
 */
const parseBoundedInt = (value, label, { fallback = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (value === undefined || value === null || value === '') return fallback;
  const num = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof num !== 'number' || !Number.isInteger(num) || num < 0 || num > max) {
    throw createValidationError(`${label} must be a whole number between 0 and ${max}`);
  }
  return num;
};

/** Parse a required, trimmed, length-limited string body value. */
const parseText = (value, label, maxLength = 255) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw createValidationError(`${label} is required`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw createValidationError(`${label} must be at most ${maxLength} characters`);
  }
  return text;
};

/** Parse a positive integer id (accepts numeric strings). */
const parseId = (value, label) => {
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(num) || num <= 0) {
    throw createValidationError(`${label} is required`);
  }
  return num;
};

/** Current Golarion date or a validation error when the calendar is not set up. */
const requireGolarionDate = async (client) => {
  const date = await Infamy.getCurrentGolarionDate(client);
  if (!date) throw createValidationError('Calendar system not initialized');
  return date;
};

const parseGolarionDateString = (value) => {
  const [year, month, day] = String(value).split('-').map(Number);
  if (![year, month, day].every(Number.isInteger)) return null;
  return { year, month, day };
};

/**
 * Get the current infamy status for the ship
 */
const getInfamyStatus = async (req, res) => {
  const { infamy, disrepute } = await Infamy.getOrCreate(null);
  const favoredPorts = await Infamy.getFavoredPorts(null);

  controllerFactory.sendSuccessResponse(res, {
    infamy,
    disrepute,
    threshold: rules.getThresholdName(infamy),
    favored_ports: favoredPorts.map(({ port_name, bonus }) => ({ port_name, bonus })),
  }, 'Infamy status retrieved');
};

/**
 * Get available impositions based on current infamy threshold
 */
const getAvailableImpositions = async (req, res) => {
  const status = await Infamy.find(null);

  if (!status) {
    return controllerFactory.sendSuccessResponse(res, {
      impositions: rules.groupImpositions([]),
      infamy: 0,
      disrepute: 0,
    }, 'No infamy yet');
  }

  const { infamy, disrepute } = status;
  const impositions = (await Infamy.getImpositionsUpTo(null, infamy)).map((imp) => {
    const displayCost = rules.getDiscountedCost(infamy, imp);
    return { ...imp, displayCost, isAvailable: disrepute >= displayCost };
  });

  controllerFactory.sendSuccessResponse(res, {
    impositions: rules.groupImpositions(impositions),
    infamy,
    disrepute,
  }, 'Available impositions retrieved');
};

/**
 * Decide from today's history whether this request is a legal attempt.
 * One attempt per in-game day, plus one reroll (3 plunder) after a failure.
 * @return {Promise<boolean>} true when this is the reroll attempt
 */
const checkDailyAttempt = async (client, golarionDate, reroll) => {
  const attempts = await Infamy.getAttemptsOnDate(client, 'Boasting at port', golarionDate);
  const rerolls = await Infamy.getAttemptsOnDate(client, 'Reroll for Infamy', golarionDate);

  if (attempts.length === 0) {
    if (reroll) {
      throw createValidationError('You cannot use the reroll option on your first attempt. Make a regular attempt first.');
    }
    return false;
  }

  if (attempts[0].infamy_change > 0 || rerolls.length > 0) {
    throw createValidationError('You have already gained Infamy today or used your reroll. Try again tomorrow (in-game).');
  }
  if (!reroll) {
    throw createValidationError('You failed to gain Infamy today. You may try again with the reroll option by spending 3 plunder.');
  }
  return true;
};

/**
 * Gain infamy at a port
 */
const gainInfamy = async (req, res) => {
  const userId = req.user.id;
  const port = parseText(req.body.port, 'Port name');
  const skillCheck = parseBoundedInt(req.body.skillCheck, 'skillCheck', { max: MAX_SKILL_CHECK });
  const plunderSpent = parseBoundedInt(req.body.plunderSpent, 'plunderSpent');
  const reroll = req.body.reroll === true || req.body.reroll === 'true';
  const skillUsed = typeof req.body.skillUsed === 'string' ? req.body.skillUsed.slice(0, 50) : null;

  if (skillCheck === 0 && plunderSpent === 0) {
    throw createValidationError('Skill check result or plunder spent is required');
  }

  await requireEnabled();

  // Infamy check DC uses the size-adjusted Average Party Level (S&S rule
  // DC = 15 + 2 x APL). The stored setting is the shared character level;
  // partyLevel derives the true APL from it and the active party size.
  const { apl } = await partyLevel.getPartyLevelInfo(req.campaignId);
  const dc = 15 + (2 * apl);

  const result = await dbUtils.executeTransaction(async (client) => {
    const { infamy: currentInfamy, disrepute: currentDisrepute } =
      await Infamy.getOrCreate(client, { lock: true });
    const currentThreshold = rules.getThresholdValue(currentInfamy);

    const date = await requireGolarionDate(client);
    const golarionDate = Infamy.formatGolarionDate(date);

    const isRerollAttempt = await checkDailyAttempt(client, golarionDate, reroll);
    if (isRerollAttempt) {
      if (plunderSpent < REROLL_PLUNDER) {
        throw createValidationError('Reroll requires at least 3 plunder to be spent.');
      }
      logger.info(`Processing reroll attempt for user ${userId} at port ${port} with ${plunderSpent} plunder`);
    }

    // A port contributes at most 5 infamy per threshold
    const totalGained = await Infamy.getPortTotal(client, port, currentThreshold);
    if (totalGained >= MAX_PORT_INFAMY) {
      throw createValidationError(
        'This port has reached its maximum Infamy contribution for your current threshold. Visit another port or reach the next threshold.'
      );
    }

    if (plunderSpent > 0) {
      const spent = await Infamy.spendPlunder(client, plunderSpent, userId);
      if (!spent.ok) {
        throw createValidationError(
          `Not enough plunder available. You have ${spent.available} but tried to spend ${plunderSpent}.`
        );
      }
    }

    const favoredBonus = await Infamy.getFavoredBonus(client, port);
    const totalCheck = skillCheck + (plunderSpent * 2) + favoredBonus;

    let infamyGained = 0;
    if (totalCheck >= dc + 10) infamyGained = 3;
    else if (totalCheck >= dc + 5) infamyGained = 2;
    else if (totalCheck >= dc) infamyGained = 1;
    infamyGained = Math.min(infamyGained, MAX_PORT_INFAMY - totalGained);

    // The attempt is recorded (and any plunder stays spent) whether or not it succeeds
    await Infamy.addHistory(client, {
      infamyChange: infamyGained,
      disreputeChange: 0,
      reason: isRerollAttempt ? 'Reroll for Infamy' : 'Boasting at port',
      port,
      userId,
      golarionDate,
    });

    let newInfamy = currentInfamy;
    let newDisrepute = currentDisrepute;
    if (infamyGained > 0) {
      ({ infamy: newInfamy, disrepute: newDisrepute } =
        await Infamy.applyChange(client, infamyGained, infamyGained));
      await Infamy.addPortVisit(client, {
        port, threshold: currentThreshold, infamyGained, skillUsed, plunderSpent, userId,
      });
    }

    return {
      infamyGained,
      newInfamy,
      newDisrepute,
      newThreshold: rules.crossedThreshold(currentInfamy, newInfamy),
      skillCheck: totalCheck,
      dc,
      isRerollAttempt,
    };
  });

  // A failed check is a normal game outcome (the attempt and plunder were
  // committed), so it is a success response with infamyGained 0.
  let message;
  if (result.infamyGained > 0) {
    message = `${result.isRerollAttempt ? 'Reroll successful! ' : ''}Gained ${result.infamyGained} Infamy at ${port}`;
  } else if (result.isRerollAttempt) {
    message = 'Your reroll attempt failed. You have used all your attempts for today (in-game).';
  } else {
    message = 'Failed to gain Infamy at this port. The attempt has been recorded, but you may try a reroll by spending 3 plunder.';
  }
  controllerFactory.sendSuccessResponse(res, result, message);
};

/**
 * Purchase an imposition with disrepute
 */
const purchaseImposition = async (req, res) => {
  const userId = req.user.id;
  const impositionId = parseId(req.body.impositionId, 'Imposition ID');

  await requireEnabled();

  const purchase = await dbUtils.executeTransaction(async (client) => {
    const imposition = await Infamy.getImposition(client, impositionId);
    if (!imposition) throw controllerFactory.createNotFoundError('Imposition not found');

    const status = await Infamy.find(client);
    if (!status) throw createValidationError('No infamy record found');
    const { infamy, disrepute } = await Infamy.getOrCreate(client, { lock: true });

    if (infamy < imposition.threshold_required) {
      throw createValidationError('Your Infamy is too low to purchase this imposition');
    }

    const actualCost = rules.getDiscountedCost(infamy, imposition);
    if (disrepute < actualCost) {
      throw createValidationError('Not enough Disrepute to purchase this imposition');
    }

    const { disrepute: newDisrepute } = await Infamy.applyChange(client, 0, -actualCost);
    await Infamy.recordImpositionUse(client, impositionId, actualCost, userId);
    await Infamy.addHistory(client, {
      disreputeChange: -actualCost,
      reason: `Purchased imposition: ${imposition.name}`,
      userId,
    });
    return { imposition, actualCost, newDisrepute };
  });

  controllerFactory.sendSuccessResponse(res, {
    imposition: purchase.imposition,
    costPaid: purchase.actualCost,
    newDisrepute: purchase.newDisrepute,
    effect: purchase.imposition.effect,
  }, `Successfully purchased imposition: ${purchase.imposition.name}`);
};

/**
 * Get infamy history (paged; limit 1-100, default 20)
 */
const getInfamyHistory = async (req, res) => {
  const limit = req.query.limit === undefined ? DEFAULT_HISTORY_PAGE : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);

  if (!Number.isInteger(limit) || limit < 1) {
    throw createValidationError('limit must be a positive whole number');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw createValidationError('offset must be a non-negative whole number');
  }
  const pageSize = Math.min(limit, MAX_HISTORY_PAGE);

  const { rows, total } = await Infamy.getHistoryPage(pageSize, offset);

  controllerFactory.sendSuccessResponse(res, {
    history: rows,
    pagination: { total, limit: pageSize, offset },
  }, 'Infamy history retrieved');
};

/**
 * Get port visit history
 */
const getPortVisits = async (req, res) => {
  const rows = await Infamy.getPortTotals();

  const ports = {};
  rows.forEach((row) => {
    if (!ports[row.port_name]) {
      ports[row.port_name] = { name: row.port_name, thresholds: {} };
    }
    ports[row.port_name].thresholds[row.threshold] = row.total_gained;
  });

  controllerFactory.sendSuccessResponse(res, { ports: Object.values(ports) }, 'Port visits retrieved');
};

/**
 * Set a port as a favored port
 */
const setFavoredPort = async (req, res) => {
  const userId = req.user.id;
  const port = parseText(req.body.port, 'Port name');

  await requireEnabled();

  // Always +2 for the new port; the existing ports are bumped below
  const newPortBonus = 2;

  const updatedFavoredPorts = await dbUtils.executeTransaction(async (client) => {
    if (!(await Infamy.find(client))) throw createValidationError('No infamy record found');
    const { infamy } = await Infamy.getOrCreate(client, { lock: true });
    const maxFavoredPorts = rules.getMaxFavoredPorts(infamy);

    const favoredPorts = await Infamy.getFavoredPorts(client);

    if (favoredPorts.some((p) => p.port_name === port)) {
      throw createValidationError('This port is already a favored port');
    }
    if (favoredPorts.length >= maxFavoredPorts) {
      throw createValidationError(
        `You can only have ${maxFavoredPorts} favored port(s) at your current Infamy threshold`
      );
    }

    await Infamy.addFavoredPort(client, port, newPortBonus, userId);

    // Existing ports are upgraded: 2nd port -> first becomes +4; 3rd port ->
    // first +6 and second +4.
    const sortedPorts = [...favoredPorts].sort((a, b) => b.bonus - a.bonus);
    if (favoredPorts.length === 1) {
      await Infamy.setFavoredPortBonus(client, sortedPorts[0].port_name, 4);
    } else if (favoredPorts.length === 2) {
      await Infamy.setFavoredPortBonus(client, sortedPorts[0].port_name, 6);
      await Infamy.setFavoredPortBonus(client, sortedPorts[1].port_name, 4);
    }

    return Infamy.getFavoredPorts(client);
  });

  controllerFactory.sendSuccessResponse(res, {
    port,
    bonus: newPortBonus,
    favoredPorts: updatedFavoredPorts,
  }, `${port} set as a favored port with +${newPortBonus} bonus`);
};

/**
 * Whether any recorded sacrifice happened within the last in-game week.
 * Dates are stored as unpadded 'Y-M-D' text, so they are compared as Golarion
 * dates, never as strings.
 */
const sacrificedWithinWeek = (sacrificeDates, today) =>
  sacrificeDates.some((value) => {
    const date = parseGolarionDateString(value);
    return date && golarionCalendar.compareDates(golarionCalendar.addDays(date, 7), today) > 0;
  });

/**
 * Sacrifice a crew member or prisoner for disrepute (Despicable 20+ feature)
 */
const sacrificeCrew = async (req, res) => {
  const userId = req.user.id;
  const crewName = parseText(req.body.crewName, 'Crew member name');

  await requireEnabled();

  const outcome = await dbUtils.executeTransaction(async (client) => {
    if (!(await Infamy.find(client))) throw createValidationError('No infamy record found');
    const { infamy } = await Infamy.getOrCreate(client, { lock: true });

    if (infamy < 20) {
      throw createValidationError('You need at least 20 Infamy (Despicable threshold) to sacrifice crew members');
    }

    const date = await requireGolarionDate(client);
    const recent = await Infamy.getRecentSacrificeDates(client);
    if (sacrificedWithinWeek(recent, date)) {
      throw createValidationError('This feature can only be used once per week (in-game time)');
    }

    // Roll 1d3 for disrepute gain
    const disreputeGain = Math.floor(Math.random() * 3) + 1;
    const { disrepute: newDisrepute } = await Infamy.applyChange(client, 0, disreputeGain);

    await Infamy.addHistory(client, {
      disreputeChange: disreputeGain,
      reason: `Sacrificed crew member: ${crewName}`,
      userId,
      golarionDate: Infamy.formatGolarionDate(date),
    });
    return { disreputeGain, newDisrepute };
  });

  controllerFactory.sendSuccessResponse(res, {
    crewName,
    disreputeGained: outcome.disreputeGain,
    newDisrepute: outcome.newDisrepute,
  }, `Sacrificed ${crewName} for ${outcome.disreputeGain} Disrepute points`);
};

/** Parse an optional whole-number adjustment (negative allowed). */
const parseDelta = (value, label) => {
  if (value === undefined || value === null || value === '') return 0;
  const num = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isSafeInteger(num)) throw createValidationError(`${label} must be a whole number`);
  return num;
};

const adjustInfamy = async (req, res) => {
  const { infamyChange, disreputeChange } = req.body;
  const userId = req.user.id;

  // Defence in depth: the route is already behind checkRole('DM')
  if (!hasDmRights(req)) {
    throw controllerFactory.createAuthorizationError('Only DMs can manually adjust infamy/disrepute');
  }

  const provided = (value) => value !== undefined && value !== null;
  if (!provided(infamyChange) && !provided(disreputeChange)) {
    throw createValidationError('At least one of infamyChange or disreputeChange must be provided');
  }
  const infamyDelta = parseDelta(infamyChange, 'infamyChange');
  const disreputeDelta = parseDelta(disreputeChange, 'disreputeChange');
  const reason = parseText(req.body.reason, 'Reason', 200);

  await requireEnabled();

  const outcome = await dbUtils.executeTransaction(async (client) => {
    const current = await Infamy.getOrCreate(client, { lock: true });

    // Clamp at 0, and record the change that actually happened
    const appliedInfamy = Math.max(0, current.infamy + infamyDelta) - current.infamy;
    const appliedDisrepute = Math.max(0, current.disrepute + disreputeDelta) - current.disrepute;

    const updated = await Infamy.applyChange(client, appliedInfamy, appliedDisrepute);
    await Infamy.addHistory(client, {
      infamyChange: appliedInfamy,
      disreputeChange: appliedDisrepute,
      reason: `DM Adjustment: ${reason}`,
      userId,
    });
    return { current, updated, appliedInfamy, appliedDisrepute };
  });

  const { current, updated, appliedInfamy, appliedDisrepute } = outcome;
  controllerFactory.sendSuccessResponse(res, {
    previousInfamy: current.infamy,
    infamyChange: appliedInfamy,
    newInfamy: updated.infamy,
    previousDisrepute: current.disrepute,
    disreputeChange: appliedDisrepute,
    newDisrepute: updated.disrepute,
    newThreshold: rules.crossedThreshold(current.infamy, updated.infamy),
  }, `Infamy ${appliedInfamy >= 0 ? 'increased' : 'decreased'} by ${Math.abs(appliedInfamy)} and Disrepute ${appliedDisrepute >= 0 ? 'increased' : 'decreased'} by ${Math.abs(appliedDisrepute)}`);
};

// Create handlers with validation and error handling. requiredFields is the
// single missing-field check; the handlers then validate type and range.
module.exports = {
  getInfamyStatus: controllerFactory.createHandler(getInfamyStatus, {
    errorMessage: 'Error getting infamy status'
  }),

  getAvailableImpositions: controllerFactory.createHandler(getAvailableImpositions, {
    errorMessage: 'Error getting available impositions'
  }),

  gainInfamy: controllerFactory.createHandler(gainInfamy, {
    errorMessage: 'Error gaining infamy',
    validation: { requiredFields: ['port'] }
  }),

  adjustInfamy: controllerFactory.createHandler(adjustInfamy, {
    errorMessage: 'Error adjusting infamy',
    validation: { requiredFields: ['reason'] }
  }),

  purchaseImposition: controllerFactory.createHandler(purchaseImposition, {
    errorMessage: 'Error purchasing imposition',
    validation: { requiredFields: ['impositionId'] }
  }),

  getInfamyHistory: controllerFactory.createHandler(getInfamyHistory, {
    errorMessage: 'Error getting infamy history'
  }),

  getPortVisits: controllerFactory.createHandler(getPortVisits, {
    errorMessage: 'Error getting port visits'
  }),

  setFavoredPort: controllerFactory.createHandler(setFavoredPort, {
    errorMessage: 'Error setting favored port',
    validation: { requiredFields: ['port'] }
  }),

  sacrificeCrew: controllerFactory.createHandler(sacrificeCrew, {
    errorMessage: 'Error sacrificing crew member',
    validation: { requiredFields: ['crewName'] }
  })
};
