import React from 'react';
import { Box, Button, Checkbox, Collapse, FormControlLabel, Grid, Paper, TextField, Typography } from '@mui/material';
import { SESSION_STATUSES, SESSION_STATUS_KEYS, SessionFilters, SessionStatus } from './sessionConfig';

interface SessionFilterPanelProps {
    open: boolean;
    filters: SessionFilters;
    onChange: (filters: SessionFilters) => void;
    onReset: () => void;
}

const SessionFilterPanel: React.FC<SessionFilterPanelProps> = ({ open, filters, onChange, onReset }) => {
    const toggleStatus = (status: SessionStatus) =>
        onChange({ ...filters, status: { ...filters.status, [status]: !filters.status[status] } });

    return (
        <Collapse in={open}>
            <Paper sx={{ p: 2, mb: 3 }}>
                <Grid container spacing={2} sx={{ alignItems: 'center' }}>
                    <Grid size={12}>
                        <Typography variant="subtitle1" gutterBottom>
                            Session Status
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            {SESSION_STATUS_KEYS.map(status => (
                                <FormControlLabel
                                    key={status}
                                    control={
                                        <Checkbox
                                            checked={filters.status[status]}
                                            onChange={() => toggleStatus(status)}
                                        />
                                    }
                                    label={SESSION_STATUSES[status].label}
                                />
                            ))}
                        </Box>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 5 }}>
                        <TextField
                            label="From Date"
                            type="date"
                            fullWidth
                            value={filters.dateFrom}
                            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
                            slotProps={{ inputLabel: { shrink: true } }}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 5 }}>
                        <TextField
                            label="To Date"
                            type="date"
                            fullWidth
                            value={filters.dateTo}
                            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
                            slotProps={{ inputLabel: { shrink: true } }}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 2 }}>
                        <Button variant="outlined" fullWidth onClick={onReset}>
                            Reset
                        </Button>
                    </Grid>
                </Grid>
            </Paper>
        </Collapse>
    );
};

export default SessionFilterPanel;
