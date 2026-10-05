import React from 'react';
import { Box, Button, Card, CardContent, Chip, Divider, Grid, Typography } from '@mui/material';
import { format, formatDistance } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { describeUserStatus } from './attendanceResponse';
import { DAYS_OF_WEEK } from '../DMSettings/sessionManagement/sessionConfig';

// [count field, names field, icon, label shown with names, noun shown for a bare count]
const ATTENDANCE_LINES = [
    { count: 'confirmed_count', names: 'confirmed_names', icon: '✅', label: 'Attending', noun: 'confirmed' },
    { count: 'maybe_count', names: 'maybe_names', icon: '❓', label: 'Maybe', noun: 'maybe' },
    { count: 'declined_count', names: 'declined_names', icon: '❌', label: 'Not Attending', noun: 'declined' }
];

// Counts come back from PostgreSQL COUNT() as strings
const countOf = (session, field) => Number(session[field]) || 0;

const statusChipColor = (status) => {
    if (status === 'confirmed') return 'success';
    if (status === 'cancelled') return 'error';
    if (status === 'completed') return 'default';
    return 'primary';
};

const AttendanceSummary = ({ session }) => {
    if (session.status === 'cancelled') {
        return (
            <Box sx={{ mt: 1 }}>
                <Typography variant="body2" sx={{ color: 'error.main' }}>
                    This session has been cancelled
                </Typography>
                {session.cancel_reason && (
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                        Reason: {session.cancel_reason}
                    </Typography>
                )}
            </Box>
        );
    }

    // The plain /sessions fallback carries no attendance information
    if (session.confirmed_count === undefined) {
        return (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Attendance details are unavailable right now
            </Typography>
        );
    }

    const lines = ATTENDANCE_LINES
        .map(line => ({ ...line, total: countOf(session, line.count), names: session[line.names] }))
        .filter(line => line.names || line.total > 0);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {lines.map(line => (
                <Typography key={line.label} variant="body2">
                    {line.names
                        ? <>{line.icon} <strong>{line.label} ({line.total}):</strong> {line.names}</>
                        : `${line.icon} ${line.total} ${line.noun}`}
                </Typography>
            ))}
            {lines.length === 0 && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    No responses yet
                </Typography>
            )}
        </Box>
    );
};

/**
 * One session on the Sessions page. Times are shown in the campaign timezone;
 * the relative "in 3 days" text uses the real instant.
 */
const SessionCard = ({ session, timezone, onUpdateAttendance }) => {
    const start = new Date(session.start_time);
    const zone = (date) => (timezone ? toZonedTime(date, timezone) : date);
    const startDate = zone(start);
    const endDate = session.end_time ? zone(new Date(session.end_time)) : null;
    const userStatus = describeUserStatus(session);

    return (
        <Card sx={{ mb: 3, border: 1, borderColor: 'divider' }}>
            <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Typography variant="h5" component="div">
                        {session.title || 'Game Session'}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {session.is_recurring && (
                            <Chip label="Recurring Template" color="secondary" variant="outlined" size="small" />
                        )}
                        {session.created_from_recurring && (
                            <Chip label="Recurring Session" color="info" variant="outlined" size="small" />
                        )}
                        {session.status && (
                            <Chip
                                label={session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                                color={statusChipColor(session.status)}
                                variant="outlined"
                                size="small"
                            />
                        )}
                    </Box>
                </Box>

                <Box sx={{ mt: 2, mb: 2 }}>
                    <Typography variant="subtitle1" gutterBottom>
                        <strong>{format(startDate, 'EEEE, MMMM d, yyyy')}</strong>
                    </Typography>
                    <Typography variant="body1">
                        {format(startDate, 'h:mm a')}{endDate && ` - ${format(endDate, 'h:mm a')}`}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {formatDistance(start, new Date(), { addSuffix: true })}
                    </Typography>
                </Box>

                {session.description && (
                    <Box sx={{ mt: 2, mb: 2 }}>
                        <Typography variant="body1">{session.description}</Typography>
                    </Box>
                )}

                {session.recurring_pattern && session.is_recurring && (
                    <Box sx={{ mt: 2, mb: 2 }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            <strong>Recurrence:</strong> {session.recurring_pattern}
                            {session.recurring_day_of_week !== null && ` on ${DAYS_OF_WEEK[session.recurring_day_of_week]}`}
                            {session.recurring_end_count && ` (${session.recurring_end_count} sessions)`}
                        </Typography>
                    </Box>
                )}

                <Divider sx={{ my: 2 }} />

                <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 8 }}>
                        <AttendanceSummary session={session} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Box
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%'
                            }}
                        >
                            {session.status !== 'cancelled' && (
                                <Typography variant="body2" sx={{ color: userStatus.color, mb: 1 }}>
                                    Your Status: <strong>{userStatus.text}</strong>
                                </Typography>
                            )}
                            {session.status !== 'recurring_template' && session.status !== 'cancelled' && (
                                <Button variant="contained" color="primary" onClick={() => onUpdateAttendance(session)}>
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

export default SessionCard;
