// frontend/src/components/pages/DMSettings/SystemSettings.js
import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';
import {
  Typography,
  Button,
  Box,
  Card,
  CardContent,
  CardHeader,
  Grid,
  TextField,
  FormControlLabel,
  Switch,
  Divider,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  CloudDownload,
  CloudUpload,
  Settings as SettingsIcon,
  Message as ChatIcon
} from '@mui/icons-material';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import Tooltip from '@mui/material/Tooltip';
import Snackbar from '@mui/material/Snackbar';

const SystemSettings = () => {
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [inviteRequired, setInviteRequired] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [theme, setTheme] = useState('dark');
  const [isLoadingDiscord, setIsLoadingDiscord] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupFile, setBackupFile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Discord integration settings
  const [discordSettings, setDiscordSettings] = useState({
    botToken: '',
    channelId: '',
    enabled: false
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
    enabled: false
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
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [
        settingsResponse,
        discordResponse
      ] = await Promise.all([
        api.get(`/user/settings`),
        api.get('/settings/discord')
      ]);

      // Handle registration setting
      const registrationSetting = settingsResponse.data.find(setting => setting.name === 'registrations open');
      console.log('Registration setting:', registrationSetting);
      setRegistrationOpen(registrationSetting?.value === '1' || registrationSetting?.value === 1);

      // Handle invite required setting
      const inviteRequiredSetting = settingsResponse.data.find(setting => setting.name === 'invite_required');
      console.log('Invite required setting:', inviteRequiredSetting);
      setInviteRequired(inviteRequiredSetting?.value === '1' || inviteRequiredSetting?.value === 1);

      // Set Discord settings
      if (discordResponse.data) {
        const botToken = discordResponse.data.discord_bot_token || '';
        const channelId = discordResponse.data.discord_channel_id || '';
        const enabled = discordResponse.data.discord_integration_enabled === '1';

        setDiscordSettings({
          botToken: botToken ? maskedToken : '',
          channelId: channelId,
          enabled: enabled,
          originalBotToken: botToken
        });

        setOriginalSettings({
          botToken: botToken,
          channelId: channelId,
          enabled: enabled
        });
      }

      // Load other settings
      const themeSettings = settingsResponse.data.find(setting => setting.name === 'theme');
      if (themeSettings) {
        setTheme(themeSettings.value || 'dark');
      }

      // Load default settings
      const defaultQuantity = settingsResponse.data.find(setting => setting.name === 'default_browser_quantity');
      const defaultQuantityEnabled = settingsResponse.data.find(setting => setting.name === 'default_quantity_enabled');
      const autoAppraisal = settingsResponse.data.find(setting => setting.name === 'auto_appraisal_enabled');
      const autoSplitStacks = settingsResponse.data.find(setting => setting.name === 'auto_split_stacks_enabled');

      setDefaultSettings({
        defaultBrowserQuantity: defaultQuantity ? parseInt(defaultQuantity.value) || 1 : 1,
        defaultQuantityEnabled: defaultQuantityEnabled ? defaultQuantityEnabled.value === '1' : false,
        autoAppraisalEnabled: autoAppraisal ? autoAppraisal.value === '1' : true,
        autoSplitStacksEnabled: autoSplitStacks ? autoSplitStacks.value === '1' : false
      });
    } catch (error) {
      console.error('Error fetching data', error);
      setError('Error loading settings data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegistrationToggle = async () => {
    try {
      const newValue = registrationOpen ? 0 : 1;
      await api.put(
        `/user/update-setting`,
        { name: 'registrations open', value: newValue }
      );
      setRegistrationOpen(!registrationOpen);
      setSuccess(`Registration ${!registrationOpen ? 'opened' : 'closed'} successfully`);
      setError('');
    } catch (error) {
      console.error('Error updating registration setting', error);
      setError('Error updating registration setting');
      setSuccess('');
    }
  };

  const handleInviteRequiredToggle = async () => {
    try {
      const newValue = inviteRequired ? 0 : 1;
      await api.put(
        `/user/update-setting`,
        { name: 'invite_required', value: newValue }
      );
      setInviteRequired(!inviteRequired);
      setSuccess(`Invite requirement ${!inviteRequired ? 'enabled' : 'disabled'} successfully`);
      setError('');
    } catch (error) {
      console.error('Error updating invite required setting', error);
      setError('Error updating invite required setting');
      setSuccess('');
    }
  };

  // Discord settings handlers
  const handleSaveDiscordSettings = async () => {
    try {
      setIsLoadingDiscord(true);

      // Only update token if it's changed and not the masked value
      if (discordSettings.botToken !== maskedToken && discordSettings.botToken.trim() !== '') {
        await api.put('/user/update-setting', {
          name: 'discord_bot_token',
          value: discordSettings.botToken
        });
      }

      // Only update channel ID if it's changed
      if (discordSettings.channelId !== originalSettings.channelId) {
        await api.put('/user/update-setting', {
          name: 'discord_channel_id',
          value: discordSettings.channelId
        });
      }

      // Only update enabled status if it's changed
      if (discordSettings.enabled !== originalSettings.enabled) {
        await api.put('/user/update-setting', {
          name: 'discord_integration_enabled',
          value: discordSettings.enabled ? '1' : '0'
        });
      }

      // Update original settings for next comparison
      setOriginalSettings({
        botToken: discordSettings.botToken !== maskedToken ? discordSettings.botToken : originalSettings.botToken,
        channelId: discordSettings.channelId,
        enabled: discordSettings.enabled
      });

      setSuccess('Discord settings updated successfully');
      setError('');
    } catch (err) {
      setError('Error updating Discord settings');
      setSuccess('');
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

      // Save auto-appraisal setting
      await api.put('/user/update-setting', {
        name: 'auto_appraisal_enabled',
        value: defaultSettings.autoAppraisalEnabled ? '1' : '0'
      });

      // Save auto-split stacks setting
      await api.put('/user/update-setting', {
        name: 'auto_split_stacks_enabled',
        value: defaultSettings.autoSplitStacksEnabled ? '1' : '0'
      });

      setSuccess('General settings updated successfully');
      setError('');
    } catch (err) {
      setError('Error updating general settings');
      setSuccess('');
    }
  };

  // Database backup and restore handlers
  const handleBackupDatabase = async () => {
    try {
      setIsBackingUp(true);

      // Define tables to exclude
      const excludeTables = ['min_caster_levels', 'min_costs', 'mod', 'spells', 'item'];

      // Call API endpoint to get database backup
      const response = await api.post('/admin/backup-database', { excludeTables }, {
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

  const handleGenerateQuickInvite = async () => {
    try {
      setIsGeneratingInvite(true);
      setQuickInviteData(null);

      const response = await api.post('/auth/generate-quick-invite');
      if (response && response.data) {
        setQuickInviteData(response.data);
        setSuccess('Quick invite code generated successfully');
        setError('');
      }
    } catch (err) {
      setError('Error generating quick invite code');
      setSuccess('');
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleCopyInviteCode = () => {
    if (!quickInviteData || !quickInviteData.code) return;

    navigator.clipboard.writeText(quickInviteData.code).then(() => {
      setSnackbarMessage('Invite code copied to clipboard');
      setSnackbarOpen(true);
    }).catch(() => {
      setSnackbarMessage('Failed to copy invite code');
      setSnackbarOpen(true);
    });
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  const formatExpirationDate = (dateString) => {
    if (!dateString) return '';

    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="300px">
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>Loading settings...</Typography>
      </Box>
    );
  }

  return (
    <div>
      <Typography variant="h6" gutterBottom>System Settings</Typography>

      {success && <Alert severity="success" sx={{ mt: 2, mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {/* Registration Settings */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardHeader title="Registration Settings"/>
            <CardContent>
              <Typography variant="body1" gutterBottom>Registration
                Status: {registrationOpen ? 'Open' : 'Closed'}</Typography>
              <Button
                  variant="outlined"
                  color={registrationOpen ? "secondary" : "primary"}
                  onClick={handleRegistrationToggle}
                  fullWidth
              >
                {registrationOpen ? 'Close Registration' : 'Open Registration'}
              </Button>

              <Divider sx={{my: 2}}/>

              <Typography variant="body1" gutterBottom>Invite Required: {inviteRequired ? 'Yes' : 'No'}</Typography>
              <Button
                  variant="outlined"
                  color={inviteRequired ? "secondary" : "primary"}
                  onClick={handleInviteRequiredToggle}
                  fullWidth
              >
                {inviteRequired ? 'Make Registration Public' : 'Require Invitation Code'}
              </Button>

              {inviteRequired && (
                  <>
                    <Divider sx={{my: 2}}/>

                    <Typography variant="body1" gutterBottom>Generate Quick Invite (expires in 4 hours)</Typography>
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={handleGenerateQuickInvite}
                        disabled={isGeneratingInvite}
                        fullWidth
                        sx={{mb: 2}}
                    >
                      {isGeneratingInvite ? <CircularProgress size={24}/> : 'Generate Quick Invite'}
                    </Button>

                    {quickInviteData && (
                        <Box sx={{
                          mt: 2,
                          p: 2,
                          backgroundColor: 'rgba(0, 0, 0, 0.1)',
                          borderRadius: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <Box>
                            <Typography variant="subtitle2">Code:</Typography>
                            <Typography
                                variant="body1"
                                fontWeight="bold"
                                fontFamily="monospace"
                                fontSize="1.1rem"
                            >
                              {quickInviteData.code}
                            </Typography>
                            <Typography variant="caption" display="block" sx={{mt: 1}}>
                              Expires: {formatExpirationDate(quickInviteData.expires_at)}
                            </Typography>
                          </Box>
                          <Tooltip title="Copy code">
                            <IconButton onClick={handleCopyInviteCode} size="small">
                              <FileCopyIcon/>
                            </IconButton>
                          </Tooltip>
                        </Box>
                    )}
                  </>
              )}

              <Box mt={2}>
                <Typography variant="body2" color="textSecondary">
                  Current settings: Registration is {registrationOpen ? 'open' : 'closed'} and invites
                  are {inviteRequired ? 'required' : 'not required'}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Discord Integration Settings */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardHeader title="Discord Integration" avatar={<ChatIcon />} />
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
              <FormControlLabel
                control={
                  <Switch
                    checked={discordSettings.enabled}
                    onChange={(e) => setDiscordSettings({...discordSettings, enabled: e.target.checked})}
                  />
                }
                label="Enable Discord Integration"
              />
              <Button
                variant="outlined"
                color="primary"
                fullWidth
                sx={{ mt: 2 }}
                onClick={handleSaveDiscordSettings}
                disabled={isLoadingDiscord}
              >
                {isLoadingDiscord ? <CircularProgress size={24} /> : 'Save Discord Settings'}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* General Settings */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardHeader title="General Settings" avatar={<SettingsIcon />} />
            <CardContent>
              <Box sx={{ mb: 2 }}>
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

              <Divider sx={{ my: 2 }} />

              <Box sx={{ mb: 2 }}>
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
                    inputProps={{ min: 1 }}
                    fullWidth
                    size="small"
                    sx={{ mt: 1 }}
                    label="Default Quantity"
                  />
                )}
              </Box>

              <Box sx={{ mb: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={defaultSettings.autoAppraisalEnabled}
                      onChange={(e) => setDefaultSettings({...defaultSettings, autoAppraisalEnabled: e.target.checked})}
                    />
                  }
                  label="Auto-Appraisal"
                />
              </Box>

              <Box sx={{ mb: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={defaultSettings.autoSplitStacksEnabled}
                      onChange={(e) => setDefaultSettings({...defaultSettings, autoSplitStacksEnabled: e.target.checked})}
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

        {/* Database Backup & Restore */}
        <Grid item xs={12}>
          <Card variant="outlined">
            <CardHeader title="Database Backup & Restore" />
            <CardContent>
              <Typography variant="body2" gutterBottom color="text.secondary">
                Backup and restore your database. The backup will exclude the following system tables:
                min_caster_levels, min_costs, mod, spells, and item.
              </Typography>

              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} md={6}>
                  <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<CloudDownload />}
                    fullWidth
                    onClick={handleBackupDatabase}
                    disabled={isBackingUp}
                  >
                    {isBackingUp ? <CircularProgress size={24} /> : 'Backup Database'}
                  </Button>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button
                      variant="contained"
                      component="label"
                      color="secondary"
                      sx={{ flex: 1 }}
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
                      startIcon={<CloudUpload />}
                      disabled={!backupFile || isRestoring}
                      onClick={handleRestoreDatabase}
                      sx={{ flex: 1 }}
                    >
                      {isRestoring ? <CircularProgress size={24} /> : 'Restore'}
                    </Button>
                  </Box>
                  {backupFile && (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Selected file: {backupFile.name}
                    </Typography>
                  )}
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
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