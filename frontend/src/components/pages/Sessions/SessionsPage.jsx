import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Paper, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useSnackbar } from 'notistack';
import api from '../../../utils/api';
import { getErrorMessage } from '../../../utils/apiErrors';
import { fetchSessionList } from '../../../utils/sessionsApi';
import { useCampaignTimezone } from '../../../hooks/useCampaignTimezone';
import SessionFilterPanel from '../DMSettings/sessionManagement/SessionFilterPanel';
import { defaultFilters, filterSessions } from '../DMSettings/sessionManagement/sessionConfig';
import AttendanceDialog from './AttendanceDialog';
import SessionCard from './SessionCard';

const EmptyState = ({ title, message }) => (
    <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>{title}</Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mt: 1 }}>{message}</Typography>
    </Paper>
);

const SessionsPage = () => {
    const [sessions, setSessions] = useState([]);
    const [characters, setCharacters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState(defaultFilters);
    const [dialogSession, setDialogSession] = useState(null);
    const { enqueueSnackbar } = useSnackbar();
    const { timezone } = useCampaignTimezone();

    const loadSessions = useCallback(async () => {
        try {
            setLoading(true);
            // All sessions with attendance; degrades to the upcoming-only list if that fails
            setSessions(await fetchSessionList({ fallbackToUpcoming: true }));
            setError(null);
        } catch {
            setError('Failed to load sessions. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadCharacters = useCallback(async () => {
        try {
            const response = await api.get('/user/characters');
            setCharacters((response.data || []).filter(char => char.active));
        } catch {
            // Non-critical: the dialog just offers no character picker
        }
    }, []);

    useEffect(() => {
        loadSessions();
        loadCharacters();
    }, [loadSessions, loadCharacters]);

    const filteredSessions = useMemo(() => filterSessions(sessions, filters), [sessions, filters]);

    const handleSubmitAttendance = async (attendanceData) => {
        try {
            await api.post(`/sessions/${dialogSession.id}/attendance/detailed`, attendanceData);
            enqueueSnackbar('Attendance updated successfully', { variant: 'success' });
            setDialogSession(null);
            loadSessions();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to update attendance'), { variant: 'error' });
        }
    };

    const renderList = () => {
        if (loading) {
            return (
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                    <CircularProgress />
                </Box>
            );
        }
        if (sessions.length === 0) {
            return <EmptyState title="No sessions found" message="No sessions have been scheduled yet." />;
        }
        if (filteredSessions.length === 0) {
            return (
                <EmptyState
                    title="No sessions match your filters"
                    message="Try adjusting your filter settings to see more sessions."
                />
            );
        }
        return (
            <Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                    Showing {filteredSessions.length} of {sessions.length} sessions
                </Typography>
                {filteredSessions.map(session => (
                    <SessionCard
                        key={session.id}
                        session={session}
                        timezone={timezone}
                        onUpdateAttendance={setDialogSession}
                    />
                ))}
            </Box>
        );
    };

    return (
        <Container maxWidth="lg">
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Game Sessions
                </Typography>
                <Button
                    variant="outlined"
                    startIcon={<FilterListIcon />}
                    endIcon={showFilters ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    onClick={() => setShowFilters(!showFilters)}
                >
                    Filters
                </Button>
            </Box>
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
            {renderList()}
            <AttendanceDialog
                open={dialogSession !== null}
                session={dialogSession}
                characters={characters}
                onClose={() => setDialogSession(null)}
                onSubmit={handleSubmitAttendance}
            />
        </Container>
    );
};

export default SessionsPage;
