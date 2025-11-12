import React, { useEffect, useState } from 'react';
import api from '../../../utils/api';
import {
    Box,
    Button,
    Card,
    CardContent,
    CircularProgress,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    FormControlLabel,
    Grid,
    InputLabel,
    MenuItem,
    Radio,
    RadioGroup,
    Select,
    TextField,
    Typography,
    Paper,
    Alert,
    Chip
} from '@mui/material';
import { format, formatDistance } from 'date-fns';
import { useSnackbar } from 'notistack';

const SessionsPage = () => {
    const [sessions, setSessions] = useState([]);
    const [characters, setCharacters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [user, setUser] = useState(null);
    const { enqueueSnackbar } = useSnackbar();

    // Get user from localStorage
    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (e) {
                console.error('Error parsing stored user data:', e);
            }
        }
    }, []);
    
    
    // Attendance dialog state
    const [openAttendanceDialog, setOpenAttendanceDialog] = useState(false);
    const [currentSession, setCurrentSession] = useState(null);
    const [attendanceStatus, setAttendanceStatus] = useState('accepted');
    const [selectedCharacter, setSelectedCharacter] = useState('');
    const [attendanceNotes, setAttendanceNotes] = useState('');
    const [lateArrivalTime, setLateArrivalTime] = useState('');
    const [earlyDepartureTime, setEarlyDepartureTime] = useState('');
    
    useEffect(() => {
        fetchSessions();
        fetchCharacters();
    }, []);
    
    const fetchSessions = async () => {
        try {
            setLoading(true);
            // Use enhanced session endpoint for better data - show all sessions, not just upcoming
            const response = await api.get('/sessions/enhanced');
            setSessions(response.data || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching sessions:', err);
            // Fallback to legacy endpoint if enhanced fails
            try {
                const fallbackResponse = await api.get('/sessions');
                setSessions(fallbackResponse.data || []);
                setError(null);
            } catch (fallbackErr) {
                console.error('Fallback error:', fallbackErr);
                setError('Failed to load sessions. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };
    
    const fetchCharacters = async () => {
        try {
            const response = await api.get('/user/characters');
            setCharacters(response.data.filter(char => char.active) || []);
        } catch (err) {
            console.error('Error fetching characters:', err);
            // Non-critical, so just log the error
        }
    };
    
    
    const handleOpenAttendanceDialog = (session) => {
        setCurrentSession(session);
        
        // Check if user already has attendance for this session
        const userAttendance = findUserAttendance(session);
        if (userAttendance) {
            setAttendanceStatus(userAttendance.status);
            setSelectedCharacter(userAttendance.character_id || '');
        } else {
            setAttendanceStatus('accepted');
            setSelectedCharacter(characters.length > 0 ? characters[0].id : '');
        }
        
        setOpenAttendanceDialog(true);
    };
    
    const findUserAttendance = (session) => {
        if (!session || !session.attendance || !user) return null;

        // Check all attendance statuses
        for (const status of ['accepted', 'declined', 'tentative']) {
            const found = session.attendance[status]?.find(attendee => attendee.user_id === user.id);
            if (found) return { ...found, status };
        }

        return null;
    };
    
    const handleUpdateAttendance = async () => {
        try {
            if (!currentSession) return;

            // Map attendance status to response types
            let responseType = 'yes';
            if (attendanceStatus === 'declined') responseType = 'no';
            if (attendanceStatus === 'tentative') responseType = 'maybe';
            if (attendanceStatus === 'late') responseType = 'late';
            if (attendanceStatus === 'early') responseType = 'early';

            const attendanceData = {
                response_type: responseType,
                character_id: attendanceStatus !== 'declined' ? selectedCharacter : null,
                notes: attendanceNotes || null,
                late_arrival_time: lateArrivalTime || null,
                early_departure_time: earlyDepartureTime || null
            };

            // Try enhanced endpoint first, fallback to legacy
            try {
                await api.post(`/sessions/${currentSession.id}/attendance/detailed`, attendanceData);
            } catch (enhancedErr) {
                // Fallback to legacy endpoint
                const legacyData = {
                    status: attendanceStatus,
                    character_id: attendanceStatus !== 'declined' ? selectedCharacter : null
                };
                await api.post(`/sessions/${currentSession.id}/attendance`, legacyData);
            }

            enqueueSnackbar('Attendance updated successfully', { variant: 'success' });

            // Close dialog and refresh sessions
            setOpenAttendanceDialog(false);
            setAttendanceNotes('');
            setLateArrivalTime('');
            setEarlyDepartureTime('');
            fetchSessions();
        } catch (err) {
            console.error('Error updating attendance:', err);
            enqueueSnackbar('Failed to update attendance', { variant: 'error' });
        }
    };
    
    const renderAttendanceList = (attendees, label) => {
        if (!attendees || attendees.length === 0) {
            return (
                <Box mt={1}>
                    <Typography variant="subtitle2" color="text.secondary">
                        {label} (0)
                    </Typography>
                    <Typography variant="body2">-</Typography>
                </Box>
            );
        }

        return (
            <Box mt={1}>
                <Typography variant="subtitle2" color="text.secondary">
                    {label} ({attendees.length})
                </Typography>
                {attendees.map((attendee, index) => (
                    <Typography key={index} variant="body2">
                        {attendee.character_name ? `${attendee.character_name} - ${attendee.username}` : attendee.username}
                        {attendee.notes && (
                            <Typography variant="caption" display="block" color="text.secondary">
                                {attendee.notes}
                            </Typography>
                        )}
                    </Typography>
                ))}
            </Box>
        );
    };

    // Enhanced attendance rendering for new format
    const renderEnhancedAttendance = (session) => {
        if (session.confirmed_count !== undefined) {
            // Enhanced format with counts
            return (
                <>
                    <Box mt={1}>
                        <Typography variant="subtitle2" color="text.secondary">
                            Attending ({session.confirmed_count || 0})
                        </Typography>
                        <Typography variant="body2">✅ {session.confirmed_count || 0} confirmed</Typography>
                    </Box>
                    <Box mt={1}>
                        <Typography variant="subtitle2" color="text.secondary">
                            Maybe ({session.maybe_count || 0})
                        </Typography>
                        <Typography variant="body2">❓ {session.maybe_count || 0} maybe</Typography>
                    </Box>
                    <Box mt={1}>
                        <Typography variant="subtitle2" color="text.secondary">
                            Not Attending ({session.declined_count || 0})
                        </Typography>
                        <Typography variant="body2">❌ {session.declined_count || 0} declined</Typography>
                    </Box>
                    {session.modified_count > 0 && (
                        <Box mt={1}>
                            <Typography variant="subtitle2" color="text.secondary">
                                Modified Attendance ({session.modified_count})
                            </Typography>
                            <Typography variant="body2">⏰ {session.modified_count} with timing changes</Typography>
                        </Box>
                    )}
                </>
            );
        } else {
            // Legacy format
            return (
                <>
                    {renderAttendanceList(session.attendance?.accepted, 'Attending')}
                    {renderAttendanceList(session.attendance?.tentative, 'Maybe')}
                    {renderAttendanceList(session.attendance?.declined, 'Not Attending')}
                </>
            );
        }
    };
    
    const renderSession = (session) => {
        const startDate = new Date(session.start_time);
        const endDate = new Date(session.end_time);
        const formattedDate = format(startDate, 'EEEE, MMMM d, yyyy');
        const formattedStartTime = format(startDate, 'h:mm a');
        const formattedEndTime = format(endDate, 'h:mm a');
        const timeUntil = formatDistance(startDate, new Date(), { addSuffix: true });

        // Determine user's attendance status
        const userAttendance = findUserAttendance(session);
        let attendanceStatusText = 'Not Responded';
        let attendanceStatusColor = 'text.secondary';

        if (userAttendance) {
            switch (userAttendance.status) {
                case 'accepted':
                    attendanceStatusText = 'Attending';
                    attendanceStatusColor = 'success.main';
                    break;
                case 'declined':
                    attendanceStatusText = 'Not Attending';
                    attendanceStatusColor = 'error.main';
                    break;
                case 'tentative':
                    attendanceStatusText = 'Maybe Attending';
                    attendanceStatusColor = 'warning.main';
                    break;
            }
        }

        return (
            <Card key={session.id} sx={{ mb: 3, border: 1, borderColor: 'divider' }}>
                <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                        <Typography variant="h5" component="div">
                            {session.title || 'Game Session'}
                        </Typography>

                        <Box display="flex" gap={1} flexWrap="wrap">
                            {session.is_recurring && (
                                <Chip
                                    label="Recurring Template"
                                    color="secondary"
                                    variant="outlined"
                                    size="small"
                                />
                            )}
                            {session.created_from_recurring && (
                                <Chip
                                    label="Recurring Session"
                                    color="info"
                                    variant="outlined"
                                    size="small"
                                />
                            )}
                            {session.status && (
                                <Chip
                                    label={session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                                    color={
                                        session.status === 'confirmed' ? 'success' :
                                        session.status === 'cancelled' ? 'error' :
                                        session.status === 'completed' ? 'default' : 'primary'
                                    }
                                    variant="outlined"
                                    size="small"
                                />
                            )}
                        </Box>
                    </Box>

                    <Box mt={2} mb={2}>
                        <Typography variant="subtitle1" gutterBottom>
                            <strong>{formattedDate}</strong>
                        </Typography>
                        <Typography variant="body1">
                            {formattedStartTime} - {formattedEndTime}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {timeUntil}
                        </Typography>
                    </Box>

                    {session.description && (
                        <Box mt={2} mb={2}>
                            <Typography variant="body1">{session.description}</Typography>
                        </Box>
                    )}

                    {session.recurring_pattern && session.is_recurring && (
                        <Box mt={2} mb={2}>
                            <Typography variant="body2" color="text.secondary">
                                <strong>Recurrence:</strong> {session.recurring_pattern}
                                {session.recurring_day_of_week !== null && (
                                    ` on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][session.recurring_day_of_week]}`
                                )}
                                {session.recurring_end_count && ` (${session.recurring_end_count} sessions)`}
                            </Typography>
                        </Box>
                    )}

                    <Divider sx={{ my: 2 }} />

                    <Grid container spacing={2} size={12}>
                        <Grid size={{xs: 12, md: 8}}>
                            {renderEnhancedAttendance(session)}
                        </Grid>
                        <Grid size={{xs: 12, md: 4}}>
                            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%">
                                <Typography variant="body2" sx={{ color: attendanceStatusColor, mb: 1 }}>
                                    Your Status: <strong>{attendanceStatusText}</strong>
                                </Typography>
                                {session.status !== 'recurring_template' && (
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={() => handleOpenAttendanceDialog(session)}
                                    >
                                        Update Attendance
                                    </Button>
                                )}
                            </Box>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>
        );
    };
    
    return (
        <Container maxWidth="lg">
            <Box mb={4} display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h4" component="h1" gutterBottom>
                    Game Sessions
                </Typography>
            </Box>
            
            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}
            
            {loading ? (
                <Box display="flex" justifyContent="center" my={4}>
                    <CircularProgress />
                </Box>
            ) : sessions.length === 0 ? (
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h6" color="text.secondary">
                        No sessions found
                    </Typography>
                    <Typography variant="body1" color="text.secondary" mt={1}>
                        No sessions have been scheduled yet.
                    </Typography>
                </Paper>
            ) : (
                <Box>
                    {sessions.map(session => renderSession(session))}
                </Box>
            )}

            {/* Attendance Dialog */}
            <Dialog open={openAttendanceDialog} onClose={() => setOpenAttendanceDialog(false)}>
                <DialogTitle>Update Attendance</DialogTitle>
                <DialogContent>
                    <Typography variant="subtitle1" gutterBottom>
                        {currentSession?.title || 'Game Session'}
                    </Typography>
                    
                    <Box mt={2} mb={3}>
                        <FormControl component="fieldset">
                            <Typography variant="subtitle2" gutterBottom>
                                Your Response:
                            </Typography>
                            <RadioGroup
                                value={attendanceStatus}
                                onChange={(e) => setAttendanceStatus(e.target.value)}
                            >
                                <FormControlLabel value="accepted" control={<Radio />} label="Yes, I'll be there" />
                                <FormControlLabel value="tentative" control={<Radio />} label="Maybe / Not sure yet" />
                                <FormControlLabel value="declined" control={<Radio />} label="No, I can't make it" />
                                <FormControlLabel value="late" control={<Radio />} label="Yes, but I'll be late" />
                                <FormControlLabel value="early" control={<Radio />} label="Yes, but I need to leave early" />
                            </RadioGroup>
                        </FormControl>
                    </Box>
                    
                    {attendanceStatus !== 'declined' && characters.length > 0 && (
                        <FormControl fullWidth sx={{ mt: 2 }}>
                            <InputLabel id="character-select-label">Character</InputLabel>
                            <Select
                                labelId="character-select-label"
                                value={selectedCharacter}
                                onChange={(e) => setSelectedCharacter(e.target.value)}
                                label="Character"
                            >
                                {characters.map((char) => (
                                    <MenuItem key={char.id} value={char.id}>
                                        {char.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}

                    {(attendanceStatus === 'late') && (
                        <TextField
                            label="Arrival Time (e.g., 7:30 PM)"
                            fullWidth
                            value={lateArrivalTime}
                            onChange={(e) => setLateArrivalTime(e.target.value)}
                            sx={{ mt: 2 }}
                            placeholder="When will you arrive?"
                        />
                    )}

                    {(attendanceStatus === 'early') && (
                        <TextField
                            label="Departure Time (e.g., 9:30 PM)"
                            fullWidth
                            value={earlyDepartureTime}
                            onChange={(e) => setEarlyDepartureTime(e.target.value)}
                            sx={{ mt: 2 }}
                            placeholder="When do you need to leave?"
                        />
                    )}

                    {attendanceStatus !== 'declined' && (
                        <TextField
                            label="Notes (Optional)"
                            fullWidth
                            multiline
                            rows={2}
                            value={attendanceNotes}
                            onChange={(e) => setAttendanceNotes(e.target.value)}
                            sx={{ mt: 2 }}
                            placeholder="Any additional comments..."
                        />
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenAttendanceDialog(false)}>Cancel</Button>
                    <Button onClick={handleUpdateAttendance} color="primary" variant="contained">
                        Update
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default SessionsPage;