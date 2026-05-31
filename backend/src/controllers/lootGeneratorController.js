// src/controllers/lootGeneratorController.js
const controllerFactory = require('../utils/controllerFactory');
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');
const lootGeneratorService = require('../services/lootGenerator/lootGeneratorService');
const { crKey } = require('../services/lootGenerator/treasureTables');

const ALLOWED_TRACKS = ['slow', 'medium', 'fast'];
const VALID_TREASURE = ['none', 'incidental', 'standard', 'double', 'triple', 'npc_gear'];
const VALID_TYPES = [
  'aberration', 'animal', 'construct', 'dragon', 'fey', 'humanoid', 'magical beast',
  'monstrous humanoid', 'ooze', 'outsider', 'plant', 'undead', 'vermin',
];

const INSERT_LOOT = `
  INSERT INTO loot
    (session_date, quantity, name, unidentified, masterwork, type, size,
     itemid, modids, value, whoupdated, notes, charges, spellcraft_dc, status)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NULL)
  RETURNING id, name, quantity`;

const INSERT_GOLD = `
  INSERT INTO gold (session_date, who, transaction_type, platinum, gold, silver, copper, notes)
  VALUES ($1, $2, 'Loot', $3, $4, $5, $6, $7)
  RETURNING id`;

// Trim and clamp a string to a DB column width (returns null for non-strings).
const clampStr = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null);
// Coerce to a non-negative integer or null (so a malformed edited field can't
// reach an INTEGER column and 500).
const toIntOrNull = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) ? n : null;
};

/**
 * Generate a treasure preview from a list of enemies (no DB writes). DM only.
 */
const generate = async (req, res) => {
  const { enemies, track, modifier, unidentified } = req.body;

  if (!Array.isArray(enemies) || enemies.length === 0) {
    throw controllerFactory.createValidationError('At least one enemy is required');
  }

  const cleaned = enemies.map((e, i) => {
    if (crKey(e.cr) === null) {
      throw controllerFactory.createValidationError(`Enemy ${i + 1}: a valid CR is required (e.g. 1/2, 1, 8)`);
    }
    const count = parseInt(e.count, 10);
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      throw controllerFactory.createValidationError(`Enemy ${i + 1}: count must be between 1 and 1000`);
    }
    return {
      name: typeof e.name === 'string' ? e.name.trim() : '',
      creatureType: VALID_TYPES.includes(e.creatureType) ? e.creatureType : 'humanoid',
      cr: e.cr,
      count,
      treasure: VALID_TREASURE.includes(e.treasure) ? e.treasure : 'standard',
      spellcaster: Boolean(e.spellcaster),
    };
  });

  const options = {};
  if (ALLOWED_TRACKS.includes(track)) options.track = track;
  const mod = parseFloat(modifier);
  if (mod > 0) options.modifier = Math.min(mod, 100);
  if (unidentified === false) options.unidentified = false;

  const preview = await lootGeneratorService.generate(cleaned, options);
  controllerFactory.sendSuccessResponse(res, preview, 'Treasure generated');
};

/**
 * Commit a (possibly edited) preview: insert items into pending loot and post
 * coins to the gold ledger, atomically. DM only.
 */
const commit = async (req, res) => {
  const { items, coins, sessionDate } = req.body;

  const itemList = Array.isArray(items) ? items : [];
  const c = coins || {};
  const platinum = Math.max(0, parseInt(c.platinum, 10) || 0);
  const gold = Math.max(0, parseInt(c.gold, 10) || 0);
  const silver = Math.max(0, parseInt(c.silver, 10) || 0);
  const copper = Math.max(0, parseInt(c.copper, 10) || 0);
  const hasCoins = platinum + gold + silver + copper > 0;

  if (itemList.length === 0 && !hasCoins) {
    throw controllerFactory.createValidationError('Nothing to commit: no items or coins');
  }

  const date = sessionDate ? new Date(sessionDate) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw controllerFactory.createValidationError('Invalid session date');
  }

  const result = await dbUtils.executeTransaction(async (client) => {
    const createdItems = [];
    for (const it of itemList) {
      if (typeof it.name !== 'string' || it.name.trim() === '') continue;
      const quantity = Math.max(1, parseInt(it.quantity, 10) || 1);
      const value = it.value === null || it.value === undefined ? null : Number(it.value);
      const modids = Array.isArray(it.modIds) && it.modIds.length > 0 ? it.modIds : null;
      // Unidentified items are stored under a generic name so the loot list
      // doesn't reveal what they are; the real identity is recoverable on
      // identification via itemid/modids.
      const storedName = (it.unidentified && typeof it.unidentifiedName === 'string' && it.unidentifiedName.trim() !== '')
        ? it.unidentifiedName
        : it.name;
      const inserted = await client.query(INSERT_LOOT, [
        date,
        quantity,
        clampStr(storedName, 255),
        Boolean(it.unidentified),
        Boolean(it.masterwork),
        clampStr(it.type, 15),
        clampStr(it.size, 15),
        it.itemId || null,
        modids,
        Number.isFinite(value) ? value : null,
        req.user?.id || null,
        clampStr(it.notes, 511),
        toIntOrNull(it.charges),
        toIntOrNull(it.spellcraftDc),
      ]);
      createdItems.push(inserted.rows[0]);
    }

    let goldEntry = null;
    if (hasCoins) {
      const g = await client.query(INSERT_GOLD, [
        date, req.user?.id || null, platinum, gold, silver, copper, 'Generated loot',
      ]);
      goldEntry = g.rows[0];
    }

    return { items: createdItems, coins: goldEntry };
  });

  logger.info(`Loot generator committed ${result.items.length} item rows`, { userId: req.user?.id });
  controllerFactory.sendCreatedResponse(res, {
    itemsCreated: result.items.length,
    coinsPosted: hasCoins,
  }, 'Treasure committed to pending loot');
};

/**
 * Get the treasure tuning settings (track + modifier). DM only.
 */
const getTreasureSettings = async (req, res) => {
  const settings = await lootGeneratorService.getTreasureSettings();
  controllerFactory.sendSuccessResponse(res, settings, 'Treasure settings retrieved');
};

/**
 * Update the treasure tuning settings. DM only.
 */
const updateTreasureSettings = async (req, res) => {
  const { track, modifier } = req.body;

  if (track !== undefined && !ALLOWED_TRACKS.includes(track)) {
    throw controllerFactory.createValidationError('Track must be slow, medium, or fast');
  }
  let mod;
  if (modifier !== undefined) {
    mod = parseFloat(modifier);
    if (!(mod > 0) || mod > 100) {
      throw controllerFactory.createValidationError('Modifier must be a positive number');
    }
  }

  if (track !== undefined) {
    await dbUtils.executeQuery(
      `INSERT INTO settings (name, value, value_type, description)
       VALUES ('treasure_track', $1, 'string', 'Treasure progression track used by the loot generator')
       ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value`,
      [track]
    );
  }
  if (mod !== undefined) {
    await dbUtils.executeQuery(
      `INSERT INTO settings (name, value, value_type, description)
       VALUES ('treasure_modifier', $1, 'string', 'Overall multiplier applied to generated treasure amounts')
       ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value`,
      [String(mod)]
    );
  }

  const settings = await lootGeneratorService.getTreasureSettings();
  controllerFactory.sendSuccessResponse(res, settings, 'Treasure settings updated');
};

module.exports = {
  generate: controllerFactory.createHandler(generate, { errorMessage: 'Error generating treasure' }),
  commit: controllerFactory.createHandler(commit, {
    errorMessage: 'Error committing treasure',
  }),
  getTreasureSettings: controllerFactory.createHandler(getTreasureSettings, { errorMessage: 'Error retrieving treasure settings' }),
  updateTreasureSettings: controllerFactory.createHandler(updateTreasureSettings, { errorMessage: 'Error updating treasure settings' }),
};
