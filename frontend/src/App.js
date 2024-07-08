import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import UnprocessedLoot from './components/UnprocessedLoot';
import LootEntry from './components/LootEntry';
import GoldTransactions from './components/GoldTransactions';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

const App = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/unprocessed-loot" element={<UnprocessedLoot />} />
          <Route path="/loot-entry" element={<LootEntry />} />
          <Route path="/gold-transactions" element={<GoldTransactions />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
};

export default App;
