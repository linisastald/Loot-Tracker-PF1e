// backend/src/controllers/harrowController.js
//
// Harrow Point Tracker (Curse of the Crimson Throne flavor module).
//
// The current chapter and the feature gate live in campaign_settings
// (harrow_current_chapter '1'..'6', harrow_system_enabled '0'/'1'). Balances
// are scoped to the current chapter, so advancing the chapter just changes
// which entries count — no data is deleted.
//
// Authorization: DM-only actions (award, award-batch, adjust, advance chapter)
// are gated by checkRole('DM') at the route layer (per-campaign role). Spend
// and Choosing are open to players for their OWN character; the controller
// enforces ownership via hasDmRights + characters.user_id. Every mutation is
// rejected while harrow_system_enabled is not '1'.

const Harrow = require('../models/Harrow');
const controllerFactory = require('../utils/controllerFactory');
const campaignSettings = require('../utils/campaignSettings');
const { hasDmRights } = require('../utils/roleUtils');

const MIN_CHAPTER = 1;
const MAX_CHAPTER = 6;
// Column limits (harrow_ledger.reason VARCHAR(255), harrow_choosing.card_name VARCHAR(64))
const MAX_REASON_LENGTH = 255;
const MAX_CARD_NAME_LENGTH = 64;

const isValidChapter = (chapter) =>
  Number.isInteger(chapter) && chapter >= MIN_CHAPTER && chapter <= MAX_CHAPTER;

/** Read the current chapter from campaign settings (defaults to 1). */
const getCurrentChapter = async () => {
  const raw = await campaignSettings.getCampaignSetting('harrow_current_chapter', {
    defaultValue: '1',
  });
  const chapter = parseInt(raw, 10);
  return isValidChapter(chapter) ? chapter : 1;
};

/** Whether the Harrow system is enabled for the active campaign. */
const isEnabled = async () => {
  const raw = await campaignSettings.getCampaignSetting('harrow_system_enabled', {
    defaultValue: '0',
  });
  return raw === '1';
};

/** Reject the request when the Harrow system is disabled for this campaign. */
const requireEnabled = async () => {
  if (!(await isEnabled())) {
    throw controllerFactory.createAuthorizationError(
      'The Harrow Point Tracker is not enabled for this campaign'
    );
  }
};

/** Parse a body value as a positive integer id, or throw a 400. */
const parseCharacterId = (value) => {
  if (value === undefined || value === null || value === '') {
    throw controllerFactory.createValidationError('characterId is required');
  }
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw controllerFactory.createValidationError('characterId must be a positive integer');
  }
  return id;
};

/** Parse a positive-integer points value, or throw a 400. */
const parsePositiveInt = (value, message) => {
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n <= 0) {
    throw controllerFactory.createValidationError(message);
  }
  return n;
};

/** Throw a 400 when an optional text value exceeds its column limit. */
const checkMaxLength = (value, field, max) => {
  if (typeof value === 'string' && value.length > max) {
    throw controllerFactory.createValidationError(`${field} must be at most ${max} characters`);
  }
};

/**
 * Load a character (404 if missing) and, when requireOwner is set, enforce that
 * a non-DM requester owns it.
 * @param {Object} req
 * @param {number} characterId
 * @param {Object} [opts]
 * @param {string} [opts.ownerMessage] - 403 message; when set, ownership is enforced
 */
const loadCharacter = async (req, characterId, { ownerMessage } = {}) => {
  const character = await Harrow.getCharacter(characterId);
  if (!character) {
    throw controllerFactory.createNotFoundError('Character not found');
  }
  if (ownerMessage && !hasDmRights(req) && character.user_id !== req.user.id) {
    throw controllerFactory.createAuthorizationError(ownerMessage);
  }
  return character;
};

/**
 * Page state: current chapter, enabled flag, and the roster with each PC's
 * current-chapter balance and recorded Choosing card.
 */
const getState = async (req, res) => {
  const currentChapter = await getCurrentChapter();
  const enabled = await isEnabled();

  const balances = await Harrow.getBalances(currentChapter);
  const choosings = await Harrow.getChoosing(currentChapter);

  const choosingByCharacter = {};
  for (const choosing of choosings) {
    choosingByCharacter[choosing.character_id] = {
      card_name: choosing.card_name,
      is_chosen_boon: choosing.is_chosen_boon,
    };
  }

  const roster = balances.map((row) => ({
    character_id: row.character_id,
    name: row.name,
    user_id: row.user_id,
    balance: row.balance,
    choosing: choosingByCharacter[row.character_id] || null,
  }));

  controllerFactory.sendSuccessResponse(
    res,
    { currentChapter, enabled, balances: roster },
    'Harrow state retrieved'
  );
};

/** Award points to a single PC (DM only). */
const award = async (req, res) => {
  await requireEnabled();
  const { points, reason } = req.body;
  const chapter = await getCurrentChapter();

  const characterId = parseCharacterId(req.body.characterId);
  const pts = parsePositiveInt(points, 'points must be a positive integer');
  checkMaxLength(reason, 'reason', MAX_REASON_LENGTH);

  const character = await loadCharacter(req, characterId);

  const entry = await Harrow.addEntry({
    characterId,
    chapter,
    delta: pts,
    reason: reason || `Chapter ${chapter} award`,
    entryType: 'award',
    userId: req.user.id,
  });
  const balance = await Harrow.getBalance(characterId, chapter);

  controllerFactory.sendSuccessResponse(
    res,
    { entry, balance, chapter },
    `Awarded ${pts} Harrow Point${pts === 1 ? '' : 's'} to ${character.name}`
  );
};

/**
 * Award helper (DM only): the DM enters the suit-match count once and ticks
 * which PCs' Choosing cards appeared in the spread. The server is authoritative
 * for the formula: total = suitMatchCount + 1 (the Choosing) + 1 if the PC's
 * own Choosing card appeared.
 *
 * Body: { suitMatchCount, awards: [{ characterId, choosingHit }] }
 */
const awardBatch = async (req, res) => {
  await requireEnabled();
  const { suitMatchCount, awards } = req.body;
  const chapter = await getCurrentChapter();

  const matches = parseInt(suitMatchCount, 10);
  if (!Number.isInteger(matches) || matches < 0 || matches > 9) {
    throw controllerFactory.createValidationError(
      'suitMatchCount must be an integer between 0 and 9'
    );
  }
  if (!Array.isArray(awards) || awards.length === 0) {
    throw controllerFactory.createValidationError('awards must be a non-empty array');
  }

  const items = awards.map((item) => {
    if (!item || !item.characterId) {
      throw controllerFactory.createValidationError('each award requires a characterId');
    }
    return { characterId: parseCharacterId(item.characterId), choosingHit: !!item.choosingHit };
  });

  const ids = items.map((item) => item.characterId);
  if (new Set(ids).size !== ids.length) {
    throw controllerFactory.createValidationError('Each character can appear only once in awards');
  }

  // One query for all characters (RLS scopes it to the active campaign).
  const found = await Harrow.getCharacters(ids);
  const foundIds = new Set(found.map((character) => character.id));
  const missing = ids.find((id) => !foundIds.has(id));
  if (missing !== undefined) {
    throw controllerFactory.createNotFoundError(`Character ${missing} not found`);
  }

  const prepared = items.map((item) => ({
    characterId: item.characterId,
    points: matches + 1 + (item.choosingHit ? 1 : 0),
    reason: `Chapter ${chapter} harrowing`,
  }));

  const entries = await Harrow.awardBatch(chapter, prepared, req.user.id);
  const balances = await Harrow.getBalances(chapter);

  controllerFactory.sendSuccessResponse(
    res,
    { entries, balances, chapter },
    `Awarded Harrow Points to ${entries.length} character${entries.length === 1 ? '' : 's'}`
  );
};

/** Spend points (player on own character, or DM on anyone). */
const spend = async (req, res) => {
  await requireEnabled();
  const { points, reason } = req.body;
  const chapter = await getCurrentChapter();

  const characterId = parseCharacterId(req.body.characterId);
  const pts = parsePositiveInt(points, 'points must be a positive integer');
  checkMaxLength(reason, 'reason', MAX_REASON_LENGTH);

  const character = await loadCharacter(req, characterId, {
    ownerMessage: 'You can only spend Harrow Points on your own character',
  });

  // Balance check + insert happen atomically under a row lock.
  const result = await Harrow.addEntryGuarded({
    characterId,
    chapter,
    delta: -pts,
    reason: reason || 'Harrow Point spend',
    entryType: 'spend',
    userId: req.user.id,
  });
  if (!result.ok) {
    throw controllerFactory.createValidationError(
      `Not enough Harrow Points: ${character.name} has ${result.balance} this chapter, tried to spend ${pts}`
    );
  }

  controllerFactory.sendSuccessResponse(
    res,
    { entry: result.entry, balance: result.balance, chapter },
    `Spent ${pts} Harrow Point${pts === 1 ? '' : 's'}`
  );
};

/** Arbitrary correction (DM only). */
const adjust = async (req, res) => {
  await requireEnabled();
  const { delta, reason } = req.body;
  const chapter = await getCurrentChapter();

  const characterId = parseCharacterId(req.body.characterId);
  const d = parseInt(delta, 10);
  if (!Number.isInteger(d) || d === 0) {
    throw controllerFactory.createValidationError('delta must be a non-zero integer');
  }
  if (!reason) {
    throw controllerFactory.createValidationError('reason is required for an adjustment');
  }
  // The stored reason is prefixed with "Adjustment: " (12 characters).
  checkMaxLength(reason, 'reason', MAX_REASON_LENGTH - 'Adjustment: '.length);

  const character = await loadCharacter(req, characterId);

  const entryParams = {
    characterId,
    chapter,
    delta: d,
    reason: `Adjustment: ${reason}`,
    entryType: 'adjust',
    userId: req.user.id,
  };

  let entry;
  let balance;
  if (d < 0) {
    // Negative adjustments must not drive the balance below zero (atomic check + insert).
    const result = await Harrow.addEntryGuarded(entryParams);
    if (!result.ok) {
      throw controllerFactory.createValidationError(
        `Adjustment would make ${character.name}'s balance negative (current ${result.balance})`
      );
    }
    ({ entry, balance } = result);
  } else {
    entry = await Harrow.addEntry(entryParams);
    balance = await Harrow.getBalance(characterId, chapter);
  }

  controllerFactory.sendSuccessResponse(
    res,
    { entry, balance, chapter },
    'Harrow Points adjusted'
  );
};

/**
 * Advance / set the current chapter (DM only). No data is deleted: balances are
 * chapter-scoped, so prior points simply stop counting toward the new chapter.
 */
const advanceChapter = async (req, res) => {
  await requireEnabled();
  const ch = parseInt(req.body.chapter, 10);
  if (!isValidChapter(ch)) {
    throw controllerFactory.createValidationError('chapter must be an integer between 1 and 6');
  }

  await campaignSettings.setCampaignSetting('harrow_current_chapter', String(ch), 'integer');
  const balances = await Harrow.getBalances(ch);

  controllerFactory.sendSuccessResponse(
    res,
    { currentChapter: ch, balances },
    `Current chapter set to ${ch}`
  );
};

/** Record a PC's Choosing card for the current chapter (player own / DM any). */
const setChoosing = async (req, res) => {
  await requireEnabled();
  const { cardName, isChosenBoon } = req.body;
  const chapter = await getCurrentChapter();

  const characterId = parseCharacterId(req.body.characterId);
  checkMaxLength(cardName, 'cardName', MAX_CARD_NAME_LENGTH);

  await loadCharacter(req, characterId, {
    ownerMessage: 'You can only set the Choosing card for your own character',
  });

  const choosing = await Harrow.setChoosing({
    characterId,
    chapter,
    cardName,
    isChosenBoon,
  });

  controllerFactory.sendSuccessResponse(
    res,
    { choosing, chapter },
    'Choosing card recorded'
  );
};

/** One PC's ledger history (optionally filtered to a chapter via ?chapter=N). */
const getCharacterLedger = async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  if (!Number.isInteger(characterId)) {
    throw controllerFactory.createValidationError('Invalid character id');
  }

  let chapter = null;
  if (req.query.chapter !== undefined) {
    chapter = parseInt(req.query.chapter, 10);
    if (!isValidChapter(chapter)) {
      throw controllerFactory.createValidationError('chapter must be an integer between 1 and 6');
    }
  }

  const ledger = await Harrow.getLedger(characterId, chapter);
  controllerFactory.sendSuccessResponse(res, { ledger }, 'Harrow ledger retrieved');
};

module.exports = {
  getState: controllerFactory.createHandler(getState, {
    errorMessage: 'Error getting Harrow state',
  }),
  award: controllerFactory.createHandler(award, {
    errorMessage: 'Error awarding Harrow Points',
  }),
  awardBatch: controllerFactory.createHandler(awardBatch, {
    errorMessage: 'Error awarding Harrow Points from reading',
  }),
  spend: controllerFactory.createHandler(spend, {
    errorMessage: 'Error spending Harrow Points',
  }),
  adjust: controllerFactory.createHandler(adjust, {
    errorMessage: 'Error adjusting Harrow Points',
  }),
  advanceChapter: controllerFactory.createHandler(advanceChapter, {
    errorMessage: 'Error advancing chapter',
  }),
  setChoosing: controllerFactory.createHandler(setChoosing, {
    errorMessage: 'Error recording Choosing card',
  }),
  getCharacterLedger: controllerFactory.createHandler(getCharacterLedger, {
    errorMessage: 'Error getting Harrow ledger',
  }),
};
