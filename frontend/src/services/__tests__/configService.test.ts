import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api before importing the service
vi.mock('../../utils/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ success: true, data: { groupName: 'Test Group' } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import api from '../../utils/api';
import configService from '../config.service';

describe('configService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('getConfig', () => {
    it('should GET /config', async () => {
      await configService.getConfig();
      expect(api.get).toHaveBeenCalledWith('/config');
    });

    it('should return response data when success is true', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: { groupName: 'My Campaign' },
      });

      const result = await configService.getConfig();
      expect(result).toEqual({ groupName: 'My Campaign' });
    });

    it('should return default config when API fails', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('Network Error'));

      const result = await configService.getConfig();
      expect(result).toEqual({ groupName: 'Pathfinder Loot Tracker' });
    });

    it('should return default config when response.success is false', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ success: false, data: null });

      const result = await configService.getConfig();
      expect(result).toEqual({ groupName: 'Pathfinder Loot Tracker' });
    });

    it('should return default config when response is null', async () => {
      vi.mocked(api.get).mockResolvedValueOnce(null as any);

      const result = await configService.getConfig();
      expect(result).toEqual({ groupName: 'Pathfinder Loot Tracker' });
    });

    it('should log error to console on failure', async () => {
      const error = new Error('Connection refused');
      vi.mocked(api.get).mockRejectedValueOnce(error);

      await configService.getConfig();
      expect(console.error).toHaveBeenCalledWith('Error fetching config:', error);
    });

    it('should not throw on API failure', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('500'));
      await expect(configService.getConfig()).resolves.toBeDefined();
    });

    it('should return data property from successful response', async () => {
      const configData = { groupName: 'Skulls and Shackles', theme: 'dark' };
      vi.mocked(api.get).mockResolvedValueOnce({ success: true, data: configData });

      const result = await configService.getConfig();
      expect(result).toEqual(configData);
    });
  });
});
