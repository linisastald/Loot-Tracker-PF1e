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
          fullVersion: '1.2.3-dev.42',
        },
      };
      vi.mocked(api.get).mockResolvedValueOnce(mockResponse);

      const result = await versionService.getVersion();
      expect(result).toEqual(mockResponse);
    });

    it('should resolve with an unknown marker, not a fake version, when the API fails', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('API unreachable'));

      const result = await versionService.getVersion();
      expect(result).toEqual({
        data: {
          version: 'unknown',
          buildNumber: 0,
          fullVersion: 'unknown',
        },
      });
    });
  });
});
