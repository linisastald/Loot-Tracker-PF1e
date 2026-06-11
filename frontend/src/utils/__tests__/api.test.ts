import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

describe('api utility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('CSRF token management', () => {
    it('should store CSRF token in localStorage', () => {
      localStorage.setItem('csrfToken', 'test-token-123');
      expect(localStorage.getItem('csrfToken')).toBe('test-token-123');
    });

    it('should clear CSRF token on removal', () => {
      localStorage.setItem('csrfToken', 'test-token');
      localStorage.removeItem('csrfToken');
      expect(localStorage.getItem('csrfToken')).toBeNull();
    });

    it('should return null when no CSRF token is stored', () => {
      expect(localStorage.getItem('csrfToken')).toBeNull();
    });
  });

  describe('module exports', () => {
    it('should export a default axios instance', async () => {
      const { default: api } = await import('../api');
      expect(api).toBeDefined();
      expect(typeof api.get).toBe('function');
      expect(typeof api.post).toBe('function');
      expect(typeof api.put).toBe('function');
      expect(typeof api.delete).toBe('function');
    });

    it('should have withCredentials enabled', async () => {
      const { default: api } = await import('../api');
      expect(api.defaults.withCredentials).toBe(true);
    });

    it('should have a baseURL configured', async () => {
      const { default: api } = await import('../api');
      expect(api.defaults.baseURL).toBeDefined();
      expect(typeof api.defaults.baseURL).toBe('string');
    });

    it('should have request interceptors registered', async () => {
      const { default: api } = await import('../api');
      // Axios stores interceptors internally; verify handlers array exists
      expect(api.interceptors.request).toBeDefined();
    });

    it('should have response interceptors registered', async () => {
      const { default: api } = await import('../api');
      expect(api.interceptors.response).toBeDefined();
    });
  });

  describe('X-Campaign-Id header (multi-campaign)', () => {
    // Invoke the registered request interceptor directly
    const runRequestInterceptor = async (config: any) => {
      const { default: api } = await import('../api');
      const handler = (api.interceptors.request as any).handlers[0];
      return handler.fulfilled(config);
    };

    beforeEach(() => {
      // Pre-seed a CSRF token so the interceptor does not attempt a network fetch
      localStorage.setItem('csrfToken', 'test-csrf-token');
    });

    it('attaches X-Campaign-Id when activeCampaignId is set', async () => {
      localStorage.setItem('activeCampaignId', '42');
      const config = await runRequestInterceptor({ url: '/loot', headers: {} });
      expect(config.headers['X-Campaign-Id']).toBe('42');
    });

    it('does NOT attach X-Campaign-Id when activeCampaignId is absent', async () => {
      const config = await runRequestInterceptor({ url: '/loot', headers: {} });
      expect(config.headers['X-Campaign-Id']).toBeUndefined();
    });

    it('does NOT attach X-Campaign-Id when the stored value is not numeric', async () => {
      localStorage.setItem('activeCampaignId', 'not-a-number');
      const config = await runRequestInterceptor({ url: '/loot', headers: {} });
      expect(config.headers['X-Campaign-Id']).toBeUndefined();
    });

    it('does NOT attach X-Campaign-Id to auth routes (campaign-independent; a stale id 403ing /auth/status would race the logout handler)', async () => {
      localStorage.setItem('activeCampaignId', '7');
      const config = await runRequestInterceptor({ url: '/auth/status', headers: {} });
      expect(config.headers['X-Campaign-Id']).toBeUndefined();
    });
  });

  describe('stale campaign selection recovery (403)', () => {
    const originalLocation = window.location;
    const reloadMock = vi.fn();

    const runResponseErrorInterceptor = async (error: any) => {
      const { default: api } = await import('../api');
      const handler = (api.interceptors.response as any).handlers[0];
      return handler.rejected(error);
    };

    beforeEach(() => {
      reloadMock.mockClear();
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: { ...originalLocation, reload: reloadMock },
      });
    });

    afterAll(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
    });

    it('clears activeCampaignId and reloads on "Not a member of this campaign" when the header was sent', async () => {
      localStorage.setItem('activeCampaignId', '42');
      const error = {
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: { success: false, message: 'Not a member of this campaign' },
        },
        config: { url: '/loot', headers: { 'X-Campaign-Id': '42' } },
      };

      await expect(runResponseErrorInterceptor(error)).rejects.toBe(error);
      expect(localStorage.getItem('activeCampaignId')).toBeNull();
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('does NOT clear or reload when the request did not carry the header (loop guard)', async () => {
      localStorage.setItem('activeCampaignId', '42');
      const error = {
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: { success: false, message: 'Not a member of this campaign' },
        },
        config: { url: '/loot', headers: {} },
      };

      await expect(runResponseErrorInterceptor(error)).rejects.toBe(error);
      expect(localStorage.getItem('activeCampaignId')).toBe('42');
      expect(reloadMock).not.toHaveBeenCalled();
    });

    it('does NOT clear activeCampaignId on unrelated 403 errors', async () => {
      localStorage.setItem('activeCampaignId', '42');
      const error = {
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: { success: false, message: 'Insufficient permissions' },
        },
        config: { url: '/loot', headers: { 'X-Campaign-Id': '42' } },
      };

      await expect(runResponseErrorInterceptor(error)).rejects.toBe(error);
      expect(localStorage.getItem('activeCampaignId')).toBe('42');
      expect(reloadMock).not.toHaveBeenCalled();
    });
  });
});
