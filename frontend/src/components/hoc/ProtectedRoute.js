import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated } from '../../utils/auth';

const ProtectedRoute = ({ children }) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    // Check authentication status and update state
    const checkAuth = async () => {
      try {
        const authed = await isAuthenticated();
        setIsAuthed(authed);
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthed(false);
      } finally {
        setAuthChecked(true);
      }
    };

    checkAuth();
  }, []);

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