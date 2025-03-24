/**
 * Utility functions for calculating sale values of items.
 *
 * IMPORTANT: This is the backend version of this utility.
 * A duplicate implementation exists in frontend/src/utils/saleValueCalculator.js.
 * If you update this file, also update the frontend version to keep them in sync.
 */

/**
 * Calculate the sale value of an item based on its type and value.
 * Trade goods sell for full value, all other items sell for half value.
 *
 * @param {Object} item - The item object
 * @param {string} item.type - The type of the item
 * @param {number} item.value - The base value of the item
 * @returns {number} - The calculated sale value
 */
const calculateItemSaleValue = (item) => {
  if (!item || item.value === null || item.value === undefined) return 0;

  // Trade goods sell for full value, other items for half value
  return item.type === 'trade good' ? item.value : item.value / 2;
};

/**
 * Calculate the total sale value for a collection of items.
 *
 * @param {Array<Object>} items - Array of item objects
 * @returns {number} - The total sale value
 */
const calculateTotalSaleValue = (items) => {
  if (!items || !Array.isArray(items)) return 0;

  return items.reduce((sum, item) => sum + calculateItemSaleValue(item), 0);
};

module.exports = {
  calculateItemSaleValue,
  calculateTotalSaleValue
};