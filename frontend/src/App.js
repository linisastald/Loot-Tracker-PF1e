// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import Login from './components/pages/Login';
import Register from './components/pages/Register';
import LootEntry from './components/pages/LootEntry';
import UnprocessedLoot from './components/pages/UnprocessedLoot';
import GoldTransactions from './components/pages/GoldTransactions';
import UserSettings from './components/pages/UserSettings';
import KeptParty from './components/pages/KeptParty';
import GivenAwayOrTrashed from './components/pages/GivenAwayOrTrashed';
import KeptCharacter from './components/pages/KeptCharacter';
import SoldLoot from './components/pages/SoldLoot';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/hoc/ProtectedRoute';
import CharacterAndUserManagement from './components/pages/CharacterAndUserManagement';
import Consumables from "./components/pages/Consumables";
import ItemManagement from "./components/pages/ItemManagement";
import GolarionCalendar from "./components/pages/GolarionCalendar";
import Tasks from "./components/pages/Tasks";
import Identify from './components/pages/Identify';
import CharacterLootLedger from "./components/pages/CharacterLootLedger";

import theme from './theme';
import api from './utils/api';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check if user is authenticated by making an API call
    const checkAuthStatus = async () => {
      try {
        const token = localStorage.getItem('token');

        // Don't attempt to check status if no token exists
        if (!token) {
          handleLogout();
          return;
        }

        // Add authorization header for this specific request
        const response = await api.get('/auth/status', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.data && response.data.success) {
          setIsAuthenticated(true);
          setUser(response.data.user);
        } else {
          handleLogout();
        }
      } catch (error) {
        console.log('Auth status check error:', error);
        handleLogout();
      }
    };

    checkAuthStatus();
    // No need to call fetchCsrfToken here, it's handled in the api.js
  }, []);

  const handleLogin = (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setIsAuthenticated(true);
    setUser(user);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  };

  const handleLogout = async () => {
    try {
      // Clean up the token first so future requests don't use it
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      // Then try to logout from the server (but don't wait for it)
      await api.post('/auth/logout').catch(err => {
        // Silently handle errors during logout
        console.log('Logout request failed, but user was logged out locally');
      });
    } catch (error) {
      console.error('Error during logout:', error);
    }

    // Update the local state
    setIsAuthenticated(false);
    setUser(null);
    delete api.defaults.headers.common['Authorization'];
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/" element={isAuthenticated ? <Navigate to="/loot-entry" /> : <Navigate to="/login" />} />
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated}><MainLayout onLogout={handleLogout} /></ProtectedRoute>}>
            <Route path="/loot-entry" element={<LootEntry />} />
            <Route path="/unprocessed-loot" element={<UnprocessedLoot />} />
            <Route path="/gold-transactions" element={<GoldTransactions />} />
            <Route path="/user-settings" element={<UserSettings />} />
            <Route path="/given-away-or-trashed" element={<GivenAwayOrTrashed />} />
            <Route path="/kept-party" element={<KeptParty />} />
            <Route path="/kept-character" element={<KeptCharacter />} />
            <Route path="/sold-loot" element={<SoldLoot />} />
            <Route path="/character-user-management" element={<CharacterAndUserManagement />} />
            <Route path="/item-management/*" element={<ItemManagement />} />
            <Route path="/golarion-calendar" element={<GolarionCalendar />} />
            <Route path="/consumables" element={<Consumables />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/identify" element={<Identify />} />
            <Route path="/character-loot-ledger" element={<CharacterLootLedger />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;