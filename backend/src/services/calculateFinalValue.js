const logger = require('../utils/logger');

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

    // Use itemWeight if available, otherwise default to 1
    let weight = itemWeight !== null ? itemWeight : 1;

    // Size multipliers for weight
    const weightSizeMultipliers = {
      'Fine': 0.1,
      'Diminutive': 0.1,
      'Tiny': 0.1,
      'Small': 0.5,
      'Medium': 1,
      'Large': 2,
      'Huge': 5,
      'Gargantuan': 8,
      'Colossal': 12
    };

    // Apply size multiplier to weight
    const appliedSize = size || 'Medium';
    weight *= weightSizeMultipliers[appliedSize];

    // Size multipliers for value (weapons and armor)
    const valueSizeMultipliers = {
      'Fine': 0.5,
      'Diminutive': 0.5,
      'Tiny': 0.5,
      'Small': 1,
      'Medium': 1,
      'Large': 2,
      'Huge': 4,
      'Gargantuan': 8,
      'Colossal': 16
    };

    // Apply size multiplier for weapons and armor value
    if ((itemType === 'weapon' || itemType === 'armor') && appliedSize in valueSizeMultipliers) {
      modifiedValue *= valueSizeMultipliers[appliedSize];
    }

    // Special case for wands
    if (itemName && itemName.toLowerCase().startsWith('wand of') && charges) {
      modifiedValue *= charges;
      logger.debug(`Applied wand charges multiplier: ${charges} -> ${modifiedValue}`);
    }

    if (mods && Array.isArray(mods)) {
      mods.forEach(mod => {
        if (mod.valuecalc) {
          const originalValue = modifiedValue;
          const valuecalc = mod.valuecalc.replace('item.wgt', weight.toString());
          try {
            // Use safe eval here
            modifiedValue = Number(eval(`${modifiedValue}${valuecalc}`));
            logger.debug(`Applied mod value calculation for ${mod.name}: ${originalValue} -> ${modifiedValue}`);
          } catch (evalError) {
            logger.error(`Error evaluating valuecalc ${valuecalc} for mod ${mod.name}: ${evalError.message}`);
          }
        }
        if (mod.plus) {
          totalPlus += Number(mod.plus);
          logger.debug(`Added plus value from mod ${mod.name}: +${mod.plus}, total plus now: ${totalPlus}`);
        }
      });
    }

    // Add masterwork value if applicable
    if (isMasterwork || totalPlus >= 1) {
      if (itemType === 'weapon') {
        modifiedValue += 300;
        logger.debug(`Added masterwork weapon value: +300 -> ${modifiedValue}`);
      } else if (itemType === 'armor') {
        modifiedValue += 150;
        logger.debug(`Added masterwork armor value: +150 -> ${modifiedValue}`);
      }
    }

    // Determine additional value based on total plus
    const plusValueTables = {
      weapon: { 1: 2000, 2: 8000, 3: 18000, 4: 32000, 5: 50000, 6: 72000, 7: 98000, 8: 128000, 9: 162000, 10: 200000 },
      armor: { 1: 1000, 2: 4000, 3: 9000, 4: 16000, 5: 25000, 6: 36000, 7: 49000, 8: 64000, 9: 81000, 10: 100000 }
    };

    let additionalValue = 0;
    if ((itemType === 'weapon' || itemType === 'armor') && totalPlus > 0 && totalPlus <= 10) {
      additionalValue = plusValueTables[itemType][totalPlus] || 0;
      logger.debug(`Added plus value for ${itemType} +${totalPlus}: +${additionalValue}`);
    }

    // Adjust additional value for ammunition
    if (itemSubtype === 'ammunition') {
      const originalAdditionalValue = additionalValue;
      additionalValue /= 50;
      logger.debug(`Adjusted value for ammunition: ${originalAdditionalValue} -> ${additionalValue}`);
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

module.exports = { calculateFinalValue };