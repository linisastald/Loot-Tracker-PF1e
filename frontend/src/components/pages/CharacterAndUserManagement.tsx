// frontend/src/components/pages/DMSettings.js
import React, {useState} from 'react';
import {Box, Container, Paper, Tab, Tabs, Typography} from '@mui/material';
import {Route, Routes, useLocation, useNavigate} from 'react-router-dom';

import SystemSettings from './DMSettings/SystemSettings';
import UserManagement from './DMSettings/UserManagement';
import CharacterManagement from './DMSettings/CharacterManagement';
import CampaignSettings from './DMSettings/CampaignSettings';
import SessionSettings from './DMSettings/SessionSettings';

const CharacterAndUserManagement = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState(() => {
        // Determine active tab based on current path
        const path = location.pathname;
        if (path.includes('/user-management')) return 1;
        if (path.includes('/character-management')) return 2;
        if (path.includes('/campaign-settings')) return 3;
        if (path.includes('/session-settings')) return 4;
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
            case 4:
                navigate('/character-user-management/session-settings');
                break;
            default:
                navigate('/character-user-management');
        }
    };

    return (
        <Container maxWidth={false} component="main">
            <Paper sx={{p: 2, mb: 2}}>
                <Box sx={{borderBottom: 1, borderColor: 'divider', mb: 2}}>
                    <Tabs value={activeTab} onChange={handleTabChange} aria-label="management tabs">
                        <Tab label="System Settings"/>
                        <Tab label="User Management"/>
                        <Tab label="Character Management"/>
                        <Tab label="Campaign Settings"/>
                        <Tab label="Session Settings"/>
                    </Tabs>
                </Box>

                <Routes>
                    <Route path="/" element={<SystemSettings/>}/>
                    <Route path="/user-management" element={<UserManagement/>}/>
                    <Route path="/character-management" element={<CharacterManagement/>}/>
                    <Route path="/campaign-settings" element={<CampaignSettings/>}/>
                    <Route path="/session-settings" element={<SessionSettings/>}/>
                </Routes>
            </Paper>
        </Container>
    );
};

export default CharacterAndUserManagement;