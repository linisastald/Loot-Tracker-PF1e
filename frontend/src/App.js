import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import Login from './components/Login';
import LootEntry from './components/LootEntry';
import LootOverview from './components/LootOverview';
import GoldTransactions from './components/GoldTransactions';
import MainLayout from './components/MainLayout';

function App() {
  return (
    <Router>
      <Switch>
        <Route path="/login" component={Login} />
        <MainLayout>
          <Route path="/loot-entry" component={LootEntry} />
          <Route path="/loot-overview" component={LootOverview} />
          <Route path="/gold-transactions" component={GoldTransactions} />
        </MainLayout>
      </Switch>
    </Router>
  );
}

export default App;
