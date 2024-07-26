const calculateFinalValue = (itemValue, itemType, itemSubtype, mods, isMasterwork) => {
  let baseValue = parseFloat(itemValue);
  let additionalValue = 0;
  let totalPlus = 0;

  console.log("Initial item value:", baseValue);
  console.log("Item type:", itemType);
  console.log("Item subtype:", itemSubtype);
  console.log("Mods:", mods);
  console.log("Is masterwork:", isMasterwork);

  mods.forEach(mod => {
    if (mod.valuecalc) {
      const valuecalc = mod.valuecalc.replace('item.wgt', '1'); // Default item weight to 1
      console.log("Valuecalc to apply:", valuecalc);
      additionalValue += eval(valuecalc);
    }
    if (mod.plus) {
      totalPlus += parseInt(mod.plus);
    }
  });

  console.log("Total plus:", totalPlus);

  // Add masterwork value if applicable
  if (isMasterwork || totalPlus >= 1) {
    if (itemType === 'weapon') {
      additionalValue += 300;
    } else if (itemType === 'armor') {
      additionalValue += 150;
    }
  }

  // Determine additional value based on total plus
  const plusValueTables = {
    weapon: { 1: 2000, 2: 8000, 3: 18000, 4: 32000, 5: 50000, 6: 72000, 7: 98000, 8: 128000, 9: 162000, 10: 200000 },
    armor: { 1: 1000, 2: 4000, 3: 9000, 4: 16000, 5: 25000, 6: 36000, 7: 49000, 8: 64000, 9: 81000, 10: 100000 }
  };

  if (itemType === 'weapon' || itemType === 'armor') {
    additionalValue += plusValueTables[itemType][totalPlus] || 0;
  }

  console.log("Additional value before ammunition adjustment:", additionalValue);

  // Adjust additional value for ammunition
  if (itemSubtype === 'ammunition') {
    additionalValue /= 50;
  }

  console.log("Additional value after ammunition adjustment:", additionalValue);

  const finalValue = baseValue + additionalValue;
  console.log("Final calculated value:", finalValue);
  return finalValue;
};

module.exports = { calculateFinalValue };