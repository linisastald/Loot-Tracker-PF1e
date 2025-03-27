export const isAuthenticated = () => {
  const token = localStorage.getItem('token');
  if (!token) return false;

  try {
    // Check if token is in JWT format (has two dots)
    if (!token.includes('.')) {
      console.error('Invalid token format - not a JWT');
      localStorage.removeItem('token');
      return false;
    }

    // Try to decode and validate expiration
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp <= Math.floor(Date.now() / 1000)) {
      localStorage.removeItem('token'); // Clear expired token
      return false;
    }
    return true;
  } catch (e) {
    console.error('Token validation error:', e);
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