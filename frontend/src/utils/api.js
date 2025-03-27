// frontend/src/utils/api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 10000,
});

// Function to fetch CSRF token
const fetchCsrfToken = async () => {
  try {
    console.log('Fetching CSRF token from:', `${API_URL}/csrf-token`);
    const response = await axios.get(`${API_URL}/csrf-token`, { withCredentials: true });

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
    // Skip CSRF for auth routes
    if (config.url && (
        config.url.includes('/auth/login') ||
        config.url.includes('/auth/register') ||
        config.url.includes('/auth/check-dm') ||
        config.url.includes('/auth/check-registration-status'))) {
      return config;
    }

    let csrfToken = localStorage.getItem('csrfToken');

    // If no token exists, fetch a new one
    if (!csrfToken) {
      csrfToken = await fetchCsrfToken();
    }

    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', {
      url: response.config.url,
      method: response.config.method,
      status: response.status
    });

    return response.data;
  },
  async (error) => {
    console.error('API Error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    // Handle CSRF token errors
    if (error.response?.status === 403 &&
        (error.response?.data?.error === 'invalid csrf token' ||
         error.response?.data?.message === 'invalid csrf token')) {

      console.log('CSRF token error detected, fetching new token');
      localStorage.removeItem('csrfToken');
      const newToken = await fetchCsrfToken();

      if (newToken && error.config) {
        // Retry the request with new token
        error.config.headers['X-CSRF-Token'] = newToken;
        return axios(error.config);
      }
    }

    return Promise.reject(error);
  }
);

// Initialize CSRF token fetch
fetchCsrfToken();

export default api;