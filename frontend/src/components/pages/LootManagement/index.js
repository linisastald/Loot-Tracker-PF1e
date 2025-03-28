// frontend/src/components/pages/LootManagement/index.js
import React, { useState } from 'react';
import {
  Container,
  Paper,
  Typography,
  Tabs,
  Tab,
  Box
} from '@mui/material';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';

import UnprocessedLoot from '../UnprocessedLoot';
import KeptParty from '../KeptParty';
import KeptCharacter from '../KeptCharacter';
import SoldLoot from '../SoldLoot';
import GivenAwayOrTrashed from '../GivenAwayOrTrashed';

const LootManagement = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => {
    // Determine active tab based on current path
    const path = location.pathname;
    if (path.includes('/kept-party')) return 1;
    if (path.includes('/kept-character')) return 2;
    if (path.includes('/sold-loot')) return 3;
    if (path.includes('/given-away-or-trashed')) return 4;
    return 0; // Default to unprocessed
  });

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    switch (newValue) {
      case 0:
        navigate('/loot-management/unprocessed');
        break;
      case 1:
        navigate('/loot-management/kept-party');
        break;
      case 2:
        navigate('/loot-management/kept-character');
        break;
      case 3:
        navigate('/loot-management/sold');
        break;
      case 4:
        navigate('/loot-management/trashed');
        break;
      default:
        navigate('/loot-management/unprocessed');
    }
  };

  return (
    <Container maxWidth={false} component="main">
              <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6">Loot Management</Typography>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={activeTab} onChange={handleTabChange} aria-label="loot management tabs">
              <Tab label="Unprocessed" />
              <Tab label="Party Loot" />
              <Tab label="Character Loot" />
              <Tab label="Sold" />
              <Tab label="Trashed" />
            </Tabs>
          </Box>
        </Paper>

        <Routes>
          <Route path="/" element={<UnprocessedLoot />} />
          <Route path="/unprocessed" element={<UnprocessedLoot />} />
          <Route path="/kept-party" element={<KeptParty />} />
          <Route path="/kept-character" element={<KeptCharacter />} />
          <Route path="/sold" element={<SoldLoot />} />
          <Route path="/trashed" element={<GivenAwayOrTrashed />} />
        </Routes>
    </Container>
  );
};

export default LootManagement;