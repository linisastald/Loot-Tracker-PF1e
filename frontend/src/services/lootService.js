import api from '../utils/api';

/**
 * Loot Service - Centralized API service for all loot-related operations
 * This service maps to the new refactored backend API structure
 */

const lootService = {
  // ===== Item Creation & Parsing =====
  
  /**
   * Parse item description using AI
   * @param {Object} data - { description: string }
   */
  parseItem: (data) => api.post('/item-creation/parse', data),
  
  /**
   * Create new loot item(s)
   * @param {Object} data - Item data or { entries: Array } for bulk
   */
  createLoot: (data) => {
    // Handle both single item and bulk creation
    const payload = data.entries ? data : { ...data };
    return api.post('/item-creation', payload);
  },
  
  /**
   * Create multiple loot items
   * @param {Array} items - Array of item objects
   */
  bulkCreateLoot: (items) => api.post('/item-creation/bulk', { items }),
  
  // ===== Item Retrieval & Search =====
  
  /**
   * Get all loot items with optional filters
   * @param {Object} params - Query parameters (isDM, activeCharacterId, etc.)
   */
  getAllLoot: (params = {}) => api.get('/items', { params }),
  
  /**
   * Search loot items
   * @param {Object} params - Search parameters
   */
  searchLoot: (params = {}) => api.get('/items/search', { params }),
  
  /**
   * Get loot item by ID
   * @param {number} id - Item ID
   */
  getLootById: (id) => api.get(`/items/${id}`),
  
  /**
   * Get items by IDs (for reference data)
   * @param {Array<number>} ids - Item IDs
   */
  getItemsByIds: (ids) => api.post('/item-creation/items/by-ids', { ids }),
  
  /**
   * Get mods by IDs
   * @param {Array<number>} ids - Mod IDs
   */
  getModsByIds: (ids) => api.post('/item-creation/mods/by-ids', { ids }),
  
  /**
   * Get all available mods
   * @param {Object} params - Filter parameters
   */
  getMods: (params = {}) => api.get('/item-creation/mods', { params }),
  
  // ===== Status & Management =====
  
  /**
   * Update loot item status (keep party/self, sell, trash)
   * @param {Object} data - { lootIds, status, characterId?, saleValue? }
   */
  updateLootStatus: (data) => api.patch('/items/status', data),
  
  /**
   * Update single loot item
   * @param {number} id - Item ID
   * @param {Object} data - Update data
   */
  updateLootItem: (id, data) => api.put(`/items/${id}`, data),
  
  /**
   * Split item stack
   * @param {Object} data - { lootId, newQuantities }
   */
  splitStack: (data) => {
    const { lootId, ...rest } = data;
    return api.post(`/items/${lootId}/split`, rest);
  },
  
  /**
   * Delete loot item
   * @param {number} id - Item ID
   */
  deleteLootItem: (id) => api.delete(`/items/${id}`),
  
  // ===== Reports & Statistics =====
  
  /**
   * Get party kept items
   * @param {Object} params - Query parameters
   */
  getKeptPartyLoot: (params = {}) => api.get('/reports/kept/party', { params }),
  
  /**
   * Get character kept items
   * @param {Object} params - Query parameters
   */
  getKeptCharacterLoot: (params = {}) => api.get('/reports/kept/character', { params }),
  
  /**
   * Get trashed items
   * @param {Object} params - Query parameters
   */
  getTrashedLoot: (params = {}) => api.get('/reports/trashed', { params }),
  
  /**
   * Get unprocessed count
   */
  getUnprocessedCount: () => api.get('/reports/unprocessed/count'),
  
  /**
   * Get character ledger
   * @param {Object} params - Query parameters
   */
  getCharacterLedger: (params = {}) => api.get('/reports/ledger', { params }),
  
  /**
   * Get loot statistics
   * @param {Object} params - Query parameters
   */
  getLootStatistics: (params = {}) => api.get('/reports/statistics', { params }),
  
  // ===== Sales Management =====
  
  /**
   * Get pending sale items
   * @param {Object} params - Query parameters
   */
  getPendingSaleItems: (params = {}) => api.get('/sales/pending', { params }),
  
  /**
   * Sell items up to amount
   * @param {Object} data - { amount }
   */
  sellUpTo: (data) => api.post('/sales/up-to', data),
  
  /**
   * Sell all except specified items
   * @param {Object} data - { itemsToKeep }
   */
  sellAllExcept: (data) => api.post('/sales/all-except', data),
  
  /**
   * Sell selected items
   * @param {Object} data - { itemsToSell }
   */
  sellSelected: (data) => api.post('/sales/selected', data),
  
  /**
   * Confirm sale
   * @param {Object} data - Sale confirmation data
   */
  confirmSale: (data) => api.put('/sales/confirm', data),
  
  // ===== Appraisal & Identification =====
  
  /**
   * Appraise loot items
   * @param {Object} data - { lootIds, characterId, appraisalRolls }
   */
  appraiseLoot: (data) => api.post('/appraisal', data),
  
  /**
   * Get unidentified items
   * @param {Object} params - Query parameters
   */
  getUnidentifiedItems: (params = {}) => api.get('/appraisal/unidentified', { params }),
  
  /**
   * Identify items
   * @param {Object} data - { itemIds, characterId, identifyResults }
   */
  identifyItems: (data) => api.post('/appraisal/identify', data),
  
  /**
   * Get item appraisals
   * @param {number} itemId - Item ID
   */
  getItemAppraisals: (itemId) => api.get(`/appraisal/item/${itemId}`),
  
  // ===== Utility Methods =====
  
  /**
   * Calculate item value
   * @param {Object} data - Value calculation parameters
   */
  calculateValue: (data) => api.post('/item-creation/calculate-value', data),
  
  /**
   * Get item suggestions for autocomplete
   * @param {Object} params - { query, limit }
   */
  suggestItems: (params) => api.get('/item-creation/items/suggest', { params }),
  
  /**
   * Get mod suggestions for autocomplete
   * @param {Object} params - { query, itemType, itemSubtype, limit }
   */
  suggestMods: (params) => api.get('/item-creation/mods/suggest', { params })
};

export default lootService;