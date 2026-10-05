import React from 'react';
import { Grid, TextField } from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';

interface SessionBasicsFieldsProps {
    title: string;
    onTitleChange: (title: string) => void;
    startTime: Date | null;
    onStartTimeChange: (start: Date | null) => void;
    endTime: Date | null;
    onEndTimeChange: (end: Date | null) => void;
    description: string;
    onDescriptionChange: (description: string) => void;
}

/** Title, start/end pickers and description shared by the create and edit dialogs. */
const SessionBasicsFields: React.FC<SessionBasicsFieldsProps> = ({
    title, onTitleChange, startTime, onStartTimeChange, endTime, onEndTimeChange, description, onDescriptionChange
}) => {
    const endBeforeStart = !!(startTime && endTime && endTime <= startTime);

    return (
        <>
            <TextField
                autoFocus
                margin="dense"
                label="Session Title"
                fullWidth
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                required
                sx={{ mb: 3 }}
            />

            <Grid container spacing={3} size={12} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <DateTimePicker
                        label="Start Time"
                        value={startTime}
                        onChange={onStartTimeChange}
                        slotProps={{ textField: { fullWidth: true } }}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <DateTimePicker
                        label="End Time"
                        value={endTime}
                        onChange={onEndTimeChange}
                        slotProps={{
                            textField: {
                                fullWidth: true,
                                error: endBeforeStart,
                                helperText: endBeforeStart ? 'End time must be after start time' : undefined
                            }
                        }}
                    />
                </Grid>
            </Grid>

            <TextField
                label="Description (Optional)"
                fullWidth
                multiline
                rows={4}
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
            />
        </>
    );
};

export default SessionBasicsFields;
