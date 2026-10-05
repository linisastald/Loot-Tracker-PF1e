import React from 'react';
import {
    Box,
    Card,
    CardContent,
    CardHeader,
    Checkbox,
    Chip,
    CircularProgress,
    Grid,
    IconButton,
    Typography
} from '@mui/material';
import {
    Announcement as AnnouncementIcon,
    Cancel as CancelIcon,
    CheckCircle as ConfirmIcon,
    Edit as EditIcon,
    NotificationImportant as ReminderIcon,
    Restore as RestoreIcon,
    Visibility as ViewIcon
} from '@mui/icons-material';
import type { SessionListItem } from '../../../../utils/sessionsApi';
import { formatInCampaignTimezone } from '../../../../utils/timezoneUtils';
import { getStatusColor, getStatusLabel } from './sessionConfig';

/** Actions that call the API and show a spinner on their button while running. */
export type BusyActionType = 'announce' | 'confirm' | 'cancel' | 'uncancel';

export interface BusyAction {
    id: number;
    type: BusyActionType;
}

interface SessionCardProps {
    session: SessionListItem;
    timezone?: string;
    selected: boolean;
    busyAction: BusyAction | null;
    onToggleSelected: (sessionId: number) => void;
    onEdit: (session: SessionListItem) => void;
    onViewAttendance: (sessionId: number) => void;
    onRemind: (session: SessionListItem) => void;
    onOpenCancel: (session: SessionListItem) => void;
    onRunAction: (sessionId: number, type: Exclude<BusyActionType, 'cancel'>) => void;
}

const ATTENDANCE_GROUPS = [
    { icon: '✅', label: 'Attending', countLabel: 'confirmed', countKey: 'confirmed_count', namesKey: 'confirmed_names' },
    { icon: '❓', label: 'Maybe', countLabel: 'maybe', countKey: 'maybe_count', namesKey: 'maybe_names' },
    { icon: '❌', label: 'Declined', countLabel: 'declined', countKey: 'declined_count', namesKey: 'declined_names' }
] as const;

const SessionCard: React.FC<SessionCardProps> = ({
    session, timezone, selected, busyAction, onToggleSelected, onEdit, onViewAttendance, onRemind, onOpenCancel, onRunAction
}) => {
    const isUpcoming = new Date(session.start_time) > new Date();
    const confirmedCount = session.confirmed_count || 0;
    const attendanceTotal = confirmedCount + (session.declined_count || 0) + (session.maybe_count || 0);
    const minimumPlayers = session.minimum_players || 3;
    const isBusy = (type: BusyActionType) => busyAction?.id === session.id && busyAction.type === type;

    const hasNames = ATTENDANCE_GROUPS.some(group => !!session[group.namesKey]);

    // Spinner-backed action buttons; shown by the rules the status allows.
    const statusActions = [
        {
            type: 'announce' as const,
            visible: isUpcoming && session.status === 'scheduled',
            title: 'Post Discord Announcement',
            color: 'primary' as const,
            icon: <AnnouncementIcon />,
            onClick: () => onRunAction(session.id, 'announce')
        },
        {
            type: 'confirm' as const,
            visible: isUpcoming && session.status === 'scheduled' && confirmedCount >= minimumPlayers,
            title: 'Confirm Session',
            color: 'success' as const,
            icon: <ConfirmIcon />,
            onClick: () => onRunAction(session.id, 'confirm')
        },
        {
            type: 'cancel' as const,
            visible: isUpcoming && session.status !== 'cancelled',
            title: 'Cancel Session',
            color: 'error' as const,
            icon: <CancelIcon />,
            onClick: () => onOpenCancel(session)
        },
        {
            type: 'uncancel' as const,
            visible: isUpcoming && session.status === 'cancelled',
            title: 'Reinstate Session',
            color: 'success' as const,
            icon: <RestoreIcon />,
            onClick: () => onRunAction(session.id, 'uncancel')
        }
    ];

    return (
        <Card variant="outlined" sx={{ mb: 2 }}>
            <CardHeader
                avatar={
                    <Checkbox
                        checked={selected}
                        onChange={() => onToggleSelected(session.id)}
                        slotProps={{ input: { 'aria-label': `Select session ${session.title || 'Game Session'}` } }}
                    />
                }
                title={session.title || 'Game Session'}
                subheader={timezone && formatInCampaignTimezone(session.start_time, timezone, 'PPpp z')}
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
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            Description: {session.description || 'No description'}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}>
                            Min Players: {minimumPlayers}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            Responses: {attendanceTotal} total
                        </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {session.status !== 'cancelled' && session.status !== 'completed' && (
                                <IconButton
                                    size="small"
                                    onClick={() => onEdit(session)}
                                    title="Edit Session Details"
                                    color="primary"
                                >
                                    <EditIcon />
                                </IconButton>
                            )}

                            <IconButton
                                size="small"
                                onClick={() => onViewAttendance(session.id)}
                                title="View Attendance Details"
                            >
                                <ViewIcon />
                            </IconButton>

                            {isUpcoming && session.status !== 'cancelled' && (
                                <IconButton
                                    size="small"
                                    onClick={() => onRemind(session)}
                                    title="Send Reminder"
                                    color="info"
                                >
                                    <ReminderIcon />
                                </IconButton>
                            )}

                            {statusActions.filter(action => action.visible).map(action => (
                                <IconButton
                                    key={action.type}
                                    size="small"
                                    onClick={action.onClick}
                                    disabled={isBusy(action.type)}
                                    title={action.title}
                                    color={action.color}
                                >
                                    {isBusy(action.type) ? <CircularProgress size={20} /> : action.icon}
                                </IconButton>
                            ))}
                        </Box>
                    </Grid>
                </Grid>

                {/* Attendance Summary */}
                <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {ATTENDANCE_GROUPS.map(group => {
                        const count = session[group.countKey] || 0;
                        const names = session[group.namesKey];
                        if (names) {
                            return (
                                <Typography key={group.label} variant="body2">
                                    {group.icon} <strong>{group.label} ({count}):</strong> {names}
                                </Typography>
                            );
                        }
                        if (count > 0) {
                            return (
                                <Typography key={group.label} variant="body2">
                                    {group.icon} {count} {group.countLabel}
                                </Typography>
                            );
                        }
                        return null;
                    })}
                    {!hasNames && attendanceTotal === 0 && (
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            No responses yet
                        </Typography>
                    )}
                </Box>
            </CardContent>
        </Card>
    );
};

export default SessionCard;
