import React from 'react';
import { CircularProgress, Container, Typography } from '@mui/material';

interface PageLoadingProps {
    /** Text next to the spinner, e.g. "Loading outposts...". */
    label: string;
}

/** Full-page centered spinner with a label. */
const PageLoading: React.FC<PageLoadingProps> = ({ label }) => (
    <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>{label}</Typography>
    </Container>
);

export default PageLoading;
