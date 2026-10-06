import React from 'react';
import { Box } from '@mui/material';

interface TabPanelProps {
    children?: React.ReactNode;
    value: number;
    index: number;
    /** Padding (MUI spacing units) around the panel content. */
    padding?: number | { xs?: number; md?: number };
}

/** Content of one tab; only the selected panel renders its children. */
const TabPanel: React.FC<TabPanelProps> = ({ children, value, index, padding = 3 }) => (
    <div
        role="tabpanel"
        hidden={value !== index}
        id={`tabpanel-${index}`}
        aria-labelledby={`tab-${index}`}
    >
        {value === index && <Box sx={{ p: padding }}>{children}</Box>}
    </div>
);

export default TabPanel;
