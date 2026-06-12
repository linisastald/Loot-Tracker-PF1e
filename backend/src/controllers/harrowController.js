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
// enforces ownership via hasDmRights + characters.user_id.

const Harrow = require('../models/Harrow');
const controllerFactory = require('../utils/controllerFactory');
const campaignSettings = require('../utils/campaignSettings');
const { hasDmRights } = require('../utils/roleUtils');

/** Read the current chapter from campaign settings (defaults to 1). */
const getCurrentChapter = async () => {
  const raw = await campaignSettings.getCampaignSetting('harrow_current_chapter', {
    defaultValue: '1',
  });
  const chapter = parseInt(raw, 10);
  return chapter >= 1 && chapter <= 6 ? chapter : 1;
};

/** Whether the Harrow system is enabled for the active campaign. */
const isEnabled = async () => {
  const raw = await campaignSettings.getCampaignSetting('harrow_system_enabled', {
    defaultValue: '0',
  });
  return raw === '1';
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
  const { characterId, points, reason } = req.body;
  const chapter = await getCurrentChapter();

  const pts = parseInt(points, 10);
  if (!characterId) {
    throw controllerFactory.createValidationError('characterId is required');
  }
  if (!Number.isInteger(pts) || pts <= 0) {
    throw controllerFactory.createValidationError('points must be a positive integer');
  }

  const character = await Harrow.getCharacter(characterId);
  if (!character) {
    throw controllerFactory.createNotFoundError('Character not found');
  }

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

  const prepared = [];
  for (const item of awards) {
    if (!item || !item.characterId) {
      throw controllerFactory.createValidationError('each award requires a characterId');
    }
    const character = await Harrow.getCharacter(item.characterId);
    if (!character) {
      throw controllerFactory.createNotFoundError(`Character ${item.characterId} not found`);
    }
    const points = matches + 1 + (item.choosingHit ? 1 : 0);
    prepared.push({
      characterId: item.characterId,
      points,
      reason: `Chapter ${chapter} harrowing`,
    });
  }

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
  const { characterId, points, reason } = req.body;
  const chapter = await getCurrentChapter();

  const pts = parseInt(points, 10);
  if (!characterId) {
    throw controllerFactory.createValidationError('characterId is required');
  }
  if (!Number.isInteger(pts) || pts <= 0) {
    throw controllerFactory.createValidationError('points must be a positive integer');
  }

  const character = await Harrow.getCharacter(characterId);
  if (!character) {
    throw controllerFactory.createNotFoundError('Character not found');
  }
  if (!hasDmRights(req) && character.user_id !== req.user.id) {
    throw controllerFactory.createAuthorizationError(
      'You can only spend Harrow Points on your own character'
    );
  }

  const balance = await Harrow.getBalance(characterId, chapter);
  if (balance < pts) {
    throw controllerFactory.createValidationError(
      `Not enough Harrow Points: ${character.name} has ${balance} this chapter, tried to spend ${pts}`
    );
  }

  const entry = await Harrow.addEntry({
    characterId,
    chapter,
    delta: -pts,
    reason: reason || 'Harrow Point spend',
    entryType: 'spend',
    userId: req.user.id,
  });
  const newBalance = await Harrow.getBalance(characterId, chapter);

  controllerFactory.sendSuccessResponse(
    res,
    { entry, balance: newBalance, chapter },
    `Spent ${pts} Harrow Point${pts === 1 ? '' : 's'}`
  );
};

/** Arbitrary correction (DM only). */
const adjust = async (req, res) => {
  const { characterId, delta, reason } = req.body;
  const chapter = await getCurrentChapter();

  const d = parseInt(delta, 10);
  if (!characterId) {
    throw controllerFactory.createValidationError('characterId is required');
  }
  if (!Number.isInteger(d) || d === 0) {
    throw controllerFactory.createValidationError('delta must be a non-zero integer');
  }
  if (!reason) {
    throw controllerFactory.createValidationError('reason is required for an adjustment');
  }

  const character = await Harrow.getCharacter(characterId);
  if (!character) {
    throw controllerFactory.createNotFoundError('Character not found');
  }

  if (d < 0) {
    const balance = await Harrow.getBalance(characterId, chapter);
    if (balance + d < 0) {
      throw controllerFactory.createValidationError(
        `Adjustment would make ${character.name}'s balance negative (current ${balance})`
      );
    }
  }

  const entry = await Harrow.addEntry({
    characterId,
    chapter,
    delta: d,
    reason: `Adjustment: ${reason}`,
    entryType: 'adjust',
    userId: req.user.id,
  });
  const balance = await Harrow.getBalance(characterId, chapter);

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
  const { chapter } = req.body;
  const ch = parseInt(chapter, 10);
  if (!Number.isInteger(ch) || ch < 1 || ch > 6) {
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
  const { characterId, cardName, isChosenBoon } = req.body;
  const chapter = await getCurrentChapter();

  if (!characterId) {
    throw controllerFactory.createValidationError('characterId is required');
  }

  const character = await Harrow.getCharacter(characterId);
  if (!character) {
    throw controllerFactory.createNotFoundError('Character not found');
  }
  if (!hasDmRights(req) && character.user_id !== req.user.id) {
    throw controllerFactory.createAuthorizationError(
      'You can only set the Choosing card for your own character'
    );
  }

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
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > 6) {
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
