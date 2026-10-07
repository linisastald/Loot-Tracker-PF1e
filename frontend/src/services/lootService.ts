import api from '../utils/api';
import { ApiResponse, LootItem, LootStatus, ItemType } from '../types/game';

/**
 * Loot Service - Centralized API service for all loot-related operations
 * This service maps to the new refactored backend API structure
 */

interface ItemParsingData {
  description: string;
}

interface BulkCreateData {
  entries?: LootItem[];
  items?: Partial<LootItem>[];
}

interface LootSearchParams {
  isDM?: boolean;
  activeCharacterId?: number;
  status?: LootStatus;
  type?: ItemType;
  character?: string;
  [key: string]: any;
}

interface StatusUpdateData {
  lootIds: number[];
  status: LootStatus;
  characterId?: number;
  saleValue?: number | null;
}

interface SplitStackData {
  lootId: number;
  newQuantities: Array<{ quantity: number }>;
}

interface AppraisalData {
  lootIds: number[];
  characterId: number;
  /** One d20 roll (1-20) per entry in lootIds, in the same order. */
  appraisalRolls: number[];
}

interface IdentificationData {
  items: number[];
  characterId: number | null;
  /**
   * The character's Spellcraft bonus (whole number, -10 to 60). The server rolls
   * the d20; the client never sends a roll or a total. Omitted for a DM identification.
   */
  spellcraftBonus?: number;
  /** DM intent: identify without a roll. Only honoured by the server for DMs. */
  dmIdentify?: boolean;
}

// Matches the backend contract for POST /item-creation/calculate-value
// (ItemParsingService.calculateItemValue -> calculateFinalValue). `mods` is a
// list of mod references by id; the backend fetches each mod's plus/valuecalc.
interface ValueCalculationData {
  itemId?: number | null;
  itemType?: ItemType | string | null;
  itemSubtype?: string | null;
  itemValue?: number | null;
  isMasterwork?: boolean;
  mods?: Array<{ id: number }>;
  charges?: number | null;
  size?: string | null;
  weight?: number | null;
}

interface SuggestionParams {
  query: string;
  limit?: number;
  itemType?: ItemType;
  itemSubtype?: string;
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
   * Get items by IDs (for reference data)
   */
  getItemsByIds: (ids: number[]): Promise<ApiResponse> =>
    api.post('/item-creation/items/by-ids', { itemIds: ids }),

  /**
   * Get mods by IDs
   */
  getModsByIds: (ids: number[]): Promise<ApiResponse> =>
    api.post('/item-creation/mods/by-ids', { modIds: ids }),

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
  ): Promise<ApiResponse> => api.put(`/items/dm-update/${id}`, data),

  /**
   * Split item stack
   */
  splitStack: (data: SplitStackData): Promise<ApiResponse> => {
    const { lootId, ...rest } = data;
    return api.post(`/items/${lootId}/split`, rest);
  },

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
  sellUpTo: (data: { maxAmount: number }): Promise<ApiResponse> =>
    api.post('/sales/up-to', data),

  /**
   * Sell all except specified items
   */
  sellAllExcept: (data: { keepIds: number[] }): Promise<ApiResponse> =>
    api.post('/sales/all-except', data),

  /**
   * Sell selected items
   */
  sellSelected: (data: { itemIds: number[] }): Promise<ApiResponse> =>
    api.post('/sales/selected', data),

  /**
   * Confirm sale
   */
  confirmSale: (data: Record<string, any>): Promise<ApiResponse> =>
    api.post('/sales/confirm', data),

  // ===== Appraisal & Identification =====

  /**
   * Appraise loot items
   */
  appraiseLoot: (data: AppraisalData): Promise<ApiResponse> =>
    api.post('/appraisal/appraise', data),

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
};

export default lootService;
