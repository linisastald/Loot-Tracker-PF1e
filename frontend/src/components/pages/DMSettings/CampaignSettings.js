// frontend/src/components/pages/DMSettings/CampaignSettings.js
import React, {useEffect, useState} from 'react';
import api from '../../../utils/api';
import {Alert, Box, Button, TextField, Typography} from '@mui/material';

const CampaignSettings = () => {
    const [campaignName, setCampaignName] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const fetchCampaignName = async () => {
            try {
                const response = await api.get('/settings/campaign-name');
                if (response.data && response.data.value) {
                    setCampaignName(response.data.value);
                }
            } catch (error) {
                console.error('Error fetching campaign name', error);
                setError('Error loading campaign name. Please try again.');
            }
        };

        fetchCampaignName();
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

    return (
        <div>
            <Typography variant="h6" gutterBottom>Campaign Settings</Typography>

            {success && <Alert severity="success" sx={{mt: 2, mb: 2}}>{success}</Alert>}
            {error && <Alert severity="error" sx={{mt: 2, mb: 2}}>{error}</Alert>}

            <Box mt={2} mb={2} sx={{maxWidth: 500}}>
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

            {/* Additional campaign settings can be added here in the future */}
        </div>
    );
};

export default CampaignSettings;