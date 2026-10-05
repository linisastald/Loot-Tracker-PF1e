// frontend/src/components/pages/DMSettings/SystemSettings.js
// Multi-campaign Phase 4c: the Discord channel/role/enabled flag, the
// campaign timezone, and auto-appraisal are per-campaign — they read from
// useCampaign().campaignSettings and write to PUT /campaigns/current/settings.
// The item-entry defaults (default quantity, auto-split stacks) are
// per-campaign too. Only the Discord bot token and the OpenAI key are
// deployment-global: they are superadmin-only, write-only inputs (the server
// never returns them; an empty input means "leave unchanged") saved through
// PUT /user/update-setting. Registration mode lives on the System Admin page;
// the legacy global 'theme' toggle was removed (the app uses the static base
// theme plus per-campaign overrides).
import React, {useEffect, useState} from 'react';
import api from '../../../utils/api';
import {useSnackbar} from 'notistack';
import {useCampaign} from '../../../contexts/CampaignContext';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import {
  Message as ChatIcon,
  Settings as SettingsIcon,
  DataObject as TestDataIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import CampaignThemeSettings from './CampaignThemeSettings';

const SystemSettings = () => {
    const {currentCampaign, campaignSettings, isSuperadmin, refresh} = useCampaign();
    const {enqueueSnackbar} = useSnackbar();
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoadingDiscord, setIsLoadingDiscord] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [isGeneratingTestData, setIsGeneratingTestData] = useState(false);

    // Timezone settings
    const [currentTimezone, setCurrentTimezone] = useState('');
    const [timezoneOptions, setTimezoneOptions] = useState([]);
    const [selectedTimezone, setSelectedTimezone] = useState('');
    const [savingTimezone, setSavingTimezone] = useState(false);

    // Discord integration settings
    const [discordSettings, setDiscordSettings] = useState({
        botToken: '',
        channelId: '',
        roleId: '',
        enabled: false,
        openaiKey: ''
    });

    // General settings
    const [defaultSettings, setDefaultSettings] = useState({
        defaultBrowserQuantity: 1,
        defaultQuantityEnabled: false,
        autoAppraisalEnabled: true,
        autoSplitStacksEnabled: false
    });

    // Set original values for comparison later
    const [originalSettings, setOriginalSettings] = useState({
        botToken: '',
        channelId: '',
        roleId: '',
        enabled: false,
        openaiKey: ''
    });

    // Saved secrets are never echoed back into their fields. The server only
    // says whether one exists; the input stays empty (write-only) and shows a
    // placeholder, and any typed input is sent verbatim on save.
    const [hasSavedBotToken, setHasSavedBotToken] = useState(false);
    const [hasSavedOpenAiKey, setHasSavedOpenAiKey] = useState(false);

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSuperadmin]);

    // Per-campaign values come from the campaign context (GET /campaigns/current
    // settings map, values stored as strings). Re-sync whenever the context
    // refreshes (e.g. after a save).
    useEffect(() => {
        const channelId = typeof campaignSettings?.discord_channel_id === 'string'
            ? campaignSettings.discord_channel_id : '';
        const roleId = typeof campaignSettings?.campaign_role_id === 'string'
            ? campaignSettings.campaign_role_id : '';
        const enabled = campaignSettings?.discord_integration_enabled === '1';

        setDiscordSettings(prev => ({...prev, channelId, roleId, enabled}));
        setOriginalSettings(prev => ({...prev, channelId, roleId, enabled}));

        const parsedQuantity = parseInt(campaignSettings?.default_browser_quantity, 10);
        setDefaultSettings(prev => ({
            ...prev,
            autoAppraisalEnabled: campaignSettings?.auto_appraisal_enabled !== undefined
                ? campaignSettings.auto_appraisal_enabled === '1'
                : true,
            defaultBrowserQuantity: parsedQuantity > 0 ? parsedQuantity : 1,
            defaultQuantityEnabled: campaignSettings?.default_quantity_enabled === '1',
            autoSplitStacksEnabled: campaignSettings?.auto_split_stacks_enabled === '1'
        }));

        const timezone = (typeof campaignSettings?.campaign_timezone === 'string' && campaignSettings.campaign_timezone)
            ? campaignSettings.campaign_timezone
            : 'America/New_York';
        setCurrentTimezone(timezone);
        // Don't clobber an in-progress selection on unrelated refreshes
        setSelectedTimezone(prev => prev || timezone);
    }, [campaignSettings]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const requests = [api.get('/settings/timezone-options')];
            // The global secrets' "is set" flags are only relevant to (and
            // only editable by) the superadmin
            if (isSuperadmin) {
                requests.push(api.get('/settings/discord'), api.get('/settings/openai-key'));
            }
            const [timezoneOptionsResponse, discordResponse, openaiResponse] = await Promise.all(requests);

            if (isSuperadmin) {
                // Only remember that a secret exists - the server never returns it
                setHasSavedBotToken(!!discordResponse?.data?.discord_bot_token_set);
                setHasSavedOpenAiKey(!!openaiResponse?.data?.hasKey);
            }

            // Load timezone option list (the current timezone itself is a
            // per-campaign setting synced from the campaign context)
            const options = timezoneOptionsResponse.data?.options || timezoneOptionsResponse?.options || [];
            setTimezoneOptions(options);
        } catch (error) {
            setError('Error loading settings data. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Discord settings handlers
    const handleSaveDiscordSettings = async () => {
        try {
            setIsLoadingDiscord(true);
            let touchedCampaignSettings = false;

            // Only send the token if the user typed a replacement; an empty
            // field means "keep the saved token" (shared by all campaigns)
            const typedBotToken = isSuperadmin && discordSettings.botToken.trim() !== '';
            if (typedBotToken) {
                await api.put('/user/update-setting', {
                    name: 'discord_bot_token',
                    // Trim: a pasted token often carries a trailing newline/space
                    value: discordSettings.botToken.trim()
                });
            }

            // Channel ID, role ID, and the enabled flag are per-campaign

            // Only update channel ID if it's changed
            if (discordSettings.channelId !== originalSettings.channelId) {
                await api.put('/campaigns/current/settings', {
                    name: 'discord_channel_id',
                    value: discordSettings.channelId
                });
                touchedCampaignSettings = true;
            }

            // Only update role ID if it's changed
            if (discordSettings.roleId !== originalSettings.roleId) {
                await api.put('/campaigns/current/settings', {
                    name: 'campaign_role_id',
                    value: discordSettings.roleId
                });
                touchedCampaignSettings = true;
            }

            // Only update enabled status if it's changed
            if (discordSettings.enabled !== originalSettings.enabled) {
                await api.put('/campaigns/current/settings', {
                    name: 'discord_integration_enabled',
                    value: discordSettings.enabled ? '1' : '0'
                });
                touchedCampaignSettings = true;
            }

            // Only send the OpenAI key if the superadmin typed a replacement;
            // an empty field means "keep the saved key"
            const typedOpenAiKey = isSuperadmin && discordSettings.openaiKey.trim() !== '';
            if (typedOpenAiKey) {
                await api.put('/user/update-setting', {
                    name: 'openai_key',
                    value: discordSettings.openaiKey.trim()
                });
            }

            // Update original settings for next comparison
            setOriginalSettings({
                botToken: '',
                channelId: discordSettings.channelId,
                roleId: discordSettings.roleId,
                enabled: discordSettings.enabled,
                openaiKey: ''
            });

            // After a successful secret save, reset the field to placeholder
            // mode - never echo the saved value back into the input.
            if (typedBotToken) {
                setDiscordSettings(prev => ({...prev, botToken: ''}));
                setHasSavedBotToken(true);
            }
            if (typedOpenAiKey) {
                setDiscordSettings(prev => ({...prev, openaiKey: ''}));
                setHasSavedOpenAiKey(true);
            }

            if (touchedCampaignSettings) {
                await refresh();
            }

            enqueueSnackbar('Discord settings updated successfully', {variant: 'success'});
        } catch (err) {
            enqueueSnackbar(
                err.response?.data?.message || 'Error updating Discord settings',
                {variant: 'error'}
            );
        } finally {
            setIsLoadingDiscord(false);
        }
    };

    // General settings handler
    const handleSaveGeneralSettings = async () => {
        try {
            // Only update settings if they've been changed from defaults

            // Item-entry defaults (per-campaign)
            await api.put('/campaigns/current/settings', {
                name: 'default_quantity_enabled',
                value: defaultSettings.defaultQuantityEnabled ? '1' : '0'
            });

            // Only save default browser quantity if enabled and valid
            if (defaultSettings.defaultQuantityEnabled && defaultSettings.defaultBrowserQuantity > 0) {
                await api.put('/campaigns/current/settings', {
                    name: 'default_browser_quantity',
                    value: defaultSettings.defaultBrowserQuantity.toString()
                });
            }

            // Save auto-appraisal setting (per-campaign)
            await api.put('/campaigns/current/settings', {
                name: 'auto_appraisal_enabled',
                value: defaultSettings.autoAppraisalEnabled ? '1' : '0'
            });

            // Save auto-split stacks setting (per-campaign)
            await api.put('/campaigns/current/settings', {
                name: 'auto_split_stacks_enabled',
                value: defaultSettings.autoSplitStacksEnabled ? '1' : '0'
            });

            await refresh();
            enqueueSnackbar('General settings updated successfully', {variant: 'success'});
        } catch (err) {
            enqueueSnackbar(
                err.response?.data?.message || 'Error updating general settings',
                {variant: 'error'}
            );
        }
    };

    // Timezone settings handler (per-campaign)
    const handleSaveTimezone = async () => {
        setSavingTimezone(true);
        try {
            await api.put('/campaigns/current/settings', {
                name: 'campaign_timezone',
                value: selectedTimezone
            });

            setCurrentTimezone(selectedTimezone);
            await refresh();
            enqueueSnackbar('Campaign timezone updated successfully!', {variant: 'success'});
        } catch (err) {
            enqueueSnackbar(
                err.response?.data?.message || 'Failed to update timezone',
                {variant: 'error'}
            );
        } finally {
            setSavingTimezone(false);
        }
    };

    const handleGenerateTestData = async () => {
        setIsGeneratingTestData(true);
        try {
            const response = await api.post('/test-data/generate');
            
            setSuccess(response.data.message || 'Test data generated successfully!');
            setSnackbarMessage(`Test data generated: ${response.data.data.summary.loot} loot items, ${response.data.data.summary.gold} gold transactions, ${response.data.data.summary.users} users, ${response.data.data.summary.ships} ships, ${response.data.data.summary.crew} crew members`);
            setSnackbarOpen(true);
            setError('');
        } catch (error) {
            setError(error.response?.data?.message || 'Error generating test data. Please try again.');
            setSuccess('');
        } finally {
            setIsGeneratingTestData(false);
        }
    };

    const handleSnackbarClose = () => {
        setSnackbarOpen(false);
    };

    if (isLoading) {
        return (
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "300px"
                }}>
                <CircularProgress/>
                <Typography variant="body1" sx={{ml: 2}}>Loading settings...</Typography>
            </Box>
        );
    }

    return (
        <div>
            <Typography variant="h6" gutterBottom>System Settings</Typography>
            {success && <Alert severity="success" sx={{mt: 2, mb: 2}}>{success}</Alert>}
            {error && <Alert severity="error" sx={{mt: 2, mb: 2}}>{error}</Alert>}
            <Grid container spacing={3}>
                {/* Discord Integration Settings */}
                <Grid size={{xs: 12, md: 6}}>
                    <Card variant="outlined">
                        <CardHeader
                            title="Discord Integration"
                            avatar={<ChatIcon/>}
                            subheader={currentCampaign
                                ? `Channel, role, and enable flag apply only to "${currentCampaign.name}"`
                                : 'Channel, role, and enable flag apply only to the current campaign'}
                        />
                        <CardContent>
                            {isSuperadmin && (
                                <TextField
                                    label="Bot Token"
                                    type="password"
                                    value={discordSettings.botToken}
                                    onChange={(e) => setDiscordSettings({...discordSettings, botToken: e.target.value})}
                                    fullWidth
                                    margin="normal"
                                    autoComplete="off"
                                    placeholder={hasSavedBotToken ? 'Token saved — type to replace' : 'Enter Discord Bot Token'}
                                    helperText={hasSavedBotToken
                                        ? 'A token is saved. Leave blank to keep it, or type a new one to replace it. Shared by all campaigns.'
                                        : 'Enter the Discord bot token (shared by all campaigns)'}
                                />
                            )}
                            <TextField
                                label="Channel ID"
                                value={discordSettings.channelId}
                                onChange={(e) => setDiscordSettings({...discordSettings, channelId: e.target.value})}
                                fullWidth
                                margin="normal"
                                placeholder="Discord Channel ID"
                                helperText="Leave unchanged to keep current value"
                            />
                            <TextField
                                label="Campaign Role ID"
                                value={discordSettings.roleId || ''}
                                onChange={(e) => setDiscordSettings({...discordSettings, roleId: e.target.value})}
                                fullWidth
                                margin="normal"
                                placeholder="Discord Role ID (optional)"
                                helperText="Role to ping for session announcements"
                            />
                            {isSuperadmin && (
                                <TextField
                                    label="OpenAI API Key"
                                    type="password"
                                    value={discordSettings.openaiKey || ''}
                                    onChange={(e) => setDiscordSettings({...discordSettings, openaiKey: e.target.value})}
                                    fullWidth
                                    margin="normal"
                                    autoComplete="off"
                                    placeholder={hasSavedOpenAiKey ? 'Key saved — type to replace' : 'Enter OpenAI API Key for Smart Item Detection'}
                                    helperText={hasSavedOpenAiKey
                                        ? 'A key is saved. Leave blank to keep it, or type a new one to replace it.'
                                        : 'Required for Smart Item Detection feature'}
                                />
                            )}
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={discordSettings.enabled}
                                        onChange={(e) => setDiscordSettings({
                                            ...discordSettings,
                                            enabled: e.target.checked
                                        })}
                                    />
                                }
                                label="Enable Discord Integration"
                            />
                            <Button
                                variant="outlined"
                                color="primary"
                                fullWidth
                                sx={{mt: 2}}
                                onClick={handleSaveDiscordSettings}
                                disabled={isLoadingDiscord}
                            >
                                {isLoadingDiscord ? <CircularProgress size={24}/> : 'Save Discord Settings'}
                            </Button>
                        </CardContent>
                    </Card>
                </Grid>

                {/* General Settings */}
                <Grid size={{xs: 12, md: 6}}>
                    <Card variant="outlined">
                        <CardHeader title="General Settings" avatar={<SettingsIcon/>}/>
                        <CardContent>
                            <Box sx={{mb: 2}}>
                                <Typography variant="subtitle2" gutterBottom>Default Item Quantity</Typography>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={defaultSettings.defaultQuantityEnabled}
                                            onChange={(e) => setDefaultSettings({
                                                ...defaultSettings,
                                                defaultQuantityEnabled: e.target.checked
                                            })}
                                        />
                                    }
                                    label="Enable Default Quantity"
                                />

                                {defaultSettings.defaultQuantityEnabled && (
                                    <TextField
                                        type="number"
                                        value={defaultSettings.defaultBrowserQuantity}
                                        onChange={(e) => setDefaultSettings({
                                            ...defaultSettings,
                                            defaultBrowserQuantity: parseInt(e.target.value) || 1
                                        })}
                                        slotProps={{ htmlInput: {min: 1} }}
                                        fullWidth
                                        size="small"
                                        sx={{mt: 1}}
                                        label="Default Quantity"
                                    />
                                )}
                            </Box>

                            <Box sx={{mb: 2}}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={defaultSettings.autoAppraisalEnabled}
                                            onChange={(e) => setDefaultSettings({
                                                ...defaultSettings,
                                                autoAppraisalEnabled: e.target.checked
                                            })}
                                        />
                                    }
                                    label="Auto-Appraisal (this campaign only)"
                                />
                            </Box>

                            <Box sx={{mb: 2}}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={defaultSettings.autoSplitStacksEnabled}
                                            onChange={(e) => setDefaultSettings({
                                                ...defaultSettings,
                                                autoSplitStacksEnabled: e.target.checked
                                            })}
                                        />
                                    }
                                    label="Auto-Split Stacks"
                                />
                            </Box>

                            <Button
                                variant="outlined"
                                color="primary"
                                fullWidth
                                onClick={handleSaveGeneralSettings}
                            >
                                Save General Settings
                            </Button>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Timezone Settings */}
                <Grid size={{xs: 12, md: 6}}>
                    <Card variant="outlined">
                        <CardHeader
                            title={currentCampaign
                                ? `Campaign Timezone — ${currentCampaign.name}`
                                : 'Campaign Timezone'}
                            avatar={<ScheduleIcon/>}
                        />
                        <CardContent>
                            <Alert severity="info" sx={{ mb: 2 }}>
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
                                    onChange={(e) => setSelectedTimezone(e.target.value)}
                                    disabled={savingTimezone}
                                >
                                    {timezoneOptions.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Button
                                variant="outlined"
                                color="primary"
                                onClick={handleSaveTimezone}
                                disabled={savingTimezone || selectedTimezone === currentTimezone}
                                fullWidth
                                sx={{ mb: 2 }}
                            >
                                {savingTimezone ? (
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
                                    <Typography variant="body2" sx={{
                                        color: "text.secondary"
                                    }}>
                                        Current timezone:
                                    </Typography>
                                    <Typography variant="body1" sx={{
                                        fontWeight: "medium"
                                    }}>
                                        {timezoneOptions.find(opt => opt.value === currentTimezone)?.label || currentTimezone}
                                    </Typography>
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Campaign Theme (per-campaign override, Phase 4b) */}
                <Grid size={{xs: 12, md: 6}}>
                    <CampaignThemeSettings/>
                </Grid>

                {/* Test Data Generation - Only show on test instance */}
                {window.location.hostname === 'test.kempsonandko.com' && (
                    <Grid size={12}>
                        <Card variant="outlined">
                            <CardHeader 
                                title="Test Data Generation" 
                                avatar={<TestDataIcon/>}
                                sx={{ backgroundColor: 'rgba(255, 152, 0, 0.1)' }}
                            />
                            <CardContent>
                                <Typography variant="body2" gutterBottom sx={{
                                    color: "text.secondary"
                                }}>
                                    ⚠️ This feature is only available on the test environment. Generate sample data for testing purposes including users, characters, loot items, gold transactions, ships, and crew.
                                </Typography>
                                <Typography
                                    variant="body2"
                                    gutterBottom
                                    sx={{
                                        color: "text.secondary",
                                        mb: 2
                                    }}>
                                    Creates: 4 test users (testplayer1-4, password: testpass123), 4 characters, ~50 loot items, ~40 gold transactions, 5 ships, 4 outposts, and 13 crew members.
                                </Typography>
                                
                                <Button
                                    variant="outlined"
                                    color="warning"
                                    startIcon={<TestDataIcon/>}
                                    onClick={handleGenerateTestData}
                                    disabled={isGeneratingTestData}
                                    sx={{ mt: 1 }}
                                >
                                    {isGeneratingTestData ? <CircularProgress size={24}/> : 'Generate Test Data'}
                                </Button>
                            </CardContent>
                        </Card>
                    </Grid>
                )}
            </Grid>
            <Snackbar
                open={snackbarOpen}
                autoHideDuration={3000}
                onClose={handleSnackbarClose}
                message={snackbarMessage}
            />
        </div>
    );
};

export default SystemSettings;