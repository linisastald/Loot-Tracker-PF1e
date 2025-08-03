/**
 * Setup mocks for unit tests
 * This file runs before setupTests.js and sets up global mocks
 */

// Force use of mock database for unit tests
process.env.NODE_ENV = 'test';
process.env.USE_MOCK_DB = 'true';

// Mock external APIs
process.env.OPENAI_API_KEY = 'mock-openai-key';
process.env.JWT_SECRET = 'mock-jwt-secret-for-testing';

// Mock console methods to reduce test noise (but keep errors)
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args) => {
  // Only show important test messages
  if (args[0]?.includes('✓') || args[0]?.includes('✗') || args[0]?.includes('🎭')) {
    originalConsoleLog(...args);
  }
};

console.error = (...args) => {
  // Always show errors, but filter out expected test database connection failures
  if (!args[0]?.includes('Test database connection failed')) {
    originalConsoleError(...args);
  }
};