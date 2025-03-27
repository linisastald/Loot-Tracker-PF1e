import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../../utils/api';

const ProtectedRoute = ({ children, isAuthenticated: propIsAuthenticated }) => {
  const [authChecked, setAuthChecked] = useState(propIsAuthenticated !== undefined);
  const [isAuthed, setIsAuthed] = useState(propIsAuthenticated || false);

  useEffect(() => {
    // Skip API call if authentication status is already provided via props
    if (propIsAuthenticated !== undefined) {
      return;
    }

    // Only check authentication if not provided by parent
    const checkAuth = async () => {
      try {
        const response = await api.get('/auth/status');
        setIsAuthed(response.data && response.data.success);
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthed(false);
      } finally {
        setAuthChecked(true);
      }
    };

    checkAuth();
  }, [propIsAuthenticated]); // Add propIsAuthenticated as dependency

  // Show nothing while checking authentication
  if (!authChecked) {
    return null;
  }

  // Redirect to login if not authenticated
  if (!isAuthed) {
    return <Navigate to="/login" />;
  }

  // Render children if authenticated
  return children;
};

export default ProtectedRoute;