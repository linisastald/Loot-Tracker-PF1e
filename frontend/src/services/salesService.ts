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
 * Calculate sale values for items using the backend API
 * @param items Array of items to calculate sale values for
 * @returns Promise with calculation results
 */
export const calculateSaleValues = async (items: LootItem[]): Promise<SaleCalculationResult> => {
  try {
    const response = await api.post('/sales/calculate', { items });
    return response.data;
  } catch (error) {
    console.error('Error calculating sale values:', error);
    throw error;
  }
};

/**
 * Calculate sale value for a single item using the backend API
 * @param item Single item to calculate sale value for
 * @returns Promise with the item's sale value
 */
export const calculateItemSaleValue = async (item: LootItem): Promise<number> => {
  try {
    const result = await calculateSaleValues([item]);
    return result.items[0]?.saleValue || 0;
  } catch (error) {
    console.error('Error calculating item sale value:', error);
    throw error;
  }
};

/**
 * Calculate total sale value for multiple items using the backend API
 * @param items Array of items to calculate total for
 * @returns Promise with the total sale value
 */
export const calculateTotalSaleValue = async (items: LootItem[]): Promise<number> => {
  try {
    const result = await calculateSaleValues(items);
    return result.totalSaleValue;
  } catch (error) {
    console.error('Error calculating total sale value:', error);
    throw error;
  }
};