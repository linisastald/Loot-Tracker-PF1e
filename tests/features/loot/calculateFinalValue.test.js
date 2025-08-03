/**
 * Tests for calculateFinalValue Service
 * Tests item value calculation with complex Pathfinder 1e rules
 */

const { calculateFinalValue } = require('../../../backend/src/services/calculateFinalValue');

// Mock logger to avoid noise in tests
jest.mock('../../../backend/src/utils/logger', () => ({
  debug: jest.fn(),
  error: jest.fn()
}));

describe('calculateFinalValue Service', () => {
  describe('Basic Value Calculations', () => {
    it('should return base item value with no modifications', () => {
      const result = calculateFinalValue(100, 'misc', 'general', [], false, 'Test Item', 0, 'Medium', 1);
      
      expect(result).toBe(100);
    });

    it('should handle string values by converting to numbers', () => {
      const result = calculateFinalValue('150', 'misc', 'general', [], false, 'Test Item', 0, 'Medium', 1);
      
      expect(result).toBe(150);
    });

    it('should handle null itemValue', () => {
      const result = calculateFinalValue(null, 'misc', 'general', [], false, 'Test Item', 0, 'Medium', 1);
      
      expect(result).toBe(0);
    });

    it('should handle undefined itemValue', () => {
      const result = calculateFinalValue(undefined, 'misc', 'general', [], false, 'Test Item', 0, 'Medium', 1);
      
      expect(result).toBe(0);
    });

    it('should handle decimal values', () => {
      const result = calculateFinalValue(99.95, 'misc', 'general', [], false, 'Test Item', 0, 'Medium', 1);
      
      expect(result).toBe(99.95);
    });
  });

  describe('Size Multipliers', () => {
    describe('Value Size Multipliers for Weapons', () => {
      it('should apply size multipliers for weapons correctly', () => {
        const baseValue = 100;
        
        expect(calculateFinalValue(baseValue, 'weapon', 'melee', [], false, 'Sword', 0, 'Fine', 1)).toBe(50);
        expect(calculateFinalValue(baseValue, 'weapon', 'melee', [], false, 'Sword', 0, 'Small', 1)).toBe(100);
        expect(calculateFinalValue(baseValue, 'weapon', 'melee', [], false, 'Sword', 0, 'Medium', 1)).toBe(100);
        expect(calculateFinalValue(baseValue, 'weapon', 'melee', [], false, 'Sword', 0, 'Large', 1)).toBe(200);
        expect(calculateFinalValue(baseValue, 'weapon', 'melee', [], false, 'Sword', 0, 'Huge', 1)).toBe(400);
        expect(calculateFinalValue(baseValue, 'weapon', 'melee', [], false, 'Sword', 0, 'Gargantuan', 1)).toBe(800);
        expect(calculateFinalValue(baseValue, 'weapon', 'melee', [], false, 'Sword', 0, 'Colossal', 1)).toBe(1600);
      });

      it('should apply size multipliers for armor correctly', () => {
        const baseValue = 200;
        
        expect(calculateFinalValue(baseValue, 'armor', 'light', [], false, 'Leather Armor', 0, 'Fine', 1)).toBe(100);
        expect(calculateFinalValue(baseValue, 'armor', 'light', [], false, 'Leather Armor', 0, 'Small', 1)).toBe(200);
        expect(calculateFinalValue(baseValue, 'armor', 'light', [], false, 'Leather Armor', 0, 'Large', 1)).toBe(400);
        expect(calculateFinalValue(baseValue, 'armor', 'light', [], false, 'Leather Armor', 0, 'Huge', 1)).toBe(800);
      });

      it('should not apply size multipliers for non-weapon/armor items', () => {
        const baseValue = 100;
        
        expect(calculateFinalValue(baseValue, 'misc', 'general', [], false, 'Ring', 0, 'Large', 1)).toBe(100);
        expect(calculateFinalValue(baseValue, 'consumable', 'potion', [], false, 'Potion', 0, 'Huge', 1)).toBe(100);
      });

      it('should default to Medium size when size is null', () => {
        const result = calculateFinalValue(100, 'weapon', 'melee', [], false, 'Sword', 0, null, 1);
        
        expect(result).toBe(100); // Medium size multiplier is 1
      });
    });

    describe('Weight Size Multipliers', () => {
      it('should apply weight multipliers correctly with mods using item.wgt', () => {
        const mods = [{
          name: 'Silver',
          valuecalc: '+item.wgt*5',
          plus: 0
        }];
        
        // Weight starts at 2, Small size makes it 1, silver adds 1*5 = 5
        const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Small', 2);
        
        expect(result).toBe(105); // 100 + (1 * 5)
      });

      it('should handle null item weight with default of 1', () => {
        const mods = [{
          name: 'Silver',
          valuecalc: '+item.wgt*10',
          plus: 0
        }];
        
        // Null weight defaults to 1, Medium size keeps it 1, silver adds 1*10 = 10
        const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', null);
        
        expect(result).toBe(110); // 100 + (1 * 10)
      });
    });
  });

  describe('Wand Charge Calculations', () => {
    it('should multiply value by charges for wands', () => {
      const result = calculateFinalValue(100, 'misc', 'wand', [], false, 'Wand of Magic Missile', 30, 'Medium', 1);
      
      expect(result).toBe(3000); // 100 * 30 charges
    });

    it('should handle wands with different charge counts', () => {
      expect(calculateFinalValue(50, 'misc', 'wand', [], false, 'Wand of Cure Light Wounds', 25, 'Medium', 1)).toBe(1250);
      expect(calculateFinalValue(75, 'misc', 'wand', [], false, 'Wand of Fireball', 50, 'Medium', 1)).toBe(3750);
    });

    it('should not apply charge multiplier for non-wand items', () => {
      const result = calculateFinalValue(100, 'misc', 'general', [], false, 'Magic Ring', 30, 'Medium', 1);
      
      expect(result).toBe(100); // Charges should not affect non-wands
    });

    it('should handle wand names with different cases', () => {
      expect(calculateFinalValue(100, 'misc', 'wand', [], false, 'WAND OF LIGHTNING BOLT', 20, 'Medium', 1)).toBe(2000);
      expect(calculateFinalValue(100, 'misc', 'wand', [], false, 'wand of healing', 15, 'Medium', 1)).toBe(1500);
    });

    it('should handle zero charges gracefully', () => {
      const result = calculateFinalValue(100, 'misc', 'wand', [], false, 'Wand of Magic Missile', 0, 'Medium', 1);
      
      expect(result).toBe(0); // 100 * 0 charges
    });
  });

  describe('Mod Value Calculations', () => {
    it('should apply mod valuecalc correctly', () => {
      const mods = [{
        name: 'Adamantine',
        valuecalc: '+3000',
        plus: 0
      }];
      
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
      
      expect(result).toBe(3100); // 100 + 3000
    });

    it('should handle multiple mods with valuecalc', () => {
      const mods = [
        {
          name: 'Masterwork',
          valuecalc: '+300',
          plus: 0
        },
        {
          name: 'Silver',
          valuecalc: '+item.wgt*2',
          plus: 0
        }
      ];
      
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 3);
      
      expect(result).toBe(406); // 100 + 300 + (3 * 2)
    });

    it('should handle mods with multiplication operations', () => {
      const mods = [{
        name: 'Doubling',
        valuecalc: '*2',
        plus: 0
      }];
      
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
      
      expect(result).toBe(200); // 100 * 2
    });

    it('should handle mods with complex calculations', () => {
      const mods = [{
        name: 'Complex',
        valuecalc: '*1.5+500',
        plus: 0
      }];
      
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
      
      expect(result).toBe(650); // 100 * 1.5 + 500
    });

    it('should handle invalid valuecalc gracefully', () => {
      const mods = [{
        name: 'Invalid',
        valuecalc: '+invalid_expression',
        plus: 0
      }];
      
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
      
      // Should return original value when calculation fails
      expect(result).toBe(100);
    });

    it('should handle empty mods array', () => {
      const result = calculateFinalValue(100, 'weapon', 'melee', [], false, 'Sword', 0, 'Medium', 1);
      
      expect(result).toBe(100);
    });

    it('should handle null mods', () => {
      const result = calculateFinalValue(100, 'weapon', 'melee', null, false, 'Sword', 0, 'Medium', 1);
      
      expect(result).toBe(100);
    });

    it('should handle mods without valuecalc or plus', () => {
      const mods = [{
        name: 'Cosmetic',
        description: 'Just looks cool'
      }];
      
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
      
      expect(result).toBe(100);
    });
  });

  describe('Plus Value Calculations', () => {
    describe('Weapon Plus Values', () => {
      it('should add correct plus values for weapons', () => {
        const mods = [{ plus: 1 }];
        
        const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
        
        expect(result).toBe(2400); // 100 + 300 (masterwork) + 2000 (+1 weapon)
      });

      it('should handle multiple plus mods for weapons', () => {
        const mods = [
          { plus: 2 },
          { plus: 1 }
        ];
        
        const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
        
        expect(result).toBe(8400); // 100 + 300 (masterwork) + 8000 (+3 weapon total)
      });

      it('should cap plus values at 10 for weapons', () => {
        const mods = [{ plus: 15 }]; // Exceeds maximum
        
        const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
        
        expect(result).toBe(400); // 100 + 300 (masterwork), no plus value added for >10
      });
    });

    describe('Armor Plus Values', () => {
      it('should add correct plus values for armor', () => {
        const mods = [{ plus: 1 }];
        
        const result = calculateFinalValue(100, 'armor', 'light', mods, false, 'Leather Armor', 0, 'Medium', 1);
        
        expect(result).toBe(1250); // 100 + 150 (masterwork) + 1000 (+1 armor)
      });

      it('should handle high plus armor correctly', () => {
        const mods = [{ plus: 5 }];
        
        const result = calculateFinalValue(100, 'armor', 'heavy', mods, false, 'Plate Mail', 0, 'Medium', 1);
        
        expect(result).toBe(25250); // 100 + 150 (masterwork) + 25000 (+5 armor)
      });
    });

    describe('Ammunition Plus Values', () => {
      it('should apply ammunition adjustment to plus values', () => {
        const mods = [{ plus: 1 }];
        
        const result = calculateFinalValue(100, 'weapon', 'ammunition', mods, false, 'Arrows', 0, 'Medium', 1);
        
        expect(result).toBe(440); // 100 + 300 (masterwork) + (2000/50) (ammo adjustment)
      });

      it('should handle high plus ammunition', () => {
        const mods = [{ plus: 3 }];
        
        const result = calculateFinalValue(50, 'weapon', 'ammunition', mods, false, 'Bolts', 0, 'Medium', 1);
        
        expect(result).toBe(710); // 50 + 300 (masterwork) + (18000/50) (ammo adjustment)
      });
    });

    it('should not add plus values for non-weapon/armor items', () => {
      const mods = [{ plus: 1 }];
      
      const result = calculateFinalValue(100, 'misc', 'general', mods, false, 'Ring', 0, 'Medium', 1);
      
      expect(result).toBe(100); // No plus value for misc items
    });
  });

  describe('Masterwork Calculations', () => {
    it('should add masterwork value for weapons when isMasterwork is true', () => {
      const result = calculateFinalValue(100, 'weapon', 'melee', [], true, 'Sword', 0, 'Medium', 1);
      
      expect(result).toBe(400); // 100 + 300 (masterwork weapon)
    });

    it('should add masterwork value for armor when isMasterwork is true', () => {
      const result = calculateFinalValue(100, 'armor', 'light', [], true, 'Leather Armor', 0, 'Medium', 1);
      
      expect(result).toBe(250); // 100 + 150 (masterwork armor)
    });

    it('should add masterwork value when totalPlus >= 1', () => {
      const mods = [{ plus: 1 }];
      
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
      
      expect(result).toBe(2400); // 100 + 300 (auto masterwork) + 2000 (+1 weapon)
    });

    it('should not add masterwork value for non-weapon/armor items', () => {
      const result = calculateFinalValue(100, 'misc', 'general', [], true, 'Ring', 0, 'Medium', 1);
      
      expect(result).toBe(100); // No masterwork bonus for misc items
    });

    it('should not double-add masterwork value when both isMasterwork and plus exist', () => {
      const mods = [{ plus: 1 }];
      
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, true, 'Sword', 0, 'Medium', 1);
      
      expect(result).toBe(2400); // 100 + 300 (masterwork once) + 2000 (+1 weapon)
    });
  });

  describe('Complex Integration Scenarios', () => {
    it('should handle weapon with size, plus, and mods', () => {
      const mods = [
        { plus: 2 },
        { name: 'Adamantine', valuecalc: '+3000', plus: 0 },
        { name: 'Silver', valuecalc: '+item.wgt*2', plus: 0 }
      ];
      
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Large', 5);
      
      // Base: 100, Size: *2 = 200, Adamantine: +3000, Silver: +(5*2) = +10, Masterwork: +300, Plus: +8000
      expect(result).toBe(11510);
    });

    it('should handle wand with charges and mods', () => {
      const mods = [{
        name: 'Enhancement',
        valuecalc: '+500',
        plus: 0
      }];
      
      const result = calculateFinalValue(100, 'misc', 'wand', mods, false, 'Wand of Magic Missile', 30, 'Medium', 1);
      
      // Base: 100, Charges: *30 = 3000, Enhancement: +500
      expect(result).toBe(3500);
    });

    it('should handle armor with all modifiers', () => {
      const mods = [
        { plus: 3 },
        { name: 'Mithril', valuecalc: '*1.5', plus: 0 },
        { name: 'Spikes', valuecalc: '+50', plus: 0 }
      ];
      
      const result = calculateFinalValue(200, 'armor', 'heavy', mods, false, 'Full Plate', 0, 'Large', 10);
      
      // Base: 200, Size: *2 = 400, Mithril: *1.5 = 600, Spikes: +50 = 650, Masterwork: +150, Plus: +9000
      expect(result).toBe(9800);
    });

    it('should handle ammunition with multiple plus mods', () => {
      const mods = [
        { plus: 1 },
        { plus: 1 },
        { name: 'Silver', valuecalc: '+item.wgt*1', plus: 0 }
      ];
      
      const result = calculateFinalValue(5, 'weapon', 'ammunition', mods, false, 'Arrows', 0, 'Medium', 0.1);
      
      // Base: 5, Silver: +(0.1*1) = 5.1, Masterwork: +300, Plus: +8000/50 = +160
      expect(result).toBe(465.1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle calculation errors gracefully', () => {
      const mods = [{
        name: 'Broken',
        valuecalc: '+undefined_variable',
        plus: 0
      }];
      
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
      
      // Should return original item value when calculation fails
      expect(result).toBe(100);
    });

    it('should handle zero base value', () => {
      const mods = [{ plus: 1 }];
      
      const result = calculateFinalValue(0, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
      
      expect(result).toBe(2300); // 0 + 300 (masterwork) + 2000 (+1 weapon)
    });

    it('should handle negative base value', () => {
      const result = calculateFinalValue(-100, 'misc', 'general', [], false, 'Cursed Item', 0, 'Medium', 1);
      
      expect(result).toBe(-100);
    });

    it('should handle very large values without overflow', () => {
      const result = calculateFinalValue(999999, 'misc', 'general', [], false, 'Artifact', 0, 'Medium', 1);
      
      expect(result).toBe(999999);
    });

    it('should handle decimal plus values', () => {
      const mods = [{ plus: 1.5 }]; // Non-integer plus
      
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
      
      expect(result).toBe(400); // Should not add plus value for non-integer plus
    });

    it('should handle string plus values', () => {
      const mods = [{ plus: '2' }]; // String plus value
      
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
      
      expect(result).toBe(8400); // Should convert string to number
    });

    it('should handle invalid plus values', () => {
      const mods = [{ plus: 'invalid' }];
      
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
      
      expect(result).toBe(100); // Should not add plus value for invalid plus
    });

    it('should handle null size gracefully', () => {
      const result = calculateFinalValue(100, 'weapon', 'melee', [], false, 'Sword', 0, null, 1);
      
      expect(result).toBe(100); // Should default to Medium size
    });

    it('should handle unknown size gracefully', () => {
      const result = calculateFinalValue(100, 'weapon', 'melee', [], false, 'Sword', 0, 'Unknown', 1);
      
      expect(result).toBe(100); // Should not apply unknown size multiplier
    });

    it('should handle circular calculations safely', () => {
      const mods = [{
        name: 'Circular',
        valuecalc: '+eval("1+1")', // Potential security issue
        plus: 0
      }];
      
      // Should not crash, may return original value or handle the calculation
      const result = calculateFinalValue(100, 'weapon', 'melee', mods, false, 'Sword', 0, 'Medium', 1);
      
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(100);
    });
  });
});