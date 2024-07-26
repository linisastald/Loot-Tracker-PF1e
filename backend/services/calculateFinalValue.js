const calculateFinalValue = (itemValue, itemType, itemSubtype, mods, isMasterwork) => {
  let modifiedValue = Number(itemValue);
  let totalPlus = 0;

  console.log("Initial item value:", modifiedValue);
  console.log("Item type:", itemType);
  console.log("Item subtype:", itemSubtype);
  console.log("Mods:", mods);
  console.log("Is masterwork:", isMasterwork);

  mods.forEach(mod => {
    if (mod.valuecalc) {
      const valuecalc = mod.valuecalc.replace('item.wgt', '1'); // Default item weight to 1
      console.log("Before applying valuecalc:", modifiedValue);
      console.log("Valuecalc to apply:", valuecalc);
      modifiedValue = Number(eval(`${modifiedValue}${valuecalc}`));
      console.log("After applying valuecalc:", modifiedValue);
    }
    if (mod.plus) {
      totalPlus += Number(mod.plus);
      console.log("Total plus after adding mod:", totalPlus);
    }
  });

  // Add masterwork value if applicable
  if (isMasterwork || totalPlus >= 1) {
    if (itemType === 'weapon') {
      modifiedValue += 300;
      console.log("Added masterwork weapon value:", 300);
    } else if (itemType === 'armor') {
      modifiedValue += 150;
      console.log("Added masterwork armor value:", 150);
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

  console.log("Additional value based on total plus:", additionalValue);

  // Adjust additional value for ammunition
  if (itemSubtype === 'ammunition') {
    additionalValue /= 50;
    console.log("Adjusted additional value for ammunition:", additionalValue);
  }

  const finalValue = modifiedValue + additionalValue;
  console.log("Final calculated value:", finalValue);
  return finalValue;
};

module.exports = { calculateFinalValue };