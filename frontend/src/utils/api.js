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
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    const csrfToken = localStorage.getItem('csrfToken');
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

const fetchCsrfToken = async () => {
  try {
    console.log(`Attempting to fetch CSRF token from: ${API_URL}/csrf-token`);
    const response = await api.get('/csrf-token', {
      timeout: 5000 // Separate timeout for CSRF token request
    });
    localStorage.setItem('csrfToken', response.data.csrfToken || 'temporary-token-for-development');
    console.log('CSRF token fetched successfully');
  } catch (error) {
    console.error('Error fetching CSRF token:', error);

    // Provide a fallback token for development
    localStorage.setItem('csrfToken', 'temporary-token-for-development');

    // Check if it's a network error
    if (error.message === 'Network Error' || error.code === 'ERR_CONNECTION_REFUSED') {
      console.warn('Unable to connect to backend. Ensure the backend server is running.');
      console.warn(`Tried to connect to: ${API_URL}/csrf-token`);
      console.warn('Possible causes:');
      console.warn('1. Backend server is not running');
      console.warn('2. Incorrect API_URL in .env file');
      console.warn('3. Network/firewall issues');
    }
  }
};

// Initialize CSRF token fetch
fetchCsrfToken();

// Add a custom error interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.message === 'Network Error' || error.code === 'ERR_CONNECTION_REFUSED') {
      console.error('Network connection error:', error);
      // You might want to add a global error notification here
    }
    return Promise.reject(error);
  }
);

export default api;