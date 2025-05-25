import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
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
    Grid2,
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
    const { user } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    
    // New session dialog state
    const [openDialog, setOpenDialog] = useState(false);
    const [sessionTitle, setSessionTitle] = useState('');
    const [startTime, setStartTime] = useState(new Date());
    const [endTime, setEndTime] = useState(new Date(new Date().setHours(new Date().getHours() + 5)));
    const [description, setDescription] = useState('');
    const [sendDiscordNotification, setSendDiscordNotification] = useState(true);
    
    // Attendance dialog state
    const [openAttendanceDialog, setOpenAttendanceDialog] = useState(false);
    const [currentSession, setCurrentSession] = useState(null);
    const [attendanceStatus, setAttendanceStatus] = useState('accepted');
    const [selectedCharacter, setSelectedCharacter] = useState('');
    
    useEffect(() => {
        fetchSessions();
        fetchCharacters();
    }, []);
    
    const fetchSessions = async () => {
        try {
            setLoading(true);
            const response = await api.get('/sessions');
            setSessions(response.data.data || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching sessions:', err);
            setError('Failed to load sessions. Please try again.');
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
        if (!session || !session.attendance) return null;
        
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
            
            const attendanceData = {
                status: attendanceStatus,
                character_id: attendanceStatus !== 'declined' ? selectedCharacter : null
            };
            
            await api.post(`/sessions/${currentSession.id}/attendance`, attendanceData);
            enqueueSnackbar('Attendance updated successfully', { variant: 'success' });
            
            // Close dialog and refresh sessions
            setOpenAttendanceDialog(false);
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
                    </Typography>
                ))}
            </Box>
        );
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
                    
                    <Grid2 container spacing={2}>
                        <Grid2 xs={12} md={8}>
                            {renderAttendanceList(session.attendance?.accepted, 'Attending')}
                            {renderAttendanceList(session.attendance?.tentative, 'Maybe')}
                            {renderAttendanceList(session.attendance?.declined, 'Not Attending')}
                        </Grid2>
                        <Grid2 xs={12} md={4}>
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
                        </Grid2>
                    </Grid2>
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
                        
                        <Grid2 container spacing={3} sx={{ mb: 3 }}>
                            <Grid2 xs={12} md={6}>
                                <DateTimePicker
                                    label="Start Time"
                                    value={startTime}
                                    onChange={setStartTime}
                                    slotProps={{ textField: { fullWidth: true } }}
                                />
                            </Grid2>
                            <Grid2 xs={12} md={6}>
                                <DateTimePicker
                                    label="End Time"
                                    value={endTime}
                                    onChange={setEndTime}
                                    slotProps={{ textField: { fullWidth: true } }}
                                />
                            </Grid2>
                        </Grid2>
                        
                        <TextField
                            label="Description (Optional)"
                            fullWidth
                            multiline
                            rows={4}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            sx={{ mb: 3 }}
                        />
                        
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