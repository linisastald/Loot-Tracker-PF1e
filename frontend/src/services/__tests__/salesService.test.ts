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
import {
  calculateSaleValues,
  calculateItemSaleValue,
  calculateTotalSaleValue,
} from '../salesService';

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

  describe('calculateItemSaleValue', () => {
    it('should call calculateSaleValues with a single-item array', async () => {
      const item = createMockItem({ value: 200 });
      const mockResult = {
        items: [{ id: 1, saleValue: 100, canSell: true, name: 'Longsword', type: 'Weapon', value: 200, quantity: 1, totalSaleValue: 100 }],
        totalSaleValue: 100,
        validCount: 1,
        invalidCount: 0,
        summary: { validTotal: 100, invalidTotal: 0 },
      };
      vi.mocked(api.post).mockResolvedValueOnce({ data: mockResult });

      const result = await calculateItemSaleValue(item as any);
      expect(api.post).toHaveBeenCalledWith('/sales/calculate', { items: [item] });
      expect(result).toBe(100);
    });

    it('should return 0 when items array in response is empty', async () => {
      const emptyResult = {
        items: [],
        totalSaleValue: 0,
        validCount: 0,
        invalidCount: 0,
        summary: { validTotal: 0, invalidTotal: 0 },
      };
      vi.mocked(api.post).mockResolvedValueOnce({ data: emptyResult });

      const result = await calculateItemSaleValue(createMockItem() as any);
      expect(result).toBe(0);
    });

    it('should return 0 when item saleValue is 0', async () => {
      const mockResult = {
        items: [{ id: 1, saleValue: 0, canSell: false, name: 'Junk', type: 'Misc', value: 0, quantity: 1, totalSaleValue: 0 }],
        totalSaleValue: 0,
        validCount: 0,
        invalidCount: 1,
        summary: { validTotal: 0, invalidTotal: 0 },
      };
      vi.mocked(api.post).mockResolvedValueOnce({ data: mockResult });

      const result = await calculateItemSaleValue(createMockItem({ value: 0 }) as any);
      expect(result).toBe(0);
    });

    it('should propagate API errors', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new Error('Network Failure'));
      await expect(calculateItemSaleValue(createMockItem() as any)).rejects.toThrow('Network Failure');
    });
  });

  describe('calculateTotalSaleValue', () => {
    it('should return totalSaleValue from the response', async () => {
      const items = [
        createMockItem({ id: 1, value: 100 }),
        createMockItem({ id: 2, value: 200 }),
      ];
      const mockResult = {
        items: [
          { id: 1, saleValue: 50, canSell: true, name: 'A', type: 'Weapon', value: 100, quantity: 1, totalSaleValue: 50 },
          { id: 2, saleValue: 100, canSell: true, name: 'B', type: 'Weapon', value: 200, quantity: 1, totalSaleValue: 100 },
        ],
        totalSaleValue: 150,
        validCount: 2,
        invalidCount: 0,
        summary: { validTotal: 150, invalidTotal: 0 },
      };
      vi.mocked(api.post).mockResolvedValueOnce({ data: mockResult });

      const result = await calculateTotalSaleValue(items as any);
      expect(result).toBe(150);
    });

    it('should POST to /sales/calculate with all items', async () => {
      const items = [createMockItem({ id: 1 }), createMockItem({ id: 2 })];
      await calculateTotalSaleValue(items as any);

      expect(api.post).toHaveBeenCalledWith('/sales/calculate', { items });
    });

    it('should propagate API errors', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new Error('Timeout'));
      await expect(calculateTotalSaleValue([createMockItem()] as any)).rejects.toThrow('Timeout');
    });
  });
});
