import React, {useEffect, useState} from 'react';
import api from '../../../utils/api';
import {
    Alert,
    Box,
    Button,
    FormControl,
    FormControlLabel,
    FormHelperText,
    InputLabel,
    MenuItem,
    Select,
    Switch,
    TextField,
    Typography,
    Paper
} from '@mui/material';

const CampaignSettings = () => {
    const [campaignName, setCampaignName] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Infamy system states
    const [infamyEnabled, setInfamyEnabled] = useState(false);
    const [averagePartyLevel, setAveragePartyLevel] = useState(5);

    // Region states
    const [region, setRegion] = useState('Varisia');
    const [availableRegions, setAvailableRegions] = useState([]);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                // Fetch campaign name
                const campaignResponse = await api.get('/settings/campaign-name');
                if (campaignResponse.data && campaignResponse.data.value) {
                    setCampaignName(campaignResponse.data.value);
                }

                // Fetch infamy system settings
                const infamyResponse = await api.get('/settings/infamy-system');
                if (infamyResponse.data && infamyResponse.data.value) {
                    const infamyValue = infamyResponse.data.value;
                    setInfamyEnabled(infamyValue === '1');
                }

                // Fetch average party level
                const aplResponse = await api.get('/settings/average-party-level');
                if (aplResponse.data && aplResponse.data.value) {
                    setAveragePartyLevel(parseInt(aplResponse.data.value) || 5);
                }

                // Fetch current region
                const regionResponse = await api.get('/settings/region');
                if (regionResponse.data && regionResponse.data.value) {
                    setRegion(regionResponse.data.value);
                }

                // Fetch available regions
                const regionsResponse = await api.get('/weather/regions');
                if (regionsResponse.data) {
                    setAvailableRegions(regionsResponse.data);
                }
            } catch (error) {
                console.error('Error fetching settings', error);
                setError('Error loading settings. Please try again.');
            }
        };

        fetchSettings();
    }, []);

    const handleCampaignNameChange = async () => {
        try {
            // Only update if there's an actual campaign name value
            if (campaignName && campaignName.trim() !== '') {
                await api.put('/user/update-setting', {
                    name: 'campaign_name',
                    value: campaignName
                });
                setSuccess('Campaign name updated successfully');
                setError('');
            } else {
                setError('Campaign name cannot be empty');
            }
        } catch (err) {
            setError('Error updating campaign name');
            setSuccess('');
        }
    };

    const handleInfamySystemChange = async (event) => {
        try {
            const isEnabled = event.target.checked;
            setInfamyEnabled(isEnabled);

            // If turning off, set to '0'
            // If turning on, set to '1'
            const newValue = isEnabled ? '1' : '0';

            await api.put('/user/update-setting', {
                name: 'infamy_system_enabled',
                value: newValue
            });

            setSuccess(`Infamy system ${isEnabled ? 'enabled' : 'disabled'} successfully`);
            setError('');
        } catch (err) {
            console.error('Error updating infamy system setting', err);
            setError('Error updating infamy system setting');
            setSuccess('');
        }
    };

    const handleAveragePartyLevelChange = async () => {
        try {
            const apl = parseInt(averagePartyLevel);
            if (isNaN(apl) || apl < 1 || apl > 20) {
                setError('Average Party Level must be a number between 1 and 20');
                return;
            }

            await api.put('/user/update-setting', {
                name: 'average_party_level',
                value: apl.toString()
            });

            setSuccess('Average Party Level updated successfully');
            setError('');
        } catch (err) {
            console.error('Error updating Average Party Level', err);
            setError('Error updating Average Party Level');
            setSuccess('');
        }
    };

    const handleRegionChange = async () => {
        try {
            await api.put('/user/update-setting', {
                name: 'region',
                value: region
            });

            // Initialize weather for the new region
            await api.post(`/weather/initialize/${region}`);

            setSuccess('Region updated successfully and weather initialized');
            setError('');
        } catch (err) {
            console.error('Error updating region', err);
            setError('Error updating region');
            setSuccess('');
        }
    };

    return (
        <div>
            <Typography variant="h6" gutterBottom>Campaign Settings</Typography>

            {success && <Alert severity="success" sx={{mt: 2, mb: 2}}>{success}</Alert>}
            {error && <Alert severity="error" sx={{mt: 2, mb: 2}}>{error}</Alert>}

            <Box mt={2} mb={4} sx={{maxWidth: 500}}>
                <TextField
                    fullWidth
                    label="Campaign Name"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    margin="normal"
                />
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleCampaignNameChange}
                    sx={{mt: 2}}
                >
                    Update Campaign Name
                </Button>
            </Box>

            <Paper sx={{p: 3, mb: 3, maxWidth: 500}}>
                <Typography variant="h6" gutterBottom>Campaign Region</Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                    The region affects weather patterns and conditions in your campaign.
                </Typography>

                <FormControl fullWidth margin="normal">
                    <InputLabel>Region</InputLabel>
                    <Select
                        value={region}
                        label="Region"
                        onChange={(e) => setRegion(e.target.value)}
                    >
                        {availableRegions.map((regionOption) => (
                            <MenuItem key={regionOption} value={regionOption}>
                                {regionOption}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleRegionChange}
                    sx={{mt: 2}}
                >
                    Update Region
                </Button>
            </Paper>

            <Paper sx={{p: 3, mb: 3, maxWidth: 500}}>
                <Typography variant="h6" gutterBottom>Infamy System</Typography>

                <FormControlLabel
                    control={
                        <Switch
                            checked={infamyEnabled}
                            onChange={handleInfamySystemChange}
                            color="primary"
                        />
                    }
                    label="Enable Infamy System"
                />

                {infamyEnabled && (
                    <Box mt={3}>
                        <Typography variant="subtitle1" gutterBottom>Average Party Level (APL)</Typography>
                        <Typography variant="body2" color="text.secondary" paragraph>
                            This value is used to calculate the DC for infamy checks: 15 + (2 × APL)
                        </Typography>

                        <TextField
                            label="Average Party Level"
                            type="number"
                            InputProps={{ inputProps: { min: 1, max: 20 } }}
                            value={averagePartyLevel}
                            onChange={(e) => setAveragePartyLevel(e.target.value)}
                            fullWidth
                            margin="normal"
                            helperText="Enter a value between 1 and 20"
                        />

                        <Button
                            variant="outlined"
                            color="primary"
                            onClick={handleAveragePartyLevelChange}
                            sx={{mt: 2}}
                        >
                            Update APL
                        </Button>

                        {averagePartyLevel && (
                            <Box mt={2} p={2} sx={{backgroundColor: 'rgba(0, 0, 0, 0.05)', borderRadius: 1}}>
                                <Typography variant="body2">
                                    Current Infamy Check DC: <strong>{15 + (2 * parseInt(averagePartyLevel || 0))}</strong>
                                </Typography>
                            </Box>
                        )}
                    </Box>
                )}
            </Paper>
        </div>
    );
};

export default CampaignSettings;
