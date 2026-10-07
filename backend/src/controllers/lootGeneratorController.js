// src/controllers/lootGeneratorController.js
const controllerFactory = require('../utils/controllerFactory');
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');
const campaignSettings = require('../utils/campaignSettings');
const lootGeneratorService = require('../services/lootGenerator/lootGeneratorService');
const { crKey, NPC_GEAR_SOURCES, DEFAULT_NPC_GEAR_SOURCE } = require('../services/lootGenerator/treasureTables');
const { ENVIRONMENTS, listEnvironments } = require('../services/lootGenerator/treasureFlavor');
const spellbookService = require('../services/lootGenerator/spellbookService');
const Spellbook = require('../models/Spellbook');

// Sanitize an edited spellbook payload before persisting (clamp class/level and
// cap/clean the spell list so malformed client input can't reach the DB).
const sanitizeBook = (sb) => {
  const casterClass = spellbookService.resolveClass(sb.casterClass);
  const casterLevel = spellbookService.clampCasterLevel(sb.casterLevel);
  const school = typeof sb.school === 'string' ? sb.school.slice(0, 20) : null;
  const spells = (Array.isArray(sb.spells) ? sb.spells : [])
    .slice(0, 300)
    .filter(s => s && typeof s.name === 'string' && s.name.trim() !== '')
    .map(s => ({
      id: Number.isInteger(s.id) ? s.id : null,
      name: s.name.trim().slice(0, 255),
      level: Math.max(0, Math.min(9, parseInt(s.level, 10) || 0)),
      school: typeof s.school === 'string' ? s.school.slice(0, 50) : null,
    }));
  return { casterClass, casterLevel, school, spells };
};

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
// reach an INTEGER column and 500); negative values clamp to 0.
const toIntOrNull = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) ? Math.max(0, n) : null;
};

// A catalog/mod id from the edited preview: null when absent, otherwise it must be a
// positive integer (a bad or stale id would otherwise fail the whole commit later).
const toIdOrNull = (v, label, index) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) {
    throw controllerFactory.createValidationError(`Item ${index + 1}: ${label} must be a positive integer`);
  }
  return n;
};

// Validate and normalise one edited preview item before the transaction starts.
const validateCommitItem = (it, index) => {
  if (!it || typeof it.name !== 'string' || it.name.trim() === '') {
    throw controllerFactory.createValidationError(`Item ${index + 1}: a name is required`);
  }
  const modIds = Array.isArray(it.modIds)
    ? it.modIds.map((m) => toIdOrNull(m, 'modIds entries', index)).filter((m) => m !== null)
    : [];
  return { itemId: toIdOrNull(it.itemId, 'itemId', index), modIds };
};

/**
 * Generate a treasure preview from a list of enemies (no DB writes). DM only.
 */
const generate = async (req, res) => {
  const { enemies, track, modifier, unidentified, environment, npcGearSource } = req.body;

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

  // Where 'npc_gear' enemies get their gp value: the CRB NPC Gear table (default) or PC wealth
  if (npcGearSource !== undefined && !NPC_GEAR_SOURCES.includes(npcGearSource)) {
    throw controllerFactory.createValidationError(`npcGearSource must be one of: ${NPC_GEAR_SOURCES.join(', ')}`);
  }

  const options = { npcGearSource: npcGearSource || DEFAULT_NPC_GEAR_SOURCE };
  if (ALLOWED_TRACKS.includes(track)) options.track = track;
  const mod = parseFloat(modifier);
  if (mod > 0) options.modifier = Math.min(mod, 100);
  if (unidentified === false) options.unidentified = false;
  if (typeof environment === 'string' && ENVIRONMENTS[environment]) options.environment = environment;

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

  const validated = itemList.map(validateCommitItem);

  const result = await dbUtils.executeTransaction(async (client) => {
    const createdItems = [];
    for (const [index, it] of itemList.entries()) {
      const { itemId, modIds } = validated[index];
      const quantity = Math.max(1, parseInt(it.quantity, 10) || 1);
      const value = it.value === null || it.value === undefined ? null : Number(it.value);
      const modids = modIds.length > 0 ? modIds : null;
      // Owner decision: a spellbook is a subtype of magic. Older clients sent the
      // non-canonical type 'spellbook', which is still honoured but stored as magic.
      const isSpellbook = it.subtype === 'spellbook' || it.type === 'spellbook';
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
        clampStr(isSpellbook ? 'magic' : it.type, 15),
        clampStr(it.size, 15),
        itemId,
        modids,
        Number.isFinite(value) ? value : null,
        req.user?.id || null,
        clampStr(it.notes, 511),
        toIntOrNull(it.charges),
        toIntOrNull(it.spellcraftDc),
      ]);
      createdItems.push(inserted.rows[0]);

      // A spellbook item also persists its spell list, linked to this loot row.
      if (isSpellbook && it.spellbook && Array.isArray(it.spellbook.spells)) {
        await Spellbook.insertWithClient(client, inserted.rows[0].id, sanitizeBook(it.spellbook));
      }
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
  controllerFactory.sendSuccessResponse(res, {
    ...settings,
    environments: listEnvironments(),
  }, 'Treasure settings retrieved');
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
    await campaignSettings.setCampaignSetting('treasure_track', track, 'string');
  }
  if (mod !== undefined) {
    await campaignSettings.setCampaignSetting('treasure_modifier', String(mod), 'string');
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
