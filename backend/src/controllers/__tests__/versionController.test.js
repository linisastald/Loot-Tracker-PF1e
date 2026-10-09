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

const logger = require('../../utils/logger');
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
    mockReadFile.mockReset();
    versionController.resetVersionCache();
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
        {
          version: '1.2.3',
          buildNumber: 42,
          fullVersion: '1.2.3-dev.42',
        },
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

    it('should report an unknown version when both files fail', async () => {
      const req = createMockReq();
      const res = createMockRes();

      mockReadFile
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'));

      await versionController.getVersion(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'unknown',
          buildNumber: 0,
          fullVersion: 'unknown',
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

    it('should fall back to package.json for an empty .docker-version file', async () => {
      const req = createMockReq();
      const res = createMockRes();

      mockReadFile
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(JSON.stringify({ version: '0.15.0' }));

      await versionController.getVersion(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '0.15.0',
          buildNumber: 0,
        }),
        expect.any(String)
      );
    });

    it('should not disclose environment or build timestamp to anonymous callers', async () => {
      const req = createMockReq();
      const res = createMockRes();

      process.env.NODE_ENV = 'staging';
      mockReadFile.mockResolvedValueOnce('VERSION=1.0.0\nLAST_BUILD=2025-06-15T10:30:00Z\n');

      await versionController.getVersion(req, res);

      const payload = res.success.mock.calls[0][0];
      expect(Object.keys(payload).sort()).toEqual(['buildNumber', 'fullVersion', 'version']);
    });

    it('should read the version file once and serve later requests from memory', async () => {
      mockReadFile.mockResolvedValueOnce('VERSION=1.0.0\nBUILD_NUMBER=3\n');

      const res1 = createMockRes();
      const res2 = createMockRes();
      await versionController.getVersion(createMockReq(), res1);
      await versionController.getVersion(createMockReq(), res2);

      expect(mockReadFile).toHaveBeenCalledTimes(1);
      expect(res2.success).toHaveBeenCalledWith(
        expect.objectContaining({ version: '1.0.0', buildNumber: 3 }),
        expect.any(String)
      );
    });

    it('should not write an info log line on every request', async () => {
      mockReadFile.mockResolvedValueOnce('VERSION=1.0.0\n');

      await versionController.getVersion(createMockReq(), createMockRes());
      await versionController.getVersion(createMockReq(), createMockRes());

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should still apply NODE_ENV to the display version when served from memory', async () => {
      mockReadFile.mockResolvedValueOnce('VERSION=1.0.0\nBUILD_NUMBER=0\n');

      process.env.NODE_ENV = 'production';
      const res1 = createMockRes();
      await versionController.getVersion(createMockReq(), res1);
      process.env.NODE_ENV = 'development';
      const res2 = createMockRes();
      await versionController.getVersion(createMockReq(), res2);

      expect(res1.success.mock.calls[0][0].fullVersion).toBe('1.0.0');
      expect(res2.success.mock.calls[0][0].fullVersion).toBe('1.0.0-dev');
    });
  });
});
