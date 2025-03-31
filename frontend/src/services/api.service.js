// src/services/api.service.js
import axios from 'axios';
import {toast} from 'react-toastify'; // Assuming you're using react-toastify for notifications

/**
 * Base API URL from environment
 */
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

/**
 * Default request timeout in milliseconds
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Configure axios instance with defaults
 */
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: DEFAULT_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor for API calls
 */
apiClient.interceptors.request.use(
  async (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor for API calls
 */
apiClient.interceptors.response.use(
  (response) => {
    // For successful responses, expect the standard format:
    // { success: true, message: string, data: any }
    return response.data;
  },
  (error) => {
    // Handle errors consistently
    const errorResponse = {
      success: false,
      message: 'An unknown error occurred',
      errors: null
    };

    if (error.response) {
      // The server responded with a status code outside the 2xx range
      const { data, status } = error.response;

      // Use standardized error format if available
      if (data) {
        if (data.success === false) {
          // The API already returned our standardized format
          errorResponse.message = data.message || errorResponse.message;
          errorResponse.errors = data.errors;
        } else {
          // Handle other types of error responses
          errorResponse.message = data.message || data.error || errorResponse.message;
        }
      }

      // Handle specific HTTP status codes
      switch (status) {
        case 401:
          // Unauthorized - clear token and redirect to login
          localStorage.removeItem('token');
          window.location.href = '/login';
          break;
        case 403:
          // Forbidden
          errorResponse.message = data.message || 'You do not have permission to access this resource';
          break;
        case 404:
          // Not found
          errorResponse.message = data.message || 'Resource not found';
          break;
        case 422:
        case 400:
          // Validation errors
          errorResponse.message = data.message || 'Validation error';
          break;
        case 500:
          // Server error
          errorResponse.message = 'Server error. Please try again later.';
          break;
        default:
          // Other errors
          errorResponse.message = data.message || `Error ${status}`;
      }
    } else if (error.request) {
      // The request was made but no response was received
      errorResponse.message = 'No response from server. Please check your internet connection.';
    } else {
      // Something happened in setting up the request
      errorResponse.message = error.message;
    }

    // Show a toast for all errors except 401 (which redirects)
    if (error.response?.status !== 401) {
      toast.error(errorResponse.message);
    }

    return Promise.reject(errorResponse);
  }
);

/**
 * Standardized API service with consistent error handling and response formatting
 */
const ApiService = {
  /**
   * Make a GET request
   * @param {string} endpoint - API endpoint
   * @param {Object} params - URL parameters
   * @returns {Promise<any>} - API response data
   */
  async get(endpoint, params = {}) {
    try {
      const response = await apiClient.get(endpoint, { params });
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Make a POST request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @returns {Promise<any>} - API response data
   */
  async post(endpoint, data = {}) {
    try {
      const response = await apiClient.post(endpoint, data);
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Make a PUT request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @returns {Promise<any>} - API response data
   */
  async put(endpoint, data = {}) {
    try {
      const response = await apiClient.put(endpoint, data);
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Make a DELETE request
   * @param {string} endpoint - API endpoint
   * @param {Object} params - URL parameters
   * @returns {Promise<any>} - API response data
   */
  async delete(endpoint, params = {}) {
    try {
      const response = await apiClient.delete(endpoint, { params });
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Upload a file
   * @param {string} endpoint - API endpoint
   * @param {FormData} formData - Form data with file
   * @param {Function} onUploadProgress - Progress callback
   * @returns {Promise<any>} - API response data
   */
  async uploadFile(endpoint, formData, onUploadProgress = null) {
    try {
      const response = await apiClient.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress,
      });
      return response;
    } catch (error) {
      throw error;
    }
  }
};

export default ApiService;