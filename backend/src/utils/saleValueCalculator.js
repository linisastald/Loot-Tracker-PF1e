/**
 * Utility functions for calculating sale values of items.
 *
 * IMPORTANT: This is the backend version of this utility.
 * A duplicate implementation exists in frontend/src/utils/saleValueCalculator.js.
 * If you update this file, also update the frontend version to keep them in sync.
 */
const logger = require('./logger');

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
  try {
    if (!item || item.value === null || item.value === undefined) {
      logger.debug('Item has no value, returning 0');
      return 0;
    }

    // Ensure value is treated as a number
    const numericValue = parseFloat(item.value);

    // If conversion failed, return 0
    if (isNaN(numericValue)) {
      logger.debug(`Item value "${item.value}" is not a valid number, returning 0`);
      return 0;
    }

    // Trade goods sell for full value, other items for half value
    const multiplier = item.type === 'trade good' ? 1 : 0.5;
    const saleValue = numericValue * multiplier;

    logger.debug(`Calculated sale value for ${item.name || 'item'} (${item.type}): ${numericValue} × ${multiplier} = ${saleValue}`);
    return saleValue;
  } catch (error) {
    logger.error(`Error calculating item sale value: ${error.message}`);
    return 0;
  }
};

/**
 * Calculate the total sale value for a collection of items.
 *
 * @param {Array<Object>} items - Array of item objects
 * @returns {number} - The total sale value
 */
const calculateTotalSaleValue = (items) => {
  try {
    if (!items || !Array.isArray(items)) {
      logger.debug('No items to calculate total for, returning 0');
      return 0;
    }

    const totalValue = items.reduce((sum, item) => sum + calculateItemSaleValue(item), 0);
    logger.debug(`Calculated total sale value for ${items.length} items: ${totalValue}`);

    return totalValue;
  } catch (error) {
    logger.error(`Error calculating total sale value: ${error.message}`);
    return 0;
  }
};

module.exports = {
  calculateItemSaleValue,
  calculateTotalSaleValue
};