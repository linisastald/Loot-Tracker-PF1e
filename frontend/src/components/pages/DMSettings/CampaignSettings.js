// frontend/src/components/pages/DMSettings/CampaignSettings.js
import React, {useEffect, useState} from 'react';
import api from '../../../utils/api';
import {
    Alert,
    Box,
    Button,
    FormControl,
    FormControlLabel,
    FormHelperText,
    RadioGroup,
    Radio,
    Switch,
    TextField,
    Typography
} from '@mui/material';

const CampaignSettings = () => {
    const [campaignName, setCampaignName] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Infamy system states
    const [infamySystem, setInfamySystem] = useState('disabled');
    const [infamyEnabled, setInfamyEnabled] = useState(false);

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
                    setInfamySystem(infamyValue);
                    setInfamyEnabled(infamyValue !== 'disabled');
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

            // If turning off, set to disabled
            // If turning on, set to "infamy" by default
            const newValue = isEnabled ? 'infamy' : 'disabled';
            setInfamySystem(newValue);

            await api.put('/user/update-setting', {
                name: 'infamy_system',
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

    const handleInfamyTypeChange = async (event) => {
        try {
            const newValue = event.target.value;
            setInfamySystem(newValue);

            await api.put('/user/update-setting', {
                name: 'infamy_system',
                value: newValue
            });

            setSuccess(`Infamy system type updated to ${newValue}`);
            setError('');
        } catch (err) {
            console.error('Error updating infamy system type', err);
            setError('Error updating infamy system type');
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

            <Box mt={4} mb={2} sx={{maxWidth: 500}}>
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
                    <Box mt={2} ml={2}>
                        <FormControl component="fieldset">
                            <RadioGroup
                                aria-label="infamy-type"
                                name="infamy-type-group"
                                value={infamySystem}
                                onChange={handleInfamyTypeChange}
                            >
                                <FormControlLabel value="infamy" control={<Radio />} label="Infamy (Standard)" />
                                <FormControlLabel value="infamy" control={<Radio />} label="Infamy (Skull & Shackles)" />
                            </RadioGroup>
                            <FormHelperText>
                                Select the appropriate infamy system for your campaign
                            </FormHelperText>
                        </FormControl>
                    </Box>
                )}
            </Box>
        </div>
    );
};

export default CampaignSettings;