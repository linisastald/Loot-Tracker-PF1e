const calculateFinalValue = (itemValue, itemType, itemSubtype, mods, isMasterwork, itemName, charges, size, itemWeight) => {
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
  }

  mods.forEach(mod => {
    if (mod.valuecalc) {
      const valuecalc = mod.valuecalc.replace('item.wgt', weight.toString());
      modifiedValue = Number(eval(`${modifiedValue}${valuecalc}`));
    }
    if (mod.plus) {
      totalPlus += Number(mod.plus);
    }
  });

  // Add masterwork value if applicable
  if (isMasterwork || totalPlus >= 1) {
    if (itemType === 'weapon') {
      modifiedValue += 300;
    } else if (itemType === 'armor') {
      modifiedValue += 150;
    }
  }

  // Determine additional value based on total plus
  const plusValueTables = {
    weapon: { 1: 2000, 2: 8000, 3: 18000, 4: 32000, 5: 50000, 6: 72000, 7: 98000, 8: 128000, 9: 162000, 10: 200000 },
    armor: { 1: 1000, 2: 4000, 3: 9000, 4: 16000, 5: 25000, 6: 36000, 7: 49000, 8: 64000, 9: 81000, 10: 100000 }
  };

  let additionalValue = 0;
  if (itemType === 'weapon' || itemType === 'armor') {
    additionalValue = plusValueTables[itemType][totalPlus] || 0;
  }

  // Adjust additional value for ammunition
  if (itemSubtype === 'ammunition') {
    additionalValue /= 50;
  }

  const finalValue = modifiedValue + additionalValue;
  return finalValue;
};

module.exports = { calculateFinalValue };