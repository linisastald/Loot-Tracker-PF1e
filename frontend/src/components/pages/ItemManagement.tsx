// frontend/src/components/pages/ItemManagement.tsx
import React from 'react';
import {Box, Container, Paper, Tab, Tabs} from '@mui/material';
import {Route, Routes, useLocation, useNavigate} from 'react-router-dom';

import GeneralItemManagement from './ItemManagement/GeneralItemManagement';
import UnidentifiedItemsManagement from './ItemManagement/UnidentifiedItemsManagement';
import PendingSaleManagement from './ItemManagement/PendingSaleManagement';
import AddItemMod from './ItemManagement/AddItemMod';
import SearchHistoryManagement from './ItemManagement/SearchHistoryManagement';

const BASE_PATH = '/item-management';

interface ItemManagementTab {
    label: string;
    // Path segment under /item-management ('' for the index tab)
    segment: string;
    element: React.ReactElement;
}

// One list drives the tab bar, the routes and the tab <-> URL mapping.
const TABS: ItemManagementTab[] = [
    {label: 'General', segment: '', element: <GeneralItemManagement/>},
    {label: 'Unidentified Items', segment: 'unidentified', element: <UnidentifiedItemsManagement/>},
    {label: 'Pending Sale', segment: 'pending-sale', element: <PendingSaleManagement/>},
    {label: 'Add Item/Mod', segment: 'add-item-mod', element: <AddItemMod/>},
    {label: 'Search History', segment: 'search-history', element: <SearchHistoryManagement/>},
];

const tabPath = (tab: ItemManagementTab): string => (tab.segment ? `${BASE_PATH}/${tab.segment}` : BASE_PATH);

const ItemManagement: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // The URL is the single source of truth for the selected tab.
    const activeTab = Math.max(
        0,
        TABS.findIndex((tab) => tab.segment !== '' && location.pathname.includes(`/${tab.segment}`))
    );

    const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
        navigate(tabPath(TABS[newValue] ?? TABS[0]));
    };

    return (
        <Container maxWidth={false} component="main">
            <Paper sx={{p: 2, mb: 2}}>
                <Box sx={{borderBottom: 1, borderColor: 'divider', mb: 2}}>
                    <Tabs value={activeTab} onChange={handleTabChange} aria-label="item management tabs">
                        {TABS.map((tab) => <Tab key={tab.label} label={tab.label}/>)}
                    </Tabs>
                </Box>

                <Routes>
                    {TABS.map((tab) => (
                        <Route key={tab.label} path={tab.segment ? `/${tab.segment}` : '/'} element={tab.element}/>
                    ))}
                </Routes>
            </Paper>
        </Container>
    );
};

export default ItemManagement;
