/**
 * Tests for Appraisal Model
 * Tests appraisal database operations and business logic
 */

const Appraisal = require('../../../backend/src/models/Appraisal');
const dbUtils = require('../../../backend/src/utils/dbUtils');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');

describe('Appraisal Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const validAppraisal = {
      characterid: 1,
      lootid: 5,
      appraisalroll: 18,
      believedvalue: 750.50
    };

    const mockCreatedAppraisal = {
      id: 1,
      ...validAppraisal,
      created_at: '2024-01-15T10:00:00Z'
    };

    it('should create an appraisal successfully', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockCreatedAppraisal] });

      const result = await Appraisal.create(validAppraisal);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO appraisal'),
        [1, 5, 18, 750.50],
        'Error creating appraisal'
      );
      expect(result).toEqual(mockCreatedAppraisal);
    });

    it('should validate required characterid field', async () => {
      const invalidAppraisal = {
        lootid: 5,
        appraisalroll: 18,
        believedvalue: 750.50
      };

      await expect(Appraisal.create(invalidAppraisal)).rejects.toThrow(
        'Character ID and Loot ID are required'
      );

      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should validate required lootid field', async () => {
      const invalidAppraisal = {
        characterid: 1,
        appraisalroll: 18,
        believedvalue: 750.50
      };

      await expect(Appraisal.create(invalidAppraisal)).rejects.toThrow(
        'Character ID and Loot ID are required'
      );

      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });

    it('should handle null characterid', async () => {
      const invalidAppraisal = {
        characterid: null,
        lootid: 5,
        appraisalroll: 18,
        believedvalue: 750.50
      };

      await expect(Appraisal.create(invalidAppraisal)).rejects.toThrow(
        'Character ID and Loot ID are required'
      );
    });

    it('should handle null lootid', async () => {
      const invalidAppraisal = {
        characterid: 1,
        lootid: null,
        appraisalroll: 18,
        believedvalue: 750.50
      };

      await expect(Appraisal.create(invalidAppraisal)).rejects.toThrow(
        'Character ID and Loot ID are required'
      );
    });

    it('should handle zero characterid as invalid', async () => {
      const invalidAppraisal = {
        characterid: 0,
        lootid: 5,
        appraisalroll: 18,
        believedvalue: 750.50
      };

      await expect(Appraisal.create(invalidAppraisal)).rejects.toThrow(
        'Character ID and Loot ID are required'
      );
    });

    it('should handle zero lootid as invalid', async () => {
      const invalidAppraisal = {
        characterid: 1,
        lootid: 0,
        appraisalroll: 18,
        believedvalue: 750.50
      };

      await expect(Appraisal.create(invalidAppraisal)).rejects.toThrow(
        'Character ID and Loot ID are required'
      );
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(Appraisal.create(validAppraisal)).rejects.toThrow('Database connection failed');
    });

    it('should handle missing optional fields', async () => {
      const minimalAppraisal = {
        characterid: 1,
        lootid: 5
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1, ...minimalAppraisal }] });

      const result = await Appraisal.create(minimalAppraisal);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [1, 5, undefined, undefined],
        'Error creating appraisal'
      );
      expect(result).toEqual({ id: 1, ...minimalAppraisal });
    });

    it('should handle decimal believed values', async () => {
      const decimalAppraisal = {
        characterid: 1,
        lootid: 5,
        appraisalroll: 15,
        believedvalue: 123.45
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1, ...decimalAppraisal }] });

      await Appraisal.create(decimalAppraisal);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [1, 5, 15, 123.45],
        'Error creating appraisal'
      );
    });

    it('should handle very large believed values', async () => {
      const largeValueAppraisal = {
        characterid: 1,
        lootid: 5,
        appraisalroll: 20,
        believedvalue: 999999.99
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1, ...largeValueAppraisal }] });

      await Appraisal.create(largeValueAppraisal);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [1, 5, 20, 999999.99],
        'Error creating appraisal'
      );
    });
  });

  describe('getByLootId', () => {
    const mockAppraisals = [
      {
        id: 1,
        characterid: 1,
        lootid: 5,
        appraisalroll: 18,
        believedvalue: 750.50,
        character_name: 'Alice'
      },
      {
        id: 2,
        characterid: 2,
        lootid: 5,
        appraisalroll: 15,
        believedvalue: 680.00,
        character_name: 'Bob'
      }
    ];

    it('should retrieve appraisals for a loot item', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockAppraisals });

      const result = await Appraisal.getByLootId(5);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN characters c ON a.characterid = c.id'),
        [5],
        'Error fetching appraisals by loot ID'
      );
      expect(result).toEqual(mockAppraisals);
    });

    it('should handle loot item with no appraisals', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Appraisal.getByLootId(999);

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Query failed'));

      await expect(Appraisal.getByLootId(5)).rejects.toThrow('Query failed');
    });

    it('should include character names in results', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockAppraisals });

      const result = await Appraisal.getByLootId(5);

      expect(result[0]).toHaveProperty('character_name', 'Alice');
      expect(result[1]).toHaveProperty('character_name', 'Bob');
    });

    it('should handle null character names', async () => {
      const appraisalsWithNullName = [
        {
          id: 1,
          characterid: 1,
          lootid: 5,
          appraisalroll: 18,
          believedvalue: 750.50,
          character_name: null
        }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: appraisalsWithNullName });

      const result = await Appraisal.getByLootId(5);

      expect(result[0]).toHaveProperty('character_name', null);
    });

    it('should order results consistently', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockAppraisals });

      await Appraisal.getByLootId(5);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.lootid = $1'),
        [5],
        'Error fetching appraisals by loot ID'
      );
    });
  });

  describe('getAverageByLootId', () => {
    it('should calculate average appraisal value', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ average: '715.25' }]
      });

      const result = await Appraisal.getAverageByLootId(5);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('AVG(believedvalue)'),
        [5],
        'Error calculating average appraisal'
      );
      expect(result).toBe(715.25);
    });

    it('should return null when no appraisals exist', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ average: null }]
      });

      const result = await Appraisal.getAverageByLootId(999);

      expect(result).toBeNull();
    });

    it('should return null when no rows returned', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Appraisal.getAverageByLootId(999);

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Average calculation failed'));

      await expect(Appraisal.getAverageByLootId(5)).rejects.toThrow('Average calculation failed');
    });

    it('should parse numeric strings correctly', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ average: '1234.5678' }]
      });

      const result = await Appraisal.getAverageByLootId(5);

      expect(result).toBe(1234.5678);
    });

    it('should handle zero average', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ average: '0' }]
      });

      const result = await Appraisal.getAverageByLootId(5);

      expect(result).toBe(0);
    });

    it('should handle very small decimal averages', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ average: '0.01' }]
      });

      const result = await Appraisal.getAverageByLootId(5);

      expect(result).toBe(0.01);
    });

    it('should handle very large averages', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ average: '999999.99' }]
      });

      const result = await Appraisal.getAverageByLootId(5);

      expect(result).toBe(999999.99);
    });
  });

  describe('updateValue', () => {
    const mockUpdatedAppraisal = {
      id: 1,
      characterid: 1,
      lootid: 5,
      appraisalroll: 18,
      believedvalue: 800.00
    };

    it('should update appraisal believed value', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockUpdatedAppraisal] });

      const result = await Appraisal.updateValue(1, 800.00);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE appraisal SET believedvalue = $1'),
        [800.00, 1],
        'Error updating appraisal value'
      );
      expect(result).toEqual(mockUpdatedAppraisal);
    });

    it('should handle zero believed value', async () => {
      const zeroValueAppraisal = {
        ...mockUpdatedAppraisal,
        believedvalue: 0
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [zeroValueAppraisal] });

      const result = await Appraisal.updateValue(1, 0);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [0, 1],
        'Error updating appraisal value'
      );
      expect(result.believedvalue).toBe(0);
    });

    it('should handle decimal believed values', async () => {
      const decimalAppraisal = {
        ...mockUpdatedAppraisal,
        believedvalue: 123.45
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [decimalAppraisal] });

      await Appraisal.updateValue(1, 123.45);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [123.45, 1],
        'Error updating appraisal value'
      );
    });

    it('should handle negative believed values', async () => {
      const negativeAppraisal = {
        ...mockUpdatedAppraisal,
        believedvalue: -50.00
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [negativeAppraisal] });

      await Appraisal.updateValue(1, -50.00);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [-50.00, 1],
        'Error updating appraisal value'
      );
    });

    it('should handle very large believed values', async () => {
      const largeAppraisal = {
        ...mockUpdatedAppraisal,
        believedvalue: 999999.99
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [largeAppraisal] });

      await Appraisal.updateValue(1, 999999.99);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [999999.99, 1],
        'Error updating appraisal value'
      );
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Update failed'));

      await expect(Appraisal.updateValue(1, 800.00)).rejects.toThrow('Update failed');
    });

    it('should handle non-existent appraisal ID', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Appraisal.updateValue(999, 800.00);

      expect(result).toBeUndefined();
    });

    it('should return updated record with RETURNING clause', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockUpdatedAppraisal] });

      await Appraisal.updateValue(1, 800.00);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('RETURNING *'),
        [800.00, 1],
        'Error updating appraisal value'
      );
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle concurrent appraisal creation', async () => {
      const appraisal1 = {
        characterid: 1,
        lootid: 5,
        appraisalroll: 18,
        believedvalue: 750.50
      };

      const appraisal2 = {
        characterid: 2,
        lootid: 5,
        appraisalroll: 15,
        believedvalue: 680.00
      };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, ...appraisal1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 2, ...appraisal2 }] });

      const [result1, result2] = await Promise.all([
        Appraisal.create(appraisal1),
        Appraisal.create(appraisal2)
      ]);

      expect(result1.id).toBe(1);
      expect(result2.id).toBe(2);
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
    });

    it('should handle database constraint violations', async () => {
      const invalidAppraisal = {
        characterid: 1,
        lootid: 999, // Non-existent loot ID
        appraisalroll: 18,
        believedvalue: 750.50
      };

      dbUtils.executeQuery.mockRejectedValue(new Error('foreign key constraint violation'));

      await expect(Appraisal.create(invalidAppraisal)).rejects.toThrow('foreign key constraint violation');
    });

    it('should handle database connection timeouts', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Connection timeout'));

      await expect(Appraisal.getByLootId(5)).rejects.toThrow('Connection timeout');
    });

    it('should handle malformed database responses', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: null });

      await expect(Appraisal.getByLootId(5)).rejects.toThrow();
    });

    it('should handle extremely long character names', async () => {
      const longNameAppraisal = {
        id: 1,
        characterid: 1,
        lootid: 5,
        appraisalroll: 18,
        believedvalue: 750.50,
        character_name: 'A'.repeat(1000) // Very long name
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [longNameAppraisal] });

      const result = await Appraisal.getByLootId(5);

      expect(result[0].character_name).toBe('A'.repeat(1000));
    });

    it('should handle floating point precision in averages', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ average: '123.456789012345' }]
      });

      const result = await Appraisal.getAverageByLootId(5);

      expect(result).toBe(123.456789012345);
    });
  });
});