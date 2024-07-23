const calculateFinalValue = (itemValue, itemType, mods) => {
  let modifiedValue = itemValue;
  let totalPlus = 0;
  console.log(modifiedValue, itemType, mods )
  mods.forEach(mod => {
    if (mod.valuecalc) {
      // Apply value calculation
      const valuecalc = mod.valuecalc.replace('item.wgt', '1'); // Default item weight to 1
      console.log("modval 1:",modifiedValue)
      console.log("valcalc 1:",valuecalc)
      modifiedValue = eval(`${modifiedValue}${valuecalc}`);
      console.log("modval 2:",modifiedValue)
    }
    if (mod.plus) {
      totalPlus += mod.plus;
      console.log("total plus:",totalPlus)
    }
  });

  // Determine additional value based on total plus
  const plusValueTables = {
    weapon: { 1: 2000, 2: 8000, 3: 18000, 4: 32000, 5: 50000, 6: 72000, 7: 98000, 8: 128000, 9: 162000, 10: 200000 },
    armor: { 1: 1000, 2: 4000, 3: 9000, 4: 16000, 5: 25000, 6: 36000, 7: 49000, 8: 64000, 9: 81000, 10: 100000 }
  };
  console.log("test",plusValueTables[itemType]?.[totalPlus])

  const additionalValue = plusValueTables[itemType]?.[totalPlus] || 0;
  console.log("add val:",additionalValue);
  console.log("modval3:",modifiedValue + additionalValue);
  return modifiedValue + additionalValue;

};

module.exports = { calculateFinalValue };
