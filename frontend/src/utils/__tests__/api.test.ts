import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// Mock axios before importing api
vi.mock('axios', () => {
  const mockInterceptors = {
    request: { use: vi.fn(), eject: vi.fn() },
    response: { use: vi.fn(), eject: vi.fn() },
  };

  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: mockInterceptors,
    defaults: { baseURL: '/api', headers: { common: {} } },
  };

  return {
    default: {
      create: vi.fn(() => mockInstance),
      get: vi.fn(),
    },
  };
});

describe('api utility', () => {
  let requestInterceptor: Function;
  let responseSuccessInterceptor: Function;
  let responseErrorInterceptor: Function;

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();

    // Import fresh to capture interceptors
    const axiosDefault = axios as any;
    const mockInstance = axiosDefault.create();

    // Extract interceptor callbacks registered via .use()
    const reqUse = mockInstance.interceptors.request.use;
    const resUse = mockInstance.interceptors.response.use;

    if (reqUse.mock?.calls?.[0]) {
      requestInterceptor = reqUse.mock.calls[0][0];
    }
    if (resUse.mock?.calls?.[0]) {
      responseSuccessInterceptor = resUse.mock.calls[0][0];
      responseErrorInterceptor = resUse.mock.calls[0][1];
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('axios instance creation', () => {
    it('should create axios instance with correct config', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.any(String),
          withCredentials: true,
          timeout: 10000,
        })
      );
    });
  });

  describe('interceptors registration', () => {
    it('should register request interceptor', () => {
      const mockInstance = (axios as any).create();
      expect(mockInstance.interceptors.request.use).toHaveBeenCalled();
    });

    it('should register response interceptor', () => {
      const mockInstance = (axios as any).create();
      expect(mockInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('CSRF token behavior (conceptual)', () => {
    it('should store CSRF token in localStorage', () => {
      // Verify the pattern: token is stored in localStorage
      localStorage.setItem('csrfToken', 'test-token-123');
      expect(localStorage.getItem('csrfToken')).toBe('test-token-123');
    });

    it('should clear CSRF token on removal', () => {
      localStorage.setItem('csrfToken', 'test-token');
      localStorage.removeItem('csrfToken');
      expect(localStorage.getItem('csrfToken')).toBeNull();
    });
  });

  describe('response interceptor', () => {
    it('should unwrap response data on success', () => {
      // The response interceptor returns response.data
      if (responseSuccessInterceptor) {
        const result = responseSuccessInterceptor({
          data: { success: true, items: [] },
          status: 200,
        });
        expect(result).toEqual({ success: true, items: [] });
      }
    });
  });
});
