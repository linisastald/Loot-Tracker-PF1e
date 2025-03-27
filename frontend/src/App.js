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
        const response = await api.get('/auth/status');
        if (response.data && response.data.success) {
          setIsAuthenticated(true);
          setUser(response.data.user);
      } else {
        handleLogout();
      }
      } catch (error) {
        handleLogout();
      }
    };

    checkAuthStatus();
    fetchCsrfToken();
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
      // Add a logout endpoint that clears the cookie
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Error during logout:', error);
    }

    // Just clean up the local state, no need to remove token from localStorage
    setIsAuthenticated(false);
    setUser(null);
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