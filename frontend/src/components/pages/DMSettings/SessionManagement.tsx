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
    Collapse,
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
    TextField,
    Typography
} from '@mui/material';
import {
    Add as AddIcon,
    Announcement as AnnouncementIcon,
    Cancel as CancelIcon,
    CheckCircle as ConfirmIcon,
    Event as EventIcon,
    ExpandLess as ExpandLessIcon,
    ExpandMore as ExpandMoreIcon,
    FilterList as FilterListIcon,
    Group as GroupIcon,
    NotificationImportant as ReminderIcon,
    Refresh as RefreshIcon,
    Send as SendIcon,
    Settings as SettingsIcon,
    Visibility as ViewIcon
} from '@mui/icons-material';
import { format, addMonths } from 'date-fns';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useSnackbar } from 'notistack';
import { useCampaignTimezone } from '../../../hooks/useCampaignTimezone';
import { formatInCampaignTimezone } from '../../../utils/timezoneUtils';

interface TimezoneResponse {
    timezone: string;
}

interface ApiResponse<T> {
    data?: T;
}

interface SessionCreateData {
    title: string;
    start_time: string;
    end_time: string;
    description: string;
    minimum_players: number;
    auto_announce_hours: number;
    reminder_hours: number;
    confirmation_hours: number;
    recurring_pattern?: string;
    recurring_day_of_week?: number;
    recurring_interval?: number;
    recurring_end_date?: string;
    recurring_end_count?: number;
}

const SessionManagement = () => {
    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState([]);
    const [selectedSession, setSelectedSession] = useState(null);
    const [error, setError] = useState('');
    const { enqueueSnackbar } = useSnackbar();

    // Campaign timezone hook
    const { timezone: currentTimezone, loading: timezoneLoading } = useCampaignTimezone();

    // Dialog states
    const [attendanceDialog, setAttendanceDialog] = useState(false);
    const [reminderDialog, setReminderDialog] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState(false);
    const [createSessionDialog, setCreateSessionDialog] = useState(false);
    const [cancelDialog, setCancelDialog] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [sessionToCancel, setSessionToCancel] = useState(null);
    const [settingsDialog, setSettingsDialog] = useState(false);

    // Default session settings (defined first so they can be used below)
    const [defaultSettings, setDefaultSettings] = useState({
        minimumPlayers: 3,
        autoAnnounceHours: 168,      // 1 week
        reminderHours: 48,            // 2 days
        confirmationHours: 48         // 2 days
    });

    // Create session dialog state
    const [sessionTitle, setSessionTitle] = useState('');
    const [startTime, setStartTime] = useState(new Date());
    const [endTime, setEndTime] = useState(new Date(new Date().setHours(new Date().getHours() + 5)));
    const [endTimeManuallySet, setEndTimeManuallySet] = useState(false);
    const [description, setDescription] = useState('');
    const [minimumPlayers, setMinimumPlayers] = useState(defaultSettings.minimumPlayers);
    const [autoAnnounceHours, setAutoAnnounceHours] = useState(defaultSettings.autoAnnounceHours);
    const [reminderHours, setReminderHours] = useState(defaultSettings.reminderHours);
    const [confirmationHours, setConfirmationHours] = useState(defaultSettings.confirmationHours);

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
    const [checkingNotifications, setCheckingNotifications] = useState(false);

    // Filter state
    const [showFilters, setShowFilters] = useState(false);
    const [filterStatus, setFilterStatus] = useState({
        scheduled: true,
        confirmed: true,
        completed: true,
        cancelled: false
    });
    const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [dateTo, setDateTo] = useState(format(addMonths(new Date(), 2), 'yyyy-MM-dd'));

    useEffect(() => {
        fetchSessions();

        // Load default settings from localStorage
        const savedDefaults = localStorage.getItem('sessionDefaults');
        if (savedDefaults) {
            try {
                const parsed = JSON.parse(savedDefaults);
                setDefaultSettings(parsed);
            } catch (err) {
                // Failed to load saved defaults - using hardcoded defaults
            }
        }
    }, []);

    // Update form fields when defaultSettings changes (after loading from localStorage)
    useEffect(() => {
        setMinimumPlayers(defaultSettings.minimumPlayers);
        setAutoAnnounceHours(defaultSettings.autoAnnounceHours);
        setReminderHours(defaultSettings.reminderHours);
        setConfirmationHours(defaultSettings.confirmationHours);
    }, [defaultSettings]);

    const fetchSessions = async () => {
        try {
            setLoading(true);
            // Get all sessions (not just upcoming) for management
            const response = await api.get('/sessions/enhanced');
            // Handle both response.data.data and response.data formats for compatibility
            setSessions(response.data?.data || response.data || []);
            setError('');
        } catch (err) {
            // Fallback to legacy endpoint if enhanced fails
            try {
                const fallbackResponse = await api.get('/sessions');
                setSessions(fallbackResponse.data || []);
                setError('');
            } catch (fallbackErr) {
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

            const sessionData: SessionCreateData = {
                title: sessionTitle,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                description: description,
                minimum_players: minimumPlayers,
                auto_announce_hours: autoAnnounceHours,
                reminder_hours: reminderHours,
                confirmation_hours: confirmationHours
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
            const error = err as { response?: { data?: { message?: string } } };
            const errorMessage = error.response?.data?.message || 'Failed to create session';
            enqueueSnackbar(errorMessage, { variant: 'error' });
        }
    };

    const handleStartTimeChange = (newStartTime) => {
        setStartTime(newStartTime);

        // If end time hasn't been manually set, auto-update it to match the new start date
        if (!endTimeManuallySet && newStartTime) {
            const currentEndTime = endTime || new Date();
            const newEndTime = new Date(newStartTime);

            // Preserve the time portion from the current end time
            newEndTime.setHours(currentEndTime.getHours());
            newEndTime.setMinutes(currentEndTime.getMinutes());

            setEndTime(newEndTime);
        }
    };

    const handleEndTimeChange = (newEndTime) => {
        setEndTime(newEndTime);
        setEndTimeManuallySet(true);
    };

    const resetSessionForm = () => {
        setSessionTitle('');
        setStartTime(new Date());
        setEndTime(new Date(new Date().setHours(new Date().getHours() + 5)));
        setEndTimeManuallySet(false);
        setDescription('');
        setMinimumPlayers(defaultSettings.minimumPlayers);
        setAutoAnnounceHours(defaultSettings.autoAnnounceHours);
        setReminderHours(defaultSettings.reminderHours);
        setConfirmationHours(defaultSettings.confirmationHours);

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
            enqueueSnackbar('Failed to post announcement', { variant: 'error' });
        } finally {
            setAnnouncingSession(null);
        }
    };

    const handleCheckNotifications = async () => {
        try {
            setCheckingNotifications(true);
            const response = await api.post('/sessions/check-notifications');
            const result = response.data?.data || response.data || {};

            if (result.count === 0) {
                enqueueSnackbar('No sessions need notifications at this time', { variant: 'info' });
            } else {
                const successCount = result.results?.filter(r => r.status === 'success').length || 0;
                const errorCount = result.results?.filter(r => r.status === 'error').length || 0;

                if (errorCount === 0) {
                    enqueueSnackbar(`Posted ${successCount} session announcement(s)`, { variant: 'success' });
                } else {
                    enqueueSnackbar(`Posted ${successCount} announcements, ${errorCount} failed`, { variant: 'warning' });
                }
                fetchSessions(); // Refresh to get updated data
            }
        } catch (err) {
            enqueueSnackbar('Failed to check notifications', { variant: 'error' });
        } finally {
            setCheckingNotifications(false);
        }
    };

    const handleSendReminder = async () => {
        try {
            setSendingReminder(true);
            await api.post(`/sessions/${selectedSession.id}/remind`, {
                reminder_type: reminderType
            });
            enqueueSnackbar('Reminder sent successfully', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar('Failed to send reminder', { variant: 'error' });
        } finally {
            setSendingReminder(false);
            setReminderDialog(false);
        }
    };

    const handleConfirmSession = async (sessionId) => {
        try {
            setConfirmingSession(sessionId);
            await api.put(`/sessions/${sessionId}`, { status: 'confirmed' });
            enqueueSnackbar('Session confirmed successfully', { variant: 'success' });
            fetchSessions();
        } catch (err) {
            enqueueSnackbar('Failed to confirm session', { variant: 'error' });
        } finally {
            setConfirmingSession(null);
        }
    };

    const handleCancelSession = async () => {
        try {
            if (!sessionToCancel) return;

            setCancelingSession(sessionToCancel.id);
            await api.put(`/sessions/${sessionToCancel.id}`, {
                status: 'cancelled',
                cancel_reason: cancelReason || 'Cancelled by DM'
            });
            enqueueSnackbar('Session cancelled successfully', { variant: 'success' });
            fetchSessions();
        } catch (err) {
            enqueueSnackbar('Failed to cancel session', { variant: 'error' });
        } finally {
            setCancelingSession(null);
            setCancelDialog(false);
            setCancelReason('');
            setSessionToCancel(null);
        }
    };

    const openCancelDialog = (session) => {
        setSessionToCancel(session);
        setCancelReason('');
        setCancelDialog(true);
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

    // Filter sessions based on current filter settings
    const filteredSessions = sessions.filter(session => {
        // Filter by status
        const status = session.status || 'scheduled';
        if (!filterStatus[status]) {
            return false;
        }

        // Filter by date range
        const sessionDate = new Date(session.start_time);
        const fromDate = dateFrom ? new Date(dateFrom) : null;
        const toDate = dateTo ? new Date(dateTo + 'T23:59:59') : null;

        if (fromDate && sessionDate < fromDate) {
            return false;
        }
        if (toDate && sessionDate > toDate) {
            return false;
        }

        return true;
    });

    const handleStatusFilterChange = (status) => {
        setFilterStatus(prev => ({
            ...prev,
            [status]: !prev[status]
        }));
    };

    const resetFilters = () => {
        setFilterStatus({
            scheduled: true,
            confirmed: true,
            completed: true,
            cancelled: false
        });
        setDateFrom(format(new Date(), 'yyyy-MM-dd'));
        setDateTo(format(addMonths(new Date(), 2), 'yyyy-MM-dd'));
    };

    const renderSessionCard = (session) => {
        const isUpcoming = new Date(session.start_time) > new Date();
        const attendanceTotal = (session.confirmed_count || 0) + (session.declined_count || 0) + (session.maybe_count || 0);

        return (
            <Card key={session.id} variant="outlined" sx={{ mb: 2 }}>
                <CardHeader
                    title={session.title || 'Game Session'}
                    subtitle={currentTimezone && formatInCampaignTimezone(session.start_time, currentTimezone, 'PPpp z')}
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
                        <Grid size={{ xs: 12, md: 6 }}>
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
                        <Grid size={{ xs: 12, md: 6 }}>
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
                                        onClick={() => openCancelDialog(session)}
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

    const saveDefaultSettings = () => {
        try {
            localStorage.setItem('sessionDefaults', JSON.stringify(defaultSettings));
            setSettingsDialog(false);
            enqueueSnackbar('Default settings saved', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar('Failed to save default settings', { variant: 'error' });
        }
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
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Session Management</Typography>
                <Box display="flex" gap={2} flexWrap="wrap">
                    <Button
                        variant="outlined"
                        startIcon={<SettingsIcon />}
                        onClick={() => setSettingsDialog(true)}
                    >
                        Defaults
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<FilterListIcon />}
                        endIcon={showFilters ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        Filters
                    </Button>
                    <Button
                        variant="outlined"
                        color="secondary"
                        startIcon={checkingNotifications ? <CircularProgress size={16} /> : <AnnouncementIcon />}
                        onClick={handleCheckNotifications}
                        disabled={checkingNotifications}
                        title="Check for sessions that need Discord announcements and post them"
                    >
                        Check Notifications
                    </Button>
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

            {/* Timezone Display */}
            {currentTimezone && (
                <Alert severity="info" sx={{ mb: 3 }}>
                    All session times are displayed in <strong>{currentTimezone}</strong>.
                    You can change this in Campaign Settings.
                </Alert>
            )}

            {/* Filters Panel */}
            <Collapse in={showFilters}>
                <Paper sx={{ p: 2, mb: 3 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid size={12}>
                            <Typography variant="subtitle1" gutterBottom>
                                Session Status
                            </Typography>
                            <Box display="flex" gap={2} flexWrap="wrap">
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={filterStatus.scheduled}
                                            onChange={() => handleStatusFilterChange('scheduled')}
                                        />
                                    }
                                    label="Scheduled"
                                />
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={filterStatus.confirmed}
                                            onChange={() => handleStatusFilterChange('confirmed')}
                                        />
                                    }
                                    label="Confirmed"
                                />
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={filterStatus.completed}
                                            onChange={() => handleStatusFilterChange('completed')}
                                        />
                                    }
                                    label="Completed"
                                />
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={filterStatus.cancelled}
                                            onChange={() => handleStatusFilterChange('cancelled')}
                                        />
                                    }
                                    label="Cancelled"
                                />
                            </Box>
                        </Grid>
                        <Grid size={{xs: 12, sm: 5}}>
                            <TextField
                                label="From Date"
                                type="date"
                                fullWidth
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid size={{xs: 12, sm: 5}}>
                            <TextField
                                label="To Date"
                                type="date"
                                fullWidth
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid size={{xs: 12, sm: 2}}>
                            <Button
                                variant="outlined"
                                fullWidth
                                onClick={resetFilters}
                            >
                                Reset
                            </Button>
                        </Grid>
                    </Grid>
                </Paper>
            </Collapse>

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
            ) : filteredSessions.length === 0 ? (
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h6" color="text.secondary">
                        No sessions match your filters
                    </Typography>
                    <Typography variant="body1" color="text.secondary" mt={1}>
                        Try adjusting your filter settings to see more sessions.
                    </Typography>
                </Paper>
            ) : (
                <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Showing {filteredSessions.length} of {sessions.length} sessions
                    </Typography>
                    {filteredSessions.map(renderSessionCard)}
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
                                                    Responded: {currentTimezone && formatInCampaignTimezone(attendee.response_timestamp, currentTimezone, 'PPp')}
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
                        {selectedSession?.start_time && currentTimezone &&
                            formatInCampaignTimezone(selectedSession.start_time, currentTimezone, 'PPpp z')}
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

            {/* Cancel Session Dialog */}
            <Dialog open={cancelDialog} onClose={() => setCancelDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Cancel Session</DialogTitle>
                <DialogContent>
                    <Typography variant="body1" gutterBottom>
                        Cancel: {sessionToCancel?.title}
                    </Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Cancellation Reason"
                        fullWidth
                        multiline
                        rows={3}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="e.g., Not enough players, DM unavailable, etc."
                        helperText="This reason will be shown in Discord and the app"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCancelDialog(false)}>Back</Button>
                    <Button
                        onClick={handleCancelSession}
                        disabled={cancelingSession}
                        variant="contained"
                        color="error"
                        startIcon={cancelingSession ? <CircularProgress size={16} /> : <CancelIcon />}
                    >
                        Cancel Session
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
                                    onChange={handleStartTimeChange}
                                    slotProps={{ textField: { fullWidth: true } }}
                                />
                            </Grid>
                            <Grid size={{xs: 12, md: 6}}>
                                <DateTimePicker
                                    label="End Time"
                                    value={endTime}
                                    onChange={handleEndTimeChange}
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
                                    label="Auto-Announce Hours Before"
                                    type="number"
                                    fullWidth
                                    value={autoAnnounceHours}
                                    onChange={(e) => setAutoAnnounceHours(Math.max(1, parseInt(e.target.value) || 168))}
                                    inputProps={{ min: 1, max: 720 }}
                                    helperText="Hours before session to post announcement (168 = 1 week)"
                                />
                            </Grid>
                            <Grid size={{xs: 12, md: 4}}>
                                <TextField
                                    label="Reminder Hours Before"
                                    type="number"
                                    fullWidth
                                    value={reminderHours}
                                    onChange={(e) => setReminderHours(Math.max(1, parseInt(e.target.value) || 48))}
                                    inputProps={{ min: 1, max: 336 }}
                                    helperText="Hours before session to send reminder (48 = 2 days)"
                                />
                            </Grid>
                        </Grid>
                        <Grid container spacing={3} sx={{ mt: 1 }} size={12}>
                            <Grid size={{xs: 12, md: 6}}>
                                <TextField
                                    label="Confirmation Hours Before"
                                    type="number"
                                    fullWidth
                                    value={confirmationHours}
                                    onChange={(e) => setConfirmationHours(Math.max(1, parseInt(e.target.value) || 48))}
                                    inputProps={{ min: 1, max: 336 }}
                                    helperText="Hours before session to check attendance. Will confirm if enough players, cancel if not (48 = 2 days)"
                                />
                            </Grid>
                        </Grid>

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

                {/* Default Settings Dialog */}
                <Dialog open={settingsDialog} onClose={() => setSettingsDialog(false)} maxWidth="md" fullWidth>
                    <DialogTitle>Default Session Settings</DialogTitle>
                    <DialogContent>
                        <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
                            These defaults will pre-fill when creating new sessions
                        </Typography>

                        <Grid container spacing={3}>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <TextField
                                    label="Default Minimum Players"
                                    type="number"
                                    fullWidth
                                    value={defaultSettings.minimumPlayers}
                                    onChange={(e) => setDefaultSettings({ ...defaultSettings, minimumPlayers: Math.max(1, parseInt(e.target.value) || 3) })}
                                    inputProps={{ min: 1, max: 10 }}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <TextField
                                    label="Default Auto-Announce Hours Before"
                                    type="number"
                                    fullWidth
                                    value={defaultSettings.autoAnnounceHours}
                                    onChange={(e) => setDefaultSettings({ ...defaultSettings, autoAnnounceHours: Math.max(1, parseInt(e.target.value) || 168) })}
                                    inputProps={{ min: 1, max: 720 }}
                                    helperText="168 hours = 1 week"
                                />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <TextField
                                    label="Default Reminder Hours Before"
                                    type="number"
                                    fullWidth
                                    value={defaultSettings.reminderHours}
                                    onChange={(e) => setDefaultSettings({ ...defaultSettings, reminderHours: Math.max(1, parseInt(e.target.value) || 48) })}
                                    inputProps={{ min: 1, max: 336 }}
                                    helperText="48 hours = 2 days"
                                />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <TextField
                                    label="Default Confirmation Hours Before"
                                    type="number"
                                    fullWidth
                                    value={defaultSettings.confirmationHours}
                                    onChange={(e) => setDefaultSettings({ ...defaultSettings, confirmationHours: Math.max(1, parseInt(e.target.value) || 48) })}
                                    inputProps={{ min: 1, max: 336 }}
                                    helperText="48 hours = 2 days. Checks attendance and auto-confirms or auto-cancels."
                                />
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setSettingsDialog(false)}>Cancel</Button>
                        <Button onClick={saveDefaultSettings} variant="contained" color="primary">
                            Save Defaults
                        </Button>
                    </DialogActions>
                </Dialog>
            </LocalizationProvider>
        </Box>
    );
};

export default SessionManagement;