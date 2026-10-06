// frontend/src/components/pages/DMSettings/CampaignSettings.jsx
// Per-campaign DM settings (multi-campaign Phase 4c). Reads come from the
// campaign context (GET /campaigns/current settings map); writes go to
// PUT /campaigns/current/settings, and the campaign name renames the active
// campaign via PATCH /campaigns/current. refresh() is called after each
// successful write so the rest of the app (sidebar title, selector, infamy
// nav) picks the change up immediately.
import React, {useEffect, useState} from 'react';
import api from '../../../utils/api';
import {getErrorMessage} from '../../../utils/apiErrors';
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

const DEFAULT_CHARACTER_LEVEL = 5;
const MAX_CHARACTER_LEVEL = 30;

// Derive the Average Party Level (APL) from a character level and the party
// size, mirroring backend utils/partyLevel (CRB p.397: <=3 chars -> -1,
// 4-5 -> 0, >=6 -> +1; clamped to a minimum of 1). Only used for previews of
// values that are not saved yet (the draft level, the next level); the saved
// APL comes from the party-level endpoint.
const deriveApl = (characterLevel, characterCount) => {
    const level = parseInt(characterLevel) || 0;
    let adjustment = 0;
    if (characterCount > 0) {
        if (characterCount <= 3) adjustment = -1;
        else if (characterCount >= 6) adjustment = 1;
    }
    return Math.max(1, level + adjustment);
};

const secondaryText = {color: 'text.secondary', mb: 2};

// One titled card of the settings page
const SettingsSection = ({title, description, children}) => (
    <Paper sx={{p: 3, mb: 3, maxWidth: 500}}>
        <Typography variant="h6" gutterBottom>{title}</Typography>
        {description && <Typography variant="body2" sx={secondaryText}>{description}</Typography>}
        {children}
    </Paper>
);

const CampaignSettings = () => {
    const {currentCampaign, campaignSettings, refresh} = useCampaign();
    const {enqueueSnackbar} = useSnackbar();

    const [campaignName, setCampaignName] = useState('');

    // Infamy system states
    const [infamyEnabled, setInfamyEnabled] = useState(false);
    // Draft of the shared character level (stored as 'average_party_level'); only
    // the text field edits it. The SAVED level is derived from the settings map.
    const [averagePartyLevel, setAveragePartyLevel] = useState(DEFAULT_CHARACTER_LEVEL);
    // Saved party picture from GET /campaigns/current/party-level
    const [characterCount, setCharacterCount] = useState(0);
    const [savedApl, setSavedApl] = useState(null);

    // Level Up (confirmation dialog because it can ping Discord)
    const [levelUpDialogOpen, setLevelUpDialogOpen] = useState(false);
    const [levelingUp, setLevelingUp] = useState(false);

    // Harrow Point Tracker (Curse of the Crimson Throne)
    const [harrowEnabled, setHarrowEnabled] = useState(false);

    // Region states
    const [region, setRegion] = useState('Varisia');
    const [availableRegions, setAvailableRegions] = useState([]);

    // The saved character level, as last confirmed by the server
    const savedLevel = parseInt(campaignSettings?.average_party_level) || DEFAULT_CHARACTER_LEVEL;

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
        // Level is per-campaign (string in the settings map); absent keeps the default
        if (typeof campaignSettings?.average_party_level === 'string' && campaignSettings.average_party_level) {
            setAveragePartyLevel(parseInt(campaignSettings.average_party_level) || DEFAULT_CHARACTER_LEVEL);
        }
    }, [campaignSettings]);

    // Active party size and the saved APL. Re-fetched after a level change.
    const fetchPartyLevel = async () => {
        try {
            const response = await api.get('/campaigns/current/party-level');
            const data = response.data || response;
            if (typeof data.character_count === 'number') {
                setCharacterCount(data.character_count);
            }
            if (typeof data.apl === 'number') {
                setSavedApl(data.apl);
            }
        } catch {
            // Non-fatal: the page still works, the APL falls back to a local
            // derivation until the count loads.
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
            } catch {
                enqueueSnackbar('Error loading settings. Please try again.', {variant: 'error'});
            }
        };

        fetchSettings();
        fetchPartyLevel();
        // enqueueSnackbar is stable; run once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Persist one per-campaign setting, then refresh the shared context
    const saveCampaignSetting = async (name, value) => {
        await api.put('/campaigns/current/settings', {name, value});
        await refresh();
    };

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
            enqueueSnackbar(getErrorMessage(err, 'Error updating campaign name'), {variant: 'error'});
        }
    };

    // Optimistic on/off switch for a '1'/'0' campaign setting: reverts on failure
    const makeToggleHandler = (name, current, setter, label) => async (event) => {
        const isEnabled = event.target.checked;
        setter(isEnabled);
        try {
            await saveCampaignSetting(name, isEnabled ? '1' : '0');
            enqueueSnackbar(`${label} ${isEnabled ? 'enabled' : 'disabled'} successfully`, {variant: 'success'});
        } catch (err) {
            setter(current);
            enqueueSnackbar(getErrorMessage(err, `Error updating ${label} setting`), {variant: 'error'});
        }
    };

    const handleInfamySystemChange = makeToggleHandler(
        'infamy_system_enabled', infamyEnabled, setInfamyEnabled, 'Infamy system'
    );
    const handleHarrowSystemChange = makeToggleHandler(
        'harrow_system_enabled', harrowEnabled, setHarrowEnabled, 'Harrow Point Tracker'
    );

    const handleAveragePartyLevelChange = async () => {
        const level = parseInt(averagePartyLevel);
        // 1-30 matches the backend validator (levels 1-20 plus mythic-adjusted)
        if (isNaN(level) || level < 1 || level > MAX_CHARACTER_LEVEL) {
            enqueueSnackbar(`Character level must be a number between 1 and ${MAX_CHARACTER_LEVEL}`, {variant: 'error'});
            return;
        }
        try {
            await saveCampaignSetting('average_party_level', level);
            await fetchPartyLevel();
            enqueueSnackbar('Character level updated successfully', {variant: 'success'});
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error updating character level'), {variant: 'error'});
        }
    };

    const atMaxLevel = savedLevel >= MAX_CHARACTER_LEVEL;
    // Prefer the server's APL for the saved level; derive it only until that loads
    const currentApl = savedApl ?? deriveApl(savedLevel, characterCount);
    const draftApl = deriveApl(averagePartyLevel, characterCount);

    const handleLevelUp = async () => {
        setLevelingUp(true);
        try {
            // expectedLevel makes a second DM's concurrent click fail instead of
            // levelling the party twice
            const response = await api.post('/campaigns/current/level-up', {expectedLevel: savedLevel});
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
            // The server's message explains a stale level ("... has changed (now N);
            // refresh and try again"); reload so the page shows the current level
            enqueueSnackbar(getErrorMessage(err, 'Error leveling up the party'), {variant: 'error'});
            setLevelUpDialogOpen(false);
            await refresh();
            await fetchPartyLevel();
        } finally {
            setLevelingUp(false);
        }
    };

    const handleRegionChange = async () => {
        try {
            await saveCampaignSetting('region', region);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error updating region'), {variant: 'error'});
            return;
        }

        // The region is saved at this point; weather initialization is a separate step
        try {
            await api.post(`/weather/initialize/${region}`);
            enqueueSnackbar('Region updated successfully and weather initialized', {variant: 'success'});
        } catch (err) {
            enqueueSnackbar(
                `Region saved, but weather initialization failed: ${getErrorMessage(err, 'unknown error')}`,
                {variant: 'warning'}
            );
        }
    };

    return (
        <div>
            <Typography variant="h6" gutterBottom>
                {currentCampaign ? `Campaign Settings — ${currentCampaign.name}` : 'Campaign Settings'}
            </Typography>
            <Typography variant="body2" sx={secondaryText}>
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
            <SettingsSection
                title="Campaign Region"
                description="The region affects weather patterns and conditions in your campaign."
            >
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
            </SettingsSection>
            <SettingsSection
                title="Party Level"
                description={'The level every character in the party is at. "Level Up" raises it by one ' +
                    'and, when Discord integration is enabled, announces the new level to your ' +
                    'campaign channel. The Average Party Level (APL) is derived from this level ' +
                    'and the party size (Core Rulebook p.397).'}
            >
                <Typography variant="body1">
                    Character level: <strong>{savedLevel}</strong>
                </Typography>
                <Typography variant="body2" sx={{
                    color: "text.secondary"
                }}>
                    Active characters: <strong>{characterCount}</strong>
                </Typography>
                <Typography variant="body1" sx={{mb: 2}}>
                    Average Party Level (APL): <strong>{currentApl}</strong>
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
                        The party is already at the maximum level ({MAX_CHARACTER_LEVEL}).
                    </Typography>
                )}
            </SettingsSection>
            <SettingsSection title="Infamy System">
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
                        <Typography variant="body2" sx={secondaryText}>
                            The shared character level (same value the "Level Up" button raises).
                            Infamy check DC = 15 + (2 × APL), where the APL is derived from this
                            level and the {characterCount}-character party size.
                        </Typography>

                        <TextField
                            label="Character Level"
                            type="number"
                            slotProps={{ input: { inputProps: { min: 1, max: MAX_CHARACTER_LEVEL } } }}
                            value={averagePartyLevel}
                            onChange={(e) => setAveragePartyLevel(e.target.value)}
                            fullWidth
                            margin="normal"
                            helperText={`Enter a value between 1 and ${MAX_CHARACTER_LEVEL}`}
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
                                    APL: <strong>{draftApl}</strong> · Current Infamy Check DC: <strong>{15 + (2 * draftApl)}</strong>
                                </Typography>
                            </Box>
                        )}
                    </Box>
                )}
            </SettingsSection>
            <SettingsSection
                title="Harrow Point Tracker"
                description={"Curse of the Crimson Throne flavor module. Tracks each PC's Harrow Point " +
                    'balance for the current chapter.'}
            >
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
            </SettingsSection>
            <Dialog open={levelUpDialogOpen} onClose={() => !levelingUp && setLevelUpDialogOpen(false)}>
                <DialogTitle>Level Up Party?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This will raise every character to <strong>level {savedLevel + 1}</strong>
                        {' '}(Average Party Level <strong>{deriveApl(savedLevel + 1, characterCount)}</strong>).
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
