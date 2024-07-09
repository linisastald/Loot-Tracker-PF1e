import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom'; // Include Navigate for redirection
import Login from './components/Login';
import Register from './components/Register';
import LootEntry from './components/LootEntry';
import UnprocessedLoot from './components/UnprocessedLoot';
import GoldTransactions from './components/GoldTransactions';
import MainLayout from './components/MainLayout';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} /> {/* Redirect root to /login */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<MainLayout />}>
            <Route path="/loot-entry" element={<LootEntry />} />
            <Route path="/unprocessed-loot" element={<UnprocessedLoot />} />
            <Route path="/gold-transactions" element={<GoldTransactions />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
