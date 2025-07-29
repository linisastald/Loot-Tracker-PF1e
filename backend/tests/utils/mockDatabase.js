/**
 * Mock Database for Backend Unit Tests
 * Provides database mocking capabilities to avoid real database connections
 */

const EventEmitter = require('events');

class MockQuery extends EventEmitter {
  constructor(result) {
    super();
    this.result = result;
  }

  // Simulate async query behavior
  async then(resolve) {
    return resolve(this.result);
  }
}

class MockPool extends EventEmitter {
  constructor() {
    super();
    this.connected = true;
    this.totalCount = 0;
    this.idleCount = 0;
    this.waitingCount = 0;
  }

  // Mock query method
  query(text, params) {
    // Parse query to determine mock response
    const queryType = this.parseQueryType(text);
    const mockResult = this.getMockResult(queryType, text, params);
    
    return new MockQuery(mockResult);
  }

  // Mock connect method
  async connect() {
    return {
      query: this.query.bind(this),
      release: () => {},
    };
  }

  // Mock end method
  async end() {
    this.connected = false;
    return Promise.resolve();
  }

  // Parse SQL query to determine type
  parseQueryType(text) {
    const sql = text.trim().toLowerCase();
    
    if (sql.startsWith('select now()')) return 'health_check';
    if (sql.startsWith('select')) return 'select';
    if (sql.startsWith('insert')) return 'insert';
    if (sql.startsWith('update')) return 'update';
    if (sql.startsWith('delete')) return 'delete';
    if (sql.includes('create table')) return 'create_table';
    if (sql.includes('drop table')) return 'drop_table';
    
    return 'unknown';
  }

  // Generate mock results based on query type
  getMockResult(queryType, text, params = []) {
    switch (queryType) {
      case 'health_check':
        return {
          rows: [{ now: new Date().toISOString() }],
          rowCount: 1,
          command: 'SELECT',
          fields: [{ name: 'now', dataTypeID: 1184 }]
        };

      case 'select':
        return this.getMockSelectResult(text, params);

      case 'insert':
        return {
          rows: [{ id: Math.floor(Math.random() * 1000) + 1 }],
          rowCount: 1,
          command: 'INSERT',
          fields: [{ name: 'id', dataTypeID: 23 }]
        };

      case 'update':
        return {
          rows: [],
          rowCount: 1,
          command: 'UPDATE',
          fields: []
        };

      case 'delete':
        return {
          rows: [],
          rowCount: 1,
          command: 'DELETE',
          fields: []
        };

      case 'create_table':
      case 'drop_table':
        return {
          rows: [],
          rowCount: 0,
          command: queryType.toUpperCase().replace('_', ' '),
          fields: []
        };

      default:
        return {
          rows: [],
          rowCount: 0,
          command: 'UNKNOWN',
          fields: []
        };
    }
  }

  // Generate mock SELECT results based on table/query pattern
  getMockSelectResult(text, params) {
    const sql = text.toLowerCase();
    
    // Mock user/auth queries
    if (sql.includes('users') || sql.includes('user')) {
      return {
        rows: [{
          id: 1,
          username: 'testuser',
          email: 'test@example.com',
          role: 'player',
          password_hash: '$2b$10$mockhashedpassword',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }],
        rowCount: 1,
        command: 'SELECT',
        fields: [
          { name: 'id', dataTypeID: 23 },
          { name: 'username', dataTypeID: 1043 },
          { name: 'email', dataTypeID: 1043 },
          { name: 'role', dataTypeID: 1043 }
        ]
      };
    }

    // Mock loot_view queries (prioritize over general loot queries)
    if (sql.includes('loot_view')) {
      return {
        rows: [
          {
            row_type: 'summary',
            id: 1,
            session_date: new Date().toISOString().split('T')[0],
            quantity: 2,
            name: 'Magic Sword',
            unidentified: false,
            masterwork: false,
            type: 'weapon',
            size: 'Medium',
            value: 1000,
            itemid: 1,
            modids: [],
            status: 'unprocessed',
            statuspage: 'unprocessed',
            whohas: 1,
            lastupdate: new Date().toISOString(),
            believedvalue: 1000,
            notes: 'Test item',
            appraisals: []
          },
          {
            row_type: 'individual',
            id: 2,
            session_date: new Date().toISOString().split('T')[0],
            quantity: 1,
            name: 'Magic Sword',
            unidentified: false,
            masterwork: false,
            type: 'weapon',
            size: 'Medium',
            value: 1000,
            itemid: 1,
            modids: [],
            status: 'unprocessed',
            statuspage: 'unprocessed',
            whohas: 1,
            lastupdate: new Date().toISOString(),
            believedvalue: 1000,
            notes: 'Test item individual',
            appraisals: []
          }
        ],
        rowCount: 2,
        command: 'SELECT',
        fields: [
          { name: 'row_type', dataTypeID: 1043 },
          { name: 'id', dataTypeID: 23 },
          { name: 'name', dataTypeID: 1043 },
          { name: 'quantity', dataTypeID: 23 },
          { name: 'value', dataTypeID: 1700 }
        ]
      };
    }

    // Mock loot/item queries
    if (sql.includes('loot') || sql.includes('item')) {
      return {
        rows: [{
          id: 1,
          name: 'Magic Sword',
          description: 'A shiny magic sword',
          value: 1000,
          quantity: 1,
          status: 'unprocessed',
          identified: true,
          character_id: 1,
          session_date: new Date().toISOString(),
          created_at: new Date().toISOString()
        }],
        rowCount: 1,
        command: 'SELECT',
        fields: [
          { name: 'id', dataTypeID: 23 },
          { name: 'name', dataTypeID: 1043 },
          { name: 'value', dataTypeID: 1700 },
          { name: 'quantity', dataTypeID: 23 }
        ]
      };
    }

    // Mock character queries
    if (sql.includes('character')) {
      return {
        rows: [{
          id: 1,
          name: 'Test Character',
          class: 'Fighter',
          level: 5,
          user_id: 1,
          active: true,
          created_at: new Date().toISOString()
        }],
        rowCount: 1,
        command: 'SELECT',
        fields: [
          { name: 'id', dataTypeID: 23 },
          { name: 'name', dataTypeID: 1043 },
          { name: 'class', dataTypeID: 1043 },
          { name: 'level', dataTypeID: 23 }
        ]
      };
    }

    // Mock invites queries  
    if (sql.includes('invites')) {
      if (sql.includes('insert')) {
        return {
          rows: [{ 
            code: 'TESTINV', 
            created_by: 1, 
            expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() 
          }],
          rowCount: 1,
          command: 'INSERT',
          fields: [
            { name: 'code', dataTypeID: 1043 },
            { name: 'expires_at', dataTypeID: 1184 }
          ]
        };
      }
      
      // Default invites query (no active invites for testing)
      return {
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        fields: [
          { name: 'code', dataTypeID: 1043 },
          { name: 'is_used', dataTypeID: 16 },
          { name: 'expires_at', dataTypeID: 1184 }
        ]
      };
    }

    // Mock settings queries
    if (sql.includes('settings')) {
      // Mock different settings based on the query
      if (sql.includes('registrations_open')) {
        return {
          rows: [{ name: 'registrations_open', value: '1', value_type: 'boolean' }],
          rowCount: 1,
          command: 'SELECT',
          fields: [
            { name: 'name', dataTypeID: 1043 },
            { name: 'value', dataTypeID: 1043 },
            { name: 'value_type', dataTypeID: 1043 }
          ]
        };
      }
      
      // Default settings mock
      return {
        rows: [
          { name: 'registrations_open', value: '1', value_type: 'boolean' },
          { name: 'campaign_name', value: 'Test Campaign', value_type: 'text' }
        ],
        rowCount: 2,
        command: 'SELECT',
        fields: [
          { name: 'name', dataTypeID: 1043 },
          { name: 'value', dataTypeID: 1043 },
          { name: 'value_type', dataTypeID: 1043 }
        ]
      };
    }

    // Default empty result
    return {
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      fields: []
    };
  }
}

// Mock database utilities
class MockDatabase {
  constructor() {
    this.pools = new Map();
    this.isConnected = false;
  }

  // Create a mock pool
  createPool(config) {
    const poolKey = JSON.stringify(config);
    
    if (!this.pools.has(poolKey)) {
      this.pools.set(poolKey, new MockPool());
    }
    
    return this.pools.get(poolKey);
  }

  // Mock successful connection
  async connect() {
    this.isConnected = true;
    return Promise.resolve();
  }

  // Mock disconnection
  async disconnect() {
    this.isConnected = false;
    this.pools.clear();
    return Promise.resolve();
  }

  // Add custom mock data for specific queries
  addMockData(queryPattern, mockResult) {
    // Store custom mock responses (could be enhanced)
    this.customMocks = this.customMocks || new Map();
    this.customMocks.set(queryPattern, mockResult);
  }

  // Reset all mocks
  reset() {
    this.pools.clear();
    this.customMocks?.clear();
    this.isConnected = false;
  }
}

// Singleton instance
const mockDatabase = new MockDatabase();

// Helper function to mock pg module
const mockPg = () => {
  return {
    Pool: MockPool,
    Client: MockPool, // For client connections
    types: {
      setTypeParser: () => {},
    },
  };
};

module.exports = {
  MockPool,
  MockQuery,
  MockDatabase,
  mockDatabase,
  mockPg,
  
  // Easy setup function for tests
  setupMockDatabase: () => {
    // Mock the pg module
    jest.doMock('pg', () => mockPg());
    
    // Mock dbUtils if it exists
    jest.doMock('../../src/utils/dbUtils', () => ({
      executeQuery: jest.fn().mockImplementation((query, params) => {
        const mockPool = new MockPool();
        return mockPool.query(query, params);
      }),
      executeTransaction: jest.fn().mockImplementation(async (callback) => {
        const mockClient = {
          query: (query, params) => new MockPool().query(query, params),
          release: () => {},
        };
        return await callback(mockClient);
      }),
      getPool: jest.fn().mockReturnValue(new MockPool()),
    }));

    return mockDatabase;
  },
  
  // Clean up function for tests
  teardownMockDatabase: () => {
    mockDatabase.reset();
    jest.clearAllMocks();
  }
};