import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom'; // Updated import for Routes
import Login from './components/Login';
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
          <Route path="/login" element={<Login />} />
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
