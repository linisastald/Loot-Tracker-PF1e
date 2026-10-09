const logger = require('../utils/logger');

/**
 * mod.valuecalc grammar (F-0643). valuecalc used to be concatenated onto the
 * running value and passed to eval(). It is now parsed strictly and NEVER
 * evaluated as code. Shapes present in database/mod_data.sql (85 distinct
 * values, all covered by tests):
 *   OP NUMBER            e.g. "+1000", "*1.1", "/2"     (OP is one of + - * /)
 *   "+(N*item.wgt)"      e.g. "+(10*item.wgt)"          (after the item.wgt
 *                        substitution this is OP "(" NUMBER "*" NUMBER ")")
 * Anything else is logged with logger.warn and treated as a no-op.
 */
// Numeric literal: digits with optional fraction / exponent (exponent only
// because Number.prototype.toString can render weights as e.g. 1e-7).
const NUMBER = String.raw`(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?`;
const OPERAND_RE = new RegExp(String.raw`^([+\-*/])(${NUMBER})$`);
const PRODUCT_RE = new RegExp(String.raw`^([+\-*/])\((${NUMBER})\*(${NUMBER})\)$`);

// Raw (stored) form accepted when an admin creates/edits a mod: no whitespace,
// and the weight only through the literal token item.wgt.
const RAW_NUMBER = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const VALUECALC_RAW_RE = new RegExp(
  String.raw`^[+\-*/](?:${RAW_NUMBER}|\(${RAW_NUMBER}\*item\.wgt\))$`
);

/**
 * Whether a stored mod.valuecalc string is in the supported grammar.
 * Used by POST/PUT /admin/mods validation.
 * @param {string} valuecalc - raw valuecalc text
 * @returns {boolean}
 */
const isValidValuecalc = (valuecalc) =>
  typeof valuecalc === 'string' && VALUECALC_RAW_RE.test(valuecalc);

/**
 * Apply an (already item.wgt-substituted) valuecalc to a running value.
 * Never executes the text. Returns the original value, unchanged, when the
 * text is not a supported shape or would not produce a finite number.
 * @param {number} value - running value
 * @param {string} valuecalc - substituted valuecalc, e.g. "+500" or "+(10*2.5)"
 * @param {string} [modName] - mod name for log messages
 * @returns {number}
 */
const applyValuecalc = (value, valuecalc, modName) => {
  const text = typeof valuecalc === 'string' ? valuecalc : '';
  let op;
  let operand;
  let match = OPERAND_RE.exec(text);
  if (match) {
    op = match[1];
    operand = Number(match[2]);
  } else if ((match = PRODUCT_RE.exec(text))) {
    op = match[1];
    operand = Number(match[2]) * Number(match[3]);
  } else {
    logger.warn(`Ignoring unsupported valuecalc for mod ${modName}: ${JSON.stringify(text).slice(0, 100)}`);
    return value;
  }

  let result;
  switch (op) {
    case '+': result = value + operand; break;
    case '-': result = value - operand; break;
    case '*': result = value * operand; break;
    default:
      if (operand === 0) {
        logger.warn(`Ignoring valuecalc with division by zero for mod ${modName}`);
        return value;
      }
      result = value / operand;
  }
  if (!Number.isFinite(result)) {
    logger.warn(`Ignoring valuecalc for mod ${modName}: result is not a finite number`);
    return value;
  }
  return result;
};

/**
 * The catalog stores a wand's value PER CHARGE (full-wand price / 50), so the
 * charge count must be multiplied in. A new, full wand has 50 charges.
 */
const WAND_FULL_CHARGES = 50;

/**
 * Whether an item name denotes a wand (catalog convention: name starts with "wand of").
 * @param {string} itemName
 * @returns {boolean}
 */
const isWandName = (itemName) =>
  typeof itemName === 'string' && itemName.toLowerCase().startsWith('wand of');

// Size multipliers for weight (hoisted: they never change)
const WEIGHT_SIZE_MULTIPLIERS = {
  Fine: 0.1, Diminutive: 0.1, Tiny: 0.1, Small: 0.5, Medium: 1,
  Large: 2, Huge: 5, Gargantuan: 8, Colossal: 12
};

// Size multipliers for the value of weapons and armor
const VALUE_SIZE_MULTIPLIERS = {
  Fine: 0.5, Diminutive: 0.5, Tiny: 0.5, Small: 1, Medium: 1,
  Large: 2, Huge: 4, Gargantuan: 8, Colossal: 16
};

// Masterwork surcharge (coreRulebook/equipment.html: +300 gp per weapon, +150 gp
// per armor, or 6 gp per single unit of ammunition = 300 / 50).
const MASTERWORK_COST = { weapon: 300, armor: 150 };
const AMMUNITION_UNITS = 50;

/**
 * Cost of a total enhancement bonus on a weapon (bonus^2 x 2000 gp) or armor
 * (bonus^2 x 1000 gp); only whole bonuses +1..+10 are priced.
 */
const enhancementCost = (itemType, totalPlus) => {
  if ((itemType !== 'weapon' && itemType !== 'armor') || !Number.isInteger(totalPlus) || totalPlus < 1 || totalPlus > 10) {
    return 0;
  }
  return totalPlus * totalPlus * (itemType === 'weapon' ? 2000 : 1000);
};

/**
 * Calculate the final value of an item based on its properties and modifications
 * @param {number} itemValue - Base value of the item
 * @param {string} itemType - Type of the item (weapon, armor, etc.)
 * @param {string} itemSubtype - Subtype of the item
 * @param {Array} mods - Array of modification objects
 * @param {boolean} isMasterwork - Whether the item is masterwork
 * @param {string} itemName - Name of the item
 * @param {number} charges - Number of charges (for wands)
 * @param {string} size - Size of the item
 * @param {number} itemWeight - Weight of the item
 * @returns {number} - The calculated final value
 */
const calculateFinalValue = (itemValue, itemType, itemSubtype, mods, isMasterwork, itemName, charges, size, itemWeight) => {
  try {
    let modifiedValue = Number(itemValue);
    let totalPlus = 0;
    const isWeaponOrArmor = itemType === 'weapon' || itemType === 'armor';

    // Use itemWeight if available (null/undefined default to 1), scaled by size
    // (an unrecognised size leaves the weight unscaled).
    const appliedSize = size || 'Medium';
    const weight = (itemWeight ?? 1) * (WEIGHT_SIZE_MULTIPLIERS[appliedSize] ?? 1);

    // Size multiplier for weapons and armor value
    if (isWeaponOrArmor && appliedSize in VALUE_SIZE_MULTIPLIERS) {
      modifiedValue *= VALUE_SIZE_MULTIPLIERS[appliedSize];
    }

    // Special case for wands: the catalog value is per charge
    if (isWandName(itemName) && charges) {
      modifiedValue *= charges;
    }

    if (mods && Array.isArray(mods)) {
      mods.forEach(mod => {
        if (mod.valuecalc) {
          modifiedValue = applyValuecalc(modifiedValue, mod.valuecalc.replaceAll('item.wgt', weight.toString()), mod.name);
        }
        if (mod.plus) {
          totalPlus += Number(mod.plus);
        }
      });
    }

    // Masterwork cost (also implied by any enhancement bonus). Ammunition is
    // priced per piece: the masterwork surcharge and the enhancement cost are
    // both divided by 50.
    const isAmmunition = itemSubtype === 'ammunition';
    if ((isMasterwork || totalPlus >= 1) && isWeaponOrArmor) {
      const masterwork = MASTERWORK_COST[itemType];
      modifiedValue += isAmmunition && itemType === 'weapon' ? masterwork / AMMUNITION_UNITS : masterwork;
    }

    let additionalValue = enhancementCost(itemType, totalPlus);
    if (isAmmunition) {
      additionalValue /= AMMUNITION_UNITS;
    }

    const finalValue = modifiedValue + additionalValue;
    logger.debug(`Final calculated value for ${itemName || 'item'}: ${finalValue}`);

    return finalValue;
  } catch (error) {
    logger.error(`Error calculating final value: ${error.message}`);
    // Return the original value if calculation fails
    return Number(itemValue) || 0;
  }
};

module.exports = { calculateFinalValue, applyValuecalc, isValidValuecalc, isWandName, WAND_FULL_CHARGES };