import api from '../utils/api';
import { LootItem, LootStatus, ItemType } from '../types/game';

/**
 * Loot Service - Centralized API service for all loot-related operations
 * This service maps to the new refactored backend API structure
 */

// API Response types
export interface ApiResponse<T = any> {
  data: T;
  status: number;
}

export interface ItemParsingData {
  description: string;
}

export interface BulkCreateData {
  entries?: LootItem[];
  items?: Partial<LootItem>[];
}

export interface LootSearchParams {
  isDM?: boolean;
  activeCharacterId?: number;
  status?: LootStatus;
  type?: ItemType;
  character?: string;
  [key: string]: any;
}

export interface StatusUpdateData {
  lootIds: number[];
  status: LootStatus;
  characterId?: number;
  saleValue?: number | null;
}

export interface SplitStackData {
  lootId: number;
  newQuantities: Array<{ quantity: number }>;
}

export interface AppraisalData {
  lootIds: number[];
  characterId: number;
  appraisalRolls: Array<{
    lootId: number;
    roll: number;
    believedValue?: number;
  }>;
}

export interface IdentificationData {
  items: number[];
  characterId: number | null;
  spellcraftRolls: number[];
}

export interface ValueCalculationData {
  baseValue?: number;
  itemType?: ItemType;
  modifications?: Array<{ type: string; value: number }>;
}

export interface SuggestionParams {
  query: string;
  limit?: number;
  itemType?: ItemType;
  itemSubtype?: string;
}

export interface SalesData {
  amount?: number;
  itemsToKeep?: number[];
  itemsToSell?: number[];
}

const lootService = {
  // ===== Item Creation & Parsing =====

  /**
   * Parse item description using AI
   */
  parseItem: (data: ItemParsingData): Promise<ApiResponse> =>
    api.post('/item-creation/parse', data),

  /**
   * Create new loot item(s)
   */
  createLoot: (
    data: Partial<LootItem> | BulkCreateData
  ): Promise<ApiResponse> => {
    // Handle both single item and bulk creation
    const payload = 'entries' in data ? data : { ...data };
    return api.post('/item-creation', payload);
  },

  /**
   * Create multiple loot items
   */
  bulkCreateLoot: (items: Partial<LootItem>[]): Promise<ApiResponse> =>
    api.post('/item-creation/bulk', { items }),

  // ===== Item Retrieval & Search =====

  /**
   * Get all loot items with optional filters
   */
  getAllLoot: (params: LootSearchParams = {}): Promise<ApiResponse> =>
    api.get('/items', { params }),

  /**
   * Search loot items
   */
  searchLoot: (params: LootSearchParams = {}): Promise<ApiResponse> =>
    api.get('/items/search', { params }),

  /**
   * Get loot item by ID
   */
  getLootById: (id: number): Promise<ApiResponse> => api.get(`/items/${id}`),

  /**
   * Get items by IDs (for reference data)
   */
  getItemsByIds: (ids: number[]): Promise<ApiResponse> =>
    api.post('/item-creation/items/by-ids', { itemIds: ids }),

  /**
   * Get mods by IDs
   */
  getModsByIds: (ids: number[]): Promise<ApiResponse> =>
    api.post('/item-creation/mods/by-ids', { ids }),

  /**
   * Get all available mods
   */
  getMods: (params: Record<string, any> = {}): Promise<ApiResponse> =>
    api.get('/item-creation/mods', { params }),

  // ===== Status & Management =====

  /**
   * Update loot item status (keep party/self, sell, trash)
   */
  updateLootStatus: (data: StatusUpdateData): Promise<ApiResponse> =>
    api.patch('/items/status', data),

  /**
   * Update single loot item
   */
  updateLootItem: (id: number, data: Partial<LootItem>): Promise<ApiResponse> =>
    api.put(`/items/${id}`, data),

  /**
   * Update loot item as DM (allows additional fields)
   */
  updateLootItemAsDM: (
    id: number,
    data: Partial<LootItem>
  ): Promise<ApiResponse> => api.put(`/loot/dm-update/${id}`, data),

  /**
   * Split item stack
   */
  splitStack: (data: SplitStackData): Promise<ApiResponse> => {
    const { lootId, ...rest } = data;
    return api.post(`/items/${lootId}/split`, rest);
  },

  /**
   * Delete loot item
   */
  deleteLootItem: (id: number): Promise<ApiResponse> =>
    api.delete(`/items/${id}`),

  // ===== Reports & Statistics =====

  /**
   * Get party kept items
   */
  getKeptPartyLoot: (params: Record<string, any> = {}): Promise<ApiResponse> =>
    api.get('/reports/kept/party', { params }),

  /**
   * Get character kept items
   */
  getKeptCharacterLoot: (
    params: Record<string, any> = {}
  ): Promise<ApiResponse> => api.get('/reports/kept/character', { params }),

  /**
   * Get trashed items
   */
  getTrashedLoot: (params: Record<string, any> = {}): Promise<ApiResponse> =>
    api.get('/reports/trashed', { params }),

  /**
   * Get unidentified count
   */
  getUnidentifiedCount: (): Promise<ApiResponse> =>
    api.get('/reports/unidentified/count'),

  /**
   * Get unprocessed count
   */
  getUnprocessedCount: (): Promise<ApiResponse> =>
    api.get('/reports/unprocessed/count'),

  /**
   * Get character ledger
   */
  getCharacterLedger: (
    params: Record<string, any> = {}
  ): Promise<ApiResponse> => api.get('/reports/ledger', { params }),

  /**
   * Get loot statistics
   */
  getLootStatistics: (params: Record<string, any> = {}): Promise<ApiResponse> =>
    api.get('/reports/statistics', { params }),

  // ===== Sales Management =====

  /**
   * Get pending sale items
   */
  getPendingSaleItems: (
    params: Record<string, any> = {}
  ): Promise<ApiResponse> => api.get('/sales/pending', { params }),

  /**
   * Sell items up to amount
   */
  sellUpTo: (data: { amount: number }): Promise<ApiResponse> =>
    api.post('/sales/up-to', data),

  /**
   * Sell all except specified items
   */
  sellAllExcept: (data: { itemsToKeep: number[] }): Promise<ApiResponse> =>
    api.post('/sales/all-except', data),

  /**
   * Sell selected items
   */
  sellSelected: (data: { itemsToSell: number[] }): Promise<ApiResponse> =>
    api.post('/sales/selected', data),

  /**
   * Confirm sale
   */
  confirmSale: (data: Record<string, any>): Promise<ApiResponse> =>
    api.put('/sales/confirm', data),

  // ===== Appraisal & Identification =====

  /**
   * Appraise loot items
   */
  appraiseLoot: (data: AppraisalData): Promise<ApiResponse> =>
    api.post('/appraisal', data),

  /**
   * Get unidentified items
   */
  getUnidentifiedItems: (
    params: Record<string, any> = {}
  ): Promise<ApiResponse> => api.get('/appraisal/unidentified', { params }),

  /**
   * Identify items
   */
  identifyItems: (data: IdentificationData): Promise<ApiResponse> =>
    api.post('/appraisal/identify', data),

  /**
   * Get item appraisals
   */
  getItemAppraisals: (itemId: number): Promise<ApiResponse> =>
    api.get(`/appraisal/item/${itemId}`),

  // ===== Utility Methods =====

  /**
   * Calculate item value
   */
  calculateValue: (data: ValueCalculationData): Promise<ApiResponse> =>
    api.post('/item-creation/calculate-value', data),

  /**
   * Get item suggestions for autocomplete
   */
  suggestItems: (params: SuggestionParams): Promise<ApiResponse> =>
    api.get('/item-creation/items/suggest', { params }),

  /**
   * Get mod suggestions for autocomplete
   */
  suggestMods: (params: SuggestionParams): Promise<ApiResponse> =>
    api.get('/item-creation/mods/suggest', { params }),
};

export default lootService;
