// src/utils/api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 10000, // 10 second timeout
});

api.interceptors.request.use(
  async (config) => {
    const token = localStorage.getItem('token');
    const csrfToken = localStorage.getItem('csrfToken');
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Enhanced response interceptor
api.interceptors.response.use(
  (response) => {
    // Log incoming response details
    console.log('Incoming Response:', {
      url: response.config.url,
      method: response.config.method,
      status: response.status,
      data: response.data
    });

    // Normalize response to ensure consistent structure
    if (response.data && response.data.success === true) {
      return response.data;
    }

    // If response doesn't match expected structure, log and throw error
    console.warn('Unexpected response structure:', response);
    throw new Error('Unexpected server response');
  },
  (error) => {
    // Log detailed error information
    console.error('API Error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    // Provide more detailed error handling
    if (error.response) {
      // The request was made and the server responded with a status code
      const errorMessage = error.response.data?.message ||
                           error.response.data?.error ||
                           'An unexpected error occurred';

      return Promise.reject({
        ...error,
        message: errorMessage,
        status: error.response.status
      });
    } else if (error.request) {
      // The request was made but no response was received
      return Promise.reject({
        message: 'No response received from server',
        type: 'network'
      });
    } else {
      // Something happened in setting up the request
      return Promise.reject({
        message: error.message || 'Error setting up the request',
        type: 'unknown'
      });
    }
  }
);

const fetchCsrfToken = async () => {
  try {
    console.log(`Attempting to fetch CSRF token from: ${API_URL}/csrf-token`);
    const response = await api.get('/csrf-token');
    localStorage.setItem('csrfToken', response.csrfToken || 'temporary-token-for-development');
    console.log('CSRF token fetched successfully');
  } catch (error) {
    console.error('Error fetching CSRF token:', error);

    // Provide a fallback token for development
    localStorage.setItem('csrfToken', 'temporary-token-for-development');
  }
};

// Initialize CSRF token fetch
fetchCsrfToken();

export default api;