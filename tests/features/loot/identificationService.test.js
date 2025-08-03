/**
 * Tests for identificationService
 * Tests the complex Pathfinder identification mechanics including DC calculations,
 * daily attempt restrictions, and caster level calculations
 */

const IdentificationService = require('../../../backend/src/services/identificationService');
const dbUtils = require('../../../backend/src/utils/dbUtils');
const ValidationService = require('../../../backend/src/services/validationService');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/services/validationService');
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

describe('IdentificationService', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      query: jest.fn()
    };
  });

  describe('getCurrentGolarionDate', () => {
    it('should return current Golarion date as formatted string', async () => {
      const mockDateResult = {
        rows: [{
          year: 4715,
          month: 3,
          day: 15
        }]
      };
      
      mockClient.query.mockResolvedValue(mockDateResult);

      const result = await IdentificationService.getCurrentGolarionDate(mockClient);

      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM golarion_current_date LIMIT 1');
      expect(result).toBe('4715-3-15');
    });

    it('should throw error when no Golarion date found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await expect(IdentificationService.getCurrentGolarionDate(mockClient))
        .rejects.toThrow('Golarion date not found');
    });

    it('should handle database errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Database error'));

      await expect(IdentificationService.getCurrentGolarionDate(mockClient))
        .rejects.toThrow('Database error');
    });
  });

  describe('hasAlreadyAttemptedToday', () => {
    it('should return true if character has already attempted today', async () => {
      const mockAttemptResult = {
        rows: [{
          lootid: 1,
          characterid: 1,
          golarion_date: '4715-3-15'
        }]
      };
      
      mockClient.query.mockResolvedValue(mockAttemptResult);

      const result = await IdentificationService.hasAlreadyAttemptedToday(
        mockClient, 1, 1, '4715-3-15'
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM identify'),
        [1, 1, '4715-3-15']
      );
      expect(result).toBe(true);
    });

    it('should return false if character has not attempted today', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await IdentificationService.hasAlreadyAttemptedToday(
        mockClient, 1, 1, '4715-3-15'
      );

      expect(result).toBe(false);
    });

    it('should handle database errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Database error'));

      await expect(IdentificationService.hasAlreadyAttemptedToday(
        mockClient, 1, 1, '4715-3-15'
      )).rejects.toThrow('Database error');
    });
  });

  describe('calculateEffectiveCasterLevel', () => {
    const mockWeaponItem = {
      type: 'weapon',
      casterlevel: 5
    };

    const mockArmorItem = {
      type: 'armor',
      casterlevel: 3
    };

    const mockPotionItem = {
      type: 'potion',
      casterlevel: 1
    };

    it('should use highest mod caster level for weapons with mods', async () => {
      const lootItem = { modids: [1, 2] };
      const mockModsResult = {
        rows: [
          { casterlevel: 8 },
          { casterlevel: 12 }
        ]
      };
      
      mockClient.query.mockResolvedValue(mockModsResult);

      const result = await IdentificationService.calculateEffectiveCasterLevel(
        mockClient, mockWeaponItem, lootItem
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT casterlevel FROM mod WHERE id = ANY($1) AND casterlevel IS NOT NULL',
        [[1, 2]]
      );
      expect(result).toBe(12); // Highest mod caster level
    });

    it('should use highest mod caster level for armor with mods', async () => {
      const lootItem = { modids: [1, 2] };
      const mockModsResult = {
        rows: [
          { casterlevel: 6 },
          { casterlevel: 4 }
        ]
      };
      
      mockClient.query.mockResolvedValue(mockModsResult);

      const result = await IdentificationService.calculateEffectiveCasterLevel(
        mockClient, mockArmorItem, lootItem
      );

      expect(result).toBe(6); // Highest mod caster level
    });

    it('should fallback to base item caster level when mods have no caster level', async () => {
      const lootItem = { modids: [1, 2] };
      mockClient.query.mockResolvedValue({ rows: [] }); // No mods with caster levels

      const result = await IdentificationService.calculateEffectiveCasterLevel(
        mockClient, mockWeaponItem, lootItem
      );

      expect(result).toBe(5); // Base item caster level
    });

    it('should use base item caster level for non-weapon/armor items', async () => {
      const lootItem = { modids: [] };

      const result = await IdentificationService.calculateEffectiveCasterLevel(
        mockClient, mockPotionItem, lootItem
      );

      expect(result).toBe(1); // Base item caster level
      expect(mockClient.query).not.toHaveBeenCalled(); // No mod query for potions
    });

    it('should default to caster level 1 when item has no caster level', async () => {
      const itemWithoutCasterLevel = { type: 'misc' };
      const lootItem = { modids: [] };

      const result = await IdentificationService.calculateEffectiveCasterLevel(
        mockClient, itemWithoutCasterLevel, lootItem
      );

      expect(result).toBe(1); // Default fallback
    });

    it('should handle items with no modids array', async () => {
      const lootItem = {}; // No modids property

      const result = await IdentificationService.calculateEffectiveCasterLevel(
        mockClient, mockWeaponItem, lootItem
      );

      expect(result).toBe(5); // Base item caster level
    });
  });

  describe('calculateRequiredDC', () => {
    it('should calculate DC as 15 + caster level', () => {
      expect(IdentificationService.calculateRequiredDC(5)).toBe(20); // 15 + 5
      expect(IdentificationService.calculateRequiredDC(10)).toBe(25); // 15 + 10
      expect(IdentificationService.calculateRequiredDC(1)).toBe(16); // 15 + 1
    });

    it('should cap caster level at 20 for DC calculation', () => {
      expect(IdentificationService.calculateRequiredDC(25)).toBe(35); // 15 + 20 (capped)
      expect(IdentificationService.calculateRequiredDC(50)).toBe(35); // 15 + 20 (capped)
      expect(IdentificationService.calculateRequiredDC(20)).toBe(35); // 15 + 20
    });

    it('should handle zero and negative caster levels', () => {
      expect(IdentificationService.calculateRequiredDC(0)).toBe(15); // 15 + 0
      expect(IdentificationService.calculateRequiredDC(-5)).toBe(10); // 15 + (-5)
    });
  });

  describe('generateItemName', () => {
    const mockBaseItem = { name: 'Long Sword' };

    it('should generate name with mods in correct order', async () => {
      const modIds = [1, 2, 3];
      const mockModsResult = {
        rows: [
          { name: 'Flaming' },
          { name: '+2 Enhancement' },
          { name: 'Keen' }
        ]
      };
      
      mockClient.query.mockResolvedValue(mockModsResult);

      const result = await IdentificationService.generateItemName(
        mockClient, mockBaseItem, modIds, false, 25, 20
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT name FROM mod WHERE id = ANY($1)',
        [modIds]
      );
      expect(result).toBe('+2 Enhancement Flaming Keen Long Sword');
    });

    it('should add cursed indicator when roll exceeds DC by 10+', async () => {
      const modIds = [1];
      const mockModsResult = {
        rows: [{ name: '+1 Enhancement' }]
      };
      
      mockClient.query.mockResolvedValue(mockModsResult);

      const result = await IdentificationService.generateItemName(
        mockClient, mockBaseItem, modIds, true, 30, 20 // Roll 30, DC 20, cursed
      );

      expect(result).toBe('+1 Enhancement Long Sword - CURSED');
    });

    it('should not add cursed indicator when roll does not exceed DC by 10+', async () => {
      const modIds = [1];
      const mockModsResult = {
        rows: [{ name: '+1 Enhancement' }]
      };
      
      mockClient.query.mockResolvedValue(mockModsResult);

      const result = await IdentificationService.generateItemName(
        mockClient, mockBaseItem, modIds, true, 29, 20 // Roll 29, DC 20, cursed
      );

      expect(result).toBe('+1 Enhancement Long Sword'); // No cursed indicator
    });

    it('should handle items with no mods', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await IdentificationService.generateItemName(
        mockClient, mockBaseItem, [], false, 25, 20
      );

      expect(result).toBe('Long Sword');
    });

    it('should handle empty mod names gracefully', async () => {
      const modIds = [1, 2];
      const mockModsResult = {
        rows: [
          { name: '+1 Enhancement' },
          { name: '' }
        ]
      };
      
      mockClient.query.mockResolvedValue(mockModsResult);

      const result = await IdentificationService.generateItemName(
        mockClient, mockBaseItem, modIds, false, 25, 20
      );

      expect(result).toBe('+1 Enhancement  Long Sword'); // Extra space from empty mod
    });
  });

  describe('recordIdentificationAttempt', () => {
    it('should record identification attempt in database', async () => {
      const attemptData = {
        lootId: 1,
        characterId: 1,
        spellcraftRoll: 25,
        golarionDate: '4715-3-15',
        success: true
      };

      mockClient.query.mockResolvedValue({ rows: [] });

      await IdentificationService.recordIdentificationAttempt(mockClient, attemptData);

      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO identify (lootid, characterid, spellcraft_roll, golarion_date, success) VALUES ($1, $2, $3, $4, $5)',
        [1, 1, 25, '4715-3-15', true]
      );
    });

    it('should handle database insertion errors', async () => {
      const attemptData = {
        lootId: 1,
        characterId: 1,
        spellcraftRoll: 25,
        golarionDate: '4715-3-15',
        success: false
      };

      mockClient.query.mockRejectedValue(new Error('Constraint violation'));

      await expect(IdentificationService.recordIdentificationAttempt(mockClient, attemptData))
        .rejects.toThrow('Constraint violation');
    });
  });

  describe('updateIdentifiedItem', () => {
    it('should update loot item name and unidentified status', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await IdentificationService.updateIdentifiedItem(mockClient, 1, '+1 Magic Sword');

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE loot SET name = $1, unidentified = false WHERE id = $2',
        ['+1 Magic Sword', 1]
      );
    });

    it('should handle update errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Update failed'));

      await expect(IdentificationService.updateIdentifiedItem(mockClient, 1, 'New Name'))
        .rejects.toThrow('Update failed');
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete identification workflow', async () => {
      // Mock the sequence of operations for successful identification
      const mockDateResult = { rows: [{ year: 4715, month: 3, day: 15 }] };
      const mockAttemptResult = { rows: [] }; // No previous attempts
      const mockModsResult = { rows: [{ casterlevel: 8 }] };
      const mockModNamesResult = { rows: [{ name: '+1 Enhancement' }] };

      mockClient.query
        .mockResolvedValueOnce(mockDateResult) // Get Golarion date
        .mockResolvedValueOnce(mockAttemptResult) // Check previous attempts
        .mockResolvedValueOnce(mockModsResult) // Get mod caster levels
        .mockResolvedValueOnce(mockModNamesResult) // Get mod names
        .mockResolvedValueOnce({ rows: [] }) // Record attempt
        .mockResolvedValueOnce({ rows: [] }); // Update item

      const item = { type: 'weapon', name: 'Long Sword', casterlevel: 5 };
      const lootItem = { modids: [1] };

      // Step 1: Get Golarion date
      const golarionDate = await IdentificationService.getCurrentGolarionDate(mockClient);
      expect(golarionDate).toBe('4715-3-15');

      // Step 2: Check if already attempted
      const alreadyAttempted = await IdentificationService.hasAlreadyAttemptedToday(
        mockClient, 1, 1, golarionDate
      );
      expect(alreadyAttempted).toBe(false);

      // Step 3: Calculate effective caster level
      const effectiveCasterLevel = await IdentificationService.calculateEffectiveCasterLevel(
        mockClient, item, lootItem
      );
      expect(effectiveCasterLevel).toBe(8);

      // Step 4: Calculate required DC
      const requiredDC = IdentificationService.calculateRequiredDC(effectiveCasterLevel);
      expect(requiredDC).toBe(23); // 15 + 8

      // Step 5: Generate item name (assuming successful roll)
      const itemName = await IdentificationService.generateItemName(
        mockClient, item, [1], false, 25, requiredDC
      );
      expect(itemName).toBe('+1 Enhancement Long Sword');

      // Step 6: Record attempt
      await IdentificationService.recordIdentificationAttempt(mockClient, {
        lootId: 1,
        characterId: 1,
        spellcraftRoll: 25,
        golarionDate,
        success: true
      });

      // Step 7: Update item
      await IdentificationService.updateIdentifiedItem(mockClient, 1, itemName);

      expect(mockClient.query).toHaveBeenCalledTimes(6);
    });

    it('should handle failed identification attempt', async () => {
      const mockDateResult = { rows: [{ year: 4715, month: 3, day: 15 }] };
      const mockAttemptResult = { rows: [] };

      mockClient.query
        .mockResolvedValueOnce(mockDateResult)
        .mockResolvedValueOnce(mockAttemptResult)
        .mockResolvedValueOnce({ rows: [] }); // Record failed attempt

      const golarionDate = await IdentificationService.getCurrentGolarionDate(mockClient);
      const alreadyAttempted = await IdentificationService.hasAlreadyAttemptedToday(
        mockClient, 1, 1, golarionDate
      );
      
      expect(alreadyAttempted).toBe(false);

      // Record failed attempt (roll too low)
      await IdentificationService.recordIdentificationAttempt(mockClient, {
        lootId: 1,
        characterId: 1,
        spellcraftRoll: 15, // Too low for typical DC
        golarionDate,
        success: false
      });

      // Should not call updateIdentifiedItem for failed attempts
      expect(mockClient.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle extremely high caster levels', async () => {
      const effectiveCasterLevel = 100;
      const requiredDC = IdentificationService.calculateRequiredDC(effectiveCasterLevel);
      expect(requiredDC).toBe(35); // Should cap at 15 + 20
    });

    it('should handle items with mixed mod types', async () => {
      const modIds = [1, 2, 3];
      const mockModsResult = {
        rows: [
          { name: 'Flaming' },
          { name: '+2 Enhancement' },
          { name: 'Frost' }
        ]
      };
      
      mockClient.query.mockResolvedValue(mockModsResult);

      const result = await IdentificationService.generateItemName(
        mockClient, { name: 'Sword' }, modIds, false, 25, 20
      );

      // Should prioritize '+' mods first
      expect(result).toBe('+2 Enhancement Flaming Frost Sword');
    });

    it('should handle special characters in item names', async () => {
      const mockBaseItem = { name: "Assassin's Dagger" };
      const mockModsResult = {
        rows: [{ name: '+1 Enhancement' }]
      };
      
      mockClient.query.mockResolvedValue(mockModsResult);

      const result = await IdentificationService.generateItemName(
        mockClient, mockBaseItem, [1], false, 25, 20
      );

      expect(result).toBe("+1 Enhancement Assassin's Dagger");
    });
  });
});