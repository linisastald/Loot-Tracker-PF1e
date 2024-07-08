import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import Login from './components/Login';
import LootEntry from './components/LootEntry';
import LootOverview from './components/LootOverview';
import GoldTransactions from './components/GoldTransactions';

function App() {
  return (
    <Router>
      <div className="App">
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/loot-entry" component={LootEntry} />
          <Route path="/loot-overview" component={LootOverview} />
          <Route path="/gold-transactions" component={GoldTransactions} />
          <Route exact path="/" component={Login} />
        </Switch>
      </div>
    </Router>
  );
}

export default App;
