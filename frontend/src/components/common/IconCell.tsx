import React from 'react';
import { Box } from '@mui/material';

interface IconCellProps {
    /** Icon shown before the content (give it its own margin/size). */
    icon: React.ReactNode;
    children: React.ReactNode;
}

/** Table cell content: a small icon followed by text, vertically centered. */
const IconCell: React.FC<IconCellProps> = ({ icon, children }) => (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {icon}
        {children}
    </Box>
);

export default IconCell;
