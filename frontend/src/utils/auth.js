// Update isAuthenticated in frontend/src/utils/auth.js
import api from './api';

export const isAuthenticated = async () => {
  try {
    // Check authentication by making an API call
    const response = await api.get('/auth/status');
    return response.data && response.data.success;
  } catch (error) {
    console.error('Authentication check failed:', error);
    return false;
  }
};

export const getUserRole = () => {
  // Get role from user data in localStorage
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;

  try {
    const user = JSON.parse(userStr);
    return user.role;
  } catch (e) {
    console.error('Invalid user data:', e);
    return null;
  }
};

export const isDM = () => {
  return getUserRole() === 'DM';
};