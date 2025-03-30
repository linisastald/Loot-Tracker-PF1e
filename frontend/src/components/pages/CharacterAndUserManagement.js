import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  TableSortLabel,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Select,
  MenuItem,
  FormControl,
  FormControlLabel,
  InputLabel,
  InputAdornment,
  FormHelperText,
  IconButton,
  Tabs,
  Tab,
  Alert,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Switch,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Backup,
  RestoreOutlined,
  Download,
  Settings as SettingsIcon,
  CloudDownload,
  CloudUpload,
  DarkMode,
  LightMode,
  Message as ChatIcon
} from '@mui/icons-material';

// Tab panel component
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`management-tabpanel-${index}`}
      aria-labelledby={`management-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

// Tab props
function a11yProps(index) {
  return {
    id: `management-tab-${index}`,
    'aria-controls': `management-tabpanel-${index}`,
  };
}

const CharacterAndUserManagement = () => {
  const [users, setUsers] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [updateCharacterDialogOpen, setUpdateCharacterDialogOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [updateCharacter, setUpdateCharacter] = useState({
    name: '',
    appraisal_bonus: '',
    birthday: '',
    deathday: '',
    active: true,
    user_id: '',
  });
  const [tabValue, setTabValue] = useState(0); // For tabs

  // Discord integration settings
  const [discordSettings, setDiscordSettings] = useState({
    botToken: '',
    channelId: '',
    enabled: false
  });
  const [isLoadingDiscord, setIsLoadingDiscord] = useState(false);

  // Backup/restore state
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupFile, setBackupFile] = useState(null);

  // General settings
  const [theme, setTheme] = useState('dark');
  const [defaultSettings, setDefaultSettings] = useState({
    defaultBrowserQuantity: 1,
    autoAppraisalEnabled: true,
    autoSplitStacksEnabled: false
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [
          usersResponse,
          charactersResponse,
          settingsResponse,
          campaignResponse,
          discordResponse
        ] = await Promise.all([
          api.get(`/user/all`),
          api.get(`/user/all-characters`),
          api.get(`/user/settings`),
          api.get('/settings/campaign-name'),
          api.get('/settings/discord')
        ]);

        setUsers(usersResponse.data);
        setCharacters(charactersResponse.data);

        // Handle registration setting
        const registrationSetting = settingsResponse.data.find(setting => setting.name === 'registrations open');
        setRegistrationOpen(registrationSetting?.value === 1);

        // Set campaign name if available
        if (campaignResponse.data && campaignResponse.data.value) {
          setCampaignName(campaignResponse.data.value);
        }

        // Set Discord settings
        if (discordResponse.data) {
          setDiscordSettings({
            botToken: discordResponse.data.discord_bot_token || '',
            channelId: discordResponse.data.discord_channel_id || '',
            enabled: discordResponse.data.discord_integration_enabled === '1'
          });
        }

        // Load other settings
        const themeSettings = settingsResponse.data.find(setting => setting.name === 'theme');
        if (themeSettings) {
          setTheme(themeSettings.value || 'dark');
        }

        // Load default settings
        const defaultQuantity = settingsResponse.data.find(setting => setting.name === 'default_browser_quantity');
        const autoAppraisal = settingsResponse.data.find(setting => setting.name === 'auto_appraisal_enabled');
        const autoSplitStacks = settingsResponse.data.find(setting => setting.name === 'auto_split_stacks_enabled');

        setDefaultSettings({
          defaultBrowserQuantity: defaultQuantity ? parseInt(defaultQuantity.value) || 1 : 1,
          autoAppraisalEnabled: autoAppraisal ? autoAppraisal.value === '1' : true,
          autoSplitStacksEnabled: autoSplitStacks ? autoSplitStacks.value === '1' : false
        });
      } catch (error) {
        console.error('Error fetching data', error);
        setError('Error loading settings data. Please try again.');
      }
    };

    fetchData();
  }, []);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleSort = (columnKey) => {
    let direction = 'asc';
    if (sortConfig.key === columnKey && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: columnKey, direction });
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

  const handlePasswordReset = async () => {
    try {
      // Validate password length
      if (!newPassword) {
        setPasswordError('Password is required');
        return;
      }

      if (newPassword.length < 8) {
        setPasswordError('Password must be at least 8 characters long');
        return;
      }

      if (newPassword.length > 64) {
        setPasswordError('Password cannot exceed 64 characters');
        return;
      }

      await api.put(
          `/user/reset-password`,
          {userId: selectedUsers[0], newPassword}
      );
      setNewPassword('');
      setSelectedUsers([]);
      setSuccess('Password reset successfully');
      setError('');
      setPasswordError('');
      setResetPasswordDialogOpen(false);
    } catch (err) {
      setPasswordError(err.response?.data?.error || err.response?.data?.message || 'Error resetting password');
      setSuccess('');
    }
  };

  const handleDeleteUser = async () => {
    try {
      await Promise.all(
        selectedUsers.map(userId =>
          api.put(
            `/user/delete-user`,
            { userId }
          )
        )
      );
      setSelectedUsers([]);
      setSuccess('User(s) deleted successfully');
      setError('');
      setDeleteUserDialogOpen(false);

      // Refresh users list
      const usersResponse = await api.get(`/user/all`);
      setUsers(usersResponse.data);
    } catch (err) {
      setError('Error deleting user(s)');
      setSuccess('');
    }
  };

  const handleUserSelect = (userId) => {
    setSelectedUsers((prevSelected) =>
      prevSelected.includes(userId)
        ? prevSelected.filter((id) => id !== userId)
        : [...prevSelected, userId]
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    });
  };

  const handleUpdateCharacter = (char) => {
    setSelectedCharacter(char);
    setUpdateCharacter({
      name: char.name,
      appraisal_bonus: char.appraisal_bonus,
      birthday: char.birthday,
      deathday: char.deathday,
      active: char.active,
      user_id: char.user_id,
    });
    setUpdateCharacterDialogOpen(true);
  };

  const handleCharacterUpdateSubmit = async () => {
    try {
      await api.put(
        `/user/characters`,
        { ...selectedCharacter, ...updateCharacter }
      );
      setUpdateCharacterDialogOpen(false);
      setSuccess('Character updated successfully');
      setError('');
      setSelectedCharacter(null);

      // Refresh characters list
      const charactersResponse = await api.get(`/user/all-characters`);
      setCharacters(charactersResponse.data);
    } catch (err) {
      setError('Error updating character');
      setSuccess('');
    }
  };

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

  // Discord settings handlers
  const handleSaveDiscordSettings = async () => {
    try {
      setIsLoadingDiscord(true);

      // Only update the bot token if it's not empty
      if (discordSettings.botToken.trim() !== '') {
        await api.put('/user/update-setting', {
          name: 'discord_bot_token',
          value: discordSettings.botToken
        });
      }

      // Only update channel ID if it's provided
      if (discordSettings.channelId.trim() !== '') {
        await api.put('/user/update-setting', {
          name: 'discord_channel_id',
          value: discordSettings.channelId
        });
      }

      // Always update enabled status
      await api.put('/user/update-setting', {
        name: 'discord_integration_enabled',
        value: discordSettings.enabled ? '1' : '0'
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

      // Save default browser quantity if it's a valid number
      if (defaultSettings.defaultBrowserQuantity > 0) {
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

  // Sort characters based on current sort configuration
  const sortedCharacters = [...characters].sort((a, b) => {
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    // Handle special cases
    if (sortConfig.key === 'username') {
      aValue = a.username || '';
      bValue = b.username || '';
    } else if (sortConfig.key === 'active') {
      return sortConfig.direction === 'asc'
        ? (a.active === b.active ? 0 : a.active ? -1 : 1)
        : (a.active === b.active ? 0 : a.active ? 1 : -1);
    }

    // Null checks
    if (aValue === null) aValue = '';
    if (bValue === null) bValue = '';

    // Compare the values
    if (aValue < bValue) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Character and User Management</Typography>

        {success && <Alert severity="success" sx={{ mt: 2, mb: 2 }}>{success}</Alert>}
        {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>}

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 2 }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label="management tabs"
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="System Settings" {...a11yProps(0)} />
            <Tab label="User Management" {...a11yProps(1)} />
            <Tab label="Character Management" {...a11yProps(2)} />
            <Tab label="Campaign Settings" {...a11yProps(3)} />
          </Tabs>
        </Box>

        {/* System Settings Tab */}
        <TabPanel value={tabValue} index={0}>
          <Typography variant="h6" gutterBottom>System Settings</Typography>

          <Grid container spacing={3}>
            {/* Registration Settings */}
            <Grid item xs={12} md={4}>
              <Card variant="outlined">
                <CardHeader title="Registration Settings" />
                <CardContent>
                  <Typography variant="body1" gutterBottom>Registration Status: {registrationOpen ? 'Open' : 'Closed'}</Typography>
                  <Button
                    variant="outlined"
                    color={registrationOpen ? "secondary" : "primary"}
                    onClick={handleRegistrationToggle}
                    fullWidth
                  >
                    {registrationOpen ? 'Close Registration' : 'Open Registration'}
                  </Button>
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
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => {}}>
                            <Visibility />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <TextField
                    label="Channel ID"
                    value={discordSettings.channelId}
                    onChange={(e) => setDiscordSettings({...discordSettings, channelId: e.target.value})}
                    fullWidth
                    margin="normal"
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
                    <TextField
                      type="number"
                      value={defaultSettings.defaultBrowserQuantity}
                      onChange={(e) => setDefaultSettings({...defaultSettings, defaultBrowserQuantity: parseInt(e.target.value) || 1})}
                      inputProps={{ min: 1 }}
                      fullWidth
                      size="small"
                    />
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
        </TabPanel>

        {/* User Management Tab */}
        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" gutterBottom>User Management</Typography>

          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Select</TableCell>
                  <TableCell>Username</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Email</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => handleUserSelect(user.id)}
                      />
                    </TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>{user.email}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box mt={2} display="flex" gap={2}>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => setResetPasswordDialogOpen(true)}
              disabled={selectedUsers.length !== 1}
            >
              Reset Password
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => setDeleteUserDialogOpen(true)}
              disabled={selectedUsers.length === 0}
            >
              Delete User
            </Button>
          </Box>
        </TabPanel>

        {/* Character Management Tab */}
        <TabPanel value={tabValue} index={2}>
          <Typography variant="h6" gutterBottom>Character Management</Typography>

          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel
                      active={sortConfig.key === 'name'}
                      direction={sortConfig.direction}
                      onClick={() => handleSort('name')}
                    >
                      Name
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortConfig.key === 'username'}
                      direction={sortConfig.direction}
                      onClick={() => handleSort('username')}
                    >
                      User
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortConfig.key === 'active'}
                      direction={sortConfig.direction}
                      onClick={() => handleSort('active')}
                    >
                      Active
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortConfig.key === 'appraisal_bonus'}
                      direction={sortConfig.direction}
                      onClick={() => handleSort('appraisal_bonus')}
                    >
                      Appraisal Bonus
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortConfig.key === 'birthday'}
                      direction={sortConfig.direction}
                      onClick={() => handleSort('birthday')}
                    >
                      Birthday
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortConfig.key === 'deathday'}
                      direction={sortConfig.direction}
                      onClick={() => handleSort('deathday')}
                    >
                      Deathday
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedCharacters.map((char) => (
                  <TableRow
                    key={char.id}
                    onClick={() => handleUpdateCharacter(char)}
                    style={{
                      cursor: 'pointer',
                      ...(char.active && {
                        outline: '2px solid #4caf50', // Green outline for active characters
                        boxShadow: '0 0 10px rgba(76, 175, 80, 0.3)',
                        backgroundColor: 'rgba(76, 175, 80, 0.05)'
                      })
                    }}
                  >
                    <TableCell>{char.name}</TableCell>
                    <TableCell>{char.username}</TableCell>
                    <TableCell>{char.active ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{char.appraisal_bonus}</TableCell>
                    <TableCell>{formatDate(char.birthday)}</TableCell>
                    <TableCell>{formatDate(char.deathday)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="body2" sx={{ mt: 2 }}>Click on a character to edit</Typography>
        </TabPanel>

        {/* Campaign Settings Tab */}
        <TabPanel value={tabValue} index={3}>
          <Typography variant="h6" gutterBottom>Campaign Settings</Typography>

          <Box mt={2} mb={2} sx={{ maxWidth: 500 }}>
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
              sx={{ mt: 2 }}
            >
              Update Campaign Name
            </Button>
          </Box>

          {/* Additional campaign settings can be added here */}
        </TabPanel>
      </Paper>

      {/* Password Reset Dialog */}
      <Dialog open={resetPasswordDialogOpen} onClose={() => setResetPasswordDialogOpen(false)}>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          <TextField
              label="New Password"
              type={showNewPassword ? 'text' : 'password'}
              fullWidth
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              margin="normal"
              InputProps={{
                endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                          aria-label="toggle password visibility"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          edge="end"
                      >
                        {showNewPassword ? <VisibilityOff/> : <Visibility/>}
                      </IconButton>
                    </InputAdornment>
                ),
              }}
          />
          <FormHelperText>
            Password must be at least 8 characters long. For better security, use longer phrases
            that are easy to remember.
          </FormHelperText>
          {passwordError && <Typography color="error">{passwordError}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetPasswordDialogOpen(false)} color="secondary" variant="outlined">
            Cancel
          </Button>
          <Button onClick={handlePasswordReset} color="primary" variant="outlined">
            Reset Password
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteUserDialogOpen} onClose={() => setDeleteUserDialogOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete the selected user(s)?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteUserDialogOpen(false)} color="secondary" variant="outlined">
            Cancel
          </Button>
          <Button onClick={handleDeleteUser} color="primary" variant="outlined">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Character Dialog */}
      <Dialog open={updateCharacterDialogOpen} onClose={() => setUpdateCharacterDialogOpen(false)}>
        <DialogTitle>Update Character</DialogTitle>
        <DialogContent>
          <TextField
            label="Name"
            fullWidth
            value={updateCharacter.name}
            onChange={(e) => setUpdateCharacter({ ...updateCharacter, name: e.target.value })}
            margin="normal"
          />
          <TextField
            label="Appraisal Bonus"
            type="number"
            fullWidth
            value={updateCharacter.appraisal_bonus}
            onChange={(e) => setUpdateCharacter({ ...updateCharacter, appraisal_bonus: e.target.value })}
            margin="normal"
          />
          <TextField
            label="Birthday"
            type="date"
            fullWidth
            value={updateCharacter.birthday || ''}
            onChange={(e) => setUpdateCharacter({ ...updateCharacter, birthday: e.target.value })}
            margin="normal"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Deathday"
            type="date"
            fullWidth
            value={updateCharacter.deathday || ''}
            onChange={(e) => setUpdateCharacter({ ...updateCharacter, deathday: e.target.value })}
            margin="normal"
            InputLabelProps={{ shrink: true }}
          />
          <FormControl margin="normal" fullWidth>
            <InputLabel id="user-select-label">User</InputLabel>
            <Select
              labelId="user-select-label"
              value={updateCharacter.user_id}
              onChange={(e) => setUpdateCharacter({ ...updateCharacter, user_id: e.target.value })}
            >
              {users
                .filter((user) => user.role === 'Player')
                .map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.username}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Checkbox
                checked={updateCharacter.active}
                onChange={(e) => setUpdateCharacter({ ...updateCharacter, active: e.target.checked })}
              />
            }
            label="Active Character"
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUpdateCharacterDialogOpen(false)} color="secondary" variant="outlined">
            Cancel
          </Button>
          <Button onClick={handleCharacterUpdateSubmit} color="primary" variant="outlined">
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default CharacterAndUserManagement;