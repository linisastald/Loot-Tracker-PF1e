// frontend/src/components/pages/DMSettings/CampaignSettings.jsx
// Per-campaign DM settings (multi-campaign Phase 4c). Reads come from the
// campaign context (GET /campaigns/current settings map); writes go to
// PUT /campaigns/current/settings, and the campaign name renames the active
// campaign via PATCH /campaigns/current. refresh() is called after each
// successful write so the rest of the app (sidebar title, selector, infamy
// nav) picks the change up immediately.
import React, {useEffect, useState} from 'react';
import api from '../../../utils/api';
import {useSnackbar} from 'notistack';
import {useCampaign} from '../../../contexts/CampaignContext';
import {
    Box,
    Button,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    Switch,
    TextField,
    Typography,
    Paper
} from '@mui/material';

const CampaignSettings = () => {
    const {currentCampaign, campaignSettings, refresh} = useCampaign();
    const {enqueueSnackbar} = useSnackbar();

    const [campaignName, setCampaignName] = useState('');

    // Infamy system states
    const [infamyEnabled, setInfamyEnabled] = useState(false);
    const [averagePartyLevel, setAveragePartyLevel] = useState(5);

    // Region states
    const [region, setRegion] = useState('Varisia');
    const [availableRegions, setAvailableRegions] = useState([]);

    // The campaign name lives on the campaign record itself (campaigns.name),
    // not in the settings map.
    useEffect(() => {
        if (currentCampaign?.name) {
            setCampaignName(currentCampaign.name);
        }
    }, [currentCampaign]);

    // Per-campaign settings arrive as strings ('1'/'0', region name) via the
    // campaign context.
    useEffect(() => {
        setInfamyEnabled(campaignSettings?.infamy_system_enabled === '1');
        if (typeof campaignSettings?.region === 'string' && campaignSettings.region) {
            setRegion(campaignSettings.region);
        }
        // APL is per-campaign (string in the settings map); absent keeps the default
        if (typeof campaignSettings?.average_party_level === 'string' && campaignSettings.average_party_level) {
            setAveragePartyLevel(parseInt(campaignSettings.average_party_level) || 5);
        }
    }, [campaignSettings]);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                // The region option list is static reference data
                const regionsResponse = await api.get('/weather/regions');

                if (regionsResponse.data) {
                    setAvailableRegions(regionsResponse.data);
                }
            } catch (error) {
                enqueueSnackbar('Error loading settings. Please try again.', {variant: 'error'});
            }
        };

        fetchSettings();
        // enqueueSnackbar is stable; run once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCampaignNameChange = async () => {
        if (!campaignName || campaignName.trim() === '') {
            enqueueSnackbar('Campaign name cannot be empty', {variant: 'error'});
            return;
        }
        try {
            // Renames the ACTIVE campaign (campaigns.name)
            await api.patch('/campaigns/current', {name: campaignName.trim()});
            await refresh();
            enqueueSnackbar('Campaign name updated successfully', {variant: 'success'});
        } catch (err) {
            enqueueSnackbar(
                err.response?.data?.message || 'Error updating campaign name',
                {variant: 'error'}
            );
        }
    };

    const handleInfamySystemChange = async (event) => {
        const isEnabled = event.target.checked;
        const previous = infamyEnabled;
        setInfamyEnabled(isEnabled);
        try {
            await api.put('/campaigns/current/settings', {
                name: 'infamy_system_enabled',
                value: isEnabled ? '1' : '0'
            });
            await refresh();
            enqueueSnackbar(
                `Infamy system ${isEnabled ? 'enabled' : 'disabled'} successfully`,
                {variant: 'success'}
            );
        } catch (err) {
            setInfamyEnabled(previous);
            enqueueSnackbar(
                err.response?.data?.message || 'Error updating infamy system setting',
                {variant: 'error'}
            );
        }
    };

    const handleAveragePartyLevelChange = async () => {
        const apl = parseInt(averagePartyLevel);
        // 1-30 matches the backend validator (levels 1-20 plus mythic-adjusted)
        if (isNaN(apl) || apl < 1 || apl > 30) {
            enqueueSnackbar('Average Party Level must be a number between 1 and 30', {variant: 'error'});
            return;
        }
        try {
            await api.put('/campaigns/current/settings', {
                name: 'average_party_level',
                value: apl
            });
            await refresh();
            enqueueSnackbar('Average Party Level updated successfully', {variant: 'success'});
        } catch (err) {
            enqueueSnackbar(
                err.response?.data?.message || 'Error updating Average Party Level',
                {variant: 'error'}
            );
        }
    };

    const handleRegionChange = async () => {
        try {
            await api.put('/campaigns/current/settings', {
                name: 'region',
                value: region
            });

            // Initialize weather for the new region
            await api.post(`/weather/initialize/${region}`);

            await refresh();
            enqueueSnackbar('Region updated successfully and weather initialized', {variant: 'success'});
        } catch (err) {
            enqueueSnackbar(
                err.response?.data?.message || 'Error updating region',
                {variant: 'error'}
            );
        }
    };

    return (
        <div>
            <Typography variant="h6" gutterBottom>
                {currentCampaign ? `Campaign Settings — ${currentCampaign.name}` : 'Campaign Settings'}
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
                These settings apply only to the current campaign.
            </Typography>

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
                            InputProps={{ inputProps: { min: 1, max: 30 } }}
                            value={averagePartyLevel}
                            onChange={(e) => setAveragePartyLevel(e.target.value)}
                            fullWidth
                            margin="normal"
                            helperText="Enter a value between 1 and 30"
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
