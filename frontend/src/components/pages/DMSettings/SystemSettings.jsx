// frontend/src/components/pages/DMSettings/SystemSettings.js
// Multi-campaign Phase 4c: the Discord channel/role/enabled flag, the
// campaign timezone, and auto-appraisal are per-campaign — they read from
// useCampaign().campaignSettings and write to PUT /campaigns/current/settings.
// Registration mode, theme, default quantity, bot token, and the OpenAI key
// remain global (PUT /user/update-setting).
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
  Divider,
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
  CloudDownload,
  CloudUpload,
  Message as ChatIcon,
  Settings as SettingsIcon,
  DataObject as TestDataIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import CampaignThemeSettings from './CampaignThemeSettings';

const REGISTRATION_MODES = [
    {value: 'open', label: 'Open', description: 'Anyone may register'},
    {value: 'invite-only', label: 'Invite only', description: 'Registration requires an invite code'},
    {value: 'closed', label: 'Closed', description: 'No new registrations'}
];

const SystemSettings = () => {
    const {currentCampaign, campaignSettings, refresh} = useCampaign();
    const {enqueueSnackbar} = useSnackbar();
    const [registrationMode, setRegistrationMode] = useState('closed');
    const [savingRegistrationMode, setSavingRegistrationMode] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [theme, setTheme] = useState('dark');
    const [isLoadingDiscord, setIsLoadingDiscord] = useState(false);
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [backupFile, setBackupFile] = useState(null);
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

    const [maskedToken, setMaskedToken] = useState('********');

    useEffect(() => {
        // When Discord settings are loaded, handle masking the token
        if (discordSettings.botToken && discordSettings.botToken !== maskedToken) {
            // If it's a real token (not the mask), we should mask it for display
            setDiscordSettings(prev => ({
                ...prev,
                originalBotToken: prev.botToken, // Store the original
                botToken: maskedToken // Display the mask
            }));
        }
    }, [maskedToken, discordSettings.botToken]);

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

        setDefaultSettings(prev => ({
            ...prev,
            autoAppraisalEnabled: campaignSettings?.auto_appraisal_enabled !== undefined
                ? campaignSettings.auto_appraisal_enabled === '1'
                : true
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
            const [
                settingsResponse,
                discordResponse,
                openaiResponse,
                timezoneOptionsResponse
            ] = await Promise.all([
                api.get(`/user/settings`),
                api.get('/settings/discord'),
                api.get('/settings/openai-key'),
                api.get('/settings/timezone-options')
            ]);

            // Handle registration mode (single setting replacing the old
            // registrations_open + invite_required toggles)
            const registrationModeSetting = settingsResponse.data.find(setting => setting.name === 'registration_mode');
            if (registrationModeSetting && REGISTRATION_MODES.some(m => m.value === registrationModeSetting.value)) {
                setRegistrationMode(registrationModeSetting.value);
            } else {
                // Fall back to deriving the mode from the legacy settings if the
                // new setting has not been written yet
                const legacyOpen = settingsResponse.data.find(setting => setting.name === 'registrations_open');
                const legacyInvite = settingsResponse.data.find(setting => setting.name === 'invite_required');
                const isOpen = legacyOpen?.value === '1' || legacyOpen?.value === 1;
                const isInvite = legacyInvite?.value === '1' || legacyInvite?.value === 1;
                setRegistrationMode(!isOpen ? 'closed' : (isInvite ? 'invite-only' : 'open'));
            }

            // Set the global Discord settings (bot token + OpenAI key). The
            // channel ID, role ID, and enabled flag are per-campaign and come
            // from the campaign context instead.
            if (discordResponse.data) {
                const botToken = discordResponse.data.discord_bot_token || '';

                // Get OpenAI key
                const openaiKey = openaiResponse.data?.hasKey ? maskedToken : '';

                setDiscordSettings(prev => ({
                    ...prev,
                    botToken: botToken ? maskedToken : '',
                    openaiKey: openaiKey,
                    originalBotToken: botToken
                }));

                setOriginalSettings(prev => ({
                    ...prev,
                    botToken: botToken,
                    openaiKey: openaiKey
                }));
            }

            // Load other settings
            const themeSettings = settingsResponse.data.find(setting => setting.name === 'theme');
            if (themeSettings) {
                setTheme(themeSettings.value || 'dark');
            }

            // Load global default settings (auto-appraisal is per-campaign and
            // synced from the campaign context instead)
            const defaultQuantity = settingsResponse.data.find(setting => setting.name === 'default_browser_quantity');
            const defaultQuantityEnabled = settingsResponse.data.find(setting => setting.name === 'default_quantity_enabled');
            const autoSplitStacks = settingsResponse.data.find(setting => setting.name === 'auto_split_stacks_enabled');

            setDefaultSettings(prev => ({
                ...prev,
                defaultBrowserQuantity: defaultQuantity ? parseInt(defaultQuantity.value) || 1 : 1,
                defaultQuantityEnabled: defaultQuantityEnabled ? defaultQuantityEnabled.value === '1' : false,
                autoSplitStacksEnabled: autoSplitStacks ? autoSplitStacks.value === '1' : false
            }));

            // Load timezone option list (the current timezone itself is a
            // per-campaign setting synced from the campaign context)
            const options = timezoneOptionsResponse.data?.options || timezoneOptionsResponse?.options || [];
            setTimezoneOptions(options);
        } catch (error) {
            console.error('Error fetching data', error);
            setError('Error loading settings data. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegistrationModeChange = async (event) => {
        const newMode = event.target.value;
        const previousMode = registrationMode;

        try {
            setSavingRegistrationMode(true);
            setRegistrationMode(newMode);
            await api.put(
                `/user/update-setting`,
                {name: 'registration_mode', value: newMode}
            );
            const modeLabel = REGISTRATION_MODES.find(m => m.value === newMode)?.label || newMode;
            setSuccess(`Registration mode set to ${modeLabel}`);
            setError('');
        } catch (error) {
            console.error('Error updating registration mode', error);
            setRegistrationMode(previousMode);
            setError(error.response?.data?.message || 'Error updating registration mode');
            setSuccess('');
        } finally {
            setSavingRegistrationMode(false);
        }
    };

    // Discord settings handlers
    const handleSaveDiscordSettings = async () => {
        try {
            setIsLoadingDiscord(true);
            let touchedCampaignSettings = false;

            // Only update token if it's changed and not the masked value
            // (the bot token is shared by all campaigns)
            if (discordSettings.botToken !== maskedToken && discordSettings.botToken.trim() !== '') {
                await api.put('/user/update-setting', {
                    name: 'discord_bot_token',
                    value: discordSettings.botToken
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

            // Only update OpenAI key if it's changed and not the masked value
            if (discordSettings.openaiKey !== maskedToken && discordSettings.openaiKey !== originalSettings.openaiKey) {
                await api.put('/user/update-setting', {
                    name: 'openai_key',
                    value: discordSettings.openaiKey
                });
            }

            // Update original settings for next comparison
            setOriginalSettings({
                botToken: discordSettings.botToken !== maskedToken ? discordSettings.botToken : originalSettings.botToken,
                channelId: discordSettings.channelId,
                roleId: discordSettings.roleId,
                enabled: discordSettings.enabled,
                openaiKey: discordSettings.openaiKey !== maskedToken ? discordSettings.openaiKey : originalSettings.openaiKey
            });

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

            // Save theme if it has a valid value
            if (theme === 'dark' || theme === 'light') {
                await api.put('/user/update-setting', {
                    name: 'theme',
                    value: theme
                });
            }

            // Save default quantity enabled setting
            await api.put('/user/update-setting', {
                name: 'default_quantity_enabled',
                value: defaultSettings.defaultQuantityEnabled ? '1' : '0'
            });

            // Only save default browser quantity if enabled and valid
            if (defaultSettings.defaultQuantityEnabled && defaultSettings.defaultBrowserQuantity > 0) {
                await api.put('/user/update-setting', {
                    name: 'default_browser_quantity',
                    value: defaultSettings.defaultBrowserQuantity.toString()
                });
            }

            // Save auto-appraisal setting (per-campaign)
            await api.put('/campaigns/current/settings', {
                name: 'auto_appraisal_enabled',
                value: defaultSettings.autoAppraisalEnabled ? '1' : '0'
            });

            // Save auto-split stacks setting
            await api.put('/user/update-setting', {
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

    // Database backup and restore handlers
    const handleBackupDatabase = async () => {
        try {
            setIsBackingUp(true);

            // Define tables to exclude
            const excludeTables = ['min_caster_levels', 'min_costs', 'mod', 'spells', 'item'];

            // Call API endpoint to get database backup
            const response = await api.post('/admin/backup-database', {excludeTables}, {
                responseType: 'blob'
            });

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response]));
            const link = document.createElement('a');
            const date = new Date().toISOString().split('T')[0];
            link.href = url;
            link.setAttribute('download', `pathfinder_loot_backup_${date}.sql`);
            document.body.appendChild(link);
            link.click();
            link.remove();

            setSuccess('Database backup created successfully');
            setError('');
        } catch (err) {
            setError('Error creating database backup');
            setSuccess('');
        } finally {
            setIsBackingUp(false);
        }
    };

    const handleFileSelect = (event) => {
        if (event.target.files && event.target.files[0]) {
            setBackupFile(event.target.files[0]);
        }
    };

    const handleRestoreDatabase = async () => {
        if (!backupFile) return;

        // Show a confirmation dialog
        if (!window.confirm('Warning: This will overwrite your current database with the backup. All unsaved changes will be lost. Continue?')) {
            return;
        }

        try {
            setIsRestoring(true);

            const formData = new FormData();
            formData.append('backupFile', backupFile);

            await api.post('/admin/restore-database', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            setSuccess('Database restored successfully. The application will reload in 5 seconds.');
            setError('');

            // Reload after a short delay
            setTimeout(() => {
                window.location.reload();
            }, 5000);
        } catch (err) {
            setError('Error restoring database: ' + (err.response?.data?.message || err.message));
            setSuccess('');
        } finally {
            setIsRestoring(false);
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
            console.error('Error generating test data:', error);
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
            <Box display="flex" justifyContent="center" alignItems="center" height="300px">
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
                {/* Registration Settings */}
                <Grid size={{xs: 12, md: 6}}>
                    <Card variant="outlined">
                        <CardHeader title="Registration Settings"/>
                        <CardContent>
                            <FormControl fullWidth>
                                <InputLabel id="registration-mode-label">Registration</InputLabel>
                                <Select
                                    labelId="registration-mode-label"
                                    id="registration-mode-select"
                                    value={registrationMode}
                                    label="Registration"
                                    onChange={handleRegistrationModeChange}
                                    disabled={savingRegistrationMode}
                                >
                                    {REGISTRATION_MODES.map((mode) => (
                                        <MenuItem key={mode.value} value={mode.value}>
                                            {mode.label} ({mode.description.toLowerCase()})
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Box mt={2}>
                                <Typography variant="body2" color="textSecondary">
                                    {REGISTRATION_MODES.find(m => m.value === registrationMode)?.description}.
                                    Invite codes can be created in the User Management tab and are
                                    single-use, granting Player membership in this campaign.
                                </Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

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
                            <TextField
                                label="Bot Token"
                                type="password"
                                value={discordSettings.botToken}
                                onChange={(e) => setDiscordSettings({...discordSettings, botToken: e.target.value})}
                                fullWidth
                                margin="normal"
                                placeholder="Enter Discord Bot Token"
                                helperText="Only enter a value if you want to change the existing token"
                            />
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
                            <TextField
                                label="OpenAI API Key"
                                type="password"
                                value={discordSettings.openaiKey || ''}
                                onChange={(e) => setDiscordSettings({...discordSettings, openaiKey: e.target.value})}
                                fullWidth
                                margin="normal"
                                placeholder="Enter OpenAI API Key for Smart Item Detection"
                                helperText="Required for Smart Item Detection feature"
                            />
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
                                <Typography variant="subtitle2" gutterBottom>Interface Theme</Typography>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={theme === 'dark'}
                                            onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
                                        />
                                    }
                                    label={theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                                />
                            </Box>

                            <Divider sx={{my: 2}}/>

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
                                        inputProps={{min: 1}}
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
                                    <Typography variant="body2" color="text.secondary">
                                        Current timezone:
                                    </Typography>
                                    <Typography variant="body1" fontWeight="medium">
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

                {/* Database Backup & Restore */}
                <Grid size={12}>
                    <Card variant="outlined">
                        <CardHeader title="Database Backup & Restore"/>
                        <CardContent>
                            <Typography variant="body2" gutterBottom color="text.secondary">
                                Backup and restore your database. The backup will exclude the following system tables:
                                min_caster_levels, min_costs, mod, spells, and item.
                            </Typography>

                            <Grid container spacing={2} sx={{mt: 1}}>
                                <Grid size={{xs: 12, md: 6}}>
                                    <Button
                                        variant="outlined"
                                        color="primary"
                                        startIcon={<CloudDownload/>}
                                        fullWidth
                                        onClick={handleBackupDatabase}
                                        disabled={isBackingUp}
                                    >
                                        {isBackingUp ? <CircularProgress size={24}/> : 'Backup Database'}
                                    </Button>
                                </Grid>

                                <Grid size={{xs: 12, md: 6}}>
                                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                        <Button
                                            variant="contained"
                                            component="label"
                                            color="secondary"
                                            sx={{flex: 1}}
                                        >
                                            Select Backup File
                                            <input
                                                type="file"
                                                accept=".sql,.dump"
                                                hidden
                                                onChange={handleFileSelect}
                                            />
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            color="secondary"
                                            startIcon={<CloudUpload/>}
                                            disabled={!backupFile || isRestoring}
                                            onClick={handleRestoreDatabase}
                                            sx={{flex: 1}}
                                        >
                                            {isRestoring ? <CircularProgress size={24}/> : 'Restore'}
                                        </Button>
                                    </Box>
                                    {backupFile && (
                                        <Typography variant="body2" sx={{mt: 1}}>
                                            Selected file: {backupFile.name}
                                        </Typography>
                                    )}
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
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
                                <Typography variant="body2" gutterBottom color="text.secondary">
                                    ⚠️ This feature is only available on the test environment. Generate sample data for testing purposes including users, characters, loot items, gold transactions, ships, and crew.
                                </Typography>
                                <Typography variant="body2" gutterBottom color="text.secondary" sx={{ mb: 2 }}>
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