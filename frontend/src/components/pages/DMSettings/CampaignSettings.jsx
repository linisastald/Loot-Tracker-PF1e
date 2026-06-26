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
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
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

// Derive the Average Party Level (APL) from the shared character level and the
// party size, mirroring backend utils/partyLevel (CRB p.397: <=3 chars -> -1,
// 4-5 -> 0, >=6 -> +1; clamped to a minimum of 1). Used for live previews; the
// backend stays the source of truth for persisted/announced values.
const deriveApl = (characterLevel, characterCount) => {
    const level = parseInt(characterLevel) || 0;
    let adjustment = 0;
    if (characterCount > 0) {
        if (characterCount <= 3) adjustment = -1;
        else if (characterCount >= 6) adjustment = 1;
    }
    return Math.max(1, level + adjustment);
};

const CampaignSettings = () => {
    const {currentCampaign, campaignSettings, refresh} = useCampaign();
    const {enqueueSnackbar} = useSnackbar();

    const [campaignName, setCampaignName] = useState('');

    // Infamy system states
    const [infamyEnabled, setInfamyEnabled] = useState(false);
    // The shared character level every PC is at (stored as 'average_party_level').
    const [averagePartyLevel, setAveragePartyLevel] = useState(5);
    // Active party size, used to derive the APL from the character level.
    const [characterCount, setCharacterCount] = useState(0);

    // Level Up (confirmation dialog because it can ping Discord)
    const [levelUpDialogOpen, setLevelUpDialogOpen] = useState(false);
    const [levelingUp, setLevelingUp] = useState(false);

    // Harrow Point Tracker (Curse of the Crimson Throne)
    const [harrowEnabled, setHarrowEnabled] = useState(false);

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
        setHarrowEnabled(campaignSettings?.harrow_system_enabled === '1');
        if (typeof campaignSettings?.region === 'string' && campaignSettings.region) {
            setRegion(campaignSettings.region);
        }
        // APL is per-campaign (string in the settings map); absent keeps the default
        if (typeof campaignSettings?.average_party_level === 'string' && campaignSettings.average_party_level) {
            setAveragePartyLevel(parseInt(campaignSettings.average_party_level) || 5);
        }
    }, [campaignSettings]);

    // Active party size drives the APL size adjustment; the character level
    // comes from the settings map (handled above). Re-fetched after a level-up.
    const fetchPartyLevel = async () => {
        try {
            const response = await api.get('/campaigns/current/party-level');
            const data = response.data || response;
            if (typeof data.character_count === 'number') {
                setCharacterCount(data.character_count);
            }
        } catch (error) {
            // Non-fatal: the page still works, the APL preview just assumes no
            // size adjustment until the count loads.
        }
    };

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
        fetchPartyLevel();
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

    const handleHarrowSystemChange = async (event) => {
        const isEnabled = event.target.checked;
        const previous = harrowEnabled;
        setHarrowEnabled(isEnabled);
        try {
            await api.put('/campaigns/current/settings', {
                name: 'harrow_system_enabled',
                value: isEnabled ? '1' : '0'
            });
            await refresh();
            enqueueSnackbar(
                `Harrow Point Tracker ${isEnabled ? 'enabled' : 'disabled'} successfully`,
                {variant: 'success'}
            );
        } catch (err) {
            setHarrowEnabled(previous);
            enqueueSnackbar(
                err.response?.data?.message || 'Error updating Harrow Point Tracker setting',
                {variant: 'error'}
            );
        }
    };

    const handleAveragePartyLevelChange = async () => {
        const level = parseInt(averagePartyLevel);
        // 1-30 matches the backend validator (levels 1-20 plus mythic-adjusted)
        if (isNaN(level) || level < 1 || level > 30) {
            enqueueSnackbar('Character level must be a number between 1 and 30', {variant: 'error'});
            return;
        }
        try {
            await api.put('/campaigns/current/settings', {
                name: 'average_party_level',
                value: level
            });
            await refresh();
            await fetchPartyLevel();
            enqueueSnackbar('Character level updated successfully', {variant: 'success'});
        } catch (err) {
            enqueueSnackbar(
                err.response?.data?.message || 'Error updating character level',
                {variant: 'error'}
            );
        }
    };

    const currentLevel = parseInt(averagePartyLevel) || 0;
    const currentApl = deriveApl(averagePartyLevel, characterCount);
    const atMaxLevel = currentLevel >= 30;

    const handleLevelUp = async () => {
        setLevelingUp(true);
        try {
            const response = await api.post('/campaigns/current/level-up');
            const data = response.data || response;
            await refresh();
            await fetchPartyLevel();
            setLevelUpDialogOpen(false);
            enqueueSnackbar(
                `Characters leveled up to level ${data.character_level} (APL ${data.apl})` +
                    (data.discordSent ? ' — Discord notified' : ''),
                {variant: 'success'}
            );
        } catch (err) {
            enqueueSnackbar(
                err.response?.data?.message || 'Error leveling up the party',
                {variant: 'error'}
            );
        } finally {
            setLevelingUp(false);
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
            <Typography variant="body2" paragraph sx={{
                color: "text.secondary"
            }}>
                These settings apply only to the current campaign.
            </Typography>
            <Box
                sx={{
                    mt: 2,
                    mb: 4,
                    maxWidth: 500
                }}>
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
                <Typography variant="body2" paragraph sx={{
                    color: "text.secondary"
                }}>
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
                <Typography variant="h6" gutterBottom>Party Level</Typography>
                <Typography variant="body2" paragraph sx={{
                    color: "text.secondary"
                }}>
                    The level every character in the party is at. "Level Up" raises it by one
                    and, when Discord integration is enabled, announces the new level to your
                    campaign channel. The Average Party Level (APL) is derived from this level
                    and the party size (Core Rulebook p.397).
                </Typography>

                <Typography variant="body1">
                    Character level: <strong>{currentLevel || '—'}</strong>
                </Typography>
                <Typography variant="body2" sx={{
                    color: "text.secondary"
                }}>
                    Active characters: <strong>{characterCount}</strong>
                </Typography>
                <Typography variant="body1" sx={{mb: 2}}>
                    Average Party Level (APL): <strong>{currentLevel ? currentApl : '—'}</strong>
                </Typography>

                <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setLevelUpDialogOpen(true)}
                    disabled={atMaxLevel}
                >
                    Level Up
                </Button>
                {atMaxLevel && (
                    <Typography
                        variant="caption"
                        sx={{
                            color: "text.secondary",
                            display: "block",
                            mt: 1
                        }}>
                        The party is already at the maximum level (30).
                    </Typography>
                )}
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
                    <Box sx={{
                        mt: 3
                    }}>
                        <Typography variant="subtitle1" gutterBottom>Character Level</Typography>
                        <Typography variant="body2" paragraph sx={{
                            color: "text.secondary"
                        }}>
                            The shared character level (same value the "Level Up" button raises).
                            Infamy check DC = 15 + (2 × APL), where the APL is derived from this
                            level and the {characterCount}-character party size.
                        </Typography>

                        <TextField
                            label="Character Level"
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
                            Update Level
                        </Button>

                        {averagePartyLevel && (
                            <Box
                                sx={{
                                    mt: 2,
                                    p: 2,
                                    backgroundColor: 'rgba(0, 0, 0, 0.05)',
                                    borderRadius: 1
                                }}>
                                <Typography variant="body2">
                                    APL: <strong>{currentApl}</strong> · Current Infamy Check DC: <strong>{15 + (2 * currentApl)}</strong>
                                </Typography>
                            </Box>
                        )}
                    </Box>
                )}
            </Paper>
            <Paper sx={{p: 3, mb: 3, maxWidth: 500}}>
                <Typography variant="h6" gutterBottom>Harrow Point Tracker</Typography>
                <Typography variant="body2" paragraph sx={{
                    color: "text.secondary"
                }}>
                    Curse of the Crimson Throne flavor module. Tracks each PC's Harrow Point
                    balance for the current chapter.
                </Typography>

                <FormControlLabel
                    control={
                        <Switch
                            checked={harrowEnabled}
                            onChange={handleHarrowSystemChange}
                            color="primary"
                        />
                    }
                    label="Enable Harrow Point Tracker"
                />
            </Paper>
            <Dialog open={levelUpDialogOpen} onClose={() => !levelingUp && setLevelUpDialogOpen(false)}>
                <DialogTitle>Level Up Party?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This will raise every character to <strong>level {currentLevel + 1}</strong>
                        {' '}(Average Party Level <strong>{deriveApl(currentLevel + 1, characterCount)}</strong>).
                        If Discord integration is enabled, an announcement will be posted to your
                        campaign channel (tagging the campaign role).
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setLevelUpDialogOpen(false)} disabled={levelingUp}>
                        Cancel
                    </Button>
                    <Button onClick={handleLevelUp} color="primary" variant="contained" disabled={levelingUp}>
                        {levelingUp ? 'Leveling Up…' : 'Level Up'}
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default CampaignSettings;
