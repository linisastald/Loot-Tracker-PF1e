import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api before importing the service
vi.mock('../../utils/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import api from '../../utils/api';
import versionService from '../versionService';

describe('versionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('getVersion', () => {
    it('should GET /version', async () => {
      await versionService.getVersion();
      expect(api.get).toHaveBeenCalledWith('/version');
    });

    it('should return the API response on success', async () => {
      const mockResponse = {
        data: {
          version: '1.2.3',
          buildNumber: 42,
          fullVersion: '1.2.3-42',
          environment: 'production',
        },
      };
      vi.mocked(api.get).mockResolvedValueOnce(mockResponse);

      const result = await versionService.getVersion();
      expect(result).toEqual(mockResponse);
    });

    it('should return fallback version info on API error', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('API unreachable'));

      const result = await versionService.getVersion();
      expect(result).toEqual({
        data: {
          version: '0.7.1',
          buildNumber: 0,
          fullVersion: '0.7.1',
          environment: 'development',
        },
      });
    });

    it('should log error to console on failure', async () => {
      const error = new Error('Connection refused');
      vi.mocked(api.get).mockRejectedValueOnce(error);

      await versionService.getVersion();
      expect(console.error).toHaveBeenCalledWith('Version API call failed:', error);
    });

    it('should not throw on API failure', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('500'));
      await expect(versionService.getVersion()).resolves.toBeDefined();
    });

    it('should return fallback with correct default version string', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('fail'));
      const result = await versionService.getVersion();
      expect(result.data.version).toBe('0.7.1');
      expect(result.data.fullVersion).toBe('0.7.1');
    });

    it('should return fallback with development environment on error', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('fail'));
      const result = await versionService.getVersion();
      expect(result.data.environment).toBe('development');
    });
  });
});
