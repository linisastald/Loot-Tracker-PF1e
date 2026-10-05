import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    List,
    ListItem,
    ListItemText,
    Paper,
    Radio,
    RadioGroup,
    TextField,
    Typography
} from '@mui/material';
import {
    Add as AddIcon,
    Announcement as AnnouncementIcon,
    Cancel as CancelIcon,
    Delete as DeleteIcon,
    ExpandLess as ExpandLessIcon,
    ExpandMore as ExpandMoreIcon,
    FilterList as FilterListIcon,
    Group as GroupIcon,
    Refresh as RefreshIcon,
    Send as SendIcon,
    Settings as SettingsIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useSnackbar } from 'notistack';
import api from '../../../utils/api';
import { getErrorMessage } from '../../../utils/apiErrors';
import { SessionListItem, fetchSessionList } from '../../../utils/sessionsApi';
import { useCampaignTimezone } from '../../../hooks/useCampaignTimezone';
import { formatInCampaignTimezone } from '../../../utils/timezoneUtils';
import CreateSessionDialog from './sessionManagement/CreateSessionDialog';
import EditSessionDialog from './sessionManagement/EditSessionDialog';
import SessionCard, { BusyAction, BusyActionType } from './sessionManagement/SessionCard';
import SessionDefaultsDialog from './sessionManagement/SessionDefaultsDialog';
import SessionFilterPanel from './sessionManagement/SessionFilterPanel';
import {
    SESSION_DEFAULTS_STORAGE_KEY,
    SessionDefaults,
    SessionFilters,
    defaultFilters,
    filterSessions,
    loadSessionDefaults
} from './sessionManagement/sessionConfig';

/** One row of GET /sessions/:id/attendance/detailed. */
interface AttendanceRecord {
    username: string;
    character_name?: string | null;
    response_type?: string | null;
    late_arrival_time?: string | null;
    early_departure_time?: string | null;
    notes?: string | null;
    response_timestamp?: string | null;
}

interface NotificationCheckResult {
    count?: number;
    results?: { status: string }[];
}

const SessionManagement = () => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [sessions, setSessions] = useState<SessionListItem[]>([]);
    const [error, setError] = useState('');
    const { enqueueSnackbar } = useSnackbar();

    // Campaign timezone hook
    const { timezone: currentTimezone } = useCampaignTimezone();

    // Dialog targets: each dialog is open while its target is set
    const [attendanceView, setAttendanceView] = useState<{ session: SessionListItem; records: AttendanceRecord[] } | null>(null);
    const [reminderSession, setReminderSession] = useState<SessionListItem | null>(null);
    const [sessionToCancel, setSessionToCancel] = useState<SessionListItem | null>(null);
    const [editingSession, setEditingSession] = useState<SessionListItem | null>(null);
    const [createSessionDialog, setCreateSessionDialog] = useState(false);
    const [settingsDialog, setSettingsDialog] = useState(false);
    const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);

    const [cancelReason, setCancelReason] = useState('');
    const [reminderType, setReminderType] = useState('all');
    const [sendingReminder, setSendingReminder] = useState(false);
    const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
    const [checkingNotifications, setCheckingNotifications] = useState(false);

    const [defaultSettings, setDefaultSettings] = useState<SessionDefaults>(loadSessionDefaults);

    // Bulk delete state
    const [selectedSessionIds, setSelectedSessionIds] = useState<number[]>([]);
    const [deletingSessions, setDeletingSessions] = useState(false);

    // Filter state
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState<SessionFilters>(defaultFilters);

    const fetchSessions = useCallback(async () => {
        try {
            setSessions(await fetchSessionList());
            setError('');
        } catch (err) {
            setError('Failed to load sessions. Please try again.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchSessions();
    };

    /** Run one per-session API action: busy spinner, snackbar, then refresh the list. */
    const runSessionAction = async (
        id: number,
        type: BusyActionType,
        request: () => Promise<unknown>,
        successMessage: string,
        failureMessage: string
    ) => {
        try {
            setBusyAction({ id, type });
            await request();
            enqueueSnackbar(successMessage, { variant: 'success' });
            fetchSessions();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, failureMessage), { variant: 'error' });
        } finally {
            setBusyAction(null);
        }
    };

    const handleRunAction = (sessionId: number, type: Exclude<BusyActionType, 'cancel'>) => {
        if (type === 'announce') {
            runSessionAction(sessionId, type, () => api.post(`/sessions/${sessionId}/announce`),
                'Session announcement posted successfully', 'Failed to post announcement');
        } else if (type === 'confirm') {
            runSessionAction(sessionId, type, () => api.put(`/sessions/${sessionId}`, { status: 'confirmed' }),
                'Session confirmed successfully', 'Failed to confirm session');
        } else {
            runSessionAction(sessionId, type, () => api.post(`/sessions/${sessionId}/uncancel`),
                'Session has been reinstated', 'Failed to uncancel session');
        }
    };

    const handleCancelSession = async () => {
        if (!sessionToCancel) return;
        const target = sessionToCancel;
        const reason = cancelReason || 'Cancelled by DM';
        setSessionToCancel(null);
        setCancelReason('');
        await runSessionAction(target.id, 'cancel',
            () => api.put(`/sessions/${target.id}`, { status: 'cancelled', cancel_reason: reason }),
            'Session cancelled successfully', 'Failed to cancel session');
    };

    const handleCheckNotifications = async () => {
        try {
            setCheckingNotifications(true);
            const response: { data?: NotificationCheckResult } = await api.post('/sessions/check-notifications');
            const result = response?.data || {};

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
                fetchSessions();
            }
        } catch (err) {
            enqueueSnackbar('Failed to check notifications', { variant: 'error' });
        } finally {
            setCheckingNotifications(false);
        }
    };

    const handleSendReminder = async () => {
        if (!reminderSession) return;
        try {
            setSendingReminder(true);
            await api.post(`/sessions/${reminderSession.id}/remind`, { reminder_type: reminderType });
            enqueueSnackbar('Reminder sent successfully', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar('Failed to send reminder', { variant: 'error' });
        } finally {
            setSendingReminder(false);
            setReminderSession(null);
        }
    };

    const viewAttendance = async (sessionId: number) => {
        try {
            // The api utility returns the response body: { success, data: rows }
            const response: { data?: AttendanceRecord[] } = await api.get(`/sessions/${sessionId}/attendance/detailed`);
            const session = sessions.find(s => s.id === sessionId);
            if (session) {
                setAttendanceView({ session, records: Array.isArray(response?.data) ? response.data : [] });
            }
        } catch (err) {
            enqueueSnackbar('Failed to load attendance details', { variant: 'error' });
        }
    };

    const saveDefaultSettings = (newDefaults: SessionDefaults) => {
        try {
            localStorage.setItem(SESSION_DEFAULTS_STORAGE_KEY, JSON.stringify(newDefaults));
            setDefaultSettings(newDefaults);
            setSettingsDialog(false);
            enqueueSnackbar('Default settings saved', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar('Failed to save default settings', { variant: 'error' });
        }
    };

    const filteredSessions = filterSessions(sessions, filters);

    const toggleSessionSelected = (sessionId: number) => {
        setSelectedSessionIds(prev =>
            prev.includes(sessionId) ? prev.filter(id => id !== sessionId) : [...prev, sessionId]
        );
    };

    const visibleIds: number[] = filteredSessions.map(session => session.id);
    const visibleSelectedCount = visibleIds.filter(id => selectedSessionIds.includes(id)).length;
    const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;

    const toggleSelectAllVisible = () => {
        setSelectedSessionIds(prev =>
            allVisibleSelected
                ? prev.filter(id => !visibleIds.includes(id))
                : Array.from(new Set([...prev, ...visibleIds]))
        );
    };

    const handleBulkDelete = async () => {
        if (selectedSessionIds.length === 0) return;
        setDeletingSessions(true);
        const results = await Promise.allSettled(
            selectedSessionIds.map(id => api.delete(`/sessions/${id}`))
        );
        const failed = selectedSessionIds.filter((_, i) => results[i].status === 'rejected');
        const deletedCount = selectedSessionIds.length - failed.length;
        setDeletingSessions(false);
        setBulkDeleteDialog(false);
        setSelectedSessionIds(failed);

        if (deletedCount > 0) {
            enqueueSnackbar(`Deleted ${deletedCount} session${deletedCount === 1 ? '' : 's'}`, { variant: 'success' });
        }
        if (failed.length > 0) {
            enqueueSnackbar(`Failed to delete ${failed.length} session${failed.length === 1 ? '' : 's'}`, { variant: 'error' });
        }
        fetchSessions();
    };

    if (loading) {
        return (
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "300px"
                }}>
                <CircularProgress />
                <Typography variant="body1" sx={{ ml: 2 }}>Loading sessions...</Typography>
            </Box>
        );
    }

    const emptyState = (title: string, hint: string) => (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ color: "text.secondary" }}>
                {title}
            </Typography>
            <Typography variant="body1" sx={{ color: "text.secondary", mt: 1 }}>
                {hint}
            </Typography>
        </Paper>
    );

    return (
        <Box>
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2
                }}>
                <Typography variant="h6">Session Management</Typography>
                <Box
                    sx={{
                        display: "flex",
                        gap: 2,
                        flexWrap: "wrap"
                    }}>
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
                        startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshIcon />}
                        onClick={handleRefresh}
                        disabled={refreshing}
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
            <SessionFilterPanel
                open={showFilters}
                filters={filters}
                onChange={setFilters}
                onReset={() => setFilters(defaultFilters())}
            />
            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}
            {sessions.length === 0 ? (
                emptyState('No sessions found', 'Create a session from the Sessions page to see it here.')
            ) : filteredSessions.length === 0 ? (
                emptyState('No sessions match your filters', 'Try adjusting your filter settings to see more sessions.')
            ) : (
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                        <Checkbox
                            checked={allVisibleSelected}
                            indeterminate={visibleSelectedCount > 0 && !allVisibleSelected}
                            onChange={toggleSelectAllVisible}
                            slotProps={{ input: { 'aria-label': 'Select all visible sessions' } }}
                        />
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            Showing {filteredSessions.length} of {sessions.length} sessions
                            {selectedSessionIds.length > 0 && ` · ${selectedSessionIds.length} selected`}
                        </Typography>
                        {selectedSessionIds.length > 0 && (
                            <Button
                                variant="outlined"
                                color="error"
                                size="small"
                                startIcon={<DeleteIcon />}
                                onClick={() => setBulkDeleteDialog(true)}
                                sx={{ ml: 'auto' }}
                            >
                                Delete Selected ({selectedSessionIds.length})
                            </Button>
                        )}
                    </Box>
                    {filteredSessions.map(session => (
                        <SessionCard
                            key={session.id}
                            session={session}
                            timezone={currentTimezone}
                            selected={selectedSessionIds.includes(session.id)}
                            busyAction={busyAction}
                            onToggleSelected={toggleSessionSelected}
                            onEdit={setEditingSession}
                            onViewAttendance={viewAttendance}
                            onRemind={setReminderSession}
                            onOpenCancel={(target) => {
                                setSessionToCancel(target);
                                setCancelReason('');
                            }}
                            onRunAction={handleRunAction}
                        />
                    ))}
                </Box>
            )}
            {/* Attendance Details Dialog */}
            <Dialog
                open={!!attendanceView}
                onClose={() => setAttendanceView(null)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <GroupIcon />
                        Attendance Details: {attendanceView?.session.title}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {attendanceView && attendanceView.records.length === 0 && (
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            No attendance has been recorded for this session.
                        </Typography>
                    )}
                    <List>
                        {attendanceView?.records.map((attendee, index) => (
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
                                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                                Responded: {currentTimezone && formatInCampaignTimezone(attendee.response_timestamp, currentTimezone, 'PPp')}
                                            </Typography>
                                        </Box>
                                    }
                                />
                            </ListItem>
                        ))}
                    </List>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAttendanceView(null)}>Close</Button>
                </DialogActions>
            </Dialog>
            {/* Send Reminder Dialog */}
            <Dialog open={!!reminderSession} onClose={() => setReminderSession(null)}>
                <DialogTitle>Send Session Reminder</DialogTitle>
                <DialogContent>
                    <Typography variant="body1" gutterBottom>
                        Send a reminder for: {reminderSession?.title}
                    </Typography>
                    <Typography variant="body2" gutterBottom sx={{ color: "text.secondary" }}>
                        {reminderSession?.start_time && currentTimezone &&
                            formatInCampaignTimezone(reminderSession.start_time, currentTimezone, 'PPpp z')}
                    </Typography>

                    <FormControl component="fieldset" sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                            Who to remind:
                        </Typography>
                        <RadioGroup
                            value={reminderType}
                            onChange={(e) => setReminderType(e.target.value)}
                        >
                            <FormControlLabel value="all" control={<Radio />} label="Everyone (general reminder)" />
                            <FormControlLabel value="non_responders" control={<Radio />} label="Non-responders only" />
                            <FormControlLabel value="maybe_responders" control={<Radio />} label="Maybe responders only" />
                        </RadioGroup>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setReminderSession(null)}>Cancel</Button>
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
            <Dialog open={!!sessionToCancel} onClose={() => setSessionToCancel(null)} maxWidth="sm" fullWidth>
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
                    <Button onClick={() => setSessionToCancel(null)}>Back</Button>
                    <Button
                        onClick={handleCancelSession}
                        variant="contained"
                        color="error"
                        startIcon={<CancelIcon />}
                    >
                        Cancel Session
                    </Button>
                </DialogActions>
            </Dialog>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <CreateSessionDialog
                    open={createSessionDialog}
                    defaults={defaultSettings}
                    onClose={() => setCreateSessionDialog(false)}
                    onCreated={() => {
                        setCreateSessionDialog(false);
                        fetchSessions();
                    }}
                />

                <EditSessionDialog
                    session={editingSession}
                    timezone={currentTimezone}
                    onClose={() => setEditingSession(null)}
                    onSaved={() => {
                        setEditingSession(null);
                        fetchSessions();
                    }}
                />
            </LocalizationProvider>

            {/* Bulk Delete Confirmation Dialog */}
            <Dialog open={bulkDeleteDialog} onClose={() => !deletingSessions && setBulkDeleteDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Delete {selectedSessionIds.length} Session{selectedSessionIds.length === 1 ? '' : 's'}?</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        This permanently deletes the selected sessions, their attendance records, and any linked Discord announcements. This cannot be undone.
                    </Alert>
                    <List dense>
                        {sessions
                            .filter(session => selectedSessionIds.includes(session.id))
                            .map(session => (
                                <ListItem key={session.id}>
                                    <ListItemText
                                        primary={session.title || 'Game Session'}
                                        secondary={currentTimezone && formatInCampaignTimezone(session.start_time, currentTimezone, 'PPpp z')}
                                    />
                                </ListItem>
                            ))}
                    </List>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBulkDeleteDialog(false)} disabled={deletingSessions}>Cancel</Button>
                    <Button
                        onClick={handleBulkDelete}
                        color="error"
                        variant="contained"
                        disabled={deletingSessions}
                        startIcon={deletingSessions ? <CircularProgress size={16} /> : <DeleteIcon />}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            <SessionDefaultsDialog
                open={settingsDialog}
                defaults={defaultSettings}
                onClose={() => setSettingsDialog(false)}
                onSave={saveDefaultSettings}
            />
        </Box>
    );
};

export default SessionManagement;
