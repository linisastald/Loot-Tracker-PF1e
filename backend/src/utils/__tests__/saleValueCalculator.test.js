/**
 * Unit tests for backend sale value calculator utility
 */

const { calculateItemSaleValue, calculateTotalSaleValue } = require('../saleValueCalculator');

// Mock logger to avoid test output clutter
jest.mock('../logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}));

describe('Sale Value Calculator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateItemSaleValue', () => {
    it('should return 0 for null item', () => {
      const result = calculateItemSaleValue(null);
      expect(result).toBe(0);
    });

    it('should return 0 for undefined item', () => {
      const result = calculateItemSaleValue(undefined);
      expect(result).toBe(0);
    });

    it('should return 0 for item with null value', () => {
      const item = { name: 'Test Item', type: 'weapon', value: null };
      const result = calculateItemSaleValue(item);
      expect(result).toBe(0);
    });

    it('should return 0 for item with undefined value', () => {
      const item = { name: 'Test Item', type: 'weapon', value: undefined };
      const result = calculateItemSaleValue(item);
      expect(result).toBe(0);
    });

    it('should return 0 for item with invalid string value', () => {
      const item = { name: 'Test Item', type: 'weapon', value: 'invalid' };
      const result = calculateItemSaleValue(item);
      expect(result).toBe(0);
    });

    it('should calculate half value for regular items', () => {
      const item = { name: 'Long Sword', type: 'weapon', value: 100 };
      const result = calculateItemSaleValue(item);
      expect(result).toBe(50);
    });

    it('should calculate full value for trade goods', () => {
      const item = { name: 'Silk', type: 'trade good', value: 100 };
      const result = calculateItemSaleValue(item);
      expect(result).toBe(100);
    });

    it('should handle string value inputs', () => {
      const item = { name: 'Magic Ring', type: 'ring', value: '250' };
      const result = calculateItemSaleValue(item);
      expect(result).toBe(125);
    });

    it('should handle decimal values', () => {
      const item = { name: 'Potion', type: 'potion', value: 25.5 };
      const result = calculateItemSaleValue(item);
      expect(result).toBe(12.75);
    });

    it('should handle zero value items', () => {
      const item = { name: 'Worthless Item', type: 'misc', value: 0 };
      const result = calculateItemSaleValue(item);
      expect(result).toBe(0);
    });

    it('should handle negative values (edge case)', () => {
      const item = { name: 'Cursed Item', type: 'weapon', value: -100 };
      const result = calculateItemSaleValue(item);
      expect(result).toBe(-50);
    });

    it('should handle items without type', () => {
      const item = { name: 'Unknown Item', value: 100 };
      const result = calculateItemSaleValue(item);
      expect(result).toBe(50); // Should default to half value
    });

    it('should handle floating point precision', () => {
      const item = { name: 'Precise Item', type: 'weapon', value: 33.33 };
      const result = calculateItemSaleValue(item);
      expect(result).toBeCloseTo(16.665);
    });
  });

  describe('calculateTotalSaleValue', () => {
    it('should return 0 for null items array', () => {
      const result = calculateTotalSaleValue(null);
      expect(result).toBe(0);
    });

    it('should return 0 for undefined items array', () => {
      const result = calculateTotalSaleValue(undefined);
      expect(result).toBe(0);
    });

    it('should return 0 for non-array input', () => {
      const result = calculateTotalSaleValue('not an array');
      expect(result).toBe(0);
    });

    it('should return 0 for empty array', () => {
      const result = calculateTotalSaleValue([]);
      expect(result).toBe(0);
    });

    it('should calculate total for single item', () => {
      const items = [
        { name: 'Sword', type: 'weapon', value: 100, quantity: 1 }
      ];
      const result = calculateTotalSaleValue(items);
      expect(result).toBe(50); // 100 * 0.5 * 1
    });

    it('should calculate total for multiple items', () => {
      const items = [
        { name: 'Sword', type: 'weapon', value: 100, quantity: 1 },
        { name: 'Shield', type: 'armor', value: 50, quantity: 2 },
        { name: 'Gold', type: 'trade good', value: 25, quantity: 4 }
      ];
      const result = calculateTotalSaleValue(items);
      expect(result).toBe(200); // (100*0.5*1) + (50*0.5*2) + (25*1*4)
    });

    it('should handle items with missing quantity (default to 1)', () => {
      const items = [
        { name: 'Sword', type: 'weapon', value: 100 },
        { name: 'Ring', type: 'ring', value: 200, quantity: null }
      ];
      const result = calculateTotalSaleValue(items);
      expect(result).toBe(150); // (100*0.5*1) + (200*0.5*1)
    });

    it('should handle items with string quantity', () => {
      const items = [
        { name: 'Potions', type: 'potion', value: 50, quantity: '3' }
      ];
      const result = calculateTotalSaleValue(items);
      expect(result).toBe(75); // 50 * 0.5 * 3
    });

    it('should handle items with invalid quantity', () => {
      const items = [
        { name: 'Sword', type: 'weapon', value: 100, quantity: 'invalid' }
      ];
      const result = calculateTotalSaleValue(items);
      expect(result).toBe(50); // Should default to quantity 1
    });

    it('should handle mixed trade goods and regular items', () => {
      const items = [
        { name: 'Silk', type: 'trade good', value: 100, quantity: 2 },
        { name: 'Armor', type: 'armor', value: 200, quantity: 1 },
        { name: 'Gems', type: 'trade good', value: 50, quantity: 5 }
      ];
      const result = calculateTotalSaleValue(items);
      expect(result).toBe(550); // (100*1*2) + (200*0.5*1) + (50*1*5)
    });

    it('should handle items with zero values', () => {
      const items = [
        { name: 'Worthless Item', type: 'misc', value: 0, quantity: 10 },
        { name: 'Valuable Item', type: 'weapon', value: 100, quantity: 1 }
      ];
      const result = calculateTotalSaleValue(items);
      expect(result).toBe(50); // (0*0.5*10) + (100*0.5*1)
    });

    it('should handle large quantities', () => {
      const items = [
        { name: 'Arrows', type: 'weapon', value: 1, quantity: 1000 }
      ];
      const result = calculateTotalSaleValue(items);
      expect(result).toBe(500); // 1 * 0.5 * 1000
    });

    it('should handle decimal values and quantities', () => {
      const items = [
        { name: 'Partial Item', type: 'misc', value: 33.33, quantity: 1.5 }
      ];
      const result = calculateTotalSaleValue(items);
      expect(result).toBeCloseTo(16.665, 3); // 33.33 * 0.5 * parseInt(1.5) = 33.33 * 0.5 * 1 = 16.665
    });

    it('should handle items with negative values (edge case)', () => {
      const items = [
        { name: 'Cursed Item', type: 'weapon', value: -100, quantity: 1 },
        { name: 'Good Item', type: 'weapon', value: 200, quantity: 1 }
      ];
      const result = calculateTotalSaleValue(items);
      expect(result).toBe(50); // (-100*0.5*1) + (200*0.5*1)
    });

    it('should handle complex mixed scenario', () => {
      const items = [
        { name: 'Masterwork Sword', type: 'weapon', value: 315, quantity: 1 },
        { name: 'Healing Potions', type: 'potion', value: 50, quantity: 5 },
        { name: 'Silk Rope', type: 'trade good', value: 10, quantity: 3 },
        { name: 'Silver Pieces', type: 'trade good', value: 0.1, quantity: 100 },
        { name: 'Broken Shield', type: 'armor', value: 0, quantity: 1 }
      ];
      const result = calculateTotalSaleValue(items);
      // (315*0.5*1) + (50*0.5*5) + (10*1*3) + (0.1*1*100) + (0*0.5*1)
      // = 157.5 + 125 + 30 + 10 + 0 = 322.5
      expect(result).toBe(322.5);
    });
  });

  describe('Error handling', () => {
    it('should handle exceptions in calculateItemSaleValue gracefully', () => {
      // Create an object that throws when accessing properties
      const problematicItem = new Proxy({}, {
        get() {
          throw new Error('Property access error');
        }
      });

      const result = calculateItemSaleValue(problematicItem);
      expect(result).toBe(0);
    });

    it('should handle exceptions in calculateTotalSaleValue gracefully', () => {
      // Array with an object that throws when accessed
      const problematicItems = [
        new Proxy({}, {
          get() {
            throw new Error('Property access error');
          }
        })
      ];

      const result = calculateTotalSaleValue(problematicItems);
      expect(result).toBe(0);
    });
  });
});