// frontend/src/utils/auth.js

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