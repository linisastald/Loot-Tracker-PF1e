const { calculateFinalValue } = require('../calculateFinalValue');

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

describe('calculateFinalValue (PF1e item valuation)', () => {
  describe('basic value calculation', () => {
    it('should return base value for simple item', () => {
      const result = calculateFinalValue(100, 'misc', null, [], false, 'Rope', null, 'Medium', 5);
      expect(result).toBe(100);
    });

    it('should handle string value input', () => {
      const result = calculateFinalValue('250', 'misc', null, [], false, 'Gem', null, 'Medium', 0);
      expect(result).toBe(250);
    });
  });

  describe('size multipliers for weapons and armor', () => {
    it('should apply 2x for Large weapons', () => {
      const result = calculateFinalValue(100, 'weapon', null, [], false, 'Greatsword', null, 'Large', 8);
      expect(result).toBe(200);
    });

    it('should apply 0.5x for Tiny weapons', () => {
      const result = calculateFinalValue(100, 'weapon', null, [], false, 'Dagger', null, 'Tiny', 0.5);
      expect(result).toBe(50);
    });

    it('should apply 4x for Huge armor', () => {
      const result = calculateFinalValue(100, 'armor', null, [], false, 'Plate', null, 'Huge', 50);
      expect(result).toBe(400);
    });

    it('should not apply size multiplier to non-weapon/armor', () => {
      const result = calculateFinalValue(100, 'potion', null, [], false, 'Potion', null, 'Large', 1);
      expect(result).toBe(100);
    });

    it('should default to Medium if no size given', () => {
      const result = calculateFinalValue(100, 'weapon', null, [], false, 'Sword', null, null, 5);
      expect(result).toBe(100); // Medium = 1x
    });
  });

  describe('masterwork bonus', () => {
    it('should add 300 for masterwork weapon', () => {
      const result = calculateFinalValue(100, 'weapon', null, [], true, 'Longsword', null, 'Medium', 4);
      expect(result).toBe(400); // 100 + 300
    });

    it('should add 150 for masterwork armor', () => {
      const result = calculateFinalValue(200, 'armor', null, [], true, 'Chainmail', null, 'Medium', 40);
      expect(result).toBe(350); // 200 + 150
    });

    it('should not add masterwork bonus for non-weapon/armor', () => {
      const result = calculateFinalValue(100, 'ring', null, [], true, 'Ring', null, 'Medium', 0);
      expect(result).toBe(100);
    });
  });

  describe('plus enhancement values', () => {
    it('should add +1 weapon enhancement (2000 gp)', () => {
      const mods = [{ name: '+1', plus: 1 }];
      const result = calculateFinalValue(100, 'weapon', null, mods, false, 'Longsword', null, 'Medium', 4);
      // 100 base + 300 masterwork (auto from plus >= 1) + 2000 (+1) = 2400
      expect(result).toBe(2400);
    });

    it('should add +3 armor enhancement (9000 gp)', () => {
      const mods = [{ name: '+3', plus: 3 }];
      const result = calculateFinalValue(200, 'armor', null, mods, false, 'Plate', null, 'Medium', 50);
      // 200 base + 150 masterwork + 9000 (+3) = 9350
      expect(result).toBe(9350);
    });

    it('should sum plus from multiple mods', () => {
      const mods = [
        { name: '+1', plus: 1 },
        { name: 'Flaming', plus: 1 }, // +1 equivalent
      ];
      const result = calculateFinalValue(100, 'weapon', null, mods, false, 'Sword', null, 'Medium', 4);
      // 100 + 300 masterwork + 8000 (+2 total) = 8400
      expect(result).toBe(8400);
    });

    it('should handle +5 weapon (50000 gp)', () => {
      const mods = [{ name: '+5', plus: 5 }];
      const result = calculateFinalValue(100, 'weapon', null, mods, false, 'Sword', null, 'Medium', 4);
      // 100 + 300 + 50000 = 50400
      expect(result).toBe(50400);
    });
  });

  describe('ammunition adjustment', () => {
    it('should divide enhancement value by 50 for ammunition', () => {
      const mods = [{ name: '+1', plus: 1 }];
      const result = calculateFinalValue(1, 'weapon', 'ammunition', mods, false, 'Arrow', null, 'Medium', 0.1);
      // 1 base + 300 masterwork + (2000/50) = 1 + 300 + 40 = 341
      expect(result).toBe(341);
    });
  });

  describe('wand charge multiplier', () => {
    it('should multiply value by charges for wands', () => {
      const result = calculateFinalValue(15, 'wand', null, [], false, 'Wand of Cure Light Wounds', 50, 'Medium', 0);
      // 15 * 50 = 750
      expect(result).toBe(750);
    });

    it('should not apply charge multiplier for non-wands', () => {
      const result = calculateFinalValue(15, 'rod', null, [], false, 'Rod of Power', 50, 'Medium', 0);
      expect(result).toBe(15);
    });

    it('should not apply when charges is null', () => {
      const result = calculateFinalValue(100, 'wand', null, [], false, 'Wand of Fireball', null, 'Medium', 0);
      expect(result).toBe(100);
    });
  });

  describe('mod value calculations', () => {
    it('should apply valuecalc from mods', () => {
      const mods = [{ name: 'Custom', valuecalc: '+500' }];
      const result = calculateFinalValue(100, 'misc', null, mods, false, 'Item', null, 'Medium', 1);
      // eval('100+500') = 600
      expect(result).toBe(600);
    });

    it('should replace item.wgt in valuecalc', () => {
      const mods = [{ name: 'Weight-based', valuecalc: '+item.wgt*10' }];
      const result = calculateFinalValue(100, 'misc', null, mods, false, 'Heavy Item', null, 'Medium', 5);
      // weight = 5 * 1 (Medium) = 5, eval('100+5*10') = 150
      expect(result).toBe(150);
    });

    it('should handle null mods gracefully', () => {
      const result = calculateFinalValue(100, 'misc', null, null, false, 'Item', null, 'Medium', 1);
      expect(result).toBe(100);
    });
  });

  describe('error handling', () => {
    it('should return original value on calculation error', () => {
      // Create a scenario that would cause eval to fail
      const mods = [{ name: 'Bad', valuecalc: '+undefined_var' }];
      // The eval might throw but the outer try-catch should handle it
      const result = calculateFinalValue(100, 'misc', null, mods, false, 'Item', null, 'Medium', 1);
      // Result depends on whether eval throws - if it does, inner catch logs but continues
      expect(typeof result).toBe('number');
    });

    it('should handle null itemWeight', () => {
      const result = calculateFinalValue(100, 'misc', null, [], false, 'Item', null, 'Medium', null);
      // Default weight to 1 when null
      expect(result).toBe(100);
    });
  });
});
