import React from 'react';
import {Navigate} from 'react-router-dom';
import api from '../../utils/api';

const ProtectedRoute = ({ children, isAuthenticated }) => {
  // If authentication status is provided via props, use it directly
  if (isAuthenticated !== undefined) {
    return isAuthenticated ? children : <Navigate to="/login" />;
  }

  // Quick check using localStorage for immediate auth state
  const userStr = localStorage.getItem('user');
  if (!userStr) {
    return <Navigate to="/login" />;
  }

  try {
    JSON.parse(userStr);
    return children;
  } catch (e) {
    localStorage.removeItem('user');
    return <Navigate to="/login" />;
  }
};

export default ProtectedRoute;