/**
 * Tests for Loot model
 * Tests database operations and data integrity for loot items
 */

const Loot = require('../../../backend/src/models/Loot');
const dbUtils = require('../../../backend/src/utils/dbUtils');

// Mock the database utilities
jest.mock('../../../backend/src/utils/dbUtils');

describe('Loot Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const mockLootEntry = {
      sessionDate: '2024-01-15',
      quantity: 1,
      name: 'Magic Sword',
      unidentified: false,
      masterwork: true,
      type: 'weapon',
      size: 'Medium',
      itemid: 1,
      modids: [1, 2],
      value: 1500,
      whoupdated: 1,
      notes: 'Found in treasure chest',
      charges: null,
      cursed: false
    };

    const mockCreatedEntry = {
      id: 1,
      ...mockLootEntry,
      lastupdate: new Date()
    };

    beforeEach(() => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockCreatedEntry] });
    });

    it('should create a new loot entry with all fields', async () => {
      const result = await Loot.create(mockLootEntry);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO loot'),
        [
          '2024-01-15',
          1,
          'Magic Sword',
          false,
          true,
          'weapon',
          'Medium',
          1,
          [1, 2],
          1500,
          1,
          'Found in treasure chest',
          null,
          false
        ],
        'Error creating loot entry'
      );
      expect(result).toEqual(mockCreatedEntry);
    });

    it('should handle null values correctly', async () => {
      const entryWithNulls = {
        sessionDate: '2024-01-15',
        quantity: 1,
        name: 'Unknown Item',
        unidentified: true,
        masterwork: false,
        type: 'misc',
        size: 'Small',
        itemid: null,
        modids: null,
        value: null,
        whoupdated: 1,
        notes: '',
        charges: null,
        cursed: null
      };

      await Loot.create(entryWithNulls);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO loot'),
        [
          '2024-01-15',
          1,
          'Unknown Item',
          true,
          false,
          'misc',
          'Small',
          null,
          null,
          null,
          1,
          '',
          null,
          false // cursed defaults to false
        ],
        'Error creating loot entry'
      );
    });

    it('should handle empty arrays and strings as null', async () => {
      const entryWithEmpties = {
        sessionDate: '2024-01-15',
        quantity: 1,
        name: 'Test Item',
        unidentified: false,
        masterwork: false,
        type: 'misc',
        size: 'Medium',
        itemid: '',
        modids: [],
        value: '',
        whoupdated: 1,
        notes: null,
        charges: '',
        cursed: undefined
      };

      await Loot.create(entryWithEmpties);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO loot'),
        [
          '2024-01-15',
          1,
          'Test Item',
          false,
          false,
          'misc',
          'Medium',
          null, // empty string becomes null
          null, // empty array becomes null
          null, // empty string becomes null
          1,
          null,
          null, // empty string becomes null
          false // undefined becomes false
        ],
        'Error creating loot entry'
      );
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database constraint violation'));

      await expect(Loot.create(mockLootEntry))
        .rejects.toThrow('Database constraint violation');
    });

    it('should include all required fields in INSERT query', async () => {
      await Loot.create(mockLootEntry);

      const query = dbUtils.executeQuery.mock.calls[0][0];
      
      // Verify all expected columns are included
      expect(query).toContain('session_date');
      expect(query).toContain('quantity');
      expect(query).toContain('name');
      expect(query).toContain('unidentified');
      expect(query).toContain('masterwork');
      expect(query).toContain('type');
      expect(query).toContain('size');
      expect(query).toContain('itemid');
      expect(query).toContain('modids');
      expect(query).toContain('value');
      expect(query).toContain('whoupdated');
      expect(query).toContain('notes');
      expect(query).toContain('charges');
      expect(query).toContain('cursed');
      expect(query).toContain('RETURNING *');
    });
  });

  describe('findByStatus', () => {
    const mockLootViewResults = [
      {
        id: 1,
        name: 'Magic Sword',
        row_type: 'individual',
        statuspage: null,
        appraisals: [
          { character_id: 1, believedvalue: 1500 },
          { character_id: 2, believedvalue: 1200 }
        ]
      },
      {
        id: 2,
        name: 'Healing Potions',
        row_type: 'summary',
        statuspage: 'Pending Sale',
        quantity: 5,
        appraisals: null
      }
    ];

    beforeEach(() => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockLootViewResults });
    });

    it('should find unprocessed items (null status)', async () => {
      const result = await Loot.findByStatus(null);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("(statuspage IS NULL OR statuspage = 'Pending Sale')"),
        []
      );
      expect(result.rows).toEqual(mockLootViewResults);
    });

    it('should find items by specific status', async () => {
      await Loot.findByStatus('Kept Party');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('statuspage = $1'),
        ['Kept Party']
      );
    });

    it('should process appraisals for active character', async () => {
      const activeCharacterId = 1;
      
      const result = await Loot.findByStatus(null, activeCharacterId);

      // Should set believedvalue for character 1
      expect(result.rows[0].believedvalue).toBe(1500);
      expect(result.rows[1].believedvalue).toBeUndefined(); // No appraisals
    });

    it('should handle character with string ID in appraisals', async () => {
      const mockResultsWithStringId = [
        {
          id: 1,
          name: 'Magic Sword',
          appraisals: [
            { character_id: '1', believedvalue: 1500 } // String ID
          ]
        }
      ];
      
      dbUtils.executeQuery.mockResolvedValue({ rows: mockResultsWithStringId });

      const result = await Loot.findByStatus(null, 1);

      expect(result.rows[0].believedvalue).toBe(1500);
    });

    it('should handle character with character_name in appraisals', async () => {
      const mockResultsWithName = [
        {
          id: 1,
          name: 'Magic Sword',
          appraisals: [
            { character_id: 1, character_name: 'Test Character', believedvalue: 1500 }
          ]
        }
      ];
      
      dbUtils.executeQuery.mockResolvedValue({ rows: mockResultsWithName });

      const result = await Loot.findByStatus(null, 1);

      expect(result.rows[0].believedvalue).toBe(1500);
    });

    it('should order results by row_type, name, id', async () => {
      await Loot.findByStatus('Available');

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('ORDER BY row_type, name, id');
    });

    it('should handle items with no appraisals', async () => {
      const mockResultsNoAppraisals = [
        {
          id: 1,
          name: 'Simple Item',
          appraisals: null
        },
        {
          id: 2,
          name: 'Another Item',
          appraisals: []
        }
      ];
      
      dbUtils.executeQuery.mockResolvedValue({ rows: mockResultsNoAppraisals });

      const result = await Loot.findByStatus(null, 1);

      expect(result.rows[0].believedvalue).toBeUndefined();
      expect(result.rows[1].believedvalue).toBeUndefined();
    });

    it('should handle character not found in appraisals', async () => {
      const result = await Loot.findByStatus(null, 999); // Character not in appraisals

      expect(result.rows[0].believedvalue).toBeUndefined();
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(Loot.findByStatus('Available'))
        .rejects.toThrow('Database connection failed');
    });
  });

  describe('update', () => {
    const mockUpdateData = {
      name: 'Updated Magic Sword',
      quantity: 2,
      value: 2000,
      status: 'Available'
    };

    const mockUpdatedEntry = {
      id: 1,
      ...mockUpdateData,
      lastupdate: new Date()
    };

    beforeEach(() => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockUpdatedEntry] });
    });

    it('should update loot entry', async () => {
      const result = await Loot.update(1, mockUpdateData);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE loot SET'),
        expect.arrayContaining([
          'Updated Magic Sword',
          2,
          2000,
          'Available',
          1
        ])
      );
      expect(result).toEqual(mockUpdatedEntry);
    });

    it('should handle partial updates', async () => {
      const partialUpdate = { name: 'New Name' };
      
      await Loot.update(1, partialUpdate);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE loot SET'),
        expect.arrayContaining(['New Name', 1])
      );
    });

    it('should handle updates with null values', async () => {
      const updateWithNulls = {
        value: null,
        notes: null,
        itemid: null
      };
      
      await Loot.update(1, updateWithNulls);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE loot SET'),
        expect.arrayContaining([null, null, null, 1])
      );
    });

    it('should include WHERE clause with item ID', async () => {
      await Loot.update(123, mockUpdateData);

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('WHERE id = $');
      
      const params = dbUtils.executeQuery.mock.calls[0][1];
      expect(params[params.length - 1]).toBe(123); // Last parameter should be ID
    });

    it('should return updated entry', async () => {
      const result = await Loot.update(1, mockUpdateData);

      expect(result).toEqual(mockUpdatedEntry);
    });

    it('should handle item not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Loot.update(999, mockUpdateData);

      expect(result).toBeUndefined();
    });
  });

  describe('findById', () => {
    const mockLootItem = {
      id: 1,
      name: 'Magic Sword',
      quantity: 1,
      value: 1500,
      unidentified: false
    };

    beforeEach(() => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockLootItem] });
    });

    it('should find loot item by ID', async () => {
      const result = await Loot.findById(1);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM loot WHERE id = $1'),
        [1]
      );
      expect(result).toEqual(mockLootItem);
    });

    it('should return undefined for non-existent item', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Loot.findById(999);

      expect(result).toBeUndefined();
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(Loot.findById(1))
        .rejects.toThrow('Database error');
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 1 });
    });

    it('should delete loot item by ID', async () => {
      const result = await Loot.delete(1);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'DELETE FROM loot WHERE id = $1',
        [1]
      );
      expect(result).toBe(true); // Successfully deleted
    });

    it('should return false when item not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 0 });

      const result = await Loot.delete(999);

      expect(result).toBe(false); // Not found/deleted
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Foreign key constraint'));

      await expect(Loot.delete(1))
        .rejects.toThrow('Foreign key constraint');
    });
  });

  describe('Edge Cases and Data Validation', () => {
    it('should handle extremely large values', async () => {
      const largeValueEntry = {
        sessionDate: '2024-01-15',
        quantity: 999999,
        name: 'Artifact',
        value: 9999999.99,
        whoupdated: 1
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [largeValueEntry] });

      const result = await Loot.create(largeValueEntry);

      expect(result).toEqual(largeValueEntry);
    });

    it('should handle special characters in names', async () => {
      const specialCharEntry = {
        sessionDate: '2024-01-15',
        quantity: 1,
        name: "Assassin's Dagger +1 (Keen)",
        notes: 'Found in goblin's lair',
        whoupdated: 1
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [specialCharEntry] });

      await Loot.create(specialCharEntry);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["Assassin's Dagger +1 (Keen)", 'Found in goblin\'s lair']),
        expect.any(String)
      );
    });

    it('should handle complex modids arrays', async () => {
      const complexModsEntry = {
        sessionDate: '2024-01-15',
        quantity: 1,
        name: 'Complex Item',
        modids: [1, 2, 3, 4, 5],
        whoupdated: 1
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [complexModsEntry] });

      await Loot.create(complexModsEntry);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([[1, 2, 3, 4, 5]]),
        expect.any(String)
      );
    });

    it('should handle zero quantities and values', async () => {
      const zeroValueEntry = {
        sessionDate: '2024-01-15',
        quantity: 0,
        name: 'Worthless Item',
        value: 0,
        whoupdated: 1
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [zeroValueEntry] });

      await Loot.create(zeroValueEntry);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([0, 0]),
        expect.any(String)
      );
    });
  });
});