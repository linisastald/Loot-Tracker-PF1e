// frontend/src/components/pages/CharacterAndUserManagement.tsx
import React from 'react';
import {Box, Container, Paper, Tab, Tabs} from '@mui/material';
import {Navigate, Route, Routes, useLocation, useNavigate} from 'react-router-dom';

import {useIsDM, useCampaign} from '../../contexts/CampaignContext';
import SystemSettings from './DMSettings/SystemSettings';
import UserManagement from './DMSettings/UserManagement';
import CharacterManagement from './DMSettings/CharacterManagement';
import CampaignSettings from './DMSettings/CampaignSettings';

const BASE_PATH = '/character-user-management';

// One entry per tab; `sub` is the path below BASE_PATH ('' is the index route)
const TABS: Array<{label: string; sub: string; element: React.ReactElement}> = [
    {label: 'System Settings', sub: '', element: <SystemSettings/>},
    {label: 'User Management', sub: '/user-management', element: <UserManagement/>},
    {label: 'Character Management', sub: '/character-management', element: <CharacterManagement/>},
    {label: 'Campaign Settings', sub: '/campaign-settings', element: <CampaignSettings/>},
];

const CharacterAndUserManagement: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const {loading} = useCampaign();
    const isDM = useIsDM();

    // The active tab always follows the URL (back/forward and in-app links included)
    const foundTab = TABS.findIndex((tab) => tab.sub !== '' && location.pathname.includes(tab.sub));
    const activeTab = foundTab === -1 ? 0 : foundTab;

    // UI gate only (the server enforces the role on every endpoint these tabs call)
    if (loading) return null;
    if (!isDM) return <Navigate to="/" replace/>;

    return (
        <Container maxWidth={false} component="main">
            <Paper sx={{p: 2, mb: 2}}>
                <Box sx={{borderBottom: 1, borderColor: 'divider', mb: 2}}>
                    <Tabs
                        value={activeTab}
                        onChange={(_event: React.SyntheticEvent, index: number) => navigate(BASE_PATH + TABS[index].sub)}
                        aria-label="management tabs"
                    >
                        {TABS.map((tab) => <Tab key={tab.label} label={tab.label}/>)}
                    </Tabs>
                </Box>

                <Routes>
                    {TABS.map((tab) => (
                        <Route key={tab.label} path={tab.sub === '' ? '/' : tab.sub} element={tab.element}/>
                    ))}
                </Routes>
            </Paper>
        </Container>
    );
};

export default CharacterAndUserManagement;
