/**
 * Tests for api.js frontend utility - API security and CSRF protection
 * Tests axios interceptors, CSRF token management, and security features
 */

import axios from 'axios';
import api from '../../../frontend/src/utils/api';

// Mock axios
jest.mock('axios');
const mockedAxios = axios;
const mockAxiosCreate = jest.fn();
const mockGet = jest.fn();
const mockInterceptorsRequest = { use: jest.fn() };
const mockInterceptorsResponse = { use: jest.fn() };

// Mock localStorage
const localStorageMock = (() => {
  let store = {};

  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock console methods
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe('API Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();

    // Setup axios mocks
    mockedAxios.create = mockAxiosCreate.mockReturnValue({
      interceptors: {
        request: mockInterceptorsRequest,
        response: mockInterceptorsResponse
      }
    });
    mockedAxios.get = mockGet;

    // Mock environment variable
    process.env.REACT_APP_API_URL = '/api';
  });

  afterEach(() => {
    delete process.env.REACT_APP_API_URL;
  });

  describe('API Instance Creation', () => {
    it('should create axios instance with correct configuration', () => {
      // Re-import to trigger instance creation
      jest.resetModules();
      require('../../../frontend/src/utils/api');

      expect(mockAxiosCreate).toHaveBeenCalledWith({
        baseURL: '/api',
        withCredentials: true,
        timeout: 10000
      });
    });

    it('should use default API_URL when environment variable is not set', () => {
      delete process.env.REACT_APP_API_URL;
      
      jest.resetModules();
      require('../../../frontend/src/utils/api');

      expect(mockAxiosCreate).toHaveBeenCalledWith({
        baseURL: '/api',
        withCredentials: true,
        timeout: 10000
      });
    });

    it('should use custom API_URL from environment variable', () => {
      process.env.REACT_APP_API_URL = 'https://api.example.com';
      
      jest.resetModules();
      require('../../../frontend/src/utils/api');

      expect(mockAxiosCreate).toHaveBeenCalledWith({
        baseURL: 'https://api.example.com',
        withCredentials: true,
        timeout: 10000
      });
    });
  });

  describe('CSRF Token Management', () => {
    describe('fetchCsrfToken', () => {
      it('should fetch and store CSRF token successfully', async () => {
        const mockResponse = {
          data: {
            data: {
              csrfToken: 'test-csrf-token'
            }
          }
        };

        mockGet.mockResolvedValue(mockResponse);

        // Import the module to access the internal function
        jest.resetModules();
        const apiModule = require('../../../frontend/src/utils/api');

        // The fetchCsrfToken is called during module initialization
        await new Promise(resolve => setTimeout(resolve, 0)); // Wait for async call

        expect(mockGet).toHaveBeenCalledWith('/api/csrf-token', { withCredentials: true });
        expect(localStorageMock.setItem).toHaveBeenCalledWith('csrfToken', 'test-csrf-token');
      });

      it('should handle invalid CSRF token response format', async () => {
        const mockResponse = {
          data: {
            invalidFormat: true
          }
        };

        mockGet.mockResolvedValue(mockResponse);

        jest.resetModules();
        require('../../../frontend/src/utils/api');

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(console.error).toHaveBeenCalledWith('Invalid CSRF token response format');
        expect(localStorageMock.setItem).not.toHaveBeenCalled();
      });

      it('should handle network errors when fetching CSRF token', async () => {
        const networkError = new Error('Network error');
        mockGet.mockRejectedValue(networkError);

        jest.resetModules();
        require('../../../frontend/src/utils/api');

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(console.error).toHaveBeenCalledWith('Error fetching CSRF token:', networkError);
        expect(localStorageMock.setItem).not.toHaveBeenCalled();
      });

      it('should handle missing response data', async () => {
        mockGet.mockResolvedValue({});

        jest.resetModules();
        require('../../../frontend/src/utils/api');

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(console.error).toHaveBeenCalledWith('Invalid CSRF token response format');
      });

      it('should handle null response', async () => {
        mockGet.mockResolvedValue(null);

        jest.resetModules();
        require('../../../frontend/src/utils/api');

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(console.error).toHaveBeenCalledWith('Invalid CSRF token response format');
      });
    });
  });

  describe('Request Interceptor', () => {
    let requestInterceptor;

    beforeEach(() => {
      jest.resetModules();
      require('../../../frontend/src/utils/api');
      
      // Get the request interceptor function
      requestInterceptor = mockInterceptorsRequest.use.mock.calls[0][0];
    });

    it('should skip CSRF for auth login route', async () => {
      const config = {
        url: '/auth/login',
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(result).toBe(config);
      expect(config.headers['X-CSRF-Token']).toBeUndefined();
    });

    it('should skip CSRF for auth register route', async () => {
      const config = {
        url: '/auth/register',
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(result).toBe(config);
      expect(config.headers['X-CSRF-Token']).toBeUndefined();
    });

    it('should skip CSRF for auth check-dm route', async () => {
      const config = {
        url: '/auth/check-dm',
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(result).toBe(config);
      expect(config.headers['X-CSRF-Token']).toBeUndefined();
    });

    it('should skip CSRF for auth status route', async () => {
      const config = {
        url: '/auth/status',
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(result).toBe(config);
      expect(config.headers['X-CSRF-Token']).toBeUndefined();
    });

    it('should add CSRF token from localStorage for non-auth routes', async () => {
      localStorageMock.setItem('csrfToken', 'stored-csrf-token');

      const config = {
        url: '/items',
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(result).toBe(config);
      expect(config.headers['X-CSRF-Token']).toBe('stored-csrf-token');
    });

    it('should fetch new CSRF token when none exists in localStorage', async () => {
      const mockResponse = {
        data: {
          data: {
            csrfToken: 'new-csrf-token'
          }
        }
      };

      mockGet.mockResolvedValue(mockResponse);

      const config = {
        url: '/items',
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(mockGet).toHaveBeenCalledWith('/api/csrf-token', { withCredentials: true });
      expect(localStorageMock.setItem).toHaveBeenCalledWith('csrfToken', 'new-csrf-token');
      expect(config.headers['X-CSRF-Token']).toBe('new-csrf-token');
    });

    it('should handle CSRF token fetch failure gracefully', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      const config = {
        url: '/items',
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(result).toBe(config);
      expect(config.headers['X-CSRF-Token']).toBeUndefined();
    });

    it('should handle partial auth routes correctly', async () => {
      localStorageMock.setItem('csrfToken', 'test-token');

      const config = {
        url: '/auth/logout', // Not in skip list
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(config.headers['X-CSRF-Token']).toBe('test-token');
    });

    it('should handle URLs with query parameters', async () => {
      const config = {
        url: '/auth/login?redirect=dashboard',
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(config.headers['X-CSRF-Token']).toBeUndefined();
    });

    it('should handle relative URLs', async () => {
      localStorageMock.setItem('csrfToken', 'test-token');

      const config = {
        url: 'items/123',
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(config.headers['X-CSRF-Token']).toBe('test-token');
    });

    it('should handle missing URL in config', async () => {
      localStorageMock.setItem('csrfToken', 'test-token');

      const config = {
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(config.headers['X-CSRF-Token']).toBe('test-token');
    });
  });

  describe('Response Interceptor', () => {
    let responseInterceptor, errorInterceptor;

    beforeEach(() => {
      jest.resetModules();
      require('../../../frontend/src/utils/api');
      
      // Get the response interceptor functions
      responseInterceptor = mockInterceptorsResponse.use.mock.calls[0][0];
      errorInterceptor = mockInterceptorsResponse.use.mock.calls[0][1];
    });

    describe('Success Response Handling', () => {
      it('should return response data on success', () => {
        const response = {
          data: {
            success: true,
            data: { id: 1, name: 'Test' }
          }
        };

        const result = responseInterceptor(response);

        expect(result).toEqual({
          success: true,
          data: { id: 1, name: 'Test' }
        });
      });

      it('should handle empty response data', () => {
        const response = {
          data: null
        };

        const result = responseInterceptor(response);

        expect(result).toBeNull();
      });

      it('should handle response with no data property', () => {
        const response = {};

        const result = responseInterceptor(response);

        expect(result).toBeUndefined();
      });
    });

    describe('Error Response Handling', () => {
      it('should log API errors', async () => {
        const error = {
          message: 'Network Error',
          response: {
            status: 500
          }
        };

        await expect(errorInterceptor(error)).rejects.toBe(error);

        expect(console.error).toHaveBeenCalledWith('API Error:', {
          message: 'Network Error',
          status: 500
        });
      });

      it('should handle CSRF token errors and retry request', async () => {
        const mockNewToken = 'new-csrf-token';
        const mockResponse = {
          data: {
            data: {
              csrfToken: mockNewToken
            }
          }
        };

        mockGet.mockResolvedValue(mockResponse);

        const originalConfig = {
          url: '/items',
          headers: {}
        };

        const error = {
          message: 'CSRF Error',
          response: {
            status: 403,
            data: {
              error: 'invalid csrf token'
            }
          },
          config: originalConfig
        };

        const retryResponse = {
          data: { success: true }
        };

        mockedAxios.mockResolvedValue(retryResponse);

        const result = await errorInterceptor(error);

        expect(localStorageMock.removeItem).toHaveBeenCalledWith('csrfToken');
        expect(mockGet).toHaveBeenCalledWith('/api/csrf-token', { withCredentials: true });
        expect(localStorageMock.setItem).toHaveBeenCalledWith('csrfToken', mockNewToken);
        expect(originalConfig.headers['X-CSRF-Token']).toBe(mockNewToken);
        expect(originalConfig._retryCount).toBe(1);
        expect(result).toBe(retryResponse);
      });

      it('should handle CSRF token errors with message field', async () => {
        const mockNewToken = 'new-csrf-token';
        const mockResponse = {
          data: {
            data: {
              csrfToken: mockNewToken
            }
          }
        };

        mockGet.mockResolvedValue(mockResponse);

        const error = {
          message: 'CSRF Error',
          response: {
            status: 403,
            data: {
              message: 'invalid csrf token'
            }
          },
          config: {
            url: '/items',
            headers: {}
          }
        };

        mockedAxios.mockResolvedValue({ data: { success: true } });

        await errorInterceptor(error);

        expect(localStorageMock.removeItem).toHaveBeenCalledWith('csrfToken');
        expect(mockGet).toHaveBeenCalledWith('/api/csrf-token', { withCredentials: true });
      });

      it('should not retry CSRF errors that have already been retried', async () => {
        const error = {
          message: 'CSRF Error',
          response: {
            status: 403,
            data: {
              error: 'invalid csrf token'
            }
          },
          config: {
            _retryCount: 1, // Already retried
            url: '/items',
            headers: {}
          }
        };

        await expect(errorInterceptor(error)).rejects.toBe(error);

        expect(localStorageMock.removeItem).not.toHaveBeenCalled();
        expect(mockGet).not.toHaveBeenCalled();
      });

      it('should not retry non-CSRF 403 errors', async () => {
        const error = {
          message: 'Forbidden',
          response: {
            status: 403,
            data: {
              error: 'insufficient permissions'
            }
          },
          config: {
            url: '/items',
            headers: {}
          }
        };

        await expect(errorInterceptor(error)).rejects.toBe(error);

        expect(localStorageMock.removeItem).not.toHaveBeenCalled();
        expect(mockGet).not.toHaveBeenCalled();
      });

      it('should not retry non-403 errors', async () => {
        const error = {
          message: 'Server Error',
          response: {
            status: 500
          },
          config: {
            url: '/items',
            headers: {}
          }
        };

        await expect(errorInterceptor(error)).rejects.toBe(error);

        expect(localStorageMock.removeItem).not.toHaveBeenCalled();
        expect(mockGet).not.toHaveBeenCalled();
      });

      it('should handle errors without response', async () => {
        const error = {
          message: 'Network Error'
        };

        await expect(errorInterceptor(error)).rejects.toBe(error);

        expect(console.error).toHaveBeenCalledWith('API Error:', {
          message: 'Network Error',
          status: undefined
        });
      });

      it('should handle CSRF retry when new token fetch fails', async () => {
        mockGet.mockRejectedValue(new Error('Token fetch failed'));

        const error = {
          message: 'CSRF Error',
          response: {
            status: 403,
            data: {
              error: 'invalid csrf token'
            }
          },
          config: {
            url: '/items',
            headers: {}
          }
        };

        await expect(errorInterceptor(error)).rejects.toBe(error);

        expect(localStorageMock.removeItem).toHaveBeenCalledWith('csrfToken');
        expect(mockGet).toHaveBeenCalled();
        expect(mockedAxios).not.toHaveBeenCalled();
      });

      it('should handle missing config during CSRF retry', async () => {
        const mockNewToken = 'new-csrf-token';
        const mockResponse = {
          data: {
            data: {
              csrfToken: mockNewToken
            }
          }
        };

        mockGet.mockResolvedValue(mockResponse);

        const error = {
          message: 'CSRF Error',
          response: {
            status: 403,
            data: {
              error: 'invalid csrf token'
            }
          },
          config: null // Missing config
        };

        await expect(errorInterceptor(error)).rejects.toBe(error);

        expect(localStorageMock.removeItem).toHaveBeenCalledWith('csrfToken');
        expect(mockGet).toHaveBeenCalled();
        expect(mockedAxios).not.toHaveBeenCalled();
      });
    });
  });

  describe('Security Features', () => {
    it('should include credentials in all requests', () => {
      jest.resetModules();
      require('../../../frontend/src/utils/api');

      expect(mockAxiosCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          withCredentials: true
        })
      );
    });

    it('should have reasonable timeout configured', () => {
      jest.resetModules();
      require('../../../frontend/src/utils/api');

      expect(mockAxiosCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10000
        })
      );
    });

    it('should handle timeout errors appropriately', async () => {
      jest.resetModules();
      require('../../../frontend/src/utils/api');
      
      const errorInterceptor = mockInterceptorsResponse.use.mock.calls[0][1];
      
      const timeoutError = {
        message: 'Request timeout',
        code: 'ECONNABORTED'
      };

      await expect(errorInterceptor(timeoutError)).rejects.toBe(timeoutError);

      expect(console.error).toHaveBeenCalledWith('API Error:', {
        message: 'Request timeout',
        status: undefined
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle localStorage access errors during CSRF token retrieval', async () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      jest.resetModules();
      require('../../../frontend/src/utils/api');
      
      const requestInterceptor = mockInterceptorsRequest.use.mock.calls[0][0];

      const config = {
        url: '/items',
        headers: {}
      };

      // Should not throw an error
      const result = await requestInterceptor(config);

      expect(result).toBe(config);
      // Should attempt to fetch new token when localStorage fails
      expect(mockGet).toHaveBeenCalled();
    });

    it('should handle localStorage access errors during CSRF token storage', async () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('localStorage quota exceeded');
      });

      const mockResponse = {
        data: {
          data: {
            csrfToken: 'test-token'
          }
        }
      };

      mockGet.mockResolvedValue(mockResponse);

      jest.resetModules();
      require('../../../frontend/src/utils/api');

      // Should not crash the application
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockGet).toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalledWith(expect.stringMatching(/localStorage/));
    });

    it('should handle malformed CSRF token responses', async () => {
      const malformedResponses = [
        { data: { data: { csrfToken: null } } },
        { data: { data: { csrfToken: '' } } },
        { data: { data: { csrfToken: 123 } } },
        { data: { data: {} } },
        { data: {} },
        {}
      ];

      for (const response of malformedResponses) {
        jest.clearAllMocks();
        mockGet.mockResolvedValue(response);

        jest.resetModules();
        require('../../../frontend/src/utils/api');

        await new Promise(resolve => setTimeout(resolve, 0));

        if (response.data?.data?.csrfToken && response.data.data.csrfToken !== '') {
          expect(localStorageMock.setItem).toHaveBeenCalled();
        } else {
          expect(console.error).toHaveBeenCalledWith('Invalid CSRF token response format');
        }
      }
    });

    it('should handle concurrent CSRF token fetches', async () => {
      let resolveToken;
      const tokenPromise = new Promise(resolve => {
        resolveToken = resolve;
      });

      mockGet.mockReturnValue(tokenPromise);

      jest.resetModules();
      require('../../../frontend/src/utils/api');
      
      const requestInterceptor = mockInterceptorsRequest.use.mock.calls[0][0];

      const config1 = { url: '/items/1', headers: {} };
      const config2 = { url: '/items/2', headers: {} };

      // Start two concurrent requests
      const promise1 = requestInterceptor(config1);
      const promise2 = requestInterceptor(config2);

      // Resolve the token fetch
      resolveToken({
        data: {
          data: {
            csrfToken: 'concurrent-token'
          }
        }
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.headers['X-CSRF-Token']).toBe('concurrent-token');
      expect(result2.headers['X-CSRF-Token']).toBe('concurrent-token');
      
      // Should only fetch token once despite concurrent requests
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('should handle request interceptor errors', async () => {
      jest.resetModules();
      require('../../../frontend/src/utils/api');
      
      const requestErrorHandler = mockInterceptorsRequest.use.mock.calls[0][1];
      const testError = new Error('Request setup failed');

      const result = requestErrorHandler(testError);

      await expect(result).rejects.toBe(testError);
    });
  });
});