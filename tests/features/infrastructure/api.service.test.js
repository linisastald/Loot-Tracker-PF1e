/**
 * Tests for api.service.js - Frontend API abstraction layer
 * Tests HTTP methods, error handling, token management, and standardized responses
 */

import ApiService from '../../../frontend/src/services/api.service';
import axios from 'axios';
import { toast } from 'react-toastify';

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

// Mock react-toastify
jest.mock('react-toastify', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  }
}));

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

// Mock window.location
const mockLocation = {
  href: '',
  assign: jest.fn(),
  replace: jest.fn(),
  reload: jest.fn()
};

Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true
});

describe('ApiService', () => {
  let mockAxiosInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    mockLocation.href = '';

    // Mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    // Mock environment variable
    process.env.REACT_APP_API_URL = 'http://localhost:5000/api';
  });

  afterEach(() => {
    delete process.env.REACT_APP_API_URL;
  });

  describe('Initialization', () => {
    beforeEach(() => {
      // Reset modules to test initialization
      jest.resetModules();
    });

    it('should create axios instance with correct configuration', () => {
      require('../../../frontend/src/services/api.service');

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:5000/api',
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    });

    it('should use default API_URL when environment variable not set', () => {
      delete process.env.REACT_APP_API_URL;
      
      require('../../../frontend/src/services/api.service');

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:5000/api'
        })
      );
    });

    it('should set up request and response interceptors', () => {
      require('../../../frontend/src/services/api.service');

      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('Request Interceptor', () => {
    let requestInterceptor;

    beforeEach(() => {
      jest.resetModules();
      require('../../../frontend/src/services/api.service');
      
      // Get the request interceptor function
      requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
    });

    it('should add Authorization header when token exists', async () => {
      localStorageMock.setItem('token', 'test-jwt-token');

      const config = {
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(result.headers['Authorization']).toBe('Bearer test-jwt-token');
    });

    it('should not add Authorization header when token does not exist', async () => {
      const config = {
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(result.headers['Authorization']).toBeUndefined();
    });

    it('should handle localStorage access errors', async () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      const config = {
        headers: {}
      };

      // Should not throw and should handle gracefully
      const result = await requestInterceptor(config);

      expect(result.headers['Authorization']).toBeUndefined();
    });

    it('should preserve existing headers', async () => {
      localStorageMock.setItem('token', 'test-token');

      const config = {
        headers: {
          'X-Custom-Header': 'custom-value',
          'Accept': 'application/json'
        }
      };

      const result = await requestInterceptor(config);

      expect(result.headers['Authorization']).toBe('Bearer test-token');
      expect(result.headers['X-Custom-Header']).toBe('custom-value');
      expect(result.headers['Accept']).toBe('application/json');
    });

    it('should handle null token', async () => {
      localStorageMock.setItem('token', null);

      const config = {
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(result.headers['Authorization']).toBeUndefined();
    });

    it('should handle empty string token', async () => {
      localStorageMock.setItem('token', '');

      const config = {
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(result.headers['Authorization']).toBeUndefined();
    });
  });

  describe('Response Interceptor', () => {
    let responseInterceptor, errorInterceptor;

    beforeEach(() => {
      jest.resetModules();
      require('../../../frontend/src/services/api.service');
      
      // Get the response interceptor functions
      responseInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][0];
      errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];
    });

    describe('Success Response Handling', () => {
      it('should return response data on success', () => {
        const response = {
          data: {
            success: true,
            message: 'Operation successful',
            data: { id: 1, name: 'Test' }
          }
        };

        const result = responseInterceptor(response);

        expect(result).toEqual({
          success: true,
          message: 'Operation successful',
          data: { id: 1, name: 'Test' }
        });
      });

      it('should handle response with no data', () => {
        const response = {
          data: null
        };

        const result = responseInterceptor(response);

        expect(result).toBeNull();
      });

      it('should handle empty response data', () => {
        const response = {
          data: {}
        };

        const result = responseInterceptor(response);

        expect(result).toEqual({});
      });
    });

    describe('Error Response Handling', () => {
      it('should handle 401 unauthorized errors', async () => {
        localStorageMock.setItem('token', 'existing-token');

        const error = {
          response: {
            status: 401,
            data: {
              message: 'Token expired'
            }
          }
        };

        await expect(errorInterceptor(error)).rejects.toEqual({
          success: false,
          message: 'Token expired',
          errors: null
        });

        expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
        expect(mockLocation.href).toBe('/login');
        expect(toast.error).not.toHaveBeenCalled(); // Should not show toast for 401
      });

      it('should handle 403 forbidden errors', async () => {
        const error = {
          response: {
            status: 403,
            data: {
              message: 'Access denied'
            }
          }
        };

        await expect(errorInterceptor(error)).rejects.toEqual({
          success: false,
          message: 'Access denied',
          errors: null
        });

        expect(toast.error).toHaveBeenCalledWith('Access denied');
      });

      it('should handle 404 not found errors', async () => {
        const error = {
          response: {
            status: 404,
            data: {
              message: 'Resource not found'
            }
          }
        };

        await expect(errorInterceptor(error)).rejects.toEqual({
          success: false,
          message: 'Resource not found',
          errors: null
        });

        expect(toast.error).toHaveBeenCalledWith('Resource not found');
      });

      it('should handle 400 validation errors', async () => {
        const error = {
          response: {
            status: 400,
            data: {
              success: false,
              message: 'Validation failed',
              errors: {
                email: 'Email is required',
                password: 'Password too short'
              }
            }
          }
        };

        await expect(errorInterceptor(error)).rejects.toEqual({
          success: false,
          message: 'Validation failed',
          errors: {
            email: 'Email is required',
            password: 'Password too short'
          }
        });

        expect(toast.error).toHaveBeenCalledWith('Validation failed');
      });

      it('should handle 422 validation errors', async () => {
        const error = {
          response: {
            status: 422,
            data: {
              message: 'Unprocessable entity'
            }
          }
        };

        await expect(errorInterceptor(error)).rejects.toEqual({
          success: false,
          message: 'Unprocessable entity',
          errors: null
        });

        expect(toast.error).toHaveBeenCalledWith('Unprocessable entity');
      });

      it('should handle 500 server errors', async () => {
        const error = {
          response: {
            status: 500,
            data: {
              message: 'Internal server error'
            }
          }
        };

        await expect(errorInterceptor(error)).rejects.toEqual({
          success: false,
          message: 'Server error. Please try again later.',
          errors: null
        });

        expect(toast.error).toHaveBeenCalledWith('Server error. Please try again later.');
      });

      it('should handle errors without response data', async () => {
        const error = {
          response: {
            status: 404,
            data: null
          }
        };

        await expect(errorInterceptor(error)).rejects.toEqual({
          success: false,
          message: 'Resource not found',
          errors: null
        });

        expect(toast.error).toHaveBeenCalledWith('Resource not found');
      });

      it('should handle network errors (no response)', async () => {
        const error = {
          request: {},
          message: 'Network Error'
        };

        await expect(errorInterceptor(error)).rejects.toEqual({
          success: false,
          message: 'No response from server. Please check your internet connection.',
          errors: null
        });

        expect(toast.error).toHaveBeenCalledWith('No response from server. Please check your internet connection.');
      });

      it('should handle request setup errors', async () => {
        const error = {
          message: 'Request setup failed'
        };

        await expect(errorInterceptor(error)).rejects.toEqual({
          success: false,
          message: 'Request setup failed',
          errors: null
        });

        expect(toast.error).toHaveBeenCalledWith('Request setup failed');
      });

      it('should handle unknown status codes', async () => {
        const error = {
          response: {
            status: 418,
            data: {
              message: 'I\'m a teapot'
            }
          }
        };

        await expect(errorInterceptor(error)).rejects.toEqual({
          success: false,
          message: 'I\'m a teapot',
          errors: null
        });

        expect(toast.error).toHaveBeenCalledWith('I\'m a teapot');
      });

      it('should handle errors with non-standard response format', async () => {
        const error = {
          response: {
            status: 400,
            data: {
              error: 'Old format error message'
            }
          }
        };

        await expect(errorInterceptor(error)).rejects.toEqual({
          success: false,
          message: 'Old format error message',
          errors: null
        });

        expect(toast.error).toHaveBeenCalledWith('Old format error message');
      });

      it('should use default message when no message available', async () => {
        const error = {
          response: {
            status: 418,
            data: {}
          }
        };

        await expect(errorInterceptor(error)).rejects.toEqual({
          success: false,
          message: 'Error 418',
          errors: null
        });

        expect(toast.error).toHaveBeenCalledWith('Error 418');
      });
    });
  });

  describe('HTTP Methods', () => {
    beforeEach(() => {
      jest.resetModules();
      const ApiServiceModule = require('../../../frontend/src/services/api.service');
      // Re-assign to get the fresh instance
      Object.assign(ApiService, ApiServiceModule.default);
    });

    describe('GET requests', () => {
      it('should make GET request with parameters', async () => {
        const mockResponse = {
          success: true,
          data: { id: 1, name: 'Test Item' }
        };

        mockAxiosInstance.get.mockResolvedValue(mockResponse);

        const result = await ApiService.get('/items', { page: 1, limit: 10 });

        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/items', {
          params: { page: 1, limit: 10 }
        });
        expect(result).toBe(mockResponse);
      });

      it('should make GET request without parameters', async () => {
        const mockResponse = {
          success: true,
          data: []
        };

        mockAxiosInstance.get.mockResolvedValue(mockResponse);

        const result = await ApiService.get('/items');

        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/items', { params: {} });
        expect(result).toBe(mockResponse);
      });

      it('should handle GET request errors', async () => {
        const mockError = new Error('GET request failed');
        mockAxiosInstance.get.mockRejectedValue(mockError);

        await expect(ApiService.get('/items')).rejects.toThrow('GET request failed');
      });
    });

    describe('POST requests', () => {
      it('should make POST request with data', async () => {
        const mockResponse = {
          success: true,
          data: { id: 1, name: 'Created Item' }
        };

        const requestData = { name: 'New Item', description: 'Test description' };

        mockAxiosInstance.post.mockResolvedValue(mockResponse);

        const result = await ApiService.post('/items', requestData);

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/items', requestData);
        expect(result).toBe(mockResponse);
      });

      it('should make POST request without data', async () => {
        const mockResponse = {
          success: true,
          message: 'Action completed'
        };

        mockAxiosInstance.post.mockResolvedValue(mockResponse);

        const result = await ApiService.post('/action');

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/action', {});
        expect(result).toBe(mockResponse);
      });

      it('should handle POST request errors', async () => {
        const mockError = new Error('POST request failed');
        mockAxiosInstance.post.mockRejectedValue(mockError);

        await expect(ApiService.post('/items', { name: 'Test' })).rejects.toThrow('POST request failed');
      });
    });

    describe('PUT requests', () => {
      it('should make PUT request with data', async () => {
        const mockResponse = {
          success: true,
          data: { id: 1, name: 'Updated Item' }
        };

        const updateData = { name: 'Updated Item', status: 'active' };

        mockAxiosInstance.put.mockResolvedValue(mockResponse);

        const result = await ApiService.put('/items/1', updateData);

        expect(mockAxiosInstance.put).toHaveBeenCalledWith('/items/1', updateData);
        expect(result).toBe(mockResponse);
      });

      it('should make PUT request without data', async () => {
        const mockResponse = {
          success: true,
          message: 'Resource updated'
        };

        mockAxiosInstance.put.mockResolvedValue(mockResponse);

        const result = await ApiService.put('/items/1');

        expect(mockAxiosInstance.put).toHaveBeenCalledWith('/items/1', {});
        expect(result).toBe(mockResponse);
      });

      it('should handle PUT request errors', async () => {
        const mockError = new Error('PUT request failed');
        mockAxiosInstance.put.mockRejectedValue(mockError);

        await expect(ApiService.put('/items/1', { name: 'Test' })).rejects.toThrow('PUT request failed');
      });
    });

    describe('DELETE requests', () => {
      it('should make DELETE request with parameters', async () => {
        const mockResponse = {
          success: true,
          message: 'Item deleted'
        };

        mockAxiosInstance.delete.mockResolvedValue(mockResponse);

        const result = await ApiService.delete('/items/1', { force: true });

        expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/items/1', {
          params: { force: true }
        });
        expect(result).toBe(mockResponse);
      });

      it('should make DELETE request without parameters', async () => {
        const mockResponse = {
          success: true,
          message: 'Item deleted'
        };

        mockAxiosInstance.delete.mockResolvedValue(mockResponse);

        const result = await ApiService.delete('/items/1');

        expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/items/1', { params: {} });
        expect(result).toBe(mockResponse);
      });

      it('should handle DELETE request errors', async () => {
        const mockError = new Error('DELETE request failed');
        mockAxiosInstance.delete.mockRejectedValue(mockError);

        await expect(ApiService.delete('/items/1')).rejects.toThrow('DELETE request failed');
      });
    });

    describe('File Upload', () => {
      it('should upload file with progress callback', async () => {
        const mockResponse = {
          success: true,
          data: { id: 1, filename: 'uploaded.pdf' }
        };

        const formData = new FormData();
        formData.append('file', new Blob(['test content']), 'test.pdf');

        const progressCallback = jest.fn();

        mockAxiosInstance.post.mockResolvedValue(mockResponse);

        const result = await ApiService.uploadFile('/upload', formData, progressCallback);

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: progressCallback
        });
        expect(result).toBe(mockResponse);
      });

      it('should upload file without progress callback', async () => {
        const mockResponse = {
          success: true,
          data: { id: 1, filename: 'uploaded.pdf' }
        };

        const formData = new FormData();
        formData.append('file', new Blob(['test content']), 'test.pdf');

        mockAxiosInstance.post.mockResolvedValue(mockResponse);

        const result = await ApiService.uploadFile('/upload', formData);

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: null
        });
        expect(result).toBe(mockResponse);
      });

      it('should handle file upload errors', async () => {
        const mockError = new Error('Upload failed');
        mockAxiosInstance.post.mockRejectedValue(mockError);

        const formData = new FormData();
        formData.append('file', new Blob(['test content']), 'test.pdf');

        await expect(ApiService.uploadFile('/upload', formData)).rejects.toThrow('Upload failed');
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(() => {
      jest.resetModules();
      const ApiServiceModule = require('../../../frontend/src/services/api.service');
      Object.assign(ApiService, ApiServiceModule.default);
    });

    it('should handle axios timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'ECONNABORTED';
      mockAxiosInstance.get.mockRejectedValue(timeoutError);

      await expect(ApiService.get('/slow-endpoint')).rejects.toThrow('Request timeout');
    });

    it('should handle network connectivity issues', async () => {
      const networkError = new Error('Network Error');
      networkError.request = {};
      mockAxiosInstance.get.mockRejectedValue(networkError);

      await expect(ApiService.get('/items')).rejects.toThrow('Network Error');
    });

    it('should handle malformed JSON responses', async () => {
      const malformedError = new Error('Unexpected token in JSON');
      mockAxiosInstance.get.mockRejectedValue(malformedError);

      await expect(ApiService.get('/items')).rejects.toThrow('Unexpected token in JSON');
    });

    it('should handle concurrent requests', async () => {
      const mockResponse1 = { success: true, data: { id: 1 } };
      const mockResponse2 = { success: true, data: { id: 2 } };
      const mockResponse3 = { success: true, data: { id: 3 } };

      mockAxiosInstance.get
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)
        .mockResolvedValueOnce(mockResponse3);

      const promises = [
        ApiService.get('/items/1'),
        ApiService.get('/items/2'),
        ApiService.get('/items/3')
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results[0]).toBe(mockResponse1);
      expect(results[1]).toBe(mockResponse2);
      expect(results[2]).toBe(mockResponse3);
    });

    it('should handle large payloads', async () => {
      const largeData = {
        items: Array.from({ length: 10000 }, (_, i) => ({
          id: i + 1,
          name: `Item ${i + 1}`,
          description: 'x'.repeat(1000)
        }))
      };

      const mockResponse = {
        success: true,
        data: largeData
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await ApiService.post('/bulk-create', largeData);

      expect(result).toBe(mockResponse);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/bulk-create', largeData);
    });

    it('should handle special characters in URLs and data', async () => {
      const specialData = {
        name: 'Test & Item™',
        description: 'Description with "quotes" and <tags>',
        unicode: 'Unicode: ñáéíóú 中文 العربية'
      };

      const mockResponse = {
        success: true,
        data: specialData
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await ApiService.post('/items with spaces', specialData);

      expect(result).toBe(mockResponse);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/items with spaces', specialData);
    });

    it('should handle undefined and null values in requests', async () => {
      const mockResponse = { success: true };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      // Should not throw errors
      await ApiService.get('/items', undefined);
      await ApiService.post('/items', null);
      await ApiService.put('/items/1', undefined);
      await ApiService.delete('/items/1', null);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/items', { params: {} });
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/items', {});
      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/items/1', {});
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/items/1', { params: {} });
    });
  });

  describe('Security Features', () => {
    beforeEach(() => {
      jest.resetModules();
      require('../../../frontend/src/services/api.service');
    });

    it('should have reasonable timeout configured', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000
        })
      );
    });

    it('should set correct Content-Type header', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json'
          }
        })
      );
    });

    it('should handle token injection securely', async () => {
      jest.resetModules();
      require('../../../frontend/src/services/api.service');
      
      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];

      // Test with potentially malicious token
      localStorageMock.setItem('token', '<script>alert("xss")</script>');

      const config = {
        headers: {}
      };

      const result = await requestInterceptor(config);

      expect(result.headers['Authorization']).toBe('Bearer <script>alert("xss")</script>');
      // Should not execute the script - just treat as string
    });

    it('should not leak sensitive data in error messages', async () => {
      jest.resetModules();
      require('../../../frontend/src/services/api.service');
      
      const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

      const error = {
        response: {
          status: 400,
          data: {
            message: 'Validation failed',
            debug: {
              password: 'secret123',
              apiKey: 'super-secret-key'
            }
          }
        }
      };

      await expect(errorInterceptor(error)).rejects.toEqual({
        success: false,
        message: 'Validation failed',
        errors: null
      });

      // Verify sensitive data isn't in toast message
      expect(toast.error).toHaveBeenCalledWith('Validation failed');
      expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('secret123'));
      expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('super-secret-key'));
    });
  });
});