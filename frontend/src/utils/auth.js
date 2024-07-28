import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL

export const login = async (email, password) => {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, { email, password });
    localStorage.setItem('token', response.data.token);
    return response.data;
  } catch (error) {
    console.error('Error logging in:', error.response ? error.response.data : error.message);
    throw error.response ? error.response.data : error.message;
  }
};

export const register = async (userData) => {
  try {
    const response = await axios.post(`${API_URL}/auth/register`, userData);
    return response.data;
  } catch (error) {
    console.error('Error registering:', error.response ? error.response.data : error.message);
    throw error.response ? error.response.data : error.message;
  }
};

export const logout = () => {
  localStorage.removeItem('token');
};

export const isAuthenticated = () => {
  const token = localStorage.getItem('token');
  if (!token) return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp <= Date.now() / 1000) {
      localStorage.removeItem('token'); // Clear expired token
      return false;
    }
    return true;
  } catch (e) {
    console.error('Invalid token:', e);
    localStorage.removeItem('token'); // Clear invalid token
    return false;
  }
};
export const getUserRole = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role;
  } catch (e) {
    console.error('Invalid token:', e);
    return null;
  }
};

export const isDM = () => {
  return getUserRole() === 'DM';
};