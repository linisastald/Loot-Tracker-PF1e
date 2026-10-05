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

    it('should not log to the console on failure', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(api.get).mockRejectedValueOnce(new Error('Connection refused'));

      await configService.getConfig();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
