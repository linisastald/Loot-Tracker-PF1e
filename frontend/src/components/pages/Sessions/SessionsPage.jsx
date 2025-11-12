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
    Alert
} from '@mui/material';
import { format, formatDistance } from 'date-fns';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
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
    
    // New session dialog state
    const [openDialog, setOpenDialog] = useState(false);
    const [sessionTitle, setSessionTitle] = useState('');
    const [startTime, setStartTime] = useState(new Date());
    const [endTime, setEndTime] = useState(new Date(new Date().setHours(new Date().getHours() + 5)));
    const [description, setDescription] = useState('');
    const [sendDiscordNotification, setSendDiscordNotification] = useState(true);
    const [minimumPlayers, setMinimumPlayers] = useState(3);
    const [announcementDaysBefore, setAnnouncementDaysBefore] = useState(7);
    const [confirmationDaysBefore, setConfirmationDaysBefore] = useState(2);
    
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
            // Use enhanced session endpoint for better data
            const response = await api.get('/sessions/enhanced?upcoming_only=true');
            setSessions(response.data.data || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching sessions:', err);
            // Fallback to legacy endpoint if enhanced fails
            try {
                const fallbackResponse = await api.get('/sessions');
                setSessions(fallbackResponse.data.data || []);
                setError(null);
            } catch (fallbackErr) {
                setError('Failed to load sessions. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };
    
    const fetchCharacters = async () => {
        try {
            const response = await api.get('/user/characters');
            setCharacters(response.data.data.filter(char => char.active) || []);
        } catch (err) {
            console.error('Error fetching characters:', err);
            // Non-critical, so just log the error
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
            
            await api.post('/sessions', sessionData);
            enqueueSnackbar('Session created successfully', { variant: 'success' });
            
            // Reset form and close dialog
            setSessionTitle('');
            setStartTime(new Date());
            setEndTime(new Date(new Date().setHours(new Date().getHours() + 5)));
            setDescription('');
            setSendDiscordNotification(true);
            setMinimumPlayers(3);
            setAnnouncementDaysBefore(7);
            setConfirmationDaysBefore(2);
            setOpenDialog(false);
            
            // Refresh sessions
            fetchSessions();
        } catch (err) {
            console.error('Error creating session:', err);
            enqueueSnackbar('Failed to create session', { variant: 'error' });
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
                    <Typography variant="h5" component="div" gutterBottom>
                        {session.title || 'Game Session'}
                    </Typography>
                    
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
                                <Button 
                                    variant="contained" 
                                    color="primary"
                                    onClick={() => handleOpenAttendanceDialog(session)}
                                >
                                    Update Attendance
                                </Button>
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
                
                {user?.role === 'DM' && (
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<AddCircleOutlineIcon />}
                        onClick={() => setOpenDialog(true)}
                    >
                        Create Session
                    </Button>
                )}
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
                        No upcoming sessions
                    </Typography>
                    <Typography variant="body1" color="text.secondary" mt={1}>
                        {user?.role === 'DM' 
                            ? "Click 'Create Session' to schedule a new game session." 
                            : "No sessions have been scheduled yet."}
                    </Typography>
                </Paper>
            ) : (
                <Box>
                    {sessions.map(session => renderSession(session))}
                </Box>
            )}
            
            {/* Create Session Dialog */}
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
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
                            sx={{ display: 'flex' }}
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
                        <Button onClick={handleCreateSession} color="primary" variant="contained">
                            Create Session
                        </Button>
                    </DialogActions>
                </Dialog>
            </LocalizationProvider>
            
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