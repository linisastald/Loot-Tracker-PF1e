/**
 * Unit tests for versionController
 * Tests getVersion with various .docker-version and package.json scenarios
 */

// Mock dependencies before requiring the controller
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

// We need to mock fs.promises for file reading
const mockReadFile = jest.fn();
jest.mock('fs', () => ({
  promises: {
    readFile: (...args) => mockReadFile(...args),
  },
}));

const versionController = require('../versionController');

// Helper to create a mock response object with all API response methods
function createMockRes() {
  return {
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    forbidden: jest.fn(),
    error: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

// Helper to create a mock request object
function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    cookies: {},
    user: null,
    ...overrides,
  };
}

describe('versionController', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  // ---------------------------------------------------------------
  // getVersion
  // ---------------------------------------------------------------
  describe('getVersion', () => {
    it('should return version info from .docker-version file', async () => {
      const req = createMockReq();
      const res = createMockRes();

      mockReadFile.mockResolvedValueOnce(
        'VERSION=1.2.3\nBUILD_NUMBER=42\nLAST_BUILD=2025-06-15T10:30:00Z\n'
      );

      await versionController.getVersion(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '1.2.3',
          buildNumber: 42,
          fullVersion: '1.2.3-dev.42',
          lastBuild: '2025-06-15T10:30:00Z',
          environment: 'test',
        }),
        'Version information retrieved'
      );
    });

    it('should return production version without dev suffix when buildNumber is 0', async () => {
      const req = createMockReq();
      const res = createMockRes();

      process.env.NODE_ENV = 'production';
      mockReadFile.mockResolvedValueOnce(
        'VERSION=2.0.0\nBUILD_NUMBER=0\nLAST_BUILD=2025-06-15\n'
      );

      await versionController.getVersion(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '2.0.0',
          buildNumber: 0,
          fullVersion: '2.0.0',
          environment: 'production',
        }),
        expect.any(String)
      );
    });

    it('should add -dev suffix in development mode with buildNumber 0', async () => {
      const req = createMockReq();
      const res = createMockRes();

      process.env.NODE_ENV = 'development';
      mockReadFile.mockResolvedValueOnce(
        'VERSION=1.0.0\nBUILD_NUMBER=0\nLAST_BUILD=\n'
      );

      await versionController.getVersion(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '1.0.0',
          buildNumber: 0,
          fullVersion: '1.0.0-dev',
          lastBuild: null,
        }),
        expect.any(String)
      );
    });

    it('should fall back to package.json when .docker-version not found', async () => {
      const req = createMockReq();
      const res = createMockRes();

      // First call (.docker-version) fails, second call (package.json) succeeds
      mockReadFile
        .mockRejectedValueOnce(new Error('ENOENT: file not found'))
        .mockResolvedValueOnce(JSON.stringify({ version: '0.9.5' }));

      await versionController.getVersion(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '0.9.5',
          buildNumber: 0,
        }),
        expect.any(String)
      );
    });

    it('should use hardcoded fallback 0.8.1 when both files fail', async () => {
      const req = createMockReq();
      const res = createMockRes();

      mockReadFile
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'));

      await versionController.getVersion(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '0.8.1',
          buildNumber: 0,
        }),
        expect.any(String)
      );
    });

    it('should handle .docker-version file with only VERSION line', async () => {
      const req = createMockReq();
      const res = createMockRes();

      mockReadFile.mockResolvedValueOnce('VERSION=3.0.0\n');

      await versionController.getVersion(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '3.0.0',
          buildNumber: 0,
          lastBuild: null,
        }),
        expect.any(String)
      );
    });

    it('should handle non-numeric BUILD_NUMBER gracefully', async () => {
      const req = createMockReq();
      const res = createMockRes();

      mockReadFile.mockResolvedValueOnce(
        'VERSION=1.0.0\nBUILD_NUMBER=abc\n'
      );

      await versionController.getVersion(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '1.0.0',
          buildNumber: 0, // parseInt('abc') is NaN, falls back to 0
        }),
        expect.any(String)
      );
    });

    it('should handle empty .docker-version file', async () => {
      const req = createMockReq();
      const res = createMockRes();

      mockReadFile.mockResolvedValueOnce('');

      await versionController.getVersion(req, res);

      // Falls through all line parsing with defaults
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '0.8.1', // default
          buildNumber: 0,
        }),
        expect.any(String)
      );
    });

    it('should include environment field from NODE_ENV', async () => {
      const req = createMockReq();
      const res = createMockRes();

      process.env.NODE_ENV = 'staging';
      mockReadFile.mockResolvedValueOnce('VERSION=1.0.0\n');

      await versionController.getVersion(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'staging' }),
        expect.any(String)
      );
    });

    it('should default environment to development when NODE_ENV is unset', async () => {
      const req = createMockReq();
      const res = createMockRes();

      delete process.env.NODE_ENV;
      mockReadFile.mockResolvedValueOnce('VERSION=1.0.0\nBUILD_NUMBER=0\n');

      await versionController.getVersion(req, res);

      // NODE_ENV is undefined, so environment falls back to 'development' via || operator
      // But isDevelopment checks NODE_ENV === 'development' which is false when undefined
      // So fullVersion stays plain '1.0.0' without -dev suffix
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'development',
          fullVersion: '1.0.0',
        }),
        expect.any(String)
      );
    });
  });
});
