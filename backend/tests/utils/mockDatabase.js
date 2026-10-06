/**
 * Minimal mock pg Pool for backend unit tests.
 *
 * MockPool answers every query with an empty, correctly shaped result (a health-check row
 * for `SELECT NOW()`, a generated id for INSERT). It deliberately does NOT guess table
 * contents from the SQL text: tests that need specific rows mock dbUtils or the model and
 * supply them explicitly.
 */

const EventEmitter = require('events');

class MockPool extends EventEmitter {
  constructor() {
    super();
    this.connected = true;
    this.totalCount = 0;
    this.idleCount = 0;
    this.waitingCount = 0;
    this.nextId = 1;
  }

  async query(text) {
    return this.getMockResult(this.parseQueryType(text));
  }

  async connect() {
    return {
      query: this.query.bind(this),
      release: () => {},
    };
  }

  async end() {
    this.connected = false;
  }

  parseQueryType(text) {
    const sql = String(text).trim().toLowerCase();

    if (sql.startsWith('select now()')) return 'health_check';
    if (sql.startsWith('select')) return 'select';
    if (sql.startsWith('insert')) return 'insert';
    if (sql.startsWith('update')) return 'update';
    if (sql.startsWith('delete')) return 'delete';
    return 'unknown';
  }

  getMockResult(queryType) {
    switch (queryType) {
      case 'health_check':
        return {
          rows: [{ now: new Date().toISOString() }],
          rowCount: 1,
          command: 'SELECT',
          fields: [{ name: 'now', dataTypeID: 1184 }],
        };
      case 'insert':
        return {
          rows: [{ id: this.nextId++ }],
          rowCount: 1,
          command: 'INSERT',
          fields: [{ name: 'id', dataTypeID: 23 }],
        };
      case 'update':
        return { rows: [], rowCount: 1, command: 'UPDATE', fields: [] };
      case 'delete':
        return { rows: [], rowCount: 1, command: 'DELETE', fields: [] };
      case 'select':
        return { rows: [], rowCount: 0, command: 'SELECT', fields: [] };
      default:
        return { rows: [], rowCount: 0, command: 'UNKNOWN', fields: [] };
    }
  }
}

module.exports = {
  MockPool,

  // Clean up function for tests (called from tests/setupTests.js)
  teardownMockDatabase: () => {
    jest.clearAllMocks();
  },
};
