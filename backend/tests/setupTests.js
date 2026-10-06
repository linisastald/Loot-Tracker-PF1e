/**
 * Global test setup for backend unit tests (setupFilesAfterEnv in both Jest configs).
 *
 * Every suite runs against mocks: pg, config/db, the logger, the email service and dbUtils
 * are replaced before any application module loads. Both configs set resetMocks: true, so
 * the jest.fn() mocks below start every test with no implementation; tests that need
 * specific behaviour set it themselves (mockResolvedValue / mockImplementation).
 * There are no real-database tests in this repository.
 */

const { teardownMockDatabase, MockPool } = require('./utils/mockDatabase');

process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'pathfinder_loot_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';

jest.doMock('pg', () => ({
  Pool: MockPool,
  Client: MockPool,
  types: {
    setTypeParser: jest.fn(),
  },
}));

jest.doMock('../src/config/db', () => {
  const mockPool = new MockPool();
  return mockPool;
});

jest.doMock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

// Mirrors the real EmailService surface (src/services/emailService.js).
jest.doMock('../src/services/emailService', () => ({
  sendPasswordResetEmail: jest.fn()
}));

jest.doMock('../src/utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
  getPool: jest.fn(),
  buildWhereClause: jest.fn(),
  buildOrderByClause: jest.fn(),
  buildLimitClause: jest.fn(),
  sanitizeInput: jest.fn(),
  formatDateForDB: jest.fn(),
  parseDBDate: jest.fn(),
  // BaseModel required methods
  getById: jest.fn(),
  insert: jest.fn(),
  updateById: jest.fn(),
  deleteById: jest.fn()
}));

afterAll(() => {
  teardownMockDatabase();
});
