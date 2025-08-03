module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': 'jest-transform-stub'
  },
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/?(*.)(spec|test).{js,jsx,ts,tsx}'
  ],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { 
          targets: 'defaults',
          modules: 'commonjs'
        }],
        ['@babel/preset-react', { 
          runtime: 'automatic',
          development: false
        }]
      ]
    }]
  },
  collectCoverageFrom: [
    'src/utils/**/*.{js,jsx}',
    'src/components/pages/**/*.{js,jsx}',
    '!src/**/*.d.ts',
    '!src/index.js',
    '!src/reportWebVitals.js',
    '!<rootDir>/node_modules/',
    '!<rootDir>/build/',
    '!src/setupTests.js',
    '!src/utils/testUtils.js',
    '!src/utils/testMocks.js',
    '!src/**/__tests__/**',
    '!src/**/tests/**'
  ],
  coverageThreshold: {
    global: {
      branches: 2,
      functions: 2,
      lines: 2,
      statements: 2
    }
  },
  coverageReporters: ['text', 'lcov', 'html'],
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  testTimeout: 10000,
  // Handle potential issues with React 19 and updated dependencies
  extensionsToTreatAsEsm: [],
  resetMocks: true,
  clearMocks: true,
  restoreMocks: true,
  maxWorkers: 1
};