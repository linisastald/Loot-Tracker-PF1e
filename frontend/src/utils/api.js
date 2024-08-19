// api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://192.168.0.64:5000/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true
});

api.interceptors.request.use(
  async (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // Add CSRF token to the request
    const csrfToken = localStorage.getItem('csrfToken');
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Add a response interceptor to capture CSRF token
api.interceptors.response.use(
  (response) => {
    const csrfToken = response.headers['x-csrf-token'];
    if (csrfToken) {
      localStorage.setItem('csrfToken', csrfToken);
    }
    return response;
  },
  (error) => Promise.reject(error)
);

export default api;