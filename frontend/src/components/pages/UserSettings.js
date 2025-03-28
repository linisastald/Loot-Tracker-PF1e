import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  Container,
  Paper,
  Typography,
  Button,
  TextField,
  Grid,
  Box,
  Alert,
  Tabs,
  Tab,
  Divider,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Card,
  CardContent,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SecurityIcon from '@mui/icons-material/Security';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CharacterTab from './UserSettings/CharacterTab';

// Tab Panel component
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
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

const UserSettings = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState(0);

  // Account settings state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // User preferences state
  const [defaultLandingPage, setDefaultLandingPage] = useState('/loot-entry');
  const [enableNotifications, setEnableNotifications] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [defaultTableView, setDefaultTableView] = useState('summary');

  // Load user preferences on mount
  useEffect(() => {
    // This would fetch user preferences from backend
    const fetchUserPreferences = async () => {
      try {
        const response = await api.get('/user/preferences');
        if (response.data) {
          setDefaultLandingPage(response.data.defaultLandingPage || '/loot-entry');
          setEnableNotifications(response.data.enableNotifications || false);
          setDarkMode(response.data.darkMode || false);
          setDefaultTableView(response.data.defaultTableView || 'summary');
        }
      } catch (error) {
        console.error('Error fetching user preferences:', error);
      }
    };

    fetchUserPreferences();
  }, []);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();

    // Basic validation
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    try {
      await api.put('/user/change-password', { oldPassword, newPassword });

      // Reset fields and show success message
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setSuccess('Password changed successfully');
    } catch (err) {
      setError(err.response?.data?.message || 'Error changing password');
      setSuccess('');
    }
  };

  const handleSavePreferences = async () => {
    try {
      await api.put('/user/preferences', {
        defaultLandingPage,
        enableNotifications,
        darkMode,
        defaultTableView
      });

      setSuccess('Preferences saved successfully');
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving preferences');
      setSuccess('');
    }
  };

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">User Settings</Typography>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 2 }}>
          <Tabs value={activeTab} onChange={handleTabChange} aria-label="settings tabs">
            <Tab label="Account" icon={<SecurityIcon />} iconPosition="start" />
            <Tab label="Preferences" icon={<PersonIcon />} iconPosition="start" />
            <Tab label="Characters" />
          </Tabs>
        </Box>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}

        {/* Account Tab */}
        <TabPanel value={activeTab} index={0}>
          <Typography variant="h6" gutterBottom>Change Password</Typography>

          <Grid container spacing={2} component="form" onSubmit={handleChangePassword}>
            <Grid item xs={12}>
              <TextField
                label="Current Password"
                type={showOldPassword ? 'text' : 'password'}
                fullWidth
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <Button
                      onClick={() => setShowOldPassword(!showOldPassword)}
                      sx={{ minWidth: 'auto' }}
                    >
                      {showOldPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </Button>
                  ),
                }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="New Password"
                type={showNewPassword ? 'text' : 'password'}
                fullWidth
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <Button
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      sx={{ minWidth: 'auto' }}
                    >
                      {showNewPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </Button>
                  ),
                }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Confirm New Password"
                type="password"
                fullWidth
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </Grid>

            <Grid item xs={12}>
              <Button
                variant="outlined"
                color="primary"
                type="submit"
                disabled={!oldPassword || !newPassword || !confirmPassword}
              >
                Change Password
              </Button>
            </Grid>
          </Grid>

          <Divider sx={{ my: 4 }} />

          <Typography variant="h6" gutterBottom>Account Information</Typography>

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1">Connected Sessions</Typography>
              <Typography variant="body2" color="text.secondary">
                You can view and manage your active sessions here. This feature will be available in a future update.
              </Typography>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle1">Export Account Data</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                You can export all your account data in various formats for backup purposes.
              </Typography>
              <Button variant="outlined" size="small" disabled>
                Export Data (Coming Soon)
              </Button>
            </CardContent>
          </Card>
        </TabPanel>

        {/* Preferences Tab */}
        <TabPanel value={activeTab} index={1}>
          <Typography variant="h6" gutterBottom>User Preferences</Typography>

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Default Landing Page</InputLabel>
                <Select
                  value={defaultLandingPage}
                  label="Default Landing Page"
                  onChange={(e) => setDefaultLandingPage(e.target.value)}
                >
                  <MenuItem value="/loot-entry">Loot Entry</MenuItem>
                  <MenuItem value="/loot-management">Loot Management</MenuItem>
                  <MenuItem value="/gold-transactions">Gold Transactions</MenuItem>
                  <MenuItem value="/calendar">Calendar</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Default Table View</InputLabel>
                <Select
                  value={defaultTableView}
                  label="Default Table View"
                  onChange={(e) => setDefaultTableView(e.target.value)}
                >
                  <MenuItem value="summary">Summary View</MenuItem>
                  <MenuItem value="detailed">Detailed View</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>Display Settings</Typography>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={darkMode}
                        onChange={(e) => setDarkMode(e.target.checked)}
                        color="primary"
                      />
                    }
                    label="Dark Mode"
                  />

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="subtitle1" gutterBottom>Notifications</Typography>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={enableNotifications}
                        onChange={(e) => setEnableNotifications(e.target.checked)}
                        color="primary"
                      />
                    }
                    label="Enable Discord Notifications"
                  />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Button
                variant="outlined"
                color="primary"
                onClick={handleSavePreferences}
              >
                Save Preferences
              </Button>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Character Tab */}
        <TabPanel value={activeTab} index={2}>
          <CharacterTab />
        </TabPanel>
      </Paper>
    </Container>
  );
};

export default UserSettings;