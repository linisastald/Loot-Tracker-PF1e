import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api before importing the service
vi.mock('../../utils/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({
      data: {
        items: [],
        totalSaleValue: 0,
        validCount: 0,
        invalidCount: 0,
        summary: { validTotal: 0, invalidTotal: 0 },
      },
    }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import api from '../../utils/api';
import { calculateSaleValues } from '../salesService';

// Factory for mock LootItem data
const createMockItem = (overrides: Record<string, any> = {}) => ({
  id: 1,
  name: 'Longsword',
  type: 'Weapon',
  value: 100,
  quantity: 1,
  ...overrides,
});

describe('salesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateSaleValues', () => {
    it('should POST to /sales/calculate with items array', async () => {
      const items = [createMockItem(), createMockItem({ id: 2, name: 'Shield' })];
      await calculateSaleValues(items as any);

      expect(api.post).toHaveBeenCalledWith('/sales/calculate', { items });
    });

    it('should return the response data', async () => {
      const mockResult = {
        items: [
          {
            id: 1,
            name: 'Longsword',
            type: 'Weapon',
            value: 100,
            quantity: 1,
            saleValue: 50,
            totalSaleValue: 50,
            canSell: true,
          },
        ],
        totalSaleValue: 50,
        validCount: 1,
        invalidCount: 0,
        summary: { validTotal: 50, invalidTotal: 0 },
      };
      vi.mocked(api.post).mockResolvedValueOnce({ data: mockResult });

      const result = await calculateSaleValues([createMockItem()] as any);
      expect(result).toEqual(mockResult);
    });

    it('should handle empty items array', async () => {
      const emptyResult = {
        items: [],
        totalSaleValue: 0,
        validCount: 0,
        invalidCount: 0,
        summary: { validTotal: 0, invalidTotal: 0 },
      };
      vi.mocked(api.post).mockResolvedValueOnce({ data: emptyResult });

      const result = await calculateSaleValues([] as any);
      expect(api.post).toHaveBeenCalledWith('/sales/calculate', { items: [] });
      expect(result).toEqual(emptyResult);
    });

    it('should propagate API errors', async () => {
      const error = new Error('Server Error');
      vi.mocked(api.post).mockRejectedValueOnce(error);

      await expect(calculateSaleValues([createMockItem()] as any)).rejects.toThrow('Server Error');
    });

    it('should handle multiple items with mixed sellability', async () => {
      const items = [
        createMockItem({ id: 1, name: 'Longsword', value: 100 }),
        createMockItem({ id: 2, name: 'Quest Item', value: 0 }),
      ];
      const mockResult = {
        items: [
          { id: 1, name: 'Longsword', saleValue: 50, canSell: true, type: 'Weapon', value: 100, quantity: 1, totalSaleValue: 50 },
          { id: 2, name: 'Quest Item', saleValue: 0, canSell: false, type: 'Weapon', value: 0, quantity: 1, totalSaleValue: 0 },
        ],
        totalSaleValue: 50,
        validCount: 1,
        invalidCount: 1,
        summary: { validTotal: 50, invalidTotal: 0 },
      };
      vi.mocked(api.post).mockResolvedValueOnce({ data: mockResult });

      const result = await calculateSaleValues(items as any);
      expect(result.validCount).toBe(1);
      expect(result.invalidCount).toBe(1);
    });
  });

});
