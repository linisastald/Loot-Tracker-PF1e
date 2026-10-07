const IdentificationService = require('../identificationService');
const ValidationService = require('../validationService');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

jest.mock('../../utils/dice', () => ({ rollD20: jest.fn() }));

const dbUtils = require('../../utils/dbUtils');
const { rollD20 } = require('../../utils/dice');

describe('IdentificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The server rolls the d20; tests pin it (total = 10 + the bonus the test sends)
    rollD20.mockReset();
    rollD20.mockReturnValue(10);
    jest.spyOn(ValidationService, 'validateItemId').mockImplementation((id) => id);
    jest.spyOn(ValidationService, 'validateRequiredNumber').mockImplementation((val, name, opts) => {
      if (val === null || val === undefined || isNaN(val)) {
        const err = new Error(`${name} is required and must be a valid number`);
        err.statusCode = 400;
        throw err;
      }
      const numVal = parseFloat(val);
      if (opts && opts.min !== undefined && numVal < opts.min) {
        const err = new Error(`${name} must be at least ${opts.min}`);
        err.statusCode = 400;
        throw err;
      }
      return numVal;
    });
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

    it('locks the loot row so simultaneous attempts cannot each pass the once-per-day check', async () => {
      const mockClient = buildMockClient();

      await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        spellcraftBonus: 10,
        golarionDate: '4718-3-14',
      });

      const queries = mockClient.query.mock.calls.map(([query]) => query);
      const lock = queries.findIndex((query) => /FROM loot WHERE id = \$1 FOR UPDATE/.test(query));
      const attemptCheck = queries.findIndex((query) => query.includes('FROM identify'));
      expect(lock).toBeGreaterThan(-1);
      expect(attemptCheck).toBeGreaterThan(lock);
    });

    it('should return success when roll >= DC', async () => {
      const mockClient = buildMockClient();

      const result = await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        spellcraftBonus: 10, // total 20 with the pinned roll of 10
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
        spellcraftBonus: 5, // total 15 with the pinned roll of 10
        golarionDate: '4718-3-14',
      });

      expect(result.success).toBe(false);
      expect(result.id).toBe(10);
      expect(result.name).toBe('Unknown Sword');
      expect(result.spellcraftRoll).toBe(15);
      expect(result).toMatchObject({ roll: 10, bonus: 5, total: 15 });
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
        spellcraftBonus: 20, // total 30 with the pinned roll of 10
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
        spellcraftBonus: 15, // total 25 with the pinned roll of 10
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
        spellcraftBonus: 10, // total 20 with the pinned roll of 10
        golarionDate: '4718-3-14',
      });

      expect(result.success).toBe(false);
      expect(result.alreadyAttempted).toBe(true);
      expect(result.message).toContain('Already attempted');
    });

    it('should skip attempt check for DM identification (dmIdentify flag)', async () => {
      const mockClient = buildMockClient();

      const result = await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        dmIdentify: true,
        golarionDate: '4718-3-14',
      });

      expect(result.success).toBe(true);
      // Verify the attempt-check query was NOT called
      const attemptCheckCalls = mockClient.query.mock.calls.filter(
        (call) => call[0].includes('FROM identify')
      );
      expect(attemptCheckCalls).toHaveLength(0);
    });

    it('treats a client-sent roll of 99 as nothing at all: the server rolls (F-1294)', async () => {
      const mockClient = buildMockClient({
        attemptCheck: { rows: [{ id: 1 }] },
      });

      const result = await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        spellcraftRoll: 99, // ignored: the server rolls
        spellcraftBonus: 0,
        golarionDate: '4718-3-14',
      });

      // Subject to the once-per-day rule like any other roll
      expect(result.alreadyAttempted).toBe(true);
      const attemptCheckCalls = mockClient.query.mock.calls.filter(
        (call) => call[0].includes('FROM identify')
      );
      expect(attemptCheckCalls).toHaveLength(1);
    });

    it('records a roll of 99 against the character when no dmIdentify flag is set (F-1294)', async () => {
      const mockClient = buildMockClient();

      await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        spellcraftRoll: 99, // ignored: the server rolls
        spellcraftBonus: 0,
        golarionDate: '4718-3-14',
      });

      const insertCall = mockClient.query.mock.calls.find(
        (call) => call[0].includes('INSERT INTO identify')
      );
      expect(insertCall[1][1]).toBe(2);
    });

    it('should record attempt with null characterId for DM identification', async () => {
      const mockClient = buildMockClient();

      await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        dmIdentify: true,
        golarionDate: '4718-3-14',
      });

      const insertCall = mockClient.query.mock.calls.find(
        (call) => call[0].includes('INSERT INTO identify')
      );
      expect(insertCall).toBeDefined();
      // characterId should be null for DM identification
      expect(insertCall[1][1]).toBeNull();
    });

    it('should NOT call roll validation for DM identification (dmIdentify flag)', async () => {
      const mockClient = buildMockClient();

      await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        dmIdentify: true,
        golarionDate: '4718-3-14',
      });

      // validateRequiredNumber should NOT have been called for the spellcraft roll
      // (it may be called for other validations, but not with 'spellcraft roll' field name)
      const spellcraftValidationCalls = ValidationService.validateRequiredNumber.mock.calls.filter(
        (call) => call[1] === 'spellcraft roll'
      );
      expect(spellcraftValidationCalls).toHaveLength(0);
    });

    it('should accept player spellcraft rolls above 20 (total includes bonus)', async () => {
      const mockClient = buildMockClient();

      // A player with high spellcraft bonus can have total rolls well above 20
      const result = await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10,
        characterId: 2,
        spellcraftBonus: 20, // total 30 with the pinned roll of 10
        golarionDate: '4718-3-14',
      });

      expect(result.success).toBe(true);
    });

    it('should throw when loot item is not found', async () => {
      const mockClient = buildMockClient({
        loot: { rows: [] },
      });

      await expect(
        IdentificationService.identifySingleItem(mockClient, {
          itemId: 999,
          characterId: 2,
          spellcraftBonus: 5, // total 15 with the pinned roll of 10
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
          spellcraftBonus: 5, // total 15 with the pinned roll of 10
          golarionDate: '4718-3-14',
        })
      ).rejects.toThrow('Item with id 5 not found');
    });

    it('ignores a client-supplied roll or total: the server roll decides', async () => {
      rollD20.mockReturnValue(3);
      const result = await IdentificationService.identifySingleItem(buildMockClient(), {
        itemId: 10,
        characterId: 2,
        spellcraftRoll: 40,
        total: 40,
        spellcraftBonus: 2,
        golarionDate: '4718-3-14',
      });

      // DC 20; the server's 3 + 2 = 5 fails no matter what the client claimed
      expect(result).toMatchObject({ success: false, roll: 3, bonus: 2, total: 5, spellcraftRoll: 5, requiredDC: 20 });
    });

    it('uses the server d20 plus the bonus and records the total', async () => {
      rollD20.mockReturnValue(14);
      const mockClient = buildMockClient();
      const result = await IdentificationService.identifySingleItem(mockClient, {
        itemId: 10, characterId: 2, spellcraftBonus: 6, golarionDate: '4718-3-14',
      });

      expect(result).toMatchObject({ success: true, roll: 14, bonus: 6, total: 20 });
      const insertCall = mockClient.query.mock.calls.find((call) => call[0].includes('INSERT INTO identify'));
      expect(insertCall[1][2]).toBe(20);
    });

    it('allows a negative bonus and a total below 1', async () => {
      rollD20.mockReturnValue(1);
      const result = await IdentificationService.identifySingleItem(buildMockClient(), {
        itemId: 10, characterId: 2, spellcraftBonus: -3, golarionDate: '4718-3-14',
      });
      expect(result).toMatchObject({ success: false, roll: 1, bonus: -3, total: -2 });
    });

    it('does not roll when the character already tried today', async () => {
      await IdentificationService.identifySingleItem(buildMockClient({ attemptCheck: { rows: [{ id: 1 }] } }), {
        itemId: 10, characterId: 2, spellcraftBonus: 5, golarionDate: '4718-3-14',
      });
      expect(rollD20).not.toHaveBeenCalled();
    });

    it('does not roll for a DM identification and keeps the automatic success', async () => {
      const result = await IdentificationService.identifySingleItem(buildMockClient(), {
        itemId: 10, characterId: 2, dmIdentify: true, spellcraftBonus: 5, golarionDate: '4718-3-14',
      });
      expect(rollD20).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.roll).toBeUndefined();
    });

    it.each([undefined, null, '', 'abc', 1.5, NaN, -11, 61, 1000, {}, [5]])(
      'rejects the spellcraft bonus %p', async (bonus) => {
        await expect(
          IdentificationService.identifySingleItem(buildMockClient(), {
            itemId: 10, characterId: 2, spellcraftBonus: bonus, golarionDate: '4718-3-14',
          })
        ).rejects.toThrow(/Spellcraft bonus must be a whole number from -10 to 60/);
        expect(rollD20).not.toHaveBeenCalled();
      });

    it.each([[-10, -10], [0, 0], [60, 60], ['7', 7], [' -2 ', -2]])('accepts the spellcraft bonus %p', async (bonus, used) => {
      const result = await IdentificationService.identifySingleItem(buildMockClient(), {
        itemId: 10, characterId: 2, spellcraftBonus: bonus, golarionDate: '4718-3-14',
      });
      expect(result.bonus).toBe(used);
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
            if (query.includes('FROM characters')) return { rows: [{ name: 'Valeros', user_id: 5 }] };
            return { rows: [] };
          }),
        };
        return await callback(mockClient);
      });

      rollD20.mockReturnValueOnce(15).mockReturnValueOnce(5);
      const result = await IdentificationService.identifyItems({
        items: [10, 11],
        characterId: 2,
        actor: { userId: 5, isDM: false },
        spellcraftBonus: 5, // server rolls 15 then 5: item 10 total 20 >= DC 20 (success), item 11 total 10 (fail)
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
            if (query.includes('FROM characters')) return { rows: [{ name: 'Valeros', user_id: 5 }] };
            return { rows: [] };
          }),
        };
        return await callback(mockClient);
      });

      const result = await IdentificationService.identifyItems({
        items: [10, 11],
        characterId: 2,
        actor: { userId: 5, isDM: false },
        spellcraftBonus: 8,
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
            if (query.includes('FROM characters')) return { rows: [{ name: 'Valeros', user_id: 5 }] };
            return { rows: [] };
          }),
        };
        return await callback(mockClient);
      });

      const result = await IdentificationService.identifyItems({
        items: [10, 11],
        characterId: 2,
        actor: { userId: 5, isDM: false },
        spellcraftBonus: 8,
      });

      // Item 10 errored, item 11 succeeded (roll 18 >= DC 16)
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe(10);
      expect(result.identified).toHaveLength(1);
    });

    it('requires a character for a non-DM identification (F-1294)', async () => {
      await expect(
        IdentificationService.identifyItems({
          items: [10],
          characterId: null,
          spellcraftBonus: 5,
        })
      ).rejects.toThrow('character ID is required');
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('identifies without rolls or a character when dmIdentify is set', async () => {
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockImplementation((query, params) => {
            if (query.includes('golarion_current_date')) return { rows: [{ year: 4718, month: 3, day: 14 }] };
            if (query.includes('FROM loot')) return { rows: [{ id: 10, name: 'Unknown Sword', itemid: 5, modids: [], cursed: false }] };
            if (query.includes('FROM item')) return { rows: [{ id: 5, name: 'Longsword', type: 'weapon', casterlevel: 20 }] };
            return { rows: [] };
          }),
        };
        return await callback(mockClient);
      });

      const result = await IdentificationService.identifyItems({
        items: [10],
        characterId: null,
        dmIdentify: true,
      });

      expect(result.identified).toHaveLength(1);
      expect(result.count.failed).toBe(0);
    });

    it('rejects a character that belongs to another user (F-0690)', async () => {
      const queries = [];
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockImplementation((query) => {
            queries.push(query);
            if (query.includes('FROM characters')) return { rows: [{ user_id: 99 }] };
            return { rows: [] };
          }),
        };
        return await callback(mockClient);
      });

      await expect(
        IdentificationService.identifyItems({
          items: [10],
          characterId: 2,
          spellcraftBonus: 20,
          actor: { userId: 5, isDM: false },
        })
      ).rejects.toThrow('your own character');
      expect(queries.some((q) => q.includes('INSERT INTO identify'))).toBe(false);
    });

    it('rejects a non-DM call without an actor and a missing character row', async () => {
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        return await callback(mockClient);
      });

      await expect(
        IdentificationService.identifyItems({ items: [10], characterId: 2, spellcraftBonus: 20 })
      ).rejects.toThrow('your own character');
    });

    it('lets a DM identify as any character', async () => {
      const queries = [];
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockImplementation((query) => {
            queries.push(query);
            if (query.includes('golarion_current_date')) return { rows: [{ year: 4718, month: 3, day: 14 }] };
            if (query.includes('FROM loot')) return { rows: [{ id: 10, name: 'Unknown', itemid: 5, modids: [] }] };
            if (query.includes('FROM item')) return { rows: [{ id: 5, name: 'Sword', type: 'weapon', casterlevel: 1 }] };
            return { rows: [] };
          }),
        };
        return await callback(mockClient);
      });

      const result = await IdentificationService.identifyItems({
        items: [10],
        characterId: 2,
        spellcraftBonus: 20,
        actor: { userId: 1, isDM: true },
      });

      expect(result.identified).toHaveLength(1);
      expect(queries.some((q) => q.includes('SELECT user_id FROM characters'))).toBe(false);
    });

    it('isolates each item in a savepoint so a database error does not poison the batch (F-0691)', async () => {
      const queries = [];
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockImplementation((query, params) => {
            queries.push(query);
            if (query.includes('golarion_current_date')) return { rows: [{ year: 4718, month: 3, day: 14 }] };
            if (query.includes('FROM loot')) {
              if (params[0] === 10) throw new Error('db exploded');
              return { rows: [{ id: 11, name: 'Unknown', itemid: 5, modids: [] }] };
            }
            if (query.includes('FROM item')) return { rows: [{ id: 5, name: 'Sword', type: 'weapon', casterlevel: 1 }] };
            if (query.includes('FROM characters')) return { rows: [{ name: 'V', user_id: 5 }] };
            return { rows: [] };
          }),
        };
        return await callback(mockClient);
      });

      const result = await IdentificationService.identifyItems({
        items: [10, 11],
        characterId: 2,
        spellcraftBonus: 20,
        actor: { userId: 5, isDM: false },
      });

      expect(result.failed).toHaveLength(1);
      expect(result.identified).toHaveLength(1);
      expect(queries.filter((q) => q === 'SAVEPOINT identify_item')).toHaveLength(2);
      expect(queries).toContain('ROLLBACK TO SAVEPOINT identify_item');
      expect(queries.filter((q) => q === 'RELEASE SAVEPOINT identify_item')).toHaveLength(1);
      // the rollback comes before the next item's savepoint
      expect(queries.indexOf('ROLLBACK TO SAVEPOINT identify_item'))
        .toBeLessThan(queries.lastIndexOf('SAVEPOINT identify_item'));
    });

    it('rejects a missing or out-of-range spellcraft bonus before touching the database', async () => {
      for (const bonus of [undefined, 61, -11, 2.5]) {
        await expect(
          IdentificationService.identifyItems({ items: [10], characterId: 2, spellcraftBonus: bonus })
        ).rejects.toThrow(/Spellcraft bonus/);
      }
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    const stubTransaction = () => dbUtils.executeTransaction.mockImplementation(async (callback) => callback({
      query: jest.fn().mockImplementation((query) => {
        if (query.includes('golarion_current_date')) return { rows: [{ year: 4718, month: 3, day: 14 }] };
        if (query.includes('FROM loot')) return { rows: [{ id: 10, name: 'Unknown Sword', itemid: 5, modids: [], cursed: false }] };
        if (query.includes('FROM item')) return { rows: [{ id: 5, name: 'Longsword', type: 'weapon', casterlevel: 3 }] };
        if (query.includes('FROM characters')) return { rows: [{ name: 'Valeros', user_id: 5 }] };
        return { rows: [] };
      }),
    }));

    it('never reads client-supplied rolls: only the server roll plus the bonus counts', async () => {
      rollD20.mockReturnValue(2);
      stubTransaction();

      const result = await IdentificationService.identifyItems({
        items: [10],
        characterId: 2,
        spellcraftRolls: [60],
        spellcraftBonus: 1,
        actor: { userId: 5, isDM: false },
      });

      expect(result.identified).toHaveLength(0);
      expect(result.failed).toEqual([expect.objectContaining({ id: 10, roll: 2, bonus: 1, total: 3 })]);
    });

    it('returns the server roll, bonus and total for every identified item', async () => {
      rollD20.mockReturnValue(18);
      stubTransaction();

      const result = await IdentificationService.identifyItems({
        items: [10], characterId: 2, spellcraftBonus: 4, actor: { userId: 5, isDM: false },
      });

      expect(result.identified[0]).toMatchObject({ id: 10, roll: 18, bonus: 4, total: 22, spellcraftRoll: 22, requiredDC: 18 });
    });

    it('should validate items array', async () => {
      await expect(
        IdentificationService.identifyItems({
          items: [],
          characterId: 2,
          spellcraftBonus: 0,
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
            if (query.includes('FROM characters')) return { rows: [{ name: 'Valeros', user_id: 5 }] };
            return { rows: [] };
          }),
        };
        return await callback(mockClient);
      });

      const result = await IdentificationService.identifyItems({
        items: [10],
        characterId: 2,
        actor: { userId: 5, isDM: false },
        spellcraftBonus: 8,
      });

      expect(result.alreadyAttempted).toBeUndefined();
      expect(result.count.alreadyAttempted).toBe(0);
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

    it('hides the real item identity from non-DM callers (F-0693)', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await IdentificationService.getUnidentifiedItems({ isDM: false });

      const itemsQuery = dbUtils.executeQuery.mock.calls[0][0];
      const selected = itemsQuery.slice(itemsQuery.indexOf('SELECT'), itemsQuery.indexOf('FROM loot'));
      expect(selected).not.toContain('*');
      expect(selected).not.toContain('base_item_name');
      ['itemid', 'modids', 'value', 'cursed', 'dm_notes', 'spellcraft_dc'].forEach((col) => {
        expect(selected).not.toContain(col);
      });
      expect(selected).toContain('l.name');
    });

    it('gives DMs the full row including the base item', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await IdentificationService.getUnidentifiedItems({ isDM: true });

      const itemsQuery = dbUtils.executeQuery.mock.calls[0][0];
      expect(itemsQuery).toContain('l.*');
      expect(itemsQuery).toContain('base_item_name');
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
