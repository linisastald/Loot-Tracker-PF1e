/**
 * Tests for appraisalService
 * Tests the item appraisal calculations and custom rounding logic
 */

const AppraisalService = require('../../../backend/src/services/appraisalService');
const dbUtils = require('../../../backend/src/utils/dbUtils');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

describe('AppraisalService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset Math.random mock before each test
    jest.spyOn(Math, 'random').mockRestore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('customRounding', () => {
    describe('Hundredth rounding (15% chance)', () => {
      beforeEach(() => {
        // Mock Math.random to trigger hundredth rounding path
        jest.spyOn(Math, 'random')
          .mockReturnValueOnce(0.1) // < 0.15, triggers hundredth path
          .mockReturnValueOnce(0.5); // < 0.99, triggers adjustment
      });

      it('should round to nearest hundredth with adjustment', () => {
        const result = AppraisalService.customRounding(123.456);
        
        // Should round to hundredths and potentially adjust
        expect(result).toBeCloseTo(123.46, 2);
      });

      it('should handle small values correctly', () => {
        const result = AppraisalService.customRounding(0.123);
        
        expect(result).toBeLessThanOrEqual(1);
        expect(result).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Tenth rounding (25% chance)', () => {
      beforeEach(() => {
        // Mock Math.random to trigger tenth rounding path
        jest.spyOn(Math, 'random')
          .mockReturnValueOnce(0.3) // >= 0.15 and < 0.4, triggers tenth path
          .mockReturnValueOnce(0.5); // < 0.75, triggers adjustment
      });

      it('should round to nearest tenth with adjustment', () => {
        const result = AppraisalService.customRounding(123.456);
        
        // Should round to tenths and potentially adjust
        expect(result).toBeCloseTo(123.5, 1);
      });

      it('should handle edge cases at tenth boundaries', () => {
        const result = AppraisalService.customRounding(99.95);
        
        expect(result).toBeGreaterThanOrEqual(99);
        expect(result).toBeLessThanOrEqual(100.5);
      });
    });

    describe('Whole number rounding (60% chance)', () => {
      beforeEach(() => {
        // Mock Math.random to trigger whole number rounding path
        jest.spyOn(Math, 'random')
          .mockReturnValueOnce(0.8) // >= 0.4, triggers whole number path
          .mockReturnValueOnce(0.3); // < 0.5, triggers adjustment
      });

      it('should round to nearest whole number with adjustment', () => {
        const result = AppraisalService.customRounding(123.456);
        
        // Should round to whole number and potentially adjust
        expect(Number.isInteger(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(120);
        expect(result).toBeLessThanOrEqual(125);
      });

      it('should handle large values correctly', () => {
        const result = AppraisalService.customRounding(9999.99);
        
        expect(Number.isInteger(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(9995);
        expect(result).toBeLessThanOrEqual(10005);
      });
    });

    describe('Adjustment logic', () => {
      it('should apply negative adjustment for last digits <= 2', () => {
        // Mock to ensure whole number rounding with adjustment
        jest.spyOn(Math, 'random')
          .mockReturnValueOnce(0.8) // Whole number path
          .mockReturnValueOnce(0.3); // Trigger adjustment

        // Value that rounds to ending in 2
        const result = AppraisalService.customRounding(122.4);
        
        // Should adjust downward (remove the 2)
        expect(result % 10).toBeLessThanOrEqual(2);
      });

      it('should apply negative adjustment for last digits >= 8', () => {
        jest.spyOn(Math, 'random')
          .mockReturnValueOnce(0.8) // Whole number path
          .mockReturnValueOnce(0.3); // Trigger adjustment

        // Value that rounds to ending in 8
        const result = AppraisalService.customRounding(128.4);
        
        // Should adjust (likely to a 5 or remove the 8)
        expect(result).toBeGreaterThanOrEqual(120);
        expect(result).toBeLessThanOrEqual(130);
      });

      it('should apply 5-adjustment for middle digits', () => {
        jest.spyOn(Math, 'random')
          .mockReturnValueOnce(0.8) // Whole number path
          .mockReturnValueOnce(0.3); // Trigger adjustment

        // Value that rounds to ending in 3
        const result = AppraisalService.customRounding(123.4);
        
        // Should adjust towards 5 (123 + (5-3) = 125)
        expect(result).toBeGreaterThanOrEqual(120);
        expect(result).toBeLessThanOrEqual(130);
      });
    });

    describe('Random behavior consistency', () => {
      it('should produce different results with different random values', () => {
        const results = [];
        
        // Test multiple iterations with different random values
        for (let i = 0; i < 10; i++) {
          jest.spyOn(Math, 'random')
            .mockReturnValue(i / 10);
          
          results.push(AppraisalService.customRounding(100.5));
          jest.restoreAllMocks();
        }
        
        // Should have some variation in results
        const uniqueResults = new Set(results);
        expect(uniqueResults.size).toBeGreaterThan(1);
      });

      it('should handle zero and negative values', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.8);
        
        expect(AppraisalService.customRounding(0)).toBe(0);
        expect(AppraisalService.customRounding(-10.5)).toBeLessThanOrEqual(0);
      });
    });
  });

  describe('fetchAndProcessAppraisals', () => {
    const mockAppraisalsData = [
      {
        appraisal_id: 1,
        characterid: 1,
        believedvalue: '1500.00',
        appraisalroll: 25,
        character_name: 'Character 1',
        character_id: 1
      },
      {
        appraisal_id: 2,
        characterid: 2,
        believedvalue: '1200.00',
        appraisalroll: 18,
        character_name: 'Character 2',
        character_id: 2
      },
      {
        appraisal_id: 3,
        characterid: 3,
        believedvalue: '1800.00',
        appraisalroll: 30,
        character_name: 'Character 3',
        character_id: 3
      }
    ];

    beforeEach(() => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockAppraisalsData });
    });

    it('should fetch appraisals for a loot item', async () => {
      const result = await AppraisalService.fetchAndProcessAppraisals(1);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT a.id as appraisal_id'),
        [1]
      );
      expect(result.appraisals).toEqual(mockAppraisalsData);
    });

    it('should calculate average appraisal value correctly', async () => {
      const result = await AppraisalService.fetchAndProcessAppraisals(1);

      // Average of 1500, 1200, 1800 = 1500
      expect(result.average_appraisal).toBe(1500);
    });

    it('should handle decimal averages correctly', async () => {
      const mockDataWithDecimals = [
        { believedvalue: '100.50' },
        { believedvalue: '200.75' },
        { believedvalue: '150.25' }
      ];
      
      dbUtils.executeQuery.mockResolvedValue({ rows: mockDataWithDecimals });

      const result = await AppraisalService.fetchAndProcessAppraisals(1);

      // Average of 100.50, 200.75, 150.25 = 150.50
      expect(result.average_appraisal).toBe(150.5);
    });

    it('should handle items with no appraisals', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await AppraisalService.fetchAndProcessAppraisals(1);

      expect(result.appraisals).toEqual([]);
      expect(result.average_appraisal).toBeNull();
    });

    it('should handle null or zero believed values', async () => {
      const mockDataWithNulls = [
        { believedvalue: '100.00' },
        { believedvalue: null },
        { believedvalue: '0' },
        { believedvalue: '200.00' }
      ];
      
      dbUtils.executeQuery.mockResolvedValue({ rows: mockDataWithNulls });

      const result = await AppraisalService.fetchAndProcessAppraisals(1);

      // Average of 100, 0, 0, 200 = 75
      expect(result.average_appraisal).toBe(75);
    });

    it('should handle string number values correctly', async () => {
      const mockDataWithStrings = [
        { believedvalue: '1500.50' },
        { believedvalue: '999.99' }
      ];
      
      dbUtils.executeQuery.mockResolvedValue({ rows: mockDataWithStrings });

      const result = await AppraisalService.fetchAndProcessAppraisals(1);

      // Should parse strings to numbers correctly
      expect(result.average_appraisal).toBeCloseTo(1250.245, 2);
    });

    it('should round average to 2 decimal places', async () => {
      const mockDataForRounding = [
        { believedvalue: '100.333' },
        { believedvalue: '100.334' },
        { believedvalue: '100.335' }
      ];
      
      dbUtils.executeQuery.mockResolvedValue({ rows: mockDataForRounding });

      const result = await AppraisalService.fetchAndProcessAppraisals(1);

      // Average should be rounded to 2 decimal places
      expect(result.average_appraisal.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
      expect(result.average_appraisal).toBeCloseTo(100.33, 2);
    });

    it('should include character information in appraisals', async () => {
      const result = await AppraisalService.fetchAndProcessAppraisals(1);

      result.appraisals.forEach(appraisal => {
        expect(appraisal).toHaveProperty('character_name');
        expect(appraisal).toHaveProperty('character_id');
        expect(appraisal).toHaveProperty('appraisalroll');
        expect(appraisal).toHaveProperty('believedvalue');
      });
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(AppraisalService.fetchAndProcessAppraisals(1))
        .rejects.toThrow('Database connection failed');
    });

    it('should query with correct JOIN structure', async () => {
      await AppraisalService.fetchAndProcessAppraisals(1);

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('FROM appraisal a');
      expect(query).toContain('JOIN characters c ON a.characterid = c.id');
      expect(query).toContain('WHERE a.lootid = $1');
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete appraisal workflow', async () => {
      const mockAppraisals = [
        { believedvalue: '1234.567', appraisalroll: 20 },
        { believedvalue: '987.654', appraisalroll: 25 },
        { believedvalue: '2000.000', appraisalroll: 15 }
      ];
      
      dbUtils.executeQuery.mockResolvedValue({ rows: mockAppraisals });

      const result = await AppraisalService.fetchAndProcessAppraisals(1);

      // Verify appraisals are returned
      expect(result.appraisals).toEqual(mockAppraisals);
      
      // Verify average calculation
      const expectedAverage = (1234.567 + 987.654 + 2000.000) / 3;
      expect(result.average_appraisal).toBeCloseTo(expectedAverage, 2);
    });

    it('should handle mixed data types in believed values', async () => {
      const mixedData = [
        { believedvalue: 1500 }, // number
        { believedvalue: '1200.50' }, // string
        { believedvalue: null }, // null
        { believedvalue: undefined }, // undefined
        { believedvalue: 0 }, // zero
        { believedvalue: '0.00' } // string zero
      ];
      
      dbUtils.executeQuery.mockResolvedValue({ rows: mixedData });

      const result = await AppraisalService.fetchAndProcessAppraisals(1);

      // Should handle all types and calculate average
      expect(result.average_appraisal).toBeCloseTo(450.08, 2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle extremely large values', async () => {
      const largeValueData = [
        { believedvalue: '999999999.99' },
        { believedvalue: '1000000000.01' }
      ];
      
      dbUtils.executeQuery.mockResolvedValue({ rows: largeValueData });

      const result = await AppraisalService.fetchAndProcessAppraisals(1);

      expect(result.average_appraisal).toBeCloseTo(1000000000, 2);
    });

    it('should handle very small decimal values', async () => {
      const smallValueData = [
        { believedvalue: '0.001' },
        { believedvalue: '0.002' },
        { believedvalue: '0.003' }
      ];
      
      dbUtils.executeQuery.mockResolvedValue({ rows: smallValueData });

      const result = await AppraisalService.fetchAndProcessAppraisals(1);

      expect(result.average_appraisal).toBeCloseTo(0.002, 3);
    });

    it('should handle single appraisal correctly', async () => {
      const singleAppraisal = [
        { believedvalue: '1337.42' }
      ];
      
      dbUtils.executeQuery.mockResolvedValue({ rows: singleAppraisal });

      const result = await AppraisalService.fetchAndProcessAppraisals(1);

      expect(result.average_appraisal).toBe(1337.42);
    });

    it('should handle custom rounding with extreme values', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.1); // Trigger hundredth rounding

      expect(() => {
        AppraisalService.customRounding(999999999);
      }).not.toThrow();

      expect(() => {
        AppraisalService.customRounding(0.000001);
      }).not.toThrow();
    });
  });
});