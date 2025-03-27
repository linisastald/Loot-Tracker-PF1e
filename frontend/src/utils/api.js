// frontend/src/utils/api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for cookies including CSRF token
  timeout: 10000, // 10 second timeout
});

// Function to fetch CSRF token
const fetchCsrfToken = async () => {
  try {
    console.log('Fetching CSRF token from:', `${API_URL}/csrf-token`);
    const response = await axios.get(`${API_URL}/csrf-token`, {
      withCredentials: true,
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

    if (response.data && response.data.data && response.data.data.csrfToken) {
      const token = response.data.data.csrfToken;
      localStorage.setItem('csrfToken', token);
      console.log('CSRF token fetched successfully');
      return token;
    } else {
      console.error('Invalid CSRF token response:', response.data);
      return null;
    }
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
    return null;
  }
};

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    // For auth routes, no need to add csrf token
    if (config.url && (
        config.url.includes('/auth/login') ||
        config.url.includes('/auth/register') ||
        config.url.includes('/auth/check-dm') ||
        config.url.includes('/auth/check-registration-status'))) {
      return config;
    }

    // For all other routes, ensure we have a CSRF token
    let csrfToken = localStorage.getItem('csrfToken');

    // If no token exists, fetch a new one
    if (!csrfToken) {
      csrfToken = await fetchCsrfToken();
    }

    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    } else {
      console.error('No CSRF token available');
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    // Log incoming response details (in dev mode only)
    if (process.env.NODE_ENV === 'development') {
      console.log('API Response:', {
        url: response.config.url,
        method: response.config.method,
        status: response.status
      });
    }

    // Normalize response to ensure consistent structure
    if (response.data && response.data.success === true) {
      return response.data;
    } else if (response.data) {
      return response.data;
    }

    return response;
  },
  async (error) => {
    // Log detailed error information
    console.error('API Error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    // Handle CSRF token errors by fetching a new token
    if (error.response && error.response.status === 403 &&
        error.response.data &&
        (error.response.data.message === 'invalid csrf token' ||
         error.response.data.error === 'invalid csrf token')) {
      console.log('CSRF token error detected, fetching new token');
      localStorage.removeItem('csrfToken');

      // Fetch a new token
      await fetchCsrfToken();

      // Retry the request with the new token
      const originalRequest = error.config;
      if (!originalRequest._retry) {
        originalRequest._retry = true;
        originalRequest.headers['X-CSRF-Token'] = localStorage.getItem('csrfToken');
        return api(originalRequest);
      }
    }

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

// Initialize CSRF token fetch on module load
fetchCsrfToken();

export default api;