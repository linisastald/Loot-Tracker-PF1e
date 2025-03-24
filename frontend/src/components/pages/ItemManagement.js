// frontend/src/components/pages/ItemManagement.js
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

import GeneralItemManagement from './ItemManagement/GeneralItemManagement';
import UnidentifiedItemsManagement from './ItemManagement/UnidentifiedItemsManagement';
import PendingSaleManagement from './ItemManagement/PendingSaleManagement';

const ItemManagement = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => {
    // Determine active tab based on current path
    const path = location.pathname;
    if (path.includes('/unidentified')) return 1;
    if (path.includes('/pending-sale')) return 2;
    return 0;
  });

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    switch (newValue) {
      case 0:
        navigate('/item-management');
        break;
      case 1:
        navigate('/item-management/unidentified');
        break;
      case 2:
        navigate('/item-management/pending-sale');
        break;
      default:
        navigate('/item-management');
    }
  };

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Item Management</Typography>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={activeTab} onChange={handleTabChange} aria-label="item management tabs">
            <Tab label="General" />
            <Tab label="Unidentified Items" />
            <Tab label="Pending Sale" />
          </Tabs>
        </Box>

        <Routes>
          <Route path="/" element={<GeneralItemManagement />} />
          <Route path="/unidentified" element={<UnidentifiedItemsManagement />} />
          <Route path="/pending-sale" element={<PendingSaleManagement />} />
        </Routes>
      </Paper>
    </Container>
  );
};

export default ItemManagement;