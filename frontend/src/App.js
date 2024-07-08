import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import Login from './components/Login';
import LootEntry from './components/LootEntry';
import UnprocessedLoot from './components/UnprocessedLoot';
import GoldTransactions from './components/GoldTransactions';
import MainLayout from './components/MainLayout';

function App() {
  return (
    <Router>
      <Switch>
        <Route path="/login" component={Login} />
        <MainLayout>
          <Route path="/loot-entry" component={LootEntry} />
          <Route path="/unprocessed-loot" component={UnprocessedLoot} />
          <Route path="/gold-transactions" component={GoldTransactions} />
        </MainLayout>
      </Switch>
    </Router>
  );
}

export default App;
