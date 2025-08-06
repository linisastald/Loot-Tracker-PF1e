// src/utils/apiService.js
import axios from 'axios';
import api from './api';

/**
 * A service for making API requests with standard error handling and response processing
 */
class ApiService {
  /**
   * Create a new API service for a specific resource
   * @param {string} resource - The API resource (e.g., 'loot', 'gold')
   */
  constructor(resource) {
    this.resource = resource;
    this.baseUrl = `/api/${resource}`;
  }

  /**
   * Make a GET request to the API
   * @param {string} [endpoint=''] - Additional endpoint to append to the base URL
   * @param {Object} [params={}] - Query parameters
   * @returns {Promise<any>} - The response data
   */
  async get(endpoint = '', params = {}) {
    try {
      const response = await api.get(`${this.baseUrl}${endpoint ? `/${endpoint}` : ''}`, { params });
      return response.data;
    } catch (error) {
      this.handleError(error, 'get');
      throw error;
    }
  }

  /**
   * Make a POST request to the API
   * @param {string} [endpoint=''] - Additional endpoint to append to the base URL
   * @param {Object} data - Data to send in the request body
   * @returns {Promise<any>} - The response data
   */
  async post(endpoint = '', data = {}) {
    try {
      const response = await api.post(`${this.baseUrl}${endpoint ? `/${endpoint}` : ''}`, data);
      return response.data;
    } catch (error) {
      this.handleError(error, 'post');
      throw error;
    }
  }

  /**
   * Make a PUT request to the API
   * @param {string} endpoint - Endpoint to append to the base URL
   * @param {Object} data - Data to send in the request body
   * @returns {Promise<any>} - The response data
   */
  async put(endpoint, data = {}) {
    try {
      const response = await api.put(`${this.baseUrl}/${endpoint}`, data);
      return response.data;
    } catch (error) {
      this.handleError(error, 'put');
      throw error;
    }
  }

  /**
   * Make a DELETE request to the API
   * @param {string} endpoint - Endpoint to append to the base URL
   * @returns {Promise<any>} - The response data
   */
  async delete(endpoint) {
    try {
      const response = await api.delete(`${this.baseUrl}/${endpoint}`);
      return response.data;
    } catch (error) {
      this.handleError(error, 'delete');
      throw error;
    }
  }

  /**
   * Handle API errors in a standard way
   * @param {Error} error - The error object
   * @param {string} method - The HTTP method that caused the error
   * @private
   */
  handleError(error, method) {
    const resourceName = this.resource.charAt(0).toUpperCase() + this.resource.slice(1);

    if (axios.isCancel(error)) {
      // Request cancelled - no action needed
      return;
    }

    if (error.response) {
      // Server responded with an error status code
      // Log API error (consider using proper error tracking service)
      // Error: ${resourceName} API ${method} error: ${error.response.status}
    } else if (error.request) {
      // Request was made but no response was received
      // Log network error (consider using proper error tracking service)
      // Error: ${resourceName} API ${method} error: No response received
    } else {
      // Something else happened while setting up the request
      // Log request setup error (consider using proper error tracking service)
      // Error: ${resourceName} API ${method} error: ${error.message}
    }
  }

  /**
   * Create an instance for a specific resource
   * @param {string} resource - The API resource
   * @returns {ApiService} - A new ApiService instance
   * @static
   */
  static for(resource) {
    return new ApiService(resource);
  }
}

// Create services for common resources
export const lootService = new ApiService('loot');
export const goldService = new ApiService('gold');
export const userService = new ApiService('user');
export const soldService = new ApiService('sold');
export const consumablesService = new ApiService('consumables');
export const calendarService = new ApiService('calendar');
export const settingsService = new ApiService('settings');

export default ApiService;