/**
 * Mock lootService for testing
 */
const lootService = {
  // Item Creation & Parsing
  parseItem: jest.fn(),
  createLoot: jest.fn(),
  bulkCreateLoot: jest.fn(),
  
  // Item Retrieval & Search
  getAllLoot: jest.fn(),
  searchLoot: jest.fn(),
  getLootById: jest.fn(),
  getItemsByIds: jest.fn(),
  getModsByIds: jest.fn(),
  getMods: jest.fn(),
  
  // Status & Management
  updateLootStatus: jest.fn(),
  updateLootItem: jest.fn(),
  splitStack: jest.fn(),
  deleteLootItem: jest.fn(),
  
  // Reports & Statistics
  getKeptPartyLoot: jest.fn(),
  getKeptCharacterLoot: jest.fn(),
  getTrashedLoot: jest.fn(),
  getUnprocessedCount: jest.fn(),
  getCharacterLedger: jest.fn(),
  getLootStatistics: jest.fn(),
  
  // Sales Management
  getPendingSaleItems: jest.fn(),
  sellUpTo: jest.fn(),
  sellAllExcept: jest.fn(),
  sellSelected: jest.fn(),
  confirmSale: jest.fn(),
  
  // Appraisal & Identification
  appraiseLoot: jest.fn(),
  getUnidentifiedItems: jest.fn(),
  identifyItems: jest.fn(),
  getItemAppraisals: jest.fn(),
  
  // Utility Methods
  calculateValue: jest.fn(),
  suggestItems: jest.fn(),
  suggestMods: jest.fn()
};

export default lootService;