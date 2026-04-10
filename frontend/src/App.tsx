// src/App.js
import CssBaseline from '@mui/material/CssBaseline';
import React, {Suspense, useCallback, useEffect, useState} from 'react';
import {BrowserRouter as Router, Navigate, Route, Routes} from 'react-router-dom';
import {ThemeProvider} from '@mui/material/styles';
import {Box, CircularProgress} from '@mui/material';

// Eagerly loaded (needed immediately for auth flow)
import Login from './components/pages/Login';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/hoc/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy loaded page components
const Register = React.lazy(() => import('./components/pages/Register'));
const ForgotPassword = React.lazy(() => import('./components/pages/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./components/pages/ResetPassword'));
const LootEntry = React.lazy(() => import('./components/pages/LootEntry'));
const GoldTransactions = React.lazy(() => import('./components/pages/GoldTransactions'));
const UserSettings = React.lazy(() => import('./components/pages/UserSettings'));
const CharacterAndUserManagement = React.lazy(() => import('./components/pages/CharacterAndUserManagement'));
const Consumables = React.lazy(() => import('./components/pages/Consumables'));
const ItemManagement = React.lazy(() => import('./components/pages/ItemManagement'));
const GolarionCalendar = React.lazy(() => import('./components/pages/GolarionCalendar'));
const Tasks = React.lazy(() => import('./components/pages/Tasks'));
const Identify = React.lazy(() => import('./components/pages/Identify'));
const LootManagement = React.lazy(() => import('./components/pages/LootManagement'));
const Infamy = React.lazy(() => import('./components/pages/Infamy'));
const ShipManagement = React.lazy(() => import('./components/pages/ShipManagement'));
const OutpostManagement = React.lazy(() => import('./components/pages/OutpostManagement'));
const CrewManagement = React.lazy(() => import('./components/pages/CrewManagement'));
const SessionsPage = React.lazy(() => import('./components/pages/Sessions/SessionsPage'));
const SessionManagement = React.lazy(() => import('./components/pages/DMSettings/SessionManagement'));
const CityServices = React.lazy(() => import('./components/pages/CityServices'));


import theme from './theme';
import api from './utils/api';
import { ConfigProvider } from './contexts/ConfigContext';
import { AuthProvider } from './contexts/AuthContext';

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
        if (response && response.data && response.data.success && isMounted) {
          setIsAuthenticated(true);
          setUser(response.data.user);
          localStorage.setItem('user', JSON.stringify(response.data.user));
        } else {
          // Only log out if we get an explicit authentication failure and there's no stored user
          if (!storedUser && isMounted) {
            handleLogout();
          }
        }
      } catch (error: unknown) {
        // Only log out on 401 status
        if (error && typeof error === 'object' && 'response' in error) {
          const axiosError = error as any;
          if (axiosError.response && axiosError.response.status === 401 && isMounted) {
            handleLogout();
          }
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

  const handleLogin = (user: any) => {
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

  const handleUserUpdate = useCallback((updatedUser: any) => {
    setUser(updatedUser);
    if (updatedUser) {
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  }, []);

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
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ConfigProvider>
          <AuthProvider user={user} isAuthenticated={isAuthenticated} onUserUpdate={handleUserUpdate}>
          <Router>
          <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><CircularProgress size={40} /></Box>}>
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
              <Route path="loot-entry" element={<ErrorBoundary><LootEntry /></ErrorBoundary>} />
              <Route path="loot-management/*" element={<ErrorBoundary><LootManagement /></ErrorBoundary>} />
              {/* Redirects for old URLs */}
              <Route path="unprocessed-loot" element={<Navigate to="/loot-management/unprocessed" replace />} />
              <Route path="kept-party" element={<Navigate to="/loot-management/kept-party" replace />} />
              <Route path="kept-character" element={<Navigate to="/loot-management/kept-character" replace />} />
              <Route path="sold-loot" element={<Navigate to="/loot-management/sold" replace />} />
              <Route path="given-away-or-trashed" element={<Navigate to="/loot-management/trashed" replace />} />
              <Route path="gold-transactions" element={<ErrorBoundary><GoldTransactions /></ErrorBoundary>} />
              <Route path="user-settings" element={<ErrorBoundary><UserSettings /></ErrorBoundary>} />
              <Route path="character-user-management/*" element={<ErrorBoundary><CharacterAndUserManagement /></ErrorBoundary>} />
              <Route path="item-management/*" element={<ErrorBoundary><ItemManagement /></ErrorBoundary>} />
              <Route path="golarion-calendar" element={<ErrorBoundary><GolarionCalendar /></ErrorBoundary>} />
              <Route path="consumables" element={<ErrorBoundary><Consumables /></ErrorBoundary>} />
              <Route path="tasks" element={<ErrorBoundary><Tasks /></ErrorBoundary>} />
              <Route path="identify" element={<ErrorBoundary><Identify /></ErrorBoundary>} />
              <Route path="infamy" element={<ErrorBoundary><Infamy /></ErrorBoundary>} />
              <Route path="ships" element={<ErrorBoundary><ShipManagement /></ErrorBoundary>} />
              <Route path="outposts" element={<ErrorBoundary><OutpostManagement /></ErrorBoundary>} />
              <Route path="crew" element={<ErrorBoundary><CrewManagement /></ErrorBoundary>} />
              <Route path="sessions" element={<ErrorBoundary><SessionsPage /></ErrorBoundary>} />
              <Route path="session-management" element={<ErrorBoundary><SessionManagement /></ErrorBoundary>} />
              <Route path="city-services" element={<ErrorBoundary><CityServices /></ErrorBoundary>} />
            </Route>
          </Routes>
          </Suspense>
          </Router>
          </AuthProvider>
        </ConfigProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;