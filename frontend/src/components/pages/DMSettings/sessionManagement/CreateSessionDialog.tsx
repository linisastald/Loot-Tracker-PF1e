import React, { useEffect, useState } from 'react';
import {
    Box,
    Button,
    Checkbox,
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
    Select,
    TextField,
    Typography
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import api from '../../../../utils/api';
import { getErrorMessage } from '../../../../utils/apiErrors';
import SessionBasicsFields from './SessionBasicsFields';
import SessionTimingFields from './SessionTimingFields';
import { DAYS_OF_WEEK, SessionDefaults, defaultEndTime, validateSessionTimes } from './sessionConfig';

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

interface CreateSessionDialogProps {
    open: boolean;
    /** Saved defaults; the timing fields are seeded from them each time the dialog opens. */
    defaults: SessionDefaults;
    onClose: () => void;
    onCreated: () => void;
}

const CreateSessionDialog: React.FC<CreateSessionDialogProps> = ({ open, defaults, onClose, onCreated }) => {
    const { enqueueSnackbar } = useSnackbar();

    const [title, setTitle] = useState('');
    const [startTime, setStartTime] = useState<Date | null>(new Date());
    const [endTime, setEndTime] = useState<Date | null>(defaultEndTime());
    const [endTimeManuallySet, setEndTimeManuallySet] = useState(false);
    const [description, setDescription] = useState('');
    const [timing, setTiming] = useState<SessionDefaults>(defaults);

    const [isRecurring, setIsRecurring] = useState(false);
    const [recurringPattern, setRecurringPattern] = useState('weekly');
    const [recurringDayOfWeek, setRecurringDayOfWeek] = useState(new Date().getDay());
    const [dayManuallySet, setDayManuallySet] = useState(false);
    const [recurringInterval, setRecurringInterval] = useState(1);
    const [recurringEndDate, setRecurringEndDate] = useState<Date | null>(null);
    const [recurringEndCount, setRecurringEndCount] = useState(12);

    // Start every opening from a clean form seeded with the saved defaults
    useEffect(() => {
        if (!open) return;
        const now = new Date();
        setTitle('');
        setStartTime(now);
        setEndTime(defaultEndTime(now));
        setEndTimeManuallySet(false);
        setDescription('');
        setTiming(defaults);
        setIsRecurring(false);
        setRecurringPattern('weekly');
        setRecurringDayOfWeek(now.getDay());
        setDayManuallySet(false);
        setRecurringInterval(1);
        setRecurringEndDate(null);
        setRecurringEndCount(12);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleStartTimeChange = (newStartTime: Date | null) => {
        setStartTime(newStartTime);
        if (!newStartTime) return;

        // The recurring weekday follows the start date until the user picks one
        if (!dayManuallySet) {
            setRecurringDayOfWeek(newStartTime.getDay());
        }

        // If end time hasn't been manually set, auto-update it to match the new start date
        if (!endTimeManuallySet) {
            const currentEndTime = endTime || new Date();
            const newEndTime = new Date(newStartTime);

            // Preserve the time portion from the current end time
            newEndTime.setHours(currentEndTime.getHours());
            newEndTime.setMinutes(currentEndTime.getMinutes());

            // Overnight sessions: if the preserved clock time lands at or before
            // the new start (e.g. 11 PM start, 4 AM end), the session crosses
            // midnight - roll the end to the next day instead of producing an
            // end time before the start
            if (newEndTime <= newStartTime) {
                newEndTime.setDate(newEndTime.getDate() + 1);
            }

            setEndTime(newEndTime);
        }
    };

    const handleEndTimeChange = (newEndTime: Date | null) => {
        setEndTime(newEndTime);
        setEndTimeManuallySet(true);
    };

    const handleCreate = async () => {
        const validationError = validateSessionTimes(title, startTime, endTime);
        if (validationError) {
            enqueueSnackbar(validationError, { variant: 'error' });
            return;
        }

        const sessionData: SessionCreateData = {
            title,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            description,
            minimum_players: timing.minimumPlayers,
            auto_announce_hours: timing.autoAnnounceHours,
            reminder_hours: timing.reminderHours,
            confirmation_hours: timing.confirmationHours
        };

        if (isRecurring) {
            sessionData.recurring_pattern = recurringPattern;
            sessionData.recurring_day_of_week = recurringDayOfWeek;
            sessionData.recurring_interval = recurringInterval;
            if (recurringEndDate) {
                sessionData.recurring_end_date = recurringEndDate.toISOString();
            }
            sessionData.recurring_end_count = recurringEndCount;
        }

        try {
            const response = await api.post(isRecurring ? '/sessions/recurring' : '/sessions', sessionData);

            if (isRecurring) {
                // The end date can stop generation before the requested count
                const created = (response as { data?: { instances?: unknown[] } })?.data?.instances?.length
                    ?? recurringEndCount;
                enqueueSnackbar(`Recurring session template created with ${created} instances`, { variant: 'success' });
            } else {
                enqueueSnackbar('Session created successfully', { variant: 'success' });
            }
            onCreated();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to create session'), { variant: 'error' });
        }
    };

    const patternSummary: Record<string, string> = {
        weekly: ' weekly',
        biweekly: ' every other week',
        monthly: ' monthly',
        custom: ` every ${recurringInterval} week${recurringInterval > 1 ? 's' : ''}`
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Create New Session</DialogTitle>
            <DialogContent>
                <SessionBasicsFields
                    title={title}
                    onTitleChange={setTitle}
                    startTime={startTime}
                    onStartTimeChange={handleStartTimeChange}
                    endTime={endTime}
                    onEndTimeChange={handleEndTimeChange}
                    description={description}
                    onDescriptionChange={setDescription}
                />

                <Box sx={{ mt: 3 }}>
                    <SessionTimingFields values={timing} onChange={setTiming} variant="create" />
                </Box>

                <Divider sx={{ my: 3 }} />

                {/* Recurring Session Options */}
                <Box sx={{ mb: 3 }}>
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
                            <Grid size={{ xs: 12, md: 6 }}>
                                <FormControl fullWidth>
                                    <InputLabel id="recurring-pattern-label">Frequency</InputLabel>
                                    <Select
                                        labelId="recurring-pattern-label"
                                        value={recurringPattern}
                                        onChange={(e: SelectChangeEvent) => setRecurringPattern(e.target.value)}
                                        label="Frequency"
                                    >
                                        <MenuItem value="weekly">Weekly</MenuItem>
                                        <MenuItem value="biweekly">Every Other Week</MenuItem>
                                        <MenuItem value="monthly">Monthly</MenuItem>
                                        <MenuItem value="custom">Custom Interval</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid size={{ xs: 12, md: 6 }}>
                                <FormControl fullWidth>
                                    <InputLabel id="day-of-week-label">Day of Week</InputLabel>
                                    <Select
                                        labelId="day-of-week-label"
                                        value={recurringDayOfWeek}
                                        onChange={(e: SelectChangeEvent<number>) => {
                                            setRecurringDayOfWeek(Number(e.target.value));
                                            setDayManuallySet(true);
                                        }}
                                        label="Day of Week"
                                    >
                                        {DAYS_OF_WEEK.map((day, index) => (
                                            <MenuItem key={day} value={index}>{day}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>

                        {recurringPattern === 'custom' && (
                            <Grid container spacing={2} size={12} sx={{ mb: 2 }}>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField
                                        label="Interval (weeks)"
                                        type="number"
                                        fullWidth
                                        value={recurringInterval}
                                        onChange={(e) => setRecurringInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                        slotProps={{ htmlInput: { min: 1, max: 52 } }}
                                        helperText="Number of weeks between sessions"
                                    />
                                </Grid>
                            </Grid>
                        )}

                        <Grid container spacing={2} size={12}>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <TextField
                                    label="Number of Sessions"
                                    type="number"
                                    fullWidth
                                    value={recurringEndCount}
                                    onChange={(e) => setRecurringEndCount(Math.max(1, parseInt(e.target.value, 10) || 12))}
                                    slotProps={{ htmlInput: { min: 1, max: 100 } }}
                                    helperText="How many sessions to create"
                                />
                            </Grid>

                            <Grid size={{ xs: 12, md: 6 }}>
                                <DatePicker
                                    label="End Date (Optional)"
                                    value={recurringEndDate}
                                    onChange={setRecurringEndDate}
                                    slotProps={{
                                        textField: {
                                            fullWidth: true,
                                            helperText: 'Stop generating sessions after this date'
                                        }
                                    }}
                                />
                            </Grid>
                        </Grid>

                        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
                            This will create up to {recurringEndCount} sessions occurring
                            {patternSummary[recurringPattern]}
                            {` on ${DAYS_OF_WEEK[recurringDayOfWeek]}s`}
                            {recurringEndDate && `, ending no later than ${format(recurringEndDate, 'MMMM d, yyyy')}`}
                            .
                        </Typography>
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleCreate} color="primary" variant="contained">
                    {isRecurring ? `Create ${recurringEndCount} Recurring Sessions` : 'Create Session'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default CreateSessionDialog;
