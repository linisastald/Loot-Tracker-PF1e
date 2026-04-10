const IdentificationService = require('../identificationService');
const ValidationService = require('../validationService');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');

describe('IdentificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Spy on ValidationService to allow rolls > 20 (DM identification uses 99)
    jest.spyOn(ValidationService, 'validateItemId').mockImplementation((id) => id);
    jest.spyOn(ValidationService, 'validateAppraisalRoll').mockImplementation((roll) => roll);
    jest.spyOn(ValidationService, 'validateItems').mockImplementation((items) => {
      if (!items || !Array.isArray(items) || items.length === 0) {
        const err = new Error('items array is required');
        err.statusCode = 400;
        throw err;
      }
      return items;
    });
    jest.spyOn(ValidationService, 'validateCharacterId').mockImplementation((id) => {
      if (!id || isNaN(id) || id < 1) {
        const err = new Error('character ID is required');
        err.statusCode = 400;
        throw err;
      }
      return id;
    });
  });

  // ---------------------------------------------------------------------------
  // getCurrentGolarionDate
  // ---------------------------------------------------------------------------
  describe('getCurrentGolarionDate', () => {
    it('should return formatted date string from DB', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: [{ year: 4718, month: 3, day: 14 }],
        }),
      };

      const result = await IdentificationService.getCurrentGolarionDate(mockClient);
      expect(result).toBe('4718-3-14');
    });

    it('should throw when golarion_current_date table is empty', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };

      await expect(IdentificationService.getCurrentGolarionDate(mockClient))
        .rejects.toThrow('Golarion date not found');
    });
  });

  // ---------------------------------------------------------------------------
  // hasAlreadyAttemptedToday
  // ---------------------------------------------------------------------------
  describe('hasAlreadyAttemptedToday', () => {
    it('should return true when an attempt exists', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
      };

      const result = await IdentificationService.hasAlreadyAttemptedToday(
        mockClient, 10, 2, '4718-3-14'
      );

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM identify'),
        [10, 2, '4718-3-14']
      );
    });

    it('should return false when no attempt exists', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };

      const result = await IdentificationService.hasAlreadyAttemptedToday(
        mockClient, 10, 2, '4718-3-14'
      );

      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // calculateRequiredDC  (PF1e: DC = 15 + caster level, capped at 20)
  // ---------------------------------------------------------------------------
  describe('calculateRequiredDC', () => {
    it('should return 15 + caster level for normal values', () => {
      expect(IdentificationService.calculateRequiredDC(1)).toBe(16);
      expect(IdentificationService.calculateRequiredDC(5)).toBe(20);
      expect(IdentificationService.calculateRequiredDC(10)).toBe(25);
      expect(IdentificationService.calculateRequiredDC(15)).toBe(30);
    });

    it('should cap effective caster level at 20', () => {
      // CL 20 => DC 35
      expect(IdentificationService.calculateRequiredDC(20)).toBe(35);
      // CL 25 => still DC 35 (capped)
      expect(IdentificationService.calculateRequiredDC(25)).toBe(35);
      expect(IdentificationService.calculateRequiredDC(100)).toBe(35);
    });

    it('should handle caster level of 0 (fallback scenario)', () => {
      expect(IdentificationService.calculateRequiredDC(0)).toBe(15);
    });
  });

  // ---------------------------------------------------------------------------
  // calculateEffectiveCasterLevel
  // ---------------------------------------------------------------------------
  describe('calculateEffectiveCasterLevel', () => {
    it('should use base item caster level for non-weapon/armor types', async () => {
      const mockClient = { query: jest.fn() };
      const item = { type: 'wondrous', casterlevel: 7 };
      const lootItem = { modids: [1, 2] };

      const result = await IdentificationService.calculateEffectiveCasterLevel(
        mockClient, item, lootItem
      );

      expect(result).toBe(7);
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('should use highest mod caster level for weapons with mods', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: [{ casterlevel: 5 }, { casterlevel: 12 }, { casterlevel: 8 }],
        }),
      };
      const item = { type: 'weapon', casterlevel: 3 };
      const lootItem = { modids: [1, 2, 3] };

      const result = await IdentificationService.calculateEffectiveCasterLevel(
        mockClient, item, lootItem
      );

      expect(result).toBe(12);
    });

    it('should use highest mod caster level for armor with mods', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: [{ casterlevel: 10 }],
        }),
      };
      const item = { type: 'armor', casterlevel: 3 };
      const lootItem = { modids: [5] };

      const result = await IdentificationService.calculateEffectiveCasterLevel(
        mockClient, item, lootItem
      );

      expect(result).toBe(10);
    });

    it('should fall back to base item caster level when mods have no caster levels', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };
      const item = { type: 'weapon', casterlevel: 6 };
      const lootItem = { modids: [1] };

      const result = await IdentificationService.calculateEffectiveCasterLevel(
        mockClient, item, lootItem
      );

      expect(result).toBe(6);
    });

    it('should fall back to 1 when base item has no caster level and no mods', async () => {
      const mockClient = { query: jest.fn() };
      const item = { type: 'ring', casterlevel: null };
      const lootItem = { modids: [] };

      const result = await IdentificationService.calculateEffectiveCasterLevel(
        mockClient, item, lootItem
      );

      expect(result).toBe(1);
    });

    it('should fall back to 1 when weapon has no mods and no caster level', async () => {
      const mockClient = { query: jest.fn() };
      const item = { type: 'weapon', casterlevel: null };
      const lootItem = { modids: null };

      const result = await IdentificationService.calculateEffectiveCasterLevel(
        mockClient, item, lootItem
      );

      expect(result).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // generateItemName
  // ---------------------------------------------------------------------------
  describe('generateItemName', () => {
    it('should generate name with mods sorted (+ prefixed first)', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: [{ name: 'Flaming' }, { name: '+1' }],
        }),
      };

      const item = { name: 'Longsword' };
      const result = await IdentificationService.generateItemName(
        mockClient, item, [1, 2], false, 25, 20
      );

      expect(result).toBe('+1 Flaming Longsword');
    });

    it('should generate name without mods when mod list is empty', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };

      const item = { name: 'Cloak of Resistance' };
      const result = await IdentificationService.generateItemName(
        mockClient, item, [], false, 25, 20
      );

      expect(result).toBe('Cloak of Resistance');
    });

    it('should append CURSED when item is cursed and roll exceeds DC by 10+', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: [{ name: '+2' }],
        }),
      };

      const item = { name: 'Sword' };
      // requiredDC = 20, roll = 30, 30 >= 20 + 10 => cursed detected
      const result = await IdentificationService.generateItemName(
        mockClient, item, [1], true, 30, 20
      );

      expect(result).toBe('+2 Sword - CURSED');
    });

    it('should NOT append CURSED when roll does not exceed DC by 10', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: [{ name: '+1' }],
        }),
      };

      const item = { name: 'Sword' };
      // requiredDC = 20, roll = 25, 25 < 20 + 10 => cursed NOT detected
      const result = await IdentificationService.generateItemName(
        mockClient, item, [1], true, 25, 20
      );

      expect(result).toBe('+1 Sword');
    });

    it('should NOT append CURSED when item is not cursed even with high roll', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: [{ name: '+1' }],
        }),
      };

      const item = { name: 'Sword' };
      const result = await IdentificationService.generateItemName(
        mockClient, item, [1], false, 40, 20
      );

      expect(result).toBe('+1 Sword');
    });

    it('should detect curse at exactly DC + 10', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };

      const item = { name: 'Amulet' };
      // requiredDC = 18, roll = 28, 28 >= 18 + 10 => exactly at threshold
      const result = await IdentificationService.generateItemName(
        mockClient, item, [], true, 28, 18
      );

      expect(result).toBe('Amulet - CURSED');
    });
  });

  // ---------------------------------------------------------------------------
  // recordIdentificationAttempt
  // ---------------------------------------------------------------------------
  describe('recordIdentificationAttempt', () => {
    it('should insert attempt with correct parameters', async () => {
      const mockClient = { query: jest.fn().mockResolvedValue({}) };

      await IdentificationService.recordIdentificationAttempt(mockClient, {
        lootId: 10,
        characterId: 3,
        spellcraftRoll: 18,
        golarionDate: '4718-3-14',
        success: true,
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO identify'),
        [10, 3, 18, '4718-3-14', true]
      );
    });

    it('should record failed attempts', async () => {
      const mockClient = { query: jest.fn().mockResolvedValue({}) };

      await IdentificationService.recordIdentificationAttempt(mockClient, {
        lootId: 10,
        characterId: 3,
        spellcraftRoll: 5,
        golarionDate: '4718-3-14',
        success: false,
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO identify'),
        [10, 3, 5, '4718-3-14', false]
      );
    });
  });

  // ---------------------------------------------------------------------------
  // updateIdentifiedItem
  // ---------------------------------------------------------------------------
  describe('updateIdentifiedItem', () => {
    it('should update loot name and set unidentified to false', async () => {
      const mockClient = { query: jest.fn().mockResolvedValue({}) };

      await IdentificationService.updateIdentifiedItem(mockClient, 10, '+1 Flaming Longsword');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE loot SET name = $1, unidentified = false'),
        ['+1 Flaming Longsword', 10]
      );
    });
  });

  // ---------------------------------------------------------------------------
  // identifySingleItem
  // ---------------------------------------------------------------------------
  describe('identifySingleItem', () => {
    function buildMockClient(overrides = {}) {
      const defaults = {
        golarionDate: { rows: [{ year: 4718, month: 3, day: 14 }] },
        loot: { rows: [{ id: 10, name: 'Unknown Sword', itemid: 5, modids: [1], cursed: false }] },
        item: { rows: [{ id: 5, name: 'Longsword', type: 'weapon', casterlevel: 3 }] },
        attemptCheck: { rows: [] },
        modCasterLevels: { rows: [{ casterlevel: 5 }] },
        modNames: { rows: [{ name: '+1' }] },
        insertAttempt: {},
        updateLoot: {},
      };
      const data = { ...defaults, ...overrides };

      const queryFn = jest.fn().mockImplementation((query) => {
        if (query.includes('golarion_current_date')) return Promise.resolve(data.golarionDate);
        if (query.includes('FROM loot')) return Promise.resolve(data.loot);
        if (query.includes('FROM item')) return Promise.resolve(data.item);
        if (query.includes('FROM identify')) return Promise.resolve(data.attemptCheck);
        if (query.includes('casterlevel FROM mod')) return Promise.resolve(data.modCasterLevels);
        if (query.includes('name FROM mod')) return Promise.resolve(data.modNames);
        if (query.includes('INSERT INTO identify')) return Promise.resolve(data.insertAttempt);
        if (query.includes('UPDATE loot')) return Promise.resolve(data.updateLoot);
        return Promise.resolve({ rows: [] });
      });

      return { query: queryFn };
    }

    it('should return success when roll >= DC', async () => {
      const mockClient = buildMockClient();

      const result = await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        spellcraftRoll: 20, // DC = 15 + 5 = 20, roll 20 >= 20
        golarionDate: '4718-3-14',
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe(10);
      expect(result.oldName).toBe('Unknown Sword');
      expect(result.newName).toBe('+1 Longsword');
      expect(result.requiredDC).toBe(20);
    });

    it('should return failure when roll < DC', async () => {
      const mockClient = buildMockClient();

      const result = await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        spellcraftRoll: 15, // DC = 20, roll 15 < 20
        golarionDate: '4718-3-14',
      });

      expect(result.success).toBe(false);
      expect(result.id).toBe(10);
      expect(result.name).toBe('Unknown Sword');
      expect(result.spellcraftRoll).toBe(15);
      expect(result.requiredDC).toBe(20);
    });

    it('should detect curse when roll >= DC + 10', async () => {
      const mockClient = buildMockClient({
        loot: { rows: [{ id: 10, name: 'Unknown Amulet', itemid: 5, modids: [1], cursed: true }] },
      });

      // DC = 20, roll = 30 => success AND cursedDetected
      const result = await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        spellcraftRoll: 30, // Mocked validation allows any value
        golarionDate: '4718-3-14',
      });

      expect(result.success).toBe(true);
      expect(result.cursedDetected).toBe(true);
      expect(result.newName).toContain('CURSED');
    });

    it('should NOT detect curse when roll < DC + 10', async () => {
      const mockClient = buildMockClient({
        loot: { rows: [{ id: 10, name: 'Unknown Amulet', itemid: 5, modids: [1], cursed: true }] },
      });

      // DC = 20, roll = 25 => success but cursedDetected = false
      const result = await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        spellcraftRoll: 25,
        golarionDate: '4718-3-14',
      });

      expect(result.success).toBe(true);
      expect(result.cursedDetected).toBe(false);
      expect(result.newName).not.toContain('CURSED');
    });

    it('should return alreadyAttempted when character tried today', async () => {
      const mockClient = buildMockClient({
        attemptCheck: { rows: [{ id: 1 }] },
      });

      const result = await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        spellcraftRoll: 20,
        golarionDate: '4718-3-14',
      });

      expect(result.success).toBe(false);
      expect(result.alreadyAttempted).toBe(true);
      expect(result.message).toContain('Already attempted');
    });

    it('should skip attempt check for DM identification (roll 99)', async () => {
      const mockClient = buildMockClient();

      const result = await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        spellcraftRoll: 99,
        golarionDate: '4718-3-14',
      });

      expect(result.success).toBe(true);
      // Verify the attempt-check query was NOT called
      const attemptCheckCalls = mockClient.query.mock.calls.filter(
        (call) => call[0].includes('FROM identify')
      );
      expect(attemptCheckCalls).toHaveLength(0);
    });

    it('should record attempt with null characterId for DM identification', async () => {
      const mockClient = buildMockClient();

      await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        spellcraftRoll: 99,
        golarionDate: '4718-3-14',
      });

      const insertCall = mockClient.query.mock.calls.find(
        (call) => call[0].includes('INSERT INTO identify')
      );
      expect(insertCall).toBeDefined();
      // characterId should be null for DM identification
      expect(insertCall[1][1]).toBeNull();
    });

    it('should throw when loot item is not found', async () => {
      const mockClient = buildMockClient({
        loot: { rows: [] },
      });

      await expect(
        IdentificationService.identifySingleItem(mockClient, {
          itemId: 999,
          characterId: 2,
          spellcraftRoll: 15,
          golarionDate: '4718-3-14',
        })
      ).rejects.toThrow('Loot item with id 999 not found');
    });

    it('should throw when base item is not found', async () => {
      const mockClient = buildMockClient({
        item: { rows: [] },
      });

      await expect(
        IdentificationService.identifySingleItem(mockClient, {
          itemId: 10,
          characterId: 2,
          spellcraftRoll: 15,
          golarionDate: '4718-3-14',
        })
      ).rejects.toThrow('Item with id 5 not found');
    });
  });

  // ---------------------------------------------------------------------------
  // identifyItems (bulk)
  // ---------------------------------------------------------------------------
  describe('identifyItems', () => {
    it('should process multiple items and categorize results', async () => {
      // Mock the transaction to call the callback with a mock client
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockImplementation((query, params) => {
            if (query.includes('golarion_current_date')) {
              return { rows: [{ year: 4718, month: 3, day: 14 }] };
            }
            if (query.includes('FROM loot')) {
              const id = params[0];
              if (id === 10) {
                return { rows: [{ id: 10, name: 'Unknown Sword', itemid: 5, modids: [1], cursed: false }] };
              }
              if (id === 11) {
                return { rows: [{ id: 11, name: 'Unknown Ring', itemid: 6, modids: [], cursed: false }] };
              }
              return { rows: [] };
            }
            if (query.includes('FROM item')) {
              const id = params[0];
              if (id === 5) return { rows: [{ id: 5, name: 'Longsword', type: 'weapon', casterlevel: 3 }] };
              if (id === 6) return { rows: [{ id: 6, name: 'Ring of Protection', type: 'ring', casterlevel: 5 }] };
              return { rows: [] };
            }
            if (query.includes('FROM identify')) return { rows: [] };
            if (query.includes('casterlevel FROM mod')) return { rows: [{ casterlevel: 5 }] };
            if (query.includes('name FROM mod')) return { rows: [{ name: '+1' }] };
            if (query.includes('INSERT INTO identify')) return {};
            if (query.includes('UPDATE loot')) return {};
            if (query.includes('FROM characters')) return { rows: [{ name: 'Valeros' }] };
            return { rows: [] };
          }),
        };
        return await callback(mockClient);
      });

      const result = await IdentificationService.identifyItems({
        items: [10, 11],
        characterId: 2,
        spellcraftRolls: [20, 10], // Item 10: roll 20 >= DC 20 (success), Item 11: roll 10 < DC 20 (fail)
      });

      expect(result.identified).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.count.success).toBe(1);
      expect(result.count.failed).toBe(1);
      expect(result.count.total).toBe(2);
    });

    it('should handle already-attempted items in bulk', async () => {
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockImplementation((query, params) => {
            if (query.includes('golarion_current_date')) {
              return { rows: [{ year: 4718, month: 3, day: 14 }] };
            }
            if (query.includes('FROM loot')) {
              return { rows: [{ id: params[0], name: 'Unknown Item', itemid: 5, modids: [], cursed: false }] };
            }
            if (query.includes('FROM item')) {
              return { rows: [{ id: 5, name: 'Dagger', type: 'weapon', casterlevel: 1 }] };
            }
            if (query.includes('FROM identify')) {
              // All items already attempted
              return { rows: [{ id: 1 }] };
            }
            if (query.includes('FROM characters')) return { rows: [{ name: 'Valeros' }] };
            return { rows: [] };
          }),
        };
        return await callback(mockClient);
      });

      const result = await IdentificationService.identifyItems({
        items: [10, 11],
        characterId: 2,
        spellcraftRolls: [18, 18],
      });

      expect(result.alreadyAttempted).toHaveLength(2);
      expect(result.count.alreadyAttempted).toBe(2);
      expect(result.count.success).toBe(0);
    });

    it('should handle errors for individual items without aborting batch', async () => {
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockImplementation((query, params) => {
            if (query.includes('golarion_current_date')) {
              return { rows: [{ year: 4718, month: 3, day: 14 }] };
            }
            if (query.includes('FROM loot')) {
              const id = params[0];
              if (id === 10) return { rows: [] }; // Not found - will cause error
              return { rows: [{ id: 11, name: 'Unknown Ring', itemid: 6, modids: [], cursed: false }] };
            }
            if (query.includes('FROM item')) {
              return { rows: [{ id: 6, name: 'Ring', type: 'ring', casterlevel: 1 }] };
            }
            if (query.includes('FROM identify')) return { rows: [] };
            if (query.includes('INSERT INTO identify')) return {};
            if (query.includes('UPDATE loot')) return {};
            if (query.includes('FROM characters')) return { rows: [{ name: 'Valeros' }] };
            return { rows: [] };
          }),
        };
        return await callback(mockClient);
      });

      const result = await IdentificationService.identifyItems({
        items: [10, 11],
        characterId: 2,
        spellcraftRolls: [18, 18],
      });

      // Item 10 errored, item 11 succeeded (roll 18 >= DC 16)
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe(10);
      expect(result.identified).toHaveLength(1);
    });

    it('should validate items array', async () => {
      await expect(
        IdentificationService.identifyItems({
          items: [],
          characterId: 2,
          spellcraftRolls: [],
        })
      ).rejects.toThrow('items array is required');
    });

    it('should set alreadyAttempted to undefined when none are already attempted', async () => {
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockImplementation((query, params) => {
            if (query.includes('golarion_current_date')) {
              return { rows: [{ year: 4718, month: 3, day: 14 }] };
            }
            if (query.includes('FROM loot')) {
              return { rows: [{ id: 10, name: 'Unknown Sword', itemid: 5, modids: [], cursed: false }] };
            }
            if (query.includes('FROM item')) {
              return { rows: [{ id: 5, name: 'Sword', type: 'weapon', casterlevel: 1 }] };
            }
            if (query.includes('FROM identify')) return { rows: [] };
            if (query.includes('INSERT INTO identify')) return {};
            if (query.includes('UPDATE loot')) return {};
            if (query.includes('FROM characters')) return { rows: [{ name: 'Valeros' }] };
            return { rows: [] };
          }),
        };
        return await callback(mockClient);
      });

      const result = await IdentificationService.identifyItems({
        items: [10],
        characterId: 2,
        spellcraftRolls: [18],
      });

      expect(result.alreadyAttempted).toBeUndefined();
      expect(result.count.alreadyAttempted).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getIdentificationAttempts
  // ---------------------------------------------------------------------------
  describe('getIdentificationAttempts', () => {
    it('should return attempts for character filtered by date', async () => {
      const mockAttempts = [
        { id: 1, lootid: 10, characterid: 2, spellcraft_roll: 18, success: true, item_name: 'Sword' },
      ];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockAttempts });

      const result = await IdentificationService.getIdentificationAttempts(2, '4718-3-14');

      expect(result).toEqual(mockAttempts);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('golarion_date = $2'),
        [2, '4718-3-14']
      );
    });

    it('should return all attempts (with LIMIT 50) when no date provided', async () => {
      const mockAttempts = [
        { id: 1, lootid: 10, characterid: 2, success: true, item_name: 'Sword' },
        { id: 2, lootid: 11, characterid: 2, success: false, item_name: 'Ring' },
      ];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockAttempts });

      const result = await IdentificationService.getIdentificationAttempts(2);

      expect(result).toEqual(mockAttempts);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 50'),
        [2]
      );
    });

    it('should validate character ID', async () => {
      await expect(
        IdentificationService.getIdentificationAttempts(null)
      ).rejects.toThrow();

      expect(ValidationService.validateCharacterId).toHaveBeenCalledWith(null);
    });
  });

  // ---------------------------------------------------------------------------
  // getUnidentifiedItems
  // ---------------------------------------------------------------------------
  describe('getUnidentifiedItems', () => {
    it('should return unidentified items with pagination', async () => {
      const mockItems = [
        { id: 10, name: 'Unknown Sword', unidentified: true, base_item_name: 'Longsword' },
      ];
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: mockItems })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await IdentificationService.getUnidentifiedItems({ limit: 10, offset: 0 });

      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('should use default limit and offset when not provided', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await IdentificationService.getUnidentifiedItems();

      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        [50, 0]
      );
    });

    it('should filter by identifiableOnly when true', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await IdentificationService.getUnidentifiedItems({ identifiableOnly: true });

      const itemsQuery = dbUtils.executeQuery.mock.calls[0][0];
      expect(itemsQuery).toContain('l.itemid IS NOT NULL');
    });

    it('should NOT filter by itemid when identifiableOnly is false', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await IdentificationService.getUnidentifiedItems({ identifiableOnly: false });

      const itemsQuery = dbUtils.executeQuery.mock.calls[0][0];
      expect(itemsQuery).not.toContain('l.itemid IS NOT NULL');
    });

    it('should parse total count as integer', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '42' }] });

      const result = await IdentificationService.getUnidentifiedItems();

      expect(result.total).toBe(42);
      expect(typeof result.total).toBe('number');
    });

    it('should apply custom pagination values', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '100' }] });

      const result = await IdentificationService.getUnidentifiedItems({ limit: 25, offset: 50 });

      expect(result.limit).toBe(25);
      expect(result.offset).toBe(50);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        [25, 50]
      );
    });
  });
});
