// frontend/src/components/pages/DMSettings/SessionSettings.js
import React, { useEffect, useState } from 'react';
import api from '../../../utils/api';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  CircularProgress,
  Divider,
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
  Event as EventIcon,
  Schedule as ScheduleIcon,
  Notifications as NotificationsIcon
} from '@mui/icons-material';

const SessionSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Discord Integration Status
  const [discordStatus, setDiscordStatus] = useState({
    enabled: false,
    token_configured: false,
    channel_configured: false,
    ready: false
  });

  // Session Schedule Settings
  const [sessionSettings, setSessionSettings] = useState({
    enabled: false,
    frequency: 'weekly', // weekly, biweekly, monthly
    daysOfWeek: [], // Array of day numbers (0 = Sunday, 1 = Monday, etc.)
    time: '19:00', // Session start time in HH:MM format
    duration: 4, // Session duration in hours
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });

  // Event Posting Settings
  const [eventSettings, setEventSettings] = useState({
    postDaysAhead: 7, // How many days before session to post event
    postTime: '12:00', // What time of day to post (HH:MM)
    includeDescription: true,
    defaultDescription: 'Weekly Pathfinder session - please respond with your availability!'
  });

  // Reminder Settings
  const [reminderSettings, setReminderSettings] = useState({
    enabled: true,
    firstReminderDays: 3, // Days before session for first reminder
    secondReminderDays: 1, // Days before session for second reminder
    reminderTime: '18:00', // What time to send reminders
    onlyRemindNoResponse: true // Only remind people who haven't responded
  });

  const daysOfWeek = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
  ];

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      
      // Check Discord integration status
      const discordResponse = await api.get('/discord/status');
      setDiscordStatus(discordResponse.data);

      // Fetch session settings
      const settingsResponse = await api.get('/user/settings');
      const settings = settingsResponse.data;

      // Parse session settings
      const sessionEnabled = settings.find(s => s.name === 'session_scheduling_enabled')?.value === '1';
      const frequency = settings.find(s => s.name === 'session_frequency')?.value || 'weekly';
      const daysOfWeek = JSON.parse(settings.find(s => s.name === 'session_days_of_week')?.value || '[]');
      const time = settings.find(s => s.name === 'session_time')?.value || '19:00';
      const duration = parseInt(settings.find(s => s.name === 'session_duration')?.value || '4');
      const timezone = settings.find(s => s.name === 'session_timezone')?.value || Intl.DateTimeFormat().resolvedOptions().timeZone;

      setSessionSettings({
        enabled: sessionEnabled,
        frequency,
        daysOfWeek,
        time,
        duration,
        timezone
      });

      // Parse event settings
      const postDaysAhead = parseInt(settings.find(s => s.name === 'event_post_days_ahead')?.value || '7');
      const postTime = settings.find(s => s.name === 'event_post_time')?.value || '12:00';
      const includeDescription = settings.find(s => s.name === 'event_include_description')?.value === '1';
      const defaultDescription = settings.find(s => s.name === 'event_default_description')?.value || 'Weekly Pathfinder session - please respond with your availability!';

      setEventSettings({
        postDaysAhead,
        postTime,
        includeDescription,
        defaultDescription
      });

      // Parse reminder settings
      const reminderEnabled = settings.find(s => s.name === 'reminder_enabled')?.value !== '0';
      const firstReminderDays = parseInt(settings.find(s => s.name === 'reminder_first_days')?.value || '3');
      const secondReminderDays = parseInt(settings.find(s => s.name === 'reminder_second_days')?.value || '1');
      const reminderTime = settings.find(s => s.name === 'reminder_time')?.value || '18:00';
      const onlyRemindNoResponse = settings.find(s => s.name === 'reminder_only_no_response')?.value !== '0';

      setReminderSettings({
        enabled: reminderEnabled,
        firstReminderDays,
        secondReminderDays,
        reminderTime,
        onlyRemindNoResponse
      });

    } catch (err) {
      setError('Failed to load session settings');
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setError('');

      // Save session settings
      await Promise.all([
        api.put('/user/update-setting', { name: 'session_scheduling_enabled', value: sessionSettings.enabled ? '1' : '0' }),
        api.put('/user/update-setting', { name: 'session_frequency', value: sessionSettings.frequency }),
        api.put('/user/update-setting', { name: 'session_days_of_week', value: JSON.stringify(sessionSettings.daysOfWeek) }),
        api.put('/user/update-setting', { name: 'session_time', value: sessionSettings.time }),
        api.put('/user/update-setting', { name: 'session_duration', value: sessionSettings.duration.toString() }),
        api.put('/user/update-setting', { name: 'session_timezone', value: sessionSettings.timezone }),

        // Save event settings
        api.put('/user/update-setting', { name: 'event_post_days_ahead', value: eventSettings.postDaysAhead.toString() }),
        api.put('/user/update-setting', { name: 'event_post_time', value: eventSettings.postTime }),
        api.put('/user/update-setting', { name: 'event_include_description', value: eventSettings.includeDescription ? '1' : '0' }),
        api.put('/user/update-setting', { name: 'event_default_description', value: eventSettings.defaultDescription }),

        // Save reminder settings
        api.put('/user/update-setting', { name: 'reminder_enabled', value: reminderSettings.enabled ? '1' : '0' }),
        api.put('/user/update-setting', { name: 'reminder_first_days', value: reminderSettings.firstReminderDays.toString() }),
        api.put('/user/update-setting', { name: 'reminder_second_days', value: reminderSettings.secondReminderDays.toString() }),
        api.put('/user/update-setting', { name: 'reminder_time', value: reminderSettings.reminderTime }),
        api.put('/user/update-setting', { name: 'reminder_only_no_response', value: reminderSettings.onlyRemindNoResponse ? '1' : '0' })
      ]);

      setSuccess('Session settings saved successfully');
    } catch (err) {
      setError('Failed to save session settings');
      console.error('Error saving settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDayToggle = (dayValue) => {
    const newDays = sessionSettings.daysOfWeek.includes(dayValue)
      ? sessionSettings.daysOfWeek.filter(d => d !== dayValue)
      : [...sessionSettings.daysOfWeek, dayValue].sort();
    
    setSessionSettings({ ...sessionSettings, daysOfWeek: newDays });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="300px">
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>Loading session settings...</Typography>
      </Box>
    );
  }

  return (
    <div>
      <Typography variant="h6" gutterBottom>Session Settings</Typography>
      
      {success && <Alert severity="success" sx={{ mt: 2, mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>}

      {/* Discord Status Warning */}
      {!discordStatus.ready && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Discord integration is not properly configured. Session scheduling requires Discord to be set up in System Settings.
          <br />
          Status: {!discordStatus.token_configured && 'Bot token missing'} {!discordStatus.channel_configured && 'Channel ID missing'} {!discordStatus.enabled && 'Integration disabled'}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Session Schedule */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardHeader title="Session Schedule" avatar={<ScheduleIcon />} />
            <CardContent>
              <FormControlLabel
                control={
                  <Switch
                    checked={sessionSettings.enabled}
                    onChange={(e) => setSessionSettings({ ...sessionSettings, enabled: e.target.checked })}
                    disabled={!discordStatus.ready}
                  />
                }
                label="Enable Automatic Session Scheduling"
              />

              {sessionSettings.enabled && (
                <>
                  <FormControl fullWidth margin="normal">
                    <InputLabel>Frequency</InputLabel>
                    <Select
                      value={sessionSettings.frequency}
                      onChange={(e) => setSessionSettings({ ...sessionSettings, frequency: e.target.value })}
                    >
                      <MenuItem value="weekly">Weekly</MenuItem>
                      <MenuItem value="biweekly">Bi-weekly</MenuItem>
                      <MenuItem value="monthly">Monthly</MenuItem>
                    </Select>
                  </FormControl>

                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Days of Week</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {daysOfWeek.map((day) => (
                      <FormControlLabel
                        key={day.value}
                        control={
                          <Checkbox
                            checked={sessionSettings.daysOfWeek.includes(day.value)}
                            onChange={() => handleDayToggle(day.value)}
                          />
                        }
                        label={day.label}
                      />
                    ))}
                  </Box>

                  <TextField
                    label="Session Time"
                    type="time"
                    value={sessionSettings.time}
                    onChange={(e) => setSessionSettings({ ...sessionSettings, time: e.target.value })}
                    fullWidth
                    margin="normal"
                    InputLabelProps={{ shrink: true }}
                  />

                  <TextField
                    label="Duration (hours)"
                    type="number"
                    value={sessionSettings.duration}
                    onChange={(e) => setSessionSettings({ ...sessionSettings, duration: parseInt(e.target.value) || 4 })}
                    fullWidth
                    margin="normal"
                    inputProps={{ min: 1, max: 12 }}
                  />

                  <TextField
                    label="Timezone"
                    value={sessionSettings.timezone}
                    onChange={(e) => setSessionSettings({ ...sessionSettings, timezone: e.target.value })}
                    fullWidth
                    margin="normal"
                    helperText="Auto-detected timezone"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Event Posting */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardHeader title="Event Posting" avatar={<EventIcon />} />
            <CardContent>
              <TextField
                label="Post Event (days ahead)"
                type="number"
                value={eventSettings.postDaysAhead}
                onChange={(e) => setEventSettings({ ...eventSettings, postDaysAhead: parseInt(e.target.value) || 7 })}
                fullWidth
                margin="normal"
                inputProps={{ min: 1, max: 30 }}
                helperText="How many days before the session to post the Discord event"
              />

              <TextField
                label="Post Time"
                type="time"
                value={eventSettings.postTime}
                onChange={(e) => setEventSettings({ ...eventSettings, postTime: e.target.value })}
                fullWidth
                margin="normal"
                InputLabelProps={{ shrink: true }}
                helperText="What time of day to post the event"
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={eventSettings.includeDescription}
                    onChange={(e) => setEventSettings({ ...eventSettings, includeDescription: e.target.checked })}
                  />
                }
                label="Include Description in Events"
              />

              {eventSettings.includeDescription && (
                <TextField
                  label="Default Event Description"
                  value={eventSettings.defaultDescription}
                  onChange={(e) => setEventSettings({ ...eventSettings, defaultDescription: e.target.value })}
                  fullWidth
                  margin="normal"
                  multiline
                  rows={3}
                  helperText="Default description for session events"
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Reminder Settings */}
        <Grid size={12}>
          <Card variant="outlined">
            <CardHeader title="Reminder Settings" avatar={<NotificationsIcon />} />
            <CardContent>
              <FormControlLabel
                control={
                  <Switch
                    checked={reminderSettings.enabled}
                    onChange={(e) => setReminderSettings({ ...reminderSettings, enabled: e.target.checked })}
                  />
                }
                label="Enable Automatic Reminders"
              />

              {reminderSettings.enabled && (
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                      label="First Reminder (days before)"
                      type="number"
                      value={reminderSettings.firstReminderDays}
                      onChange={(e) => setReminderSettings({ ...reminderSettings, firstReminderDays: parseInt(e.target.value) || 3 })}
                      fullWidth
                      inputProps={{ min: 1, max: 14 }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                      label="Second Reminder (days before)"
                      type="number"
                      value={reminderSettings.secondReminderDays}
                      onChange={(e) => setReminderSettings({ ...reminderSettings, secondReminderDays: parseInt(e.target.value) || 1 })}
                      fullWidth
                      inputProps={{ min: 1, max: 7 }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                      label="Reminder Time"
                      type="time"
                      value={reminderSettings.reminderTime}
                      onChange={(e) => setReminderSettings({ ...reminderSettings, reminderTime: e.target.value })}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={reminderSettings.onlyRemindNoResponse}
                          onChange={(e) => setReminderSettings({ ...reminderSettings, onlyRemindNoResponse: e.target.checked })}
                        />
                      }
                      label="Only remind non-responders"
                      sx={{ mt: 2 }}
                    />
                  </Grid>
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Save Button */}
        <Grid size={12}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={saveSettings}
              disabled={saving || !discordStatus.ready}
              sx={{ minWidth: 200 }}
            >
              {saving ? <CircularProgress size={24} /> : 'Save Session Settings'}
            </Button>
          </Box>
        </Grid>
      </Grid>
    </div>
  );
};

export default SessionSettings;