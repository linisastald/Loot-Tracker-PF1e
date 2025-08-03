module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.js'],
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/src/**/__tests__/**/*.js',
    '<rootDir>/src/**/?(*.)(spec|test).js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/__tests__/**',
    '!<rootDir>/node_modules/',
    '!<rootDir>/tests/'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  detectOpenHandles: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // Handle potential issues with updated dependencies
  extensionsToTreatAsEsm: [],
  globals: {
    'ts-jest': {
      useESM: false
    }
  },
  // Ensure proper module resolution
  moduleNameMapping: {},
  transform: {},
  // Handle async operations better
  maxWorkers: 1
};