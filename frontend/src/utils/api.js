// src/utils/api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

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
    const response = await api.get('/csrf-token');
    localStorage.setItem('csrfToken', response.data.csrfToken);
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
  }
};

fetchCsrfToken();

export default api;