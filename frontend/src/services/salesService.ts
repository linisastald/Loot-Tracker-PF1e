import api from '../utils/api';
import { LootItem } from '../types/game';

/**
 * Sales service for handling item sale calculations and operations
 */
export interface SaleCalculationItem {
  id: number;
  name: string;
  type: string;
  value: number;
  quantity: number;
  saleValue: number;
  totalSaleValue: number;
  canSell: boolean;
}

export interface SaleCalculationResult {
  items: SaleCalculationItem[];
  totalSaleValue: number;
  validCount: number;
  invalidCount: number;
  summary: {
    validTotal: number;
    invalidTotal: number;
  };
}

/**
 * Calculate sale values for items using the backend API.
 * Errors propagate; the api interceptor already logs them.
 * @param items Array of items to calculate sale values for
 * @returns Promise with calculation results
 */
export const calculateSaleValues = async (items: LootItem[]): Promise<SaleCalculationResult> => {
  const response = await api.post('/sales/calculate', { items });
  return response.data;
};

/**
 * Calculate total sale value for multiple items using the backend API
 * @param items Array of items to calculate total for
 * @returns Promise with the total sale value
 */
export const calculateTotalSaleValue = async (items: LootItem[]): Promise<number> => {
  const result = await calculateSaleValues(items);
  return result.totalSaleValue;
};
