/**
 * Utility functions for calculating sale values of items.
 *
 * Rule: Pathfinder 1e Core Rulebook, "Selling Treasure" (Equipment chapter): most
 * things sell for half their listed price, trade goods for full price.
 * (PRD copy: coreRulebook/equipment.html, "Selling Treasure".)
 */

/**
 * Calculate the sale value of ONE unit of an item based on its type and value.
 * Trade goods sell for full value, all other items sell for half value.
 *
 * @param {Object} item - The item object
 * @param {string} item.type - The type of the item
 * @param {number} item.value - The base value of the item
 * @returns {number} - The calculated sale value (0 when the value is missing or not a number)
 */
const calculateItemSaleValue = (item) => {
  if (!item || item.value === null || item.value === undefined) {
    return 0;
  }

  const numericValue = parseFloat(item.value);
  if (isNaN(numericValue)) {
    return 0;
  }

  return numericValue * (item.type === 'trade good' ? 1 : 0.5);
};

/**
 * Calculate the total sale value for a collection of items (unit value x quantity).
 *
 * @param {Array<Object>} items - Array of item objects
 * @returns {number} - The total sale value
 */
const calculateTotalSaleValue = (items) => {
  if (!items || !Array.isArray(items)) {
    return 0;
  }

  return items.reduce(
    (sum, item) => sum + calculateItemSaleValue(item) * (parseInt(item?.quantity) || 1),
    0
  );
};

module.exports = {
  calculateItemSaleValue,
  calculateTotalSaleValue
};
