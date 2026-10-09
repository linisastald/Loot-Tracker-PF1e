// frontend/src/components/pages/LootManagement/index.tsx
import React from 'react';
import {Box, Container, Paper, Tab, Tabs} from '@mui/material';
import {Route, Routes, useLocation, useNavigate} from 'react-router-dom';

import UnprocessedLoot from './UnprocessedLoot';
import KeptParty from './KeptParty';
import KeptCharacter from './KeptCharacter';
import SoldLoot from './SoldLoot';
import GivenAwayOrTrashed from './GivenAwayOrTrashed';

// One table drives the tab labels, the navigation targets, the routes and the
// active tab, so they cannot drift apart.
const TABS = [
    {label: 'Unprocessed', path: 'unprocessed', element: <UnprocessedLoot/>},
    {label: 'Party Loot', path: 'kept-party', element: <KeptParty/>},
    {label: 'Character Loot', path: 'kept-character', element: <KeptCharacter/>},
    {label: 'Sold', path: 'sold', element: <SoldLoot/>},
    {label: 'Trashed', path: 'trashed', element: <GivenAwayOrTrashed/>},
];

const LootManagement = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // Derived from the URL on every render, so a direct load, a refresh and the
    // browser back/forward buttons all highlight the right tab.
    const segment = location.pathname.split('/').filter(Boolean)[1];
    const activeIndex = TABS.findIndex(tab => tab.path === segment);
    const activeTab = activeIndex === -1 ? 0 : activeIndex; // default to unprocessed

    return (
        <Container maxWidth={false} component="main">
            <Paper sx={{p: 2, mb: 2}}>
                <Box sx={{borderBottom: 1, borderColor: 'divider', mb: 2}}>
                    <Tabs
                        value={activeTab}
                        onChange={(_event, newValue: number) => navigate(`/loot-management/${TABS[newValue].path}`)}
                        aria-label="loot management tabs"
                    >
                        {TABS.map(tab => <Tab key={tab.path} label={tab.label}/>)}
                    </Tabs>
                </Box>
            </Paper>

            <Routes>
                <Route path="/" element={<UnprocessedLoot/>}/>
                {TABS.map(tab => <Route key={tab.path} path={`/${tab.path}`} element={tab.element}/>)}
            </Routes>
        </Container>
    );
};

export default LootManagement;
