import React, { useEffect, useState } from 'react';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
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
    Grid,
    IconButton,
    InputLabel,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    MenuItem,
    Paper,
    Select,
    TextField,
    Typography
} from '@mui/material';
import {
    Add as AddIcon,
    Assignment as AssignmentIcon,
    Book as BookIcon,
    Close as CloseIcon,
    Note as NoteIcon,
    Person as PersonIcon,
    Shield as ShieldIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';

const SessionNotes = ({ sessionId, sessionTitle }) => {
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState([]);
    const [addNoteDialog, setAddNoteDialog] = useState(false);
    const [error, setError] = useState('');
    const { user } = useAuth();
    const { enqueueSnackbar } = useSnackbar();

    // Add note form state
    const [newNoteType, setNewNoteType] = useState('general');
    const [newNoteContent, setNewNoteContent] = useState('');
    const [submittingNote, setSubmittingNote] = useState(false);

    useEffect(() => {
        if (sessionId) {
            fetchNotes();
        }
    }, [sessionId]);

    const fetchNotes = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/sessions/${sessionId}/notes`);
            setNotes(response.data.data || []);
            setError('');
        } catch (err) {
            console.error('Error fetching session notes:', err);
            setError('Failed to load session notes. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddNote = async () => {
        if (!newNoteContent.trim()) {
            enqueueSnackbar('Please enter note content', { variant: 'error' });
            return;
        }

        try {
            setSubmittingNote(true);
            await api.post(`/sessions/${sessionId}/notes`, {
                note: newNoteContent.trim(),
                note_type: newNoteType
            });

            enqueueSnackbar('Note added successfully', { variant: 'success' });
            setAddNoteDialog(false);
            setNewNoteContent('');
            setNewNoteType('general');
            fetchNotes(); // Refresh notes list
        } catch (err) {
            console.error('Error adding note:', err);
            enqueueSnackbar('Failed to add note', { variant: 'error' });
        } finally {
            setSubmittingNote(false);
        }
    };

    const getNoteTypeInfo = (noteType) => {
        switch (noteType) {
            case 'prep_request':
                return {
                    label: 'Prep Request',
                    icon: <AssignmentIcon />,
                    color: 'warning',
                    description: 'Request for DM preparation'
                };
            case 'dm_note':
                return {
                    label: 'DM Note',
                    icon: <ShieldIcon />,
                    color: 'error',
                    description: 'DM-only note'
                };
            default:
                return {
                    label: 'General Note',
                    icon: <NoteIcon />,
                    color: 'default',
                    description: 'General session note'
                };
        }
    };

    const canViewNote = (note) => {
        // DM can see all notes
        if (user?.role === 'DM') return true;

        // Players can see general notes and prep requests, but not DM notes
        if (note.note_type === 'dm_note') return false;

        return true;
    };

    const renderNote = (note, index) => {
        if (!canViewNote(note)) return null;

        const noteTypeInfo = getNoteTypeInfo(note.note_type);
        const isOwnNote = note.user_id === user?.id;

        return (
            <ListItem key={note.id || index} alignItems="flex-start" divider>
                <ListItemAvatar>
                    {noteTypeInfo.icon}
                </ListItemAvatar>
                <ListItemText
                    primary={
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <Typography variant="subtitle2">
                                {note.username}
                                {note.character_name && ` (${note.character_name})`}
                            </Typography>
                            <Chip
                                label={noteTypeInfo.label}
                                color={noteTypeInfo.color}
                                size="small"
                            />
                            {isOwnNote && (
                                <Chip
                                    label="Your note"
                                    color="info"
                                    size="small"
                                    variant="outlined"
                                />
                            )}
                        </Box>
                    }
                    secondary={
                        <Box>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                                {note.note}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {format(new Date(note.created_at), 'PPp')}
                            </Typography>
                        </Box>
                    }
                />
            </ListItem>
        );
    };

    const groupedNotes = {
        prep_request: notes.filter(note => note.note_type === 'prep_request'),
        general: notes.filter(note => note.note_type === 'general'),
        dm_note: notes.filter(note => note.note_type === 'dm_note' && canViewNote(note))
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="200px">
                <CircularProgress />
                <Typography variant="body1" sx={{ ml: 2 }}>Loading session notes...</Typography>
            </Box>
        );
    }

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                    Session Notes
                    {sessionTitle && (
                        <Typography variant="body2" color="text.secondary">
                            {sessionTitle}
                        </Typography>
                    )}
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setAddNoteDialog(true)}
                    size="small"
                >
                    Add Note
                </Button>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            {notes.length === 0 ? (
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h6" color="text.secondary">
                        No session notes yet
                    </Typography>
                    <Typography variant="body1" color="text.secondary" mt={1}>
                        Add prep requests, general notes, or DM notes for this session.
                    </Typography>
                </Paper>
            ) : (
                <Grid container spacing={2}>
                    {/* Prep Requests */}
                    {groupedNotes.prep_request.length > 0 && (
                        <Grid item xs={12}>
                            <Card variant="outlined">
                                <CardHeader
                                    title="Prep Requests"
                                    avatar={<AssignmentIcon color="warning" />}
                                    titleTypographyProps={{ variant: 'h6' }}
                                />
                                <CardContent sx={{ pt: 0 }}>
                                    <List>
                                        {groupedNotes.prep_request.map(renderNote)}
                                    </List>
                                </CardContent>
                            </Card>
                        </Grid>
                    )}

                    {/* General Notes */}
                    {groupedNotes.general.length > 0 && (
                        <Grid item xs={12}>
                            <Card variant="outlined">
                                <CardHeader
                                    title="General Notes"
                                    avatar={<NoteIcon />}
                                    titleTypographyProps={{ variant: 'h6' }}
                                />
                                <CardContent sx={{ pt: 0 }}>
                                    <List>
                                        {groupedNotes.general.map(renderNote)}
                                    </List>
                                </CardContent>
                            </Card>
                        </Grid>
                    )}

                    {/* DM Notes */}
                    {user?.role === 'DM' && groupedNotes.dm_note.length > 0 && (
                        <Grid item xs={12}>
                            <Card variant="outlined">
                                <CardHeader
                                    title="DM Notes"
                                    avatar={<ShieldIcon color="error" />}
                                    titleTypographyProps={{ variant: 'h6' }}
                                />
                                <CardContent sx={{ pt: 0 }}>
                                    <List>
                                        {groupedNotes.dm_note.map(renderNote)}
                                    </List>
                                </CardContent>
                            </Card>
                        </Grid>
                    )}
                </Grid>
            )}

            {/* Add Note Dialog */}
            <Dialog open={addNoteDialog} onClose={() => setAddNoteDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        Add Session Note
                        <IconButton onClick={() => setAddNoteDialog(false)}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel id="note-type-label">Note Type</InputLabel>
                        <Select
                            labelId="note-type-label"
                            value={newNoteType}
                            onChange={(e) => setNewNoteType(e.target.value)}
                            label="Note Type"
                        >
                            <MenuItem value="general">
                                <Box display="flex" alignItems="center" gap={1}>
                                    <NoteIcon />
                                    General Note
                                </Box>
                            </MenuItem>
                            <MenuItem value="prep_request">
                                <Box display="flex" alignItems="center" gap={1}>
                                    <AssignmentIcon />
                                    Prep Request
                                </Box>
                            </MenuItem>
                            {user?.role === 'DM' && (
                                <MenuItem value="dm_note">
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <ShieldIcon />
                                        DM Note (Private)
                                    </Box>
                                </MenuItem>
                            )}
                        </Select>
                    </FormControl>

                    <Box mb={2}>
                        <Typography variant="body2" color="text.secondary">
                            {getNoteTypeInfo(newNoteType).description}
                        </Typography>
                    </Box>

                    <TextField
                        autoFocus
                        label="Note Content"
                        fullWidth
                        multiline
                        rows={4}
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        placeholder={
                            newNoteType === 'prep_request'
                                ? 'Describe what you need the DM to prepare...'
                                : newNoteType === 'dm_note'
                                ? 'Private notes for session planning...'
                                : 'General session notes, thoughts, or reminders...'
                        }
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddNoteDialog(false)}>Cancel</Button>
                    <Button
                        onClick={handleAddNote}
                        disabled={submittingNote || !newNoteContent.trim()}
                        variant="contained"
                        startIcon={submittingNote ? <CircularProgress size={16} /> : <AddIcon />}
                    >
                        Add Note
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default SessionNotes;