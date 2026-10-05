import React, { useEffect, useState } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Radio,
    RadioGroup,
    Select,
    TextField,
    Typography
} from '@mui/material';
import { DEFAULT_ATTENDANCE_STATUS, getUserResponse, responseTypeForStatus } from './attendanceResponse';

const RESPONSE_OPTIONS = [
    { value: 'accepted', label: "Yes, I'll be there" },
    { value: 'tentative', label: 'Maybe / Not sure yet' },
    { value: 'declined', label: "No, I can't make it" },
    { value: 'late', label: "Yes, but I'll be late" },
    { value: 'early', label: 'Yes, but I need to leave early' }
];

/**
 * Dialog for answering a session invitation. The form is re-initialised from
 * the user's existing response each time it opens for a session.
 *
 * onSubmit receives the body for POST /sessions/:id/attendance/detailed.
 */
const AttendanceDialog = ({ open, session, characters, onClose, onSubmit }) => {
    const [status, setStatus] = useState(DEFAULT_ATTENDANCE_STATUS);
    const [characterId, setCharacterId] = useState('');
    const [notes, setNotes] = useState('');
    const [lateArrivalTime, setLateArrivalTime] = useState('');
    const [earlyDepartureTime, setEarlyDepartureTime] = useState('');

    useEffect(() => {
        if (!open) return;
        const existing = getUserResponse(session);
        const stored = existing?.characterId;
        const storedIsActive = stored && characters.some(char => char.id === stored);

        setStatus(existing?.status || DEFAULT_ATTENDANCE_STATUS);
        setCharacterId(storedIsActive ? stored : (characters[0]?.id ?? ''));
        setNotes('');
        setLateArrivalTime('');
        setEarlyDepartureTime('');
        // Only re-initialise when the dialog opens for a session, not whenever the character list refreshes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, session]);

    const declined = status === 'declined';

    const handleSubmit = () => {
        onSubmit({
            response_type: responseTypeForStatus(status),
            character_id: declined ? null : (characterId || null),
            notes: notes || null,
            late_arrival_time: status === 'late' ? (lateArrivalTime || null) : null,
            early_departure_time: status === 'early' ? (earlyDepartureTime || null) : null
        });
    };

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>Update Attendance</DialogTitle>
            <DialogContent>
                <Typography variant="subtitle1" gutterBottom>
                    {session?.title || 'Game Session'}
                </Typography>

                <Box sx={{ mt: 2, mb: 3 }}>
                    <FormControl component="fieldset">
                        <Typography variant="subtitle2" gutterBottom>Your Response:</Typography>
                        <RadioGroup value={status} onChange={(e) => setStatus(e.target.value)}>
                            {RESPONSE_OPTIONS.map(option => (
                                <FormControlLabel
                                    key={option.value}
                                    value={option.value}
                                    control={<Radio />}
                                    label={option.label}
                                />
                            ))}
                        </RadioGroup>
                    </FormControl>
                </Box>

                {!declined && characters.length > 0 && (
                    <FormControl fullWidth sx={{ mt: 2 }}>
                        <InputLabel id="character-select-label">Character</InputLabel>
                        <Select
                            labelId="character-select-label"
                            value={characterId}
                            onChange={(e) => setCharacterId(e.target.value)}
                            label="Character"
                        >
                            {characters.map((char) => (
                                <MenuItem key={char.id} value={char.id}>{char.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}

                {status === 'late' && (
                    <TextField
                        label="Arrival Time"
                        type="time"
                        fullWidth
                        value={lateArrivalTime}
                        onChange={(e) => setLateArrivalTime(e.target.value)}
                        sx={{ mt: 2 }}
                        helperText="When will you arrive?"
                        slotProps={{ inputLabel: { shrink: true } }}
                    />
                )}

                {status === 'early' && (
                    <TextField
                        label="Departure Time"
                        type="time"
                        fullWidth
                        value={earlyDepartureTime}
                        onChange={(e) => setEarlyDepartureTime(e.target.value)}
                        sx={{ mt: 2 }}
                        helperText="When do you need to leave?"
                        slotProps={{ inputLabel: { shrink: true } }}
                    />
                )}

                {!declined && (
                    <TextField
                        label="Notes (Optional)"
                        fullWidth
                        multiline
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        sx={{ mt: 2 }}
                        placeholder="Any additional comments..."
                    />
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSubmit} color="primary" variant="contained">Update</Button>
            </DialogActions>
        </Dialog>
    );
};

export default AttendanceDialog;
