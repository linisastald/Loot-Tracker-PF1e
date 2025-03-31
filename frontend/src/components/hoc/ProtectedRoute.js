import React, {useEffect, useState} from 'react';
import {Navigate} from 'react-router-dom';
import api from '../../utils/api';

const ProtectedRoute = ({ children, isAuthenticated: propIsAuthenticated }) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    // If authentication status is provided via props, use it directly
    if (propIsAuthenticated !== undefined) {
      setIsAuthed(propIsAuthenticated);
      setAuthChecked(true);
      return;
    }

    // First perform a quick check using localStorage
    const userStr = localStorage.getItem('user');
    let userFromStorage = null;

    if (userStr) {
      try {
        userFromStorage = JSON.parse(userStr);
        setIsAuthed(true);
        console.log('User found in localStorage, treating as authenticated');
      } catch (e) {
        console.error('Error parsing user data from localStorage:', e);
        localStorage.removeItem('user');
      }
    }

    // Then verify with the server to confirm the token is still valid
    const verifyAuth = async () => {
      try {
        console.log('ProtectedRoute: Verifying auth with server');
        const response = await api.get('/auth/status');
        console.log('ProtectedRoute auth response:', response);

        if (response && response.success) {
          console.log('Server confirmed authentication is valid');
          setIsAuthed(true);

          // Update user in localStorage if needed
          if (response.data && response.data.user) {
            localStorage.setItem('user', JSON.stringify(response.data.user));
          }
        } else {
          console.warn('Server returned unsuccessful auth status');

          // If we have user in localStorage, keep them authenticated
          // This provides offline resilience when server checks temporarily fail
          if (!userFromStorage) {
            setIsAuthed(false);
          }
        }
      } catch (error) {
        console.error('Error during auth verification:', error);

        // Only log out on explicit 401 unauthorized
        if (error.response && error.response.status === 401) {
          console.log('Received 401 Unauthorized, removing authentication');
          setIsAuthed(false);
          localStorage.removeItem('user');
        } else if (userFromStorage) {
          // For other errors, keep user logged in if we have local data
          console.log('Error occurred but keeping user authenticated based on localStorage');
        }
      } finally {
        setAuthChecked(true);
      }
    };

    verifyAuth();
  }, [propIsAuthenticated]);

  // Show nothing while checking authentication
  if (!authChecked) {
    console.log('Still checking authentication status...');
    return null;
  }

  // Redirect to login if not authenticated
  if (!isAuthed) {
    console.log('Not authenticated, redirecting to login');
    return <Navigate to="/login" />;
  }

  // Render children if authenticated
  console.log('Authentication confirmed, rendering protected route');
  return children;
};

export default ProtectedRoute;