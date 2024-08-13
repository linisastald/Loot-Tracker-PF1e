import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';


import Login from './components/pages/Login';
import Register from './components/pages/Register';
import LootEntry from './components/pages/LootEntry';
import UnprocessedLoot from './components/pages/UnprocessedLoot';
import GoldTransactions from './components/pages/GoldTransactions';
import UserSettings from './components/pages/UserSettings';
import KeptParty from './components/pages/KeptParty';
import GivenAwayOrTrashed from './components/pages/GivenAwayOrTrashed';
import KeptCharacter from './components/pages/KeptCharacter';
import SoldLoot from './components/pages/SoldLoot'; // Import SoldLoot
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/hoc/ProtectedRoute';
import CharacterAndUserManagement from './components/pages/CharacterAndUserManagement';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Consumables from "./components/pages/Consumables";
import ItemManagement from "./components/pages/ItemManagement";
import GolarionCalendar from "./components/pages/GolarionCalendar";


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
            <Route path="/kept-character" element={<KeptCharacter />} />
            <Route path="/sold-loot" element={<SoldLoot />} />
            <Route path="/character-user-management" element={<CharacterAndUserManagement />} />
            <Route path="/item-management" element={<ItemManagement />} />
            <Route path="/golarion-calendar" element={<GolarionCalendar />} />
            <Route path="/consumables" element={<Consumables />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
