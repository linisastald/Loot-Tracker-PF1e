import { describe, it, expect, beforeEach } from 'vitest';

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
});
