// src/App.js
import CssBaseline from '@mui/material/CssBaseline';
import React, {useEffect, useState} from 'react';
import {BrowserRouter as Router, Navigate, Route, Routes} from 'react-router-dom';
import {ThemeProvider} from '@mui/material/styles';
import {Box, CircularProgress} from '@mui/material';


import Login from './components/pages/Login';
import Register from './components/pages/Register';
import ForgotPassword from './components/pages/ForgotPassword';
import ResetPassword from './components/pages/ResetPassword';
import LootEntry from './components/pages/LootEntry';
import GoldTransactions from './components/pages/GoldTransactions';
import UserSettings from './components/pages/UserSettings';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/hoc/ProtectedRoute';
import CharacterAndUserManagement from './components/pages/CharacterAndUserManagement';
import Consumables from "./components/pages/Consumables";
import ItemManagement from "./components/pages/ItemManagement";
import GolarionCalendar from "./components/pages/GolarionCalendar";
import Tasks from "./components/pages/Tasks";
import Identify from './components/pages/Identify';
import LootManagement from './components/pages/LootManagement';
import Infamy from './components/pages/Infamy';


import theme from './theme';
import api from './utils/api';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    // First check localStorage for user data
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        if (isMounted) {
          setIsAuthenticated(true);
          setUser(userData);
        }
      } catch (e) {
        console.error('Error parsing stored user data:', e);
        localStorage.removeItem('user');
      }
    }

    // Then verify with server that the token is still valid
    const checkAuthStatus = async () => {
      try {
        const response = await api.get('/auth/status');

        // Check if the response contains success flag
        if (response && response.success && isMounted) {
          setIsAuthenticated(true);
          setUser(response.data.user);
          localStorage.setItem('user', JSON.stringify(response.data.user));
        } else {
          // Only log out if we get an explicit authentication failure and there's no stored user
          if (!storedUser && isMounted) {
            handleLogout();
          }
        }
      } catch (error) {
        // Only log out on 401 status
        if (error.response && error.response.status === 401 && isMounted) {
          handleLogout();
        }
      } finally {
        if (isMounted) {
          setAuthLoading(false);
        }
      }
    };

    checkAuthStatus();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = (user) => {
    // Only store user info, token is in HTTP-only cookie
    localStorage.setItem('user', JSON.stringify(user));
    setIsAuthenticated(true);
    setUser(user);
    // No need to set Authorization header, cookie will be sent automatically
  };
  const handleLogout = async () => {
    try {
      // Clear local storage
      localStorage.removeItem('user');

      // Log out from server to clear the HTTP-only cookie
      await api.post('/auth/logout').catch(() => {
        // Logout request failed, but user was logged out locally
      });
    } catch (error) {
      console.error('Error during logout:', error);
    }

    // Update the local state
    setIsAuthenticated(false);
    setUser(null);
  };

  // Show loading spinner while checking authentication
  if (authLoading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            backgroundColor: 'background.default'
          }}
        >
          <CircularProgress size={40} role="status" aria-label="Loading application" />
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/" element={isAuthenticated ? <Navigate to="/loot-entry" /> : <Navigate to="/login" />} />
          <Route path="/login" element={
            // If already authenticated, redirect to main page
            isAuthenticated ?
              <Navigate to="/loot-entry" replace /> :
              <Login onLogin={handleLogin} />
          } />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Protected routes using the ProtectedRoute component */}
          <Route path="/" element={<ProtectedRoute isAuthenticated={isAuthenticated}><MainLayout onLogout={handleLogout} /></ProtectedRoute>}>
            <Route path="loot-entry" element={<LootEntry />} />
            <Route path="loot-management/*" element={<LootManagement />} />
            {/* Redirects for old URLs */}
            <Route path="unprocessed-loot" element={<Navigate to="/loot-management/unprocessed" replace />} />
            <Route path="kept-party" element={<Navigate to="/loot-management/kept-party" replace />} />
            <Route path="kept-character" element={<Navigate to="/loot-management/kept-character" replace />} />
            <Route path="sold-loot" element={<Navigate to="/loot-management/sold" replace />} />
            <Route path="given-away-or-trashed" element={<Navigate to="/loot-management/trashed" replace />} />
            <Route path="gold-transactions" element={<GoldTransactions />} />
            <Route path="user-settings" element={<UserSettings />} />
            <Route path="character-user-management/*" element={<CharacterAndUserManagement />} />
            <Route path="item-management/*" element={<ItemManagement />} />
            <Route path="golarion-calendar" element={<GolarionCalendar />} />
            <Route path="consumables" element={<Consumables />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="identify" element={<Identify />} />
            <Route path="infamy" element={<Infamy />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;