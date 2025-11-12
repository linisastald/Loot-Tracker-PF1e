import React, { useEffect, useState } from 'react';
import api from '../../../utils/api';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
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
            setSessions(response.data.data || []);
            setError('');
        } catch (err) {
            console.error('Error fetching sessions:', err);
            setError('Failed to load sessions. Please try again.');
        } finally {
            setLoading(false);
        }
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
                    <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <Typography variant="body2">
                            ✅ {session.confirmed_count || 0} confirmed
                        </Typography>
                        <Typography variant="body2">
                            ❓ {session.maybe_count || 0} maybe
                        </Typography>
                        <Typography variant="body2">
                            ❌ {session.declined_count || 0} declined
                        </Typography>
                        {session.modified_count > 0 && (
                            <Typography variant="body2">
                                ⏰ {session.modified_count} timing changes
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
                <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={fetchSessions}
                >
                    Refresh
                </Button>
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
        </Box>
    );
};

export default SessionManagement;