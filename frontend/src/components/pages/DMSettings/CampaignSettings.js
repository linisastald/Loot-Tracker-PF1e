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

    // Fame system states
    const [fameSystem, setFameSystem] = useState('disabled');
    const [fameEnabled, setFameEnabled] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                // Fetch campaign name
                const campaignResponse = await api.get('/settings/campaign-name');
                if (campaignResponse.data && campaignResponse.data.value) {
                    setCampaignName(campaignResponse.data.value);
                }

                // Fetch fame system settings
                const fameResponse = await api.get('/settings/fame-system');
                if (fameResponse.data && fameResponse.data.value) {
                    const fameValue = fameResponse.data.value;
                    setFameSystem(fameValue);
                    setFameEnabled(fameValue !== 'disabled');
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

    const handleFameSystemChange = async (event) => {
        try {
            const isEnabled = event.target.checked;
            setFameEnabled(isEnabled);

            // If turning off, set to disabled
            // If turning on, set to "fame" by default
            const newValue = isEnabled ? 'fame' : 'disabled';
            setFameSystem(newValue);

            await api.put('/user/update-setting', {
                name: 'fame_system',
                value: newValue
            });

            setSuccess(`Fame system ${isEnabled ? 'enabled' : 'disabled'} successfully`);
            setError('');
        } catch (err) {
            console.error('Error updating fame system setting', err);
            setError('Error updating fame system setting');
            setSuccess('');
        }
    };

    const handleFameTypeChange = async (event) => {
        try {
            const newValue = event.target.value;
            setFameSystem(newValue);

            await api.put('/user/update-setting', {
                name: 'fame_system',
                value: newValue
            });

            setSuccess(`Fame system type updated to ${newValue}`);
            setError('');
        } catch (err) {
            console.error('Error updating fame system type', err);
            setError('Error updating fame system type');
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
                <Typography variant="h6" gutterBottom>Fame System</Typography>

                <FormControlLabel
                    control={
                        <Switch
                            checked={fameEnabled}
                            onChange={handleFameSystemChange}
                            color="primary"
                        />
                    }
                    label="Enable Fame System"
                />

                {fameEnabled && (
                    <Box mt={2} ml={2}>
                        <FormControl component="fieldset">
                            <RadioGroup
                                aria-label="fame-type"
                                name="fame-type-group"
                                value={fameSystem}
                                onChange={handleFameTypeChange}
                            >
                                <FormControlLabel value="fame" control={<Radio />} label="Fame (Standard)" />
                                <FormControlLabel value="infamy" control={<Radio />} label="Infamy (Skull & Shackles)" />
                            </RadioGroup>
                            <FormHelperText>
                                Select the appropriate fame system for your campaign
                            </FormHelperText>
                        </FormControl>
                    </Box>
                )}
            </Box>
        </div>
    );
};

export default CampaignSettings;