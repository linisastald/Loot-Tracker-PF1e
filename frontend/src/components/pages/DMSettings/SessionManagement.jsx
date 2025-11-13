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
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputLabel,
    List,
    ListItem,
    ListItemText,
    MenuItem,
    Paper,
    Radio,
    RadioGroup,
    Select,
    Switch,
    TextField,
    Typography
} from '@mui/material';
import {
    Add as AddIcon,
    Announcement as AnnouncementIcon,
    Cancel as CancelIcon,
    CheckCircle as ConfirmIcon,
    Event as EventIcon,
    Group as GroupIcon,
    NotificationImportant as ReminderIcon,
    Refresh as RefreshIcon,
    Send as SendIcon,
    Visibility as ViewIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useSnackbar } from 'notistack';

const SessionManagement = () => {
    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState([]);
    const [selectedSession, setSelectedSession] = useState(null);
    const [error, setError] = useState('');
    const { enqueueSnackbar } = useSnackbar();

    // Dialog states
    const [attendanceDialog, setAttendanceDialog] = useState(false);
    const [reminderDialog, setReminderDialog] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState(false);
    const [createSessionDialog, setCreateSessionDialog] = useState(false);

    // Create session dialog state
    const [sessionTitle, setSessionTitle] = useState('');
    const [startTime, setStartTime] = useState(new Date());
    const [endTime, setEndTime] = useState(new Date(new Date().setHours(new Date().getHours() + 5)));
    const [description, setDescription] = useState('');
    const [sendDiscordNotification, setSendDiscordNotification] = useState(true);
    const [minimumPlayers, setMinimumPlayers] = useState(3);
    const [announcementDaysBefore, setAnnouncementDaysBefore] = useState(7);
    const [confirmationDaysBefore, setConfirmationDaysBefore] = useState(2);

    // Recurring session state
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurringPattern, setRecurringPattern] = useState('weekly');
    const [recurringDayOfWeek, setRecurringDayOfWeek] = useState(0); // 0 = Sunday
    const [recurringInterval, setRecurringInterval] = useState(1);
    const [recurringEndDate, setRecurringEndDate] = useState(null);
    const [recurringEndCount, setRecurringEndCount] = useState(12);

    // Reminder dialog settings
    const [reminderType, setReminderType] = useState('all');
    const [sendingReminder, setSendingReminder] = useState(false);

    // Session action states
    const [announcingSession, setAnnouncingSession] = useState(null);
    const [cancelingSession, setCancelingSession] = useState(null);
    const [confirmingSession, setConfirmingSession] = useState(null);

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        try {
            setLoading(true);
            // Get all sessions (not just upcoming) for management
            const response = await api.get('/sessions/enhanced');
            // Handle both response.data.data and response.data formats for compatibility
            setSessions(response.data?.data || response.data || []);
            setError('');
        } catch (err) {
            console.error('Error fetching sessions:', err);
            // Fallback to legacy endpoint if enhanced fails
            try {
                const fallbackResponse = await api.get('/sessions');
                setSessions(fallbackResponse.data || []);
                setError('');
            } catch (fallbackErr) {
                console.error('Fallback error:', fallbackErr);
                setError('Failed to load sessions. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSession = async () => {
        try {
            if (!sessionTitle || !startTime || !endTime) {
                enqueueSnackbar('Please fill in all required fields', { variant: 'error' });
                return;
            }

            if (endTime <= startTime) {
                enqueueSnackbar('End time must be after start time', { variant: 'error' });
                return;
            }

            if (isRecurring && recurringPattern !== 'custom' && (recurringDayOfWeek < 0 || recurringDayOfWeek > 6)) {
                enqueueSnackbar('Please select a valid day of the week for recurring sessions', { variant: 'error' });
                return;
            }

            const sessionData = {
                title: sessionTitle,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                description: description,
                minimum_players: minimumPlayers,
                announcement_days_before: announcementDaysBefore,
                confirmation_days_before: confirmationDaysBefore,
                send_discord_notification: sendDiscordNotification
            };

            // Add recurring fields if enabled
            if (isRecurring) {
                sessionData.recurring_pattern = recurringPattern;
                sessionData.recurring_day_of_week = recurringDayOfWeek;
                sessionData.recurring_interval = recurringInterval;
                if (recurringEndDate) {
                    sessionData.recurring_end_date = recurringEndDate.toISOString();
                }
                sessionData.recurring_end_count = recurringEndCount;
            }

            const endpoint = isRecurring ? '/sessions/recurring' : '/sessions';
            await api.post(endpoint, sessionData);

            const message = isRecurring
                ? `Recurring session template created with ${recurringEndCount} instances`
                : 'Session created successfully';
            enqueueSnackbar(message, { variant: 'success' });

            // Reset form and close dialog
            resetSessionForm();

            // Refresh sessions
            fetchSessions();
        } catch (err) {
            console.error('Error creating session:', err);
            const errorMessage = err.response?.data?.message || 'Failed to create session';
            enqueueSnackbar(errorMessage, { variant: 'error' });
        }
    };

    const resetSessionForm = () => {
        setSessionTitle('');
        setStartTime(new Date());
        setEndTime(new Date(new Date().setHours(new Date().getHours() + 5)));
        setDescription('');
        setSendDiscordNotification(true);
        setMinimumPlayers(3);
        setAnnouncementDaysBefore(7);
        setConfirmationDaysBefore(2);

        // Reset recurring fields
        setIsRecurring(false);
        setRecurringPattern('weekly');
        setRecurringDayOfWeek(0);
        setRecurringInterval(1);
        setRecurringEndDate(null);
        setRecurringEndCount(12);

        setCreateSessionDialog(false);
    };

    const handleAnnounceSession = async (sessionId) => {
        try {
            setAnnouncingSession(sessionId);
            await api.post(`/sessions/${sessionId}/announce`);
            enqueueSnackbar('Session announcement posted successfully', { variant: 'success' });
            fetchSessions(); // Refresh to get updated data
        } catch (err) {
            console.error('Error announcing session:', err);
            enqueueSnackbar('Failed to post announcement', { variant: 'error' });
        } finally {
            setAnnouncingSession(null);
        }
    };

    const handleSendReminder = async () => {
        try {
            setSendingReminder(true);
            await api.post(`/sessions/${selectedSession.id}/remind`, {
                reminder_type: reminderType
            });
            enqueueSnackbar('Reminder sent successfully', { variant: 'success' });
            setReminderDialog(false);
        } catch (err) {
            console.error('Error sending reminder:', err);
            enqueueSnackbar('Failed to send reminder', { variant: 'error' });
        } finally {
            setSendingReminder(false);
        }
    };

    const handleConfirmSession = async (sessionId) => {
        try {
            setConfirmingSession(sessionId);
            await api.put(`/sessions/${sessionId}`, { status: 'confirmed' });
            enqueueSnackbar('Session confirmed successfully', { variant: 'success' });
            fetchSessions();
        } catch (err) {
            console.error('Error confirming session:', err);
            enqueueSnackbar('Failed to confirm session', { variant: 'error' });
        } finally {
            setConfirmingSession(null);
        }
    };

    const handleCancelSession = async (sessionId, reason = 'Cancelled by DM') => {
        try {
            setCancelingSession(sessionId);
            await api.put(`/sessions/${sessionId}`, {
                status: 'cancelled',
                cancel_reason: reason
            });
            enqueueSnackbar('Session cancelled successfully', { variant: 'success' });
            fetchSessions();
        } catch (err) {
            console.error('Error cancelling session:', err);
            enqueueSnackbar('Failed to cancel session', { variant: 'error' });
        } finally {
            setCancelingSession(null);
        }
    };

    const viewAttendance = async (sessionId) => {
        try {
            const response = await api.get(`/sessions/${sessionId}/attendance/detailed`);
            setSelectedSession({
                ...sessions.find(s => s.id === sessionId),
                detailedAttendance: response.data.data
            });
            setAttendanceDialog(true);
        } catch (err) {
            console.error('Error fetching attendance:', err);
            enqueueSnackbar('Failed to load attendance details', { variant: 'error' });
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'scheduled': return 'primary';
            case 'confirmed': return 'success';
            case 'cancelled': return 'error';
            case 'completed': return 'default';
            default: return 'default';
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'scheduled': return 'Scheduled';
            case 'confirmed': return 'Confirmed';
            case 'cancelled': return 'Cancelled';
            case 'completed': return 'Completed';
            default: return status;
        }
    };

    const renderSessionCard = (session) => {
        const isUpcoming = new Date(session.start_time) > new Date();
        const attendanceTotal = (session.confirmed_count || 0) + (session.declined_count || 0) + (session.maybe_count || 0);

        return (
            <Card key={session.id} variant="outlined" sx={{ mb: 2 }}>
                <CardHeader
                    title={session.title || 'Game Session'}
                    subtitle={format(new Date(session.start_time), 'PPpp')}
                    action={
                        <Chip
                            label={getStatusLabel(session.status)}
                            color={getStatusColor(session.status)}
                            size="small"
                        />
                    }
                />
                <CardContent>
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <Typography variant="body2" color="text.secondary">
                                Description: {session.description || 'No description'}
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 1 }}>
                                Min Players: {session.minimum_players || 3}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Responses: {attendanceTotal} total
                            </Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                {/* View Attendance */}
                                <IconButton
                                    size="small"
                                    onClick={() => viewAttendance(session.id)}
                                    title="View Attendance Details"
                                >
                                    <ViewIcon />
                                </IconButton>

                                {/* Announce Session */}
                                {isUpcoming && session.status === 'scheduled' && (
                                    <IconButton
                                        size="small"
                                        onClick={() => handleAnnounceSession(session.id)}
                                        disabled={announcingSession === session.id}
                                        title="Post Discord Announcement"
                                        color="primary"
                                    >
                                        {announcingSession === session.id ?
                                            <CircularProgress size={20} /> : <AnnouncementIcon />}
                                    </IconButton>
                                )}

                                {/* Send Reminder */}
                                {isUpcoming && session.status !== 'cancelled' && (
                                    <IconButton
                                        size="small"
                                        onClick={() => {
                                            setSelectedSession(session);
                                            setReminderDialog(true);
                                        }}
                                        title="Send Reminder"
                                        color="info"
                                    >
                                        <ReminderIcon />
                                    </IconButton>
                                )}

                                {/* Confirm Session */}
                                {isUpcoming && session.status === 'scheduled' &&
                                 (session.confirmed_count || 0) >= (session.minimum_players || 3) && (
                                    <IconButton
                                        size="small"
                                        onClick={() => handleConfirmSession(session.id)}
                                        disabled={confirmingSession === session.id}
                                        title="Confirm Session"
                                        color="success"
                                    >
                                        {confirmingSession === session.id ?
                                            <CircularProgress size={20} /> : <ConfirmIcon />}
                                    </IconButton>
                                )}

                                {/* Cancel Session */}
                                {isUpcoming && session.status !== 'cancelled' && (
                                    <IconButton
                                        size="small"
                                        onClick={() => handleCancelSession(session.id)}
                                        disabled={cancelingSession === session.id}
                                        title="Cancel Session"
                                        color="error"
                                    >
                                        {cancelingSession === session.id ?
                                            <CircularProgress size={20} /> : <CancelIcon />}
                                    </IconButton>
                                )}
                            </Box>
                        </Grid>
                    </Grid>

                    {/* Attendance Summary */}
                    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {session.confirmed_names && (
                            <Typography variant="body2">
                                ✅ <strong>Attending ({session.confirmed_count || 0}):</strong> {session.confirmed_names}
                            </Typography>
                        )}
                        {!session.confirmed_names && (session.confirmed_count || 0) > 0 && (
                            <Typography variant="body2">
                                ✅ {session.confirmed_count} confirmed
                            </Typography>
                        )}
                        {session.maybe_names && (
                            <Typography variant="body2">
                                ❓ <strong>Maybe ({session.maybe_count || 0}):</strong> {session.maybe_names}
                            </Typography>
                        )}
                        {!session.maybe_names && (session.maybe_count || 0) > 0 && (
                            <Typography variant="body2">
                                ❓ {session.maybe_count} maybe
                            </Typography>
                        )}
                        {session.declined_names && (
                            <Typography variant="body2">
                                ❌ <strong>Declined ({session.declined_count || 0}):</strong> {session.declined_names}
                            </Typography>
                        )}
                        {!session.declined_names && (session.declined_count || 0) > 0 && (
                            <Typography variant="body2">
                                ❌ {session.declined_count} declined
                            </Typography>
                        )}
                        {!session.confirmed_names && !session.maybe_names && !session.declined_names &&
                         (session.confirmed_count || 0) === 0 && (session.maybe_count || 0) === 0 && (session.declined_count || 0) === 0 && (
                            <Typography variant="body2" color="text.secondary">
                                No responses yet
                            </Typography>
                        )}
                    </Box>
                </CardContent>
            </Card>
        );
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="300px">
                <CircularProgress />
                <Typography variant="body1" sx={{ ml: 2 }}>Loading sessions...</Typography>
            </Box>
        );
    }

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h6">Session Management</Typography>
                <Box display="flex" gap={2}>
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<AddIcon />}
                        onClick={() => setCreateSessionDialog(true)}
                    >
                        Create Session
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={fetchSessions}
                    >
                        Refresh
                    </Button>
                </Box>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            {sessions.length === 0 ? (
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h6" color="text.secondary">
                        No sessions found
                    </Typography>
                    <Typography variant="body1" color="text.secondary" mt={1}>
                        Create a session from the Sessions page to see it here.
                    </Typography>
                </Paper>
            ) : (
                <Box>
                    {sessions.map(renderSessionCard)}
                </Box>
            )}

            {/* Attendance Details Dialog */}
            <Dialog
                open={attendanceDialog}
                onClose={() => setAttendanceDialog(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    <Box display="flex" alignItems="center" gap={1}>
                        <GroupIcon />
                        Attendance Details: {selectedSession?.title}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {selectedSession?.detailedAttendance && (
                        <List>
                            {selectedSession.detailedAttendance.map((attendee, index) => (
                                <ListItem key={index} divider>
                                    <ListItemText
                                        primary={`${attendee.username} ${attendee.character_name ? `(${attendee.character_name})` : ''}`}
                                        secondary={
                                            <Box>
                                                <Typography variant="body2">
                                                    Status: {attendee.response_type}
                                                </Typography>
                                                {attendee.late_arrival_time && (
                                                    <Typography variant="body2">
                                                        Late Arrival: {attendee.late_arrival_time}
                                                    </Typography>
                                                )}
                                                {attendee.early_departure_time && (
                                                    <Typography variant="body2">
                                                        Early Departure: {attendee.early_departure_time}
                                                    </Typography>
                                                )}
                                                {attendee.notes && (
                                                    <Typography variant="body2">
                                                        Notes: {attendee.notes}
                                                    </Typography>
                                                )}
                                                <Typography variant="caption" color="text.secondary">
                                                    Responded: {format(new Date(attendee.response_timestamp), 'PPp')}
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                </ListItem>
                            ))}
                        </List>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAttendanceDialog(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Send Reminder Dialog */}
            <Dialog open={reminderDialog} onClose={() => setReminderDialog(false)}>
                <DialogTitle>Send Session Reminder</DialogTitle>
                <DialogContent>
                    <Typography variant="body1" gutterBottom>
                        Send a reminder for: {selectedSession?.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        {selectedSession?.start_time &&
                            format(new Date(selectedSession.start_time), 'PPpp')}
                    </Typography>

                    <FormControl component="fieldset" sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                            Who to remind:
                        </Typography>
                        <RadioGroup
                            value={reminderType}
                            onChange={(e) => setReminderType(e.target.value)}
                        >
                            <FormControlLabel
                                value="all"
                                control={<Radio />}
                                label="Everyone (general reminder)"
                            />
                            <FormControlLabel
                                value="non_responders"
                                control={<Radio />}
                                label="Non-responders only"
                            />
                            <FormControlLabel
                                value="maybe_responders"
                                control={<Radio />}
                                label="Maybe responders only"
                            />
                        </RadioGroup>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setReminderDialog(false)}>Cancel</Button>
                    <Button
                        onClick={handleSendReminder}
                        disabled={sendingReminder}
                        variant="contained"
                        startIcon={sendingReminder ? <CircularProgress size={16} /> : <SendIcon />}
                    >
                        Send Reminder
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Create Session Dialog */}
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <Dialog open={createSessionDialog} onClose={() => setCreateSessionDialog(false)} maxWidth="md" fullWidth>
                    <DialogTitle>Create New Session</DialogTitle>
                    <DialogContent>
                        <TextField
                            autoFocus
                            margin="dense"
                            label="Session Title"
                            fullWidth
                            value={sessionTitle}
                            onChange={(e) => setSessionTitle(e.target.value)}
                            required
                            sx={{ mb: 3 }}
                        />

                        <Grid container spacing={3} size={12} sx={{ mb: 3 }}>
                            <Grid size={{xs: 12, md: 6}}>
                                <DateTimePicker
                                    label="Start Time"
                                    value={startTime}
                                    onChange={setStartTime}
                                    slotProps={{ textField: { fullWidth: true } }}
                                />
                            </Grid>
                            <Grid size={{xs: 12, md: 6}}>
                                <DateTimePicker
                                    label="End Time"
                                    value={endTime}
                                    onChange={setEndTime}
                                    slotProps={{ textField: { fullWidth: true } }}
                                />
                            </Grid>
                        </Grid>

                        <TextField
                            label="Description (Optional)"
                            fullWidth
                            multiline
                            rows={4}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            sx={{ mb: 3 }}
                        />

                        <Grid container spacing={3} size={12} sx={{ mb: 3 }}>
                            <Grid size={{xs: 12, md: 4}}>
                                <TextField
                                    label="Minimum Players"
                                    type="number"
                                    fullWidth
                                    value={minimumPlayers}
                                    onChange={(e) => setMinimumPlayers(Math.max(1, parseInt(e.target.value) || 3))}
                                    inputProps={{ min: 1, max: 10 }}
                                />
                            </Grid>
                            <Grid size={{xs: 12, md: 4}}>
                                <TextField
                                    label="Announcement Days Before"
                                    type="number"
                                    fullWidth
                                    value={announcementDaysBefore}
                                    onChange={(e) => setAnnouncementDaysBefore(Math.max(1, parseInt(e.target.value) || 7))}
                                    inputProps={{ min: 1, max: 30 }}
                                />
                            </Grid>
                            <Grid size={{xs: 12, md: 4}}>
                                <TextField
                                    label="Confirmation Days Before"
                                    type="number"
                                    fullWidth
                                    value={confirmationDaysBefore}
                                    onChange={(e) => setConfirmationDaysBefore(Math.max(1, parseInt(e.target.value) || 2))}
                                    inputProps={{ min: 1, max: 14 }}
                                />
                            </Grid>
                        </Grid>

                        <FormControlLabel
                            control={
                                <RadioGroup
                                    value={sendDiscordNotification.toString()}
                                    onChange={(e) => setSendDiscordNotification(e.target.value === 'true')}
                                    row
                                >
                                    <FormControlLabel value="true" control={<Radio />} label="Yes" />
                                    <FormControlLabel value="false" control={<Radio />} label="No" />
                                </RadioGroup>
                            }
                            label="Send Discord Notification:"
                            sx={{ display: 'flex', mb: 3 }}
                        />

                        <Divider sx={{ my: 3 }} />

                        {/* Recurring Session Options */}
                        <Box mb={3}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={isRecurring}
                                        onChange={(e) => setIsRecurring(e.target.checked)}
                                    />
                                }
                                label="Make this a recurring session"
                            />
                        </Box>

                        {isRecurring && (
                            <Box sx={{ pl: 3, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, mb: 3 }}>
                                <Typography variant="subtitle2" gutterBottom>
                                    Recurring Session Options
                                </Typography>

                                <Grid container spacing={2} size={12} sx={{ mb: 2 }}>
                                    <Grid size={{xs: 12, md: 6}}>
                                        <FormControl fullWidth>
                                            <InputLabel id="recurring-pattern-label">Frequency</InputLabel>
                                            <Select
                                                labelId="recurring-pattern-label"
                                                value={recurringPattern}
                                                onChange={(e) => setRecurringPattern(e.target.value)}
                                                label="Frequency"
                                            >
                                                <MenuItem value="weekly">Weekly</MenuItem>
                                                <MenuItem value="biweekly">Every Other Week</MenuItem>
                                                <MenuItem value="monthly">Monthly</MenuItem>
                                                <MenuItem value="custom">Custom Interval</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>

                                    <Grid size={{xs: 12, md: 6}}>
                                        <FormControl fullWidth>
                                            <InputLabel id="day-of-week-label">Day of Week</InputLabel>
                                            <Select
                                                labelId="day-of-week-label"
                                                value={recurringDayOfWeek}
                                                onChange={(e) => setRecurringDayOfWeek(e.target.value)}
                                                label="Day of Week"
                                            >
                                                <MenuItem value={0}>Sunday</MenuItem>
                                                <MenuItem value={1}>Monday</MenuItem>
                                                <MenuItem value={2}>Tuesday</MenuItem>
                                                <MenuItem value={3}>Wednesday</MenuItem>
                                                <MenuItem value={4}>Thursday</MenuItem>
                                                <MenuItem value={5}>Friday</MenuItem>
                                                <MenuItem value={6}>Saturday</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                </Grid>

                                {recurringPattern === 'custom' && (
                                    <Grid container spacing={2} size={12} sx={{ mb: 2 }}>
                                        <Grid size={{xs: 12, md: 6}}>
                                            <TextField
                                                label="Interval (weeks)"
                                                type="number"
                                                fullWidth
                                                value={recurringInterval}
                                                onChange={(e) => setRecurringInterval(Math.max(1, parseInt(e.target.value) || 1))}
                                                inputProps={{ min: 1, max: 52 }}
                                                helperText="Number of weeks between sessions"
                                            />
                                        </Grid>
                                    </Grid>
                                )}

                                <Grid container spacing={2} size={12}>
                                    <Grid size={{xs: 12, md: 6}}>
                                        <TextField
                                            label="Number of Sessions"
                                            type="number"
                                            fullWidth
                                            value={recurringEndCount}
                                            onChange={(e) => setRecurringEndCount(Math.max(1, parseInt(e.target.value) || 12))}
                                            inputProps={{ min: 1, max: 100 }}
                                            helperText="How many sessions to create"
                                        />
                                    </Grid>

                                    <Grid size={{xs: 12, md: 6}}>
                                        <DatePicker
                                            label="End Date (Optional)"
                                            value={recurringEndDate}
                                            onChange={setRecurringEndDate}
                                            slotProps={{
                                                textField: {
                                                    fullWidth: true,
                                                    helperText: "Stop generating sessions after this date"
                                                }
                                            }}
                                        />
                                    </Grid>
                                </Grid>

                                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                                    {isRecurring && (
                                        <>
                                            This will create {recurringEndCount} sessions occurring
                                            {recurringPattern === 'weekly' && ' weekly'}
                                            {recurringPattern === 'biweekly' && ' every other week'}
                                            {recurringPattern === 'monthly' && ' monthly'}
                                            {recurringPattern === 'custom' && ` every ${recurringInterval} week${recurringInterval > 1 ? 's' : ''}`}
                                            {recurringDayOfWeek !== null && (
                                                ` on ${['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][recurringDayOfWeek]}`
                                            )}
                                            {recurringEndDate && `, ending no later than ${format(recurringEndDate, 'MMMM d, yyyy')}`}
                                            .
                                        </>
                                    )}
                                </Typography>
                            </Box>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={resetSessionForm}>Cancel</Button>
                        <Button onClick={handleCreateSession} color="primary" variant="contained">
                            {isRecurring ? `Create ${recurringEndCount} Recurring Sessions` : 'Create Session'}
                        </Button>
                    </DialogActions>
                </Dialog>
            </LocalizationProvider>
        </Box>
    );
};

export default SessionManagement;