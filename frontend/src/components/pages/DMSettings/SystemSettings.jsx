// frontend/src/components/pages/DMSettings/SystemSettings.jsx
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
import React, {useEffect, useRef, useState} from 'react';
import api from '../../../utils/api';
import {getErrorMessage} from '../../../utils/apiErrors';
import {clearTimezoneCache} from '../../../utils/timezoneUtils';
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

// The test-data card is only offered on the test instance (and only to the
// superadmin; the server enforces both).
const TEST_DATA_HOSTNAME = 'test.kempsonandko.com';
const DEFAULT_TIMEZONE = 'America/New_York';
const CAMPAIGN_SETTINGS_ENDPOINT = '/campaigns/current/settings';

// Per-campaign values as the form edits them, derived from the context's
// settings map (values are stored as strings).
const readCampaignValues = (settings) => {
    const quantity = parseInt(settings?.default_browser_quantity, 10);
    return {
        channelId: typeof settings?.discord_channel_id === 'string' ? settings.discord_channel_id : '',
        roleId: typeof settings?.campaign_role_id === 'string' ? settings.campaign_role_id : '',
        enabled: settings?.discord_integration_enabled === '1',
        autoAppraisalEnabled: settings?.auto_appraisal_enabled !== undefined
            ? settings.auto_appraisal_enabled === '1'
            : true,
        defaultBrowserQuantity: quantity > 0 ? quantity : 1,
        defaultQuantityEnabled: settings?.default_quantity_enabled === '1',
        autoSplitStacksEnabled: settings?.auto_split_stacks_enabled === '1',
        timezone: (typeof settings?.campaign_timezone === 'string' && settings.campaign_timezone)
            ? settings.campaign_timezone
            : DEFAULT_TIMEZONE
    };
};

const GENERAL_SWITCHES = [
    {key: 'autoAppraisalEnabled', label: 'Auto-Appraisal (this campaign only)'},
    {key: 'autoSplitStacksEnabled', label: 'Auto-Split Stacks'}
];

const flag = (value) => (value ? '1' : '0');

const SystemSettings = ({testDataHostname = TEST_DATA_HOSTNAME}) => {
    const {currentCampaign, campaignSettings, isSuperadmin, refresh} = useCampaign();
    const {enqueueSnackbar} = useSnackbar();
    const [error, setError] = useState('');
    const [isLoadingDiscord, setIsLoadingDiscord] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingTestData, setIsGeneratingTestData] = useState(false);
    // Shown once after a run: the server generates a new random password each time
    const [testCredentials, setTestCredentials] = useState(null);

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

    // The values last loaded from / saved to the server. Used both to decide
    // which fields changed and to tell unsaved edits apart from untouched
    // fields when the campaign context refreshes.
    const savedRef = useRef(null);

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
    // settings map). Re-sync whenever the context refreshes, but only the fields
    // the user has not edited: a field still equal to the previously loaded
    // value is replaced, an unsaved edit is kept.
    useEffect(() => {
        const next = readCampaignValues(campaignSettings);
        const prev = savedRef.current;
        const sync = (current, key) => (prev === null || current === prev[key]) ? next[key] : current;

        setDiscordSettings(d => ({
            ...d,
            channelId: sync(d.channelId, 'channelId'),
            roleId: sync(d.roleId, 'roleId'),
            enabled: sync(d.enabled, 'enabled')
        }));
        setDefaultSettings(d => ({
            autoAppraisalEnabled: sync(d.autoAppraisalEnabled, 'autoAppraisalEnabled'),
            defaultBrowserQuantity: sync(d.defaultBrowserQuantity, 'defaultBrowserQuantity'),
            defaultQuantityEnabled: sync(d.defaultQuantityEnabled, 'defaultQuantityEnabled'),
            autoSplitStacksEnabled: sync(d.autoSplitStacksEnabled, 'autoSplitStacksEnabled')
        }));
        setCurrentTimezone(next.timezone);
        setSelectedTimezone(selected => sync(selected, 'timezone'));
        savedRef.current = next;
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
        let touchedCampaignSettings = false;
        try {
            setIsLoadingDiscord(true);

            // Only send the token if the user typed a replacement; an empty
            // field means "keep the saved token" (shared by all campaigns)
            const typedBotToken = isSuperadmin && discordSettings.botToken.trim() !== '';
            if (typedBotToken) {
                await api.put('/user/update-setting', {
                    name: 'discord_bot_token',
                    // Trim: a pasted token often carries a trailing newline/space
                    value: discordSettings.botToken.trim()
                });
                setDiscordSettings(prev => ({...prev, botToken: ''}));
                setHasSavedBotToken(true);
            }

            // Channel ID, role ID, and the enabled flag are per-campaign;
            // only the fields that changed are written
            const saved = savedRef.current;
            const changes = [
                ['channelId', 'discord_channel_id', discordSettings.channelId],
                ['roleId', 'campaign_role_id', discordSettings.roleId],
                ['enabled', 'discord_integration_enabled', flag(discordSettings.enabled)]
            ].filter(([key]) => discordSettings[key] !== saved[key]);
            for (const [key, name, value] of changes) {
                await api.put(CAMPAIGN_SETTINGS_ENDPOINT, {name, value});
                touchedCampaignSettings = true;
                savedRef.current = {...savedRef.current, [key]: discordSettings[key]};
            }

            // Only send the OpenAI key if the superadmin typed a replacement;
            // an empty field means "keep the saved key"
            const typedOpenAiKey = isSuperadmin && discordSettings.openaiKey.trim() !== '';
            if (typedOpenAiKey) {
                await api.put('/user/update-setting', {
                    name: 'openai_key',
                    value: discordSettings.openaiKey.trim()
                });
                setDiscordSettings(prev => ({...prev, openaiKey: ''}));
                setHasSavedOpenAiKey(true);
            }

            enqueueSnackbar('Discord settings updated successfully', {variant: 'success'});
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error updating Discord settings'), {variant: 'error'});
        } finally {
            setIsLoadingDiscord(false);
            // Also after a partial failure: the writes that did succeed must show up
            if (touchedCampaignSettings) {
                await refresh();
            }
        }
    };

    // General settings handler (per-campaign)
    const handleSaveGeneralSettings = async () => {
        const updates = [
            ['default_quantity_enabled', flag(defaultSettings.defaultQuantityEnabled)],
            // The quantity is only saved while the default is enabled and valid
            ...(defaultSettings.defaultQuantityEnabled && defaultSettings.defaultBrowserQuantity > 0
                ? [['default_browser_quantity', String(defaultSettings.defaultBrowserQuantity)]]
                : []),
            ['auto_appraisal_enabled', flag(defaultSettings.autoAppraisalEnabled)],
            ['auto_split_stacks_enabled', flag(defaultSettings.autoSplitStacksEnabled)]
        ];
        try {
            for (const [name, value] of updates) {
                await api.put(CAMPAIGN_SETTINGS_ENDPOINT, {name, value});
            }
            await refresh();
            enqueueSnackbar('General settings updated successfully', {variant: 'success'});
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error updating general settings'), {variant: 'error'});
        }
    };

    // Timezone settings handler (per-campaign)
    const handleSaveTimezone = async () => {
        setSavingTimezone(true);
        try {
            await api.put(CAMPAIGN_SETTINGS_ENDPOINT, {
                name: 'campaign_timezone',
                value: selectedTimezone
            });

            setCurrentTimezone(selectedTimezone);
            // Pages formatting times in the campaign timezone cache it for 5 minutes
            clearTimezoneCache();
            await refresh();
            enqueueSnackbar('Campaign timezone updated successfully!', {variant: 'success'});
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to update timezone'), {variant: 'error'});
        } finally {
            setSavingTimezone(false);
        }
    };

    const handleGenerateTestData = async () => {
        setIsGeneratingTestData(true);
        setTestCredentials(null);
        try {
            // The api utility returns the response body: { success, data: { message, summary } }
            const response = await api.post('/test-data/generate');
            const summary = response?.data?.summary;
            setTestCredentials(response?.data?.testCredentials || null);
            enqueueSnackbar(
                summary
                    ? `Test data generated: ${summary.loot} loot items, ${summary.gold} gold transactions, ${summary.users} users, ${summary.ships} ships, ${summary.crew} crew members`
                    : (response?.data?.message || 'Test data generated successfully!'),
                {variant: 'success'}
            );
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error generating test data. Please try again.'), {variant: 'error'});
        } finally {
            setIsGeneratingTestData(false);
        }
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

                            {GENERAL_SWITCHES.map(({key, label}) => (
                                <Box key={key} sx={{mb: 2}}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={defaultSettings[key]}
                                                onChange={(e) => setDefaultSettings({
                                                    ...defaultSettings,
                                                    [key]: e.target.checked
                                                })}
                                            />
                                        }
                                        label={label}
                                    />
                                </Box>
                            ))}

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
                {isSuperadmin && window.location.hostname === testDataHostname && (
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
                                    Creates: 4 test users (testplayer1-4, with a new random password shown once after each run), 4 characters, ~50 loot items, ~40 gold transactions, 5 ships, 4 outposts, and 13 crew members.
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

                                {testCredentials && (
                                    <Alert severity="success" sx={{ mt: 2 }}>
                                        Test accounts {testCredentials.username} - password: <strong>{testCredentials.password}</strong>.
                                        Copy it now; it is not shown again and replaces the previous password.
                                    </Alert>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                )}
            </Grid>
        </div>
    );
};

export default SystemSettings;