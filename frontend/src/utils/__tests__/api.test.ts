import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import axios from 'axios';

describe('api utility', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    it('always targets /api (the CRA-era REACT_APP_API_URL key is gone)', async () => {
      const { default: api } = await import('../api');
      expect(api.defaults.baseURL).toBe('/api');
    });

    it('should have request and response interceptors registered', async () => {
      const { default: api } = await import('../api');
      expect((api.interceptors.request as any).handlers.length).toBeGreaterThan(0);
      expect((api.interceptors.response as any).handlers.length).toBeGreaterThan(0);
    });

    it('does not fire a network request just by being imported', async () => {
      const spy = vi.spyOn(axios, 'get');
      vi.resetModules();
      await import('../api');
      expect(spy).not.toHaveBeenCalled();
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

  describe('CSRF token injection (request interceptor)', () => {
    const run = async (config: any) => {
      const { default: api } = await import('../api');
      return (api.interceptors.request as any).handlers[0].fulfilled(config);
    };

    it('sets X-CSRF-Token from storage without any network call', async () => {
      localStorage.setItem('csrfToken', 'stored-token');
      const getSpy = vi.spyOn(axios, 'get');
      const config = await run({ url: '/loot', headers: {} });
      expect(config.headers['X-CSRF-Token']).toBe('stored-token');
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('fetches a token when none is stored, caches it and attaches it', async () => {
      const getSpy = vi
        .spyOn(axios, 'get')
        .mockResolvedValue({ data: { success: true, data: { csrfToken: 'fresh-token' } } });
      const config = await run({ url: '/loot', headers: {} });
      expect(getSpy).toHaveBeenCalledWith('/api/csrf-token', { withCredentials: true });
      expect(config.headers['X-CSRF-Token']).toBe('fresh-token');
      expect(localStorage.getItem('csrfToken')).toBe('fresh-token');
    });

    it('shares one in-flight token fetch between concurrent requests', async () => {
      let resolve!: (v: unknown) => void;
      const getSpy = vi
        .spyOn(axios, 'get')
        .mockReturnValue(new Promise((r) => { resolve = r; }) as any);
      const a = run({ url: '/a', headers: {} });
      const b = run({ url: '/b', headers: {} });
      // let both interceptor calls reach the shared fetch
      await new Promise((r) => setTimeout(r, 0));
      resolve({ data: { data: { csrfToken: 'one' } } });
      const [ca, cb] = await Promise.all([a, b]);
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(ca.headers['X-CSRF-Token']).toBe('one');
      expect(cb.headers['X-CSRF-Token']).toBe('one');
    });

    it('lets the request through without a token (no throw, no console noise) when the token fetch fails', async () => {
      vi.spyOn(axios, 'get').mockRejectedValue(new Error('network down'));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const config = await run({ url: '/loot', headers: {} });
      expect(config.headers['X-CSRF-Token']).toBeUndefined();
      expect(errSpy).not.toHaveBeenCalled();
    });

    it.each([
      '/auth/login',
      '/auth/register',
      '/auth/check-dm',
      '/auth/check-registration-status',
      '/auth/refresh',
      '/auth/status',
    ])('skips the CSRF token for %s', async (url) => {
      const getSpy = vi.spyOn(axios, 'get');
      const config = await run({ url, headers: {} });
      expect(config.headers['X-CSRF-Token']).toBeUndefined();
      expect(getSpy).not.toHaveBeenCalled();
    });
  });

  describe('response interceptor', () => {
    const originalLocation = window.location;
    const hrefSetter = vi.fn();
    const reloadMock = vi.fn();

    const runFulfilled = async (response: any) => {
      const { default: api } = await import('../api');
      return (api.interceptors.response as any).handlers[0].fulfilled(response);
    };
    const runRejected = async (error: any) => {
      const { default: api } = await import('../api');
      return (api.interceptors.response as any).handlers[0].rejected(error);
    };
    const make401 = (url: string) => ({
      message: 'Request failed with status code 401',
      response: { status: 401, data: { success: false, message: 'Unauthorized' } },
      config: { url, headers: {} },
    });

    beforeEach(() => {
      hrefSetter.mockClear();
      reloadMock.mockClear();
      const fake: Record<string, unknown> = {
        pathname: '/loot-management/sold',
        search: '?x=1',
        reload: reloadMock,
      };
      Object.defineProperty(fake, 'href', { get: () => '', set: hrefSetter });
      Object.defineProperty(window, 'location', { configurable: true, writable: true, value: fake });
    });

    afterAll(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
    });

    it('unwraps the response body for resolved calls', async () => {
      const body = { success: true, data: [1, 2] };
      await expect(runFulfilled({ data: body, status: 200 })).resolves.toBe(body);
    });

    it('does not log to the console for an ordinary failed request', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = { message: 'nope', response: { status: 404, data: {} }, config: { url: '/x', headers: {} } };
      await expect(runRejected(error)).rejects.toBe(error);
      expect(errSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('passes network errors (no response) straight through', async () => {
      const error = { message: 'Network Error', config: { url: '/x', headers: {} } };
      await expect(runRejected(error)).rejects.toBe(error);
      expect(hrefSetter).not.toHaveBeenCalled();
    });

    describe('401 handling', () => {
      it('on a normal endpoint remembers where the user was, clears the token and redirects to /login', async () => {
        localStorage.setItem('csrfToken', 'tok');
        const error = make401('/loot');
        await expect(runRejected(error)).rejects.toBe(error);
        expect(sessionStorage.getItem('loginRedirectReason')).toBe('expired');
        expect(sessionStorage.getItem('loginReturnTo')).toBe('/loot-management/sold?x=1');
        expect(localStorage.getItem('csrfToken')).toBeNull();
        expect(hrefSetter).toHaveBeenCalledWith('/login');
      });

      it('on /auth/* does not redirect (login failure, status probe, refresh)', async () => {
        localStorage.setItem('csrfToken', 'tok');
        for (const url of ['/auth/login', '/auth/status', '/auth/refresh']) {
          const error = make401(url);
          await expect(runRejected(error)).rejects.toBe(error);
        }
        expect(hrefSetter).not.toHaveBeenCalled();
        expect(sessionStorage.getItem('loginReturnTo')).toBeNull();
        expect(localStorage.getItem('csrfToken')).toBe('tok');
      });

      it.each(['/login', '/register', '/forgot-password', '/reset-password'])(
        'while already on %s does not redirect or clobber the return path',
        async (page) => {
          (window.location as any).pathname = page;
          sessionStorage.setItem('loginReturnTo', '/gold-transactions');
          const error = make401('/settings/registration');
          await expect(runRejected(error)).rejects.toBe(error);
          expect(hrefSetter).not.toHaveBeenCalled();
          expect(sessionStorage.getItem('loginReturnTo')).toBe('/gold-transactions');
        }
      );
    });

    describe('stale campaign selection recovery (403)', () => {
      const make403 = (message: string, headers: Record<string, string>) => ({
        message: 'Request failed with status code 403',
        response: { status: 403, data: { success: false, message } },
        config: { url: '/loot', headers },
      });

      it('clears activeCampaignId and reloads on "Not a member of this campaign" when the header was sent', async () => {
        localStorage.setItem('activeCampaignId', '42');
        const error = make403('Not a member of this campaign', { 'X-Campaign-Id': '42' });
        await expect(runRejected(error)).rejects.toBe(error);
        expect(localStorage.getItem('activeCampaignId')).toBeNull();
        expect(reloadMock).toHaveBeenCalledTimes(1);
      });

      it('does NOT clear or reload when the request did not carry the header (loop guard)', async () => {
        localStorage.setItem('activeCampaignId', '42');
        const error = make403('Not a member of this campaign', {});
        await expect(runRejected(error)).rejects.toBe(error);
        expect(localStorage.getItem('activeCampaignId')).toBe('42');
        expect(reloadMock).not.toHaveBeenCalled();
      });

      it('does NOT clear activeCampaignId on unrelated 403 errors (including a CORS rejection)', async () => {
        localStorage.setItem('activeCampaignId', '42');
        for (const message of ['Insufficient permissions', 'Not allowed by CORS']) {
          const error = make403(message, { 'X-Campaign-Id': '42' });
          await expect(runRejected(error)).rejects.toBe(error);
        }
        expect(localStorage.getItem('activeCampaignId')).toBe('42');
        expect(reloadMock).not.toHaveBeenCalled();
      });
    });

    describe('invalid csrf token retry', () => {
      const csrfError = (config: any) => ({
        message: 'Request failed with status code 403',
        response: { status: 403, data: { success: false, message: 'invalid csrf token' } },
        config,
      });

      it('retries once through the api instance (so the caller gets the unwrapped body) with the new token', async () => {
        const { default: api } = await import('../api');
        vi.spyOn(axios, 'get').mockResolvedValue({ data: { data: { csrfToken: 'new-token' } } });
        const body = { success: true, data: { id: 1 } };
        const adapter = vi.fn().mockImplementation(async (config: any) => ({
          data: body, status: 200, statusText: 'OK', headers: {}, config,
        }));
        const previousAdapter = api.defaults.adapter;
        api.defaults.adapter = adapter;
        localStorage.setItem('csrfToken', 'old-token');

        try {
          const config: any = { url: '/loot', method: 'post', headers: { 'X-CSRF-Token': 'old-token' } };
          const result = await runRejected(csrfError(config));

          expect(result).toEqual(body);
          expect(adapter).toHaveBeenCalledTimes(1);
          expect(adapter.mock.calls[0][0].headers['X-CSRF-Token']).toBe('new-token');
          expect(localStorage.getItem('csrfToken')).toBe('new-token');
        } finally {
          api.defaults.adapter = previousAdapter;
        }
      });

      it('does not retry a request that was already retried (no loop)', async () => {
        const getSpy = vi.spyOn(axios, 'get');
        const error = csrfError({ url: '/loot', headers: {}, _retryCount: 1 });
        await expect(runRejected(error)).rejects.toBe(error);
        expect(getSpy).not.toHaveBeenCalled();
      });

      it('rejects with the original error, without redirecting, when the token cannot be refreshed', async () => {
        vi.spyOn(axios, 'get').mockRejectedValue(new Error('network down'));
        const error = csrfError({ url: '/loot', headers: {} });
        await expect(runRejected(error)).rejects.toBe(error);
        expect(hrefSetter).not.toHaveBeenCalled();
      });
    });
  });
});
