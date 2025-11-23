import React, { useState, useEffect } from 'react';
import {
    Alert,
    Box,
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    SelectChangeEvent,
    Snackbar,
    Typography,
    Paper,
    CircularProgress
} from '@mui/material';
import { Schedule as ScheduleIcon } from '@mui/icons-material';
import api from '../../../utils/api';

interface TimezoneOption {
    value: string;
    label: string;
}

const TimezoneSettings: React.FC = () => {
    const [currentTimezone, setCurrentTimezone] = useState<string>('');
    const [timezoneOptions, setTimezoneOptions] = useState<TimezoneOption[]>([]);
    const [selectedTimezone, setSelectedTimezone] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [snackbar, setSnackbar] = useState({
        open: false,
        message: '',
        severity: 'success' as 'success' | 'error' | 'info'
    });

    useEffect(() => {
        fetchTimezoneData();
    }, []);

    const fetchTimezoneData = async () => {
        try {
            setLoading(true);
            const [timezoneRes, optionsRes] = await Promise.all([
                api.get('/settings/campaign-timezone'),
                api.get('/settings/timezone-options')
            ]);

            // Handle response unwrapping from api interceptor
            const timezone = timezoneRes.data?.timezone || timezoneRes?.timezone || 'America/New_York';
            const options = optionsRes.data?.options || optionsRes?.options || [];

            setCurrentTimezone(timezone);
            setSelectedTimezone(timezone);
            setTimezoneOptions(options);
        } catch (error: any) {
            setSnackbar({
                open: true,
                message: error.response?.data?.message || 'Failed to load timezone settings',
                severity: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleTimezoneChange = (event: SelectChangeEvent<string>) => {
        setSelectedTimezone(event.target.value);
    };

    const handleSaveTimezone = async () => {
        setSaving(true);
        try {
            await api.post('/settings/campaign-timezone', {
                timezone: selectedTimezone
            });

            setCurrentTimezone(selectedTimezone);
            setSnackbar({
                open: true,
                message: 'Campaign timezone updated successfully! All scheduled tasks have been restarted.',
                severity: 'success'
            });
        } catch (error: any) {
            console.error('Error updating timezone:', error);
            setSnackbar({
                open: true,
                message: error.response?.data?.message || 'Failed to update timezone',
                severity: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleCloseSnackbar = () => {
        setSnackbar({ ...snackbar, open: false });
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" p={3}>
                <CircularProgress size={24} />
                <Typography variant="body2" sx={{ ml: 2 }}>
                    Loading timezone settings...
                </Typography>
            </Box>
        );
    }

    const currentTimezoneLabel = timezoneOptions.find(opt => opt.value === currentTimezone)?.label || currentTimezone;

    return (
        <Paper sx={{ p: 3, mb: 3, maxWidth: 500 }}>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
                <ScheduleIcon color="primary" />
                <Typography variant="h6">Campaign Timezone</Typography>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
                All session times and automated reminders will use this timezone.
                Changing this setting will restart all scheduled tasks.
            </Alert>

            <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel id="timezone-select-label">Timezone</InputLabel>
                <Select
                    labelId="timezone-select-label"
                    id="timezone-select"
                    value={selectedTimezone}
                    label="Timezone"
                    onChange={handleTimezoneChange}
                    disabled={saving}
                >
                    {timezoneOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                            {option.label}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>

            <Button
                variant="contained"
                onClick={handleSaveTimezone}
                disabled={saving || selectedTimezone === currentTimezone}
                fullWidth
                sx={{ mb: 2 }}
            >
                {saving ? (
                    <>
                        <CircularProgress size={20} sx={{ mr: 1 }} />
                        Saving...
                    </>
                ) : (
                    'Save Timezone'
                )}
            </Button>

            {currentTimezone && (
                <Box
                    sx={{
                        p: 2,
                        backgroundColor: 'rgba(0, 0, 0, 0.05)',
                        borderRadius: 1,
                        textAlign: 'center'
                    }}
                >
                    <Typography variant="body2" color="text.secondary">
                        Current timezone:
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                        {currentTimezoneLabel}
                    </Typography>
                </Box>
            )}

            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={handleCloseSnackbar}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert
                    onClose={handleCloseSnackbar}
                    severity={snackbar.severity}
                    sx={{ width: '100%' }}
                    elevation={6}
                    variant="filled"
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Paper>
    );
};

export default TimezoneSettings;
