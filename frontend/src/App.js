import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import LootEntry from './components/LootEntry';
import UnprocessedLoot from './components/UnprocessedLoot';
import GoldTransactions from './components/GoldTransactions';
import UserSettings from './components/UserSettings';
import GivenAwayOrTrashed from './components/GivenAwayOrTrashed'; // Import GivenAwayOrTrashed
import MainLayout from './components/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route path="/loot-entry" element={<LootEntry />} />
            <Route path="/unprocessed-loot" element={<UnprocessedLoot />} />
            <Route path="/gold-transactions" element={<GoldTransactions />} />
            <Route path="/user-settings" element={<UserSettings />} />
            <Route path="/given-away-or-trashed" element={<GivenAwayOrTrashed />} />
            <Route path="/kept-party" element={<KeptParty />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
