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

    // Check local storage first for a quick initial check
    const userStr = localStorage.getItem('user');
    if (userStr) {
      setIsAuthed(true);
    }

    // Then verify with server that the token is still valid
    const checkAuth = async () => {
      try {
        const response = await api.get('/auth/status');
        if (response?.data?.success) {
          setIsAuthed(true);
          // Update user in localStorage if it has changed
          if (response.data.user) {
            localStorage.setItem('user', JSON.stringify(response.data.user));
          }
        } else {
          // Only set to false if we get an explicit failure
          console.warn('Auth check returned unsuccessful');
          setIsAuthed(false);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        // Only set to false on 401 status
        if (error.response && error.response.status === 401) {
          setIsAuthed(false);
          localStorage.removeItem('user');
        }
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