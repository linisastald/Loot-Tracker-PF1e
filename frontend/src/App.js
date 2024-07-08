import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom'; // Use Switch instead of Routes
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import UnprocessedLoot from './components/UnprocessedLoot';
import LootEntry from './components/LootEntry';
import GoldTransactions from './components/GoldTransactions';

const App = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Switch> {/* Use Switch instead of Routes */}
          <Route path="/unprocessed-loot" component={UnprocessedLoot} />
          <Route path="/loot-entry" component={LootEntry} />
          <Route path="/gold-transactions" component={GoldTransactions} />
        </Switch>
      </Router>
    </ThemeProvider>
  );
};

export default App;
