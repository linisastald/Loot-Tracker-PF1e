// frontend/src/components/pages/CharacterAndUserManagement.js
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

import SystemSettings from './CharacterAndUserManagement/SystemSettings';
import UserManagement from './CharacterAndUserManagement/UserManagement';
import CharacterManagement from './CharacterAndUserManagement/CharacterManagement';
import CampaignSettings from './CharacterAndUserManagement/CampaignSettings';

const CharacterAndUserManagement = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => {
    // Determine active tab based on current path
    const path = location.pathname;
    if (path.includes('/user-management')) return 1;
    if (path.includes('/character-management')) return 2;
    if (path.includes('/campaign-settings')) return 3;
    return 0; // Default to system settings
  });

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    switch (newValue) {
      case 0:
        navigate('/character-user-management');
        break;
      case 1:
        navigate('/character-user-management/user-management');
        break;
      case 2:
        navigate('/character-user-management/character-management');
        break;
      case 3:
        navigate('/character-user-management/campaign-settings');
        break;
      default:
        navigate('/character-user-management');
    }
  };

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Character and User Management</Typography>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={activeTab} onChange={handleTabChange} aria-label="management tabs">
            <Tab label="System Settings" />
            <Tab label="User Management" />
            <Tab label="Character Management" />
            <Tab label="Campaign Settings" />
          </Tabs>
        </Box>

        <Routes>
          <Route path="/" element={<SystemSettings />} />
          <Route path="/user-management" element={<UserManagement />} />
          <Route path="/character-management" element={<CharacterManagement />} />
          <Route path="/campaign-settings" element={<CampaignSettings />} />
        </Routes>
      </Paper>
    </Container>
  );
};

export default CharacterAndUserManagement;