import React, {useEffect, useRef, useState} from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  FormControlLabel,
  Grid,
  List,
  ListItem,
  ListItemText,
  Paper,
  Tab,
  Tabs,
  Tooltip,
  Typography
} from '@mui/material';
import {styled} from '@mui/material/styles';
import {useSnackbar} from 'notistack';
import api from '../../utils/api';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import HistoryIcon from '@mui/icons-material/History';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {grey} from '@mui/material/colors';
import {formatInCampaignTimezone} from '../../utils/timezoneUtils';
import {useCampaignTimezone} from '../../hooks/useCampaignTimezone';
import {unwrapList} from '../../utils/apiResponse';
import {dealTasks} from '../../utils/taskDealer';
import type {TaskAssignment, TaskDefinition, TaskMap, TaskPhase} from '../../types/sessionTasks';

interface Character {
    id: number;
    name: string;
}

// Where the "Was at last session" pre-fill came from
interface LastSessionInfo {
    source: 'task_history' | 'rsvp';
    session_title: string | null;
    recorded_at: string;
    character_ids: number[];
    // Last session's deal (null when the source is RSVPs)
    assignments?: TaskAssignment | null;
}

interface TaskHistoryRecord {
    id: number;
    session_title: string | null;
    assignments: TaskAssignment;
    character_count: number;
    late_count: number;
    created_by_name: string | null;
    created_at: string;
}

interface AttendanceRecord {
    character_id: number | null;
    response_type: string;
}

interface NextSessionResponse {
    session?: { id: number; title: string } | null;
    attendance?: AttendanceRecord[] | null;
}

interface AlertState {
    show: boolean;
    severity: 'info' | 'warning' | 'error' | 'success';
    message: string;
}

type FlagMap = Record<number, boolean>;

// One table drives the result cards, the history columns and the Discord embeds
const PHASES: Array<{key: TaskPhase; title: string; color: string}> = [
    {key: 'pre', title: 'Pre-Session', color: '#673AB7'},
    {key: 'during', title: 'During Session', color: '#FFC107'},
    {key: 'post', title: 'Post-Session', color: '#F44336'},
];

// Discord caps an embed field value at 1024 characters
const DISCORD_FIELD_LIMIT = 1024;

const CompactListItem = styled(ListItem)(({theme}) => ({
    padding: theme.spacing(0, 1),
}));

const CompactListItemText = styled(ListItemText)({
    margin: 0,
    '& .MuiListItemText-primary': {
        fontSize: '0.9rem',
    },
});

const StyledCard = styled(Card)(({theme}) => ({
    marginBottom: theme.spacing(3),
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[3],
    transition: 'transform 0.2s, box-shadow 0.2s',
    overflow: 'hidden',
    '&:hover': {
        boxShadow: theme.shadows[6],
        transform: 'translateY(-2px)',
    },
}));

const StyledCardHeader = styled(Box, {
    shouldForwardProp: (prop) => prop !== 'color',
})<{ color: string }>(({ theme, color }) => ({
    padding: theme.spacing(2),
    backgroundColor: color,
    color: theme.palette.getContrastText?.(color) || '#fff',
    display: 'flex',
    alignItems: 'center',
    '& svg': {
        marginRight: theme.spacing(1),
    },
}));

const CharacterSelector = styled(Box)(({theme}) => ({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    margin: theme.spacing(2, 0),
}));

const CharacterChip = styled(Box, {
    shouldForwardProp: (prop) => prop !== 'selected' && prop !== 'late',
})<{ selected?: boolean; late?: boolean }>(({ theme, selected, late }) => ({
    padding: theme.spacing(1, 2),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.text.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    border: '1px solid',
    borderColor: selected
        ? (late ? theme.palette.warning.main : theme.palette.primary.main)
        : theme.palette.divider,
    boxShadow: selected ? `0 0 0 1px ${late ? theme.palette.warning.main : theme.palette.primary.main}` : 'none',
    transition: 'all 0.2s',
    '&:hover': {
        backgroundColor: theme.palette.action.hover,
        transform: 'translateY(-1px)',
        boxShadow: selected
            ? `0 2px 4px 0 ${late ? theme.palette.warning.main + '40' : theme.palette.primary.main + '40'}`
            : theme.shadows[1],
    },
}));

// A small labelled checkbox inside a character row. The row itself toggles
// selection on click, so the checkbox must not bubble.
const CharacterFlagToggle: React.FC<{
    title: string;
    label: string;
    checked: boolean;
    onToggle: () => void;
}> = ({title, label, checked, onToggle}) => (
    <Tooltip title={title}>
        <FormControlLabel
            control={
                <Checkbox
                    size="small"
                    checked={checked}
                    onChange={(e) => {
                        e.stopPropagation();
                        onToggle();
                    }}
                    onClick={(e) => e.stopPropagation()}
                />
            }
            label={<Typography variant="caption">{label}</Typography>}
            sx={{m: 0}}
        />
    </Tooltip>
);

const Tasks: React.FC = () => {
    const {enqueueSnackbar} = useSnackbar();
    const [activeCharacters, setActiveCharacters] = useState<Character[]>([]);
    const [selectedCharacters, setSelectedCharacters] = useState<FlagMap>({});
    const [lateArrivals, setLateArrivals] = useState<FlagMap>({});
    const [earlyLeavers, setEarlyLeavers] = useState<FlagMap>({});
    const [attendedLastSession, setAttendedLastSession] = useState<FlagMap>({});
    const [lastSessionInfo, setLastSessionInfo] = useState<LastSessionInfo | null>(null);
    const [assignedTasks, setAssignedTasks] = useState<TaskAssignment | null>(null);
    const [alert, setAlert] = useState<AlertState>({show: false, severity: 'info', message: ''});
    const [discordSendFailed, setDiscordSendFailed] = useState<boolean>(false);
    // The ref blocks a second click in the same tick; the state disables the buttons
    const assigningRef = useRef<boolean>(false);
    const [assigning, setAssigning] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<number>(0);
    const [upcomingSession, setUpcomingSession] = useState<{id: number; title: string} | null>(null);
    const [history, setHistory] = useState<TaskHistoryRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState<boolean>(false);
    const [taskDefinitions, setTaskDefinitions] = useState<TaskDefinition[]>([]);
    const [taskDefinitionsStatus, setTaskDefinitionsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const {timezone} = useCampaignTimezone();

    const showSnackbar = (message: string, variant: 'default' | 'success' | 'error' | 'info' = 'default') => {
        enqueueSnackbar(message, {variant});
    };

    const showAlert = (severity: AlertState['severity'], message: string) => {
        setAlert({show: true, severity, message});
    };

    useEffect(() => {
        loadInitialState();
        loadTaskDefinitions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (activeTab === 1) {
            fetchHistory();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const loadTaskDefinitions = async () => {
        try {
            const response = await api.get('/session-tasks');
            setTaskDefinitions(unwrapList<TaskDefinition>(response));
            setTaskDefinitionsStatus('ready');
        } catch {
            setTaskDefinitionsStatus('error');
            showSnackbar('Failed to load the task list. Check DM Settings > Task Management.', 'error');
        }
    };

    const loadInitialState = async () => {
        try {
            // Fetch all active characters
            const charResponse = await api.get('/user/active-characters');
            const characters: Character[] = charResponse.data;
            setActiveCharacters(characters);

            // Initialize everyone as unchecked
            const allFalse = (): FlagMap => Object.fromEntries(characters.map(char => [char.id, false]));
            const initialSelectedState = allFalse();
            const initialLateState = allFalse();
            const initialEarlyState = allFalse();
            const initialAttendedState = allFalse();

            // Try to pre-populate from the next upcoming session's attendance
            try {
                const sessionResponse = await api.get('/sessions/next-with-attendance');
                const sessionData: NextSessionResponse | null = sessionResponse.data;

                if (sessionData?.session) {
                    setUpcomingSession({
                        id: sessionData.session.id,
                        title: sessionData.session.title
                    });
                }

                if (sessionData?.attendance) {
                    // Build a map: character_id -> response_type
                    const responseByCharacter: Record<number, string> = {};
                    sessionData.attendance.forEach((record) => {
                        if (record.character_id && ['yes', 'late', 'early', 'late_and_early'].includes(record.response_type)) {
                            responseByCharacter[record.character_id] = record.response_type;
                        }
                    });

                    // Pre-check characters that have an attending response
                    let preSelected = 0;
                    characters.forEach(char => {
                        const response = responseByCharacter[char.id];
                        if (response) {
                            preSelected++;
                            initialSelectedState[char.id] = true;
                            if (response === 'late' || response === 'late_and_early') {
                                initialLateState[char.id] = true;
                            }
                            if (response === 'early' || response === 'late_and_early') {
                                initialEarlyState[char.id] = true;
                            }
                        }
                    });

                    if (preSelected > 0) {
                        showSnackbar(`Pre-selected ${preSelected} characters from next session's RSVPs`);
                    }
                }
            } catch {
                // Non-fatal - just means no session data to pre-populate from
            }

            // Pre-mark who was at the previous session (from the last task
            // assignment, or last session's RSVPs) for tasks that require it.
            try {
                const lastResponse = await api.get('/sessions/last-session-attendees');
                const lastData: LastSessionInfo | null = lastResponse.data?.data ?? lastResponse.data ?? null;
                if (lastData && Array.isArray(lastData.character_ids)) {
                    setLastSessionInfo(lastData);
                    lastData.character_ids.forEach((id) => {
                        if (id in initialAttendedState) {
                            initialAttendedState[id] = true;
                        }
                    });
                }
            } catch {
                // Non-fatal - the DM can mark attendance by hand
            }

            setSelectedCharacters(initialSelectedState);
            setLateArrivals(initialLateState);
            setEarlyLeavers(initialEarlyState);
            setAttendedLastSession(initialAttendedState);
        } catch {
            showSnackbar('Error fetching active characters', 'error');
        }
    };

    const toggleIn = (setter: React.Dispatch<React.SetStateAction<FlagMap>>) => (id: number) => {
        setter(prev => ({...prev, [id]: !prev[id]}));
    };
    const handleToggle = toggleIn(setSelectedCharacters);
    const handleToggleLateArrival = toggleIn(setLateArrivals);
    const handleToggleAttendedLastSession = toggleIn(setAttendedLastSession);
    const handleToggleEarlyLeaver = toggleIn(setEarlyLeavers);

    // Which per-character toggles matter for this campaign's task list
    const hasPreviousAttendanceTasks = taskDefinitions.some(def => def.requires_previous_attendance);
    const hasEarlyLeaverTasks = taskDefinitions.some(def => def.exclude_early);

    // Description for a dealt task in a phase, if the DM wrote one
    const descriptionFor = (phase: TaskPhase, taskName: string): string | null =>
        taskDefinitions.find(def => def.phase === phase && def.name === taskName)?.description || null;

    // One Discord embed per phase (a flat array of embeds goes to the API)
    const createEmbed = (phase: TaskPhase, title: string, color: string, tasks: TaskMap) => ({
        title: `${title} Tasks:`,
        description: '',
        fields: formatTasksForEmbed(phase, tasks),
        color: parseInt(color.slice(1), 16),
        author: {
            name: 'Task Assignments'
        }
    });

    const formatTasksForEmbed = (phase: TaskPhase, tasks: TaskMap) => {
        return Object.entries(tasks)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([character, characterTasks]) => {
                const plain = characterTasks.map(task => `• ${task}`).join('\n');
                const described = characterTasks.map(task => {
                    const description = descriptionFor(phase, task);
                    return description ? `• ${task}\n  _${description}_` : `• ${task}`;
                }).join('\n');
                return {
                    name: character,
                    // Drop the descriptions rather than have Discord reject the send
                    value: described.length <= DISCORD_FIELD_LIMIT ? described : plain.slice(0, DISCORD_FIELD_LIMIT),
                    inline: false
                };
            });
    };

    const saveAssignmentToHistory = async (
        assignments: TaskAssignment,
        characterCount: number,
        lateCount: number
    ) => {
        try {
            await api.post('/sessions/task-history', {
                session_id: upcomingSession?.id ?? null,
                session_title: upcomingSession?.title ?? null,
                assignments,
                character_count: characterCount,
                late_count: lateCount
            });
        } catch {
            showSnackbar('Tasks assigned, but failed to save to history.', 'error');
        }
    };

    const fetchHistory = async () => {
        try {
            setHistoryLoading(true);
            const response = await api.get('/sessions/task-history');
            setHistory(unwrapList<TaskHistoryRecord>(response));
        } catch {
            showSnackbar('Failed to load assignment history.', 'error');
        } finally {
            setHistoryLoading(false);
        }
    };

    // Post the three phase embeds to the campaign's Discord channel. Returns
    // whether it went through; the retry button shows when it did not.
    const sendTasksToDiscord = async (assignment: TaskAssignment, successMessage: string, failureMessage: string) => {
        try {
            const embeds = PHASES.map(({key, title, color}) => createEmbed(key, title, color, assignment[key]));
            await api.post('/discord/send-message', {embeds});
            showSnackbar(successMessage, 'success');
            setDiscordSendFailed(false);
        } catch {
            showSnackbar(failureMessage, 'error');
            setDiscordSendFailed(true);
        }
    };

    const setBusy = (busy: boolean) => {
        assigningRef.current = busy;
        setAssigning(busy);
    };

    const assignTasks = async () => {
        if (assigningRef.current) return;
        setDiscordSendFailed(false);
        setAlert(prev => ({...prev, show: false}));

        const selectedChars = activeCharacters.filter(char => selectedCharacters[char.id]);

        if (selectedChars.length === 0) {
            showAlert('warning', 'Please select at least one character to assign tasks');
            return;
        }
        if (taskDefinitionsStatus === 'loading') {
            showAlert('info', 'The task list is still loading. Try again in a moment.');
            return;
        }
        if (taskDefinitionsStatus === 'error') {
            showAlert('error', 'The task list could not be loaded. Reload the page and try again.');
            return;
        }
        if (taskDefinitions.length === 0) {
            showAlert('warning', 'No tasks are defined for this campaign. Add some under DM Settings > Task Management.');
            return;
        }

        setBusy(true);
        try {
            // Every rule of the deal comes from the options on each task.
            const {assignments, notes} = dealTasks({
                definitions: taskDefinitions,
                characters: selectedChars,
                lateArrivals,
                earlyLeavers,
                attendedLastSession,
                lastAssignments: lastSessionInfo?.assignments,
            });

            setAssignedTasks(assignments);

            if (notes.length > 0) {
                showAlert('info', `Not dealt: ${notes.join('; ')}.`);
            }

            // Persist the assignment to history (independent of the Discord send,
            // so a Discord failure doesn't lose the record).
            const lateCount = selectedChars.filter(char => lateArrivals[char.id]).length;
            await saveAssignmentToHistory(assignments, selectedChars.length, lateCount);

            await sendTasksToDiscord(
                assignments,
                'Tasks assigned and sent to Discord successfully!',
                'Tasks assigned, but failed to send to Discord. You can try again.'
            );
        } catch {
            showAlert('error', 'Error assigning tasks. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const retrySendToDiscord = async () => {
        if (!assignedTasks || assigningRef.current) return;
        setBusy(true);
        try {
            await sendTasksToDiscord(
                assignedTasks,
                'Tasks sent to Discord successfully!',
                'Failed to send to Discord. You can try again.'
            );
        } finally {
            setBusy(false);
        }
    };

    // phase = null for history rows: today's descriptions may not match what was dealt then
    const renderTaskList = (tasks: TaskMap, phase: TaskPhase | null = null) => (
        <List disablePadding>
            {Object.entries(tasks)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([character, characterTasks]) => (
                <CompactListItem key={character}>
                    <CompactListItemText
                        primary={
                            <Box>
                                <Typography variant="subtitle1" component="div">{character}</Typography>
                                <List disablePadding>
                                    {characterTasks.map((task, index) => (
                                        <CompactListItem key={index}>
                                            <CompactListItemText
                                                primary={`• ${task}`}
                                                secondary={phase ? descriptionFor(phase, task) : null}
                                            />
                                        </CompactListItem>
                                    ))}
                                </List>
                            </Box>
                        }
                    />
                </CompactListItem>
            ))}
        </List>
    );

    const handleAlertClose = () => {
        setAlert(prev => ({...prev, show: false}));
    };

    // Selected characters, optionally narrowed to those with a flag set
    const countSelected = (flags?: FlagMap) =>
        activeCharacters.filter(char => selectedCharacters[char.id] && (!flags || flags[char.id])).length;

    return (
        <Container maxWidth="lg" component="main">
            <Box sx={{borderBottom: 1, borderColor: 'divider', mb: 3}}>
                <Tabs value={activeTab} onChange={(_e, value) => setActiveTab(value)}>
                    <Tab label="Assign" />
                    <Tab label="History" />
                </Tabs>
            </Box>
            {activeTab === 0 && (
              <>
            <Paper sx={{p: 3, mb: 3, borderRadius: 2}} elevation={3}>

                {alert.show && (
                    <Alert
                        severity={alert.severity}
                        sx={{mb: 2}}
                        onClose={handleAlertClose}
                    >
                        {alert.message}
                    </Alert>
                )}

                <Typography variant="body1" sx={{ mb: 2 }}>
                    Characters who have RSVP'd "yes" to the next session are pre-selected automatically, and those who
                    responded "late" or "early" are pre-marked as arriving late or leaving early. Adjust selections as
                    needed, then click Assign Tasks. Each task's own options (DM Settings &gt; Task Management) decide
                    who can draw it.
                    {hasPreviousAttendanceTasks && (
                        <>
                            {' '}Some tasks (like Recap) only go to characters who were at the last session;
                            {lastSessionInfo
                                ? ` that is pre-filled from ${lastSessionInfo.source === 'task_history'
                                    ? 'the last task assignment'
                                    : "the last session's RSVPs"}${lastSessionInfo.session_title
                                    ? ` (${lastSessionInfo.session_title})`
                                    : ''}. Adjust if needed.`
                                : ' mark them with "Was at last session".'}
                        </>
                    )}
                </Typography>

                <Grid container spacing={3} size={12}>
                <Grid size={{xs: 12, md: 6}}>
                        <CharacterSelector>
                            <Typography variant="subtitle1" gutterBottom sx={{display: 'flex', alignItems: 'center'}}>
                                <PersonIcon sx={{mr: 1}} color="primary"/>
                                Characters ({countSelected()} selected, {countSelected(lateArrivals)} arriving late
                                {hasEarlyLeaverTasks ? `, ${countSelected(earlyLeavers)} leaving early` : ''})
                            </Typography>

                            {activeCharacters.map((char) => (
                                <CharacterChip
                                    key={char.id}
                                    selected={selectedCharacters[char.id]}
                                    late={lateArrivals[char.id] && selectedCharacters[char.id]}
                                    onClick={() => handleToggle(char.id)}
                                >
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center"
                                        }}>
                                        <Checkbox
                                            checked={selectedCharacters[char.id] || false}
                                            onChange={(e) => {
                                                e.stopPropagation();  // Prevent the click from bubbling to the parent
                                                handleToggle(char.id);
                                            }}
                                            onClick={(e) => e.stopPropagation()}  // Prevent the click from triggering the parent onClick
                                            sx={{p: 0.5, mr: 1}}
                                        />
                                        {char.name}
                                        {selectedCharacters[char.id] && lateArrivals[char.id] && (
                                            <Chip
                                                size="small"
                                                icon={<AccessTimeIcon/>}
                                                label="Late"
                                                sx={{ml: 1, borderColor: theme => theme.palette.warning.main}}
                                                variant="outlined"
                                                color="warning"
                                            />
                                        )}
                                        {hasEarlyLeaverTasks && selectedCharacters[char.id] && earlyLeavers[char.id] && (
                                            <Chip
                                                size="small"
                                                icon={<DirectionsRunIcon/>}
                                                label="Early"
                                                sx={{ml: 1}}
                                                variant="outlined"
                                                color="warning"
                                            />
                                        )}
                                        {hasPreviousAttendanceTasks && selectedCharacters[char.id] && !attendedLastSession[char.id] && (
                                            <Chip
                                                size="small"
                                                icon={<HistoryIcon/>}
                                                label="Missed last session"
                                                sx={{ml: 1}}
                                                variant="outlined"
                                                color="info"
                                            />
                                        )}
                                    </Box>
                                    {selectedCharacters[char.id] && (
                                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                            {hasPreviousAttendanceTasks && (
                                                <CharacterFlagToggle
                                                    title="Was at the last session (needed for tasks like Recap)"
                                                    label="Was at last session"
                                                    checked={attendedLastSession[char.id] || false}
                                                    onToggle={() => handleToggleAttendedLastSession(char.id)}
                                                />
                                            )}
                                            <CharacterFlagToggle
                                                title="Mark as arriving late"
                                                label="Late"
                                                checked={lateArrivals[char.id] || false}
                                                onToggle={() => handleToggleLateArrival(char.id)}
                                            />
                                            {hasEarlyLeaverTasks && (
                                                <CharacterFlagToggle
                                                    title="Mark as leaving early"
                                                    label="Early"
                                                    checked={earlyLeavers[char.id] || false}
                                                    onToggle={() => handleToggleEarlyLeaver(char.id)}
                                                />
                                            )}
                                        </Box>
                                    )}
                                </CharacterChip>
                            ))}
                        </CharacterSelector>
                    </Grid>

                    <Grid size={{xs: 12, md: 6}}>
                        <Box
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                height: '100%',
                                justifyContent: 'center',
                                alignItems: 'center',
                                p: 3,
                                backgroundColor: grey[900],
                                borderRadius: 2
                            }}
                        >
                            <Typography variant="h6" gutterBottom>
                                Ready to assign tasks?
                            </Typography>

                            <Typography
                                variant="body2"
                                sx={{
                                    color: "text.secondary",
                                    textAlign: 'center',
                                    mb: 2
                                }}>
                                Tasks will be randomly assigned to selected characters
                                according to each task's options.
                            </Typography>

                            <Button
                                variant="outlined"
                                color="primary"
                                fullWidth
                                size="large"
                                onClick={assignTasks}
                                disabled={assigning}
                                sx={{mt: 2, py: 1.5, fontWeight: 'bold'}}
                            >
                                Assign Tasks and Send to Discord
                            </Button>

                            {discordSendFailed && (
                                <Button
                                    variant="outlined"
                                    color="secondary"
                                    fullWidth
                                    size="large"
                                    onClick={retrySendToDiscord}
                                    disabled={assigning}
                                    startIcon={<RefreshIcon/>}
                                    sx={{mt: 2}}
                                >
                                    Retry Sending to Discord
                                </Button>
                            )}
                        </Box>
                    </Grid>
                </Grid>
            </Paper>

            {assignedTasks && (
                <Grid container spacing={3}>
                    {PHASES.map(({key, title, color}) => (
                        <Grid key={key} size={{xs: 12, md: 4}}>
                            <StyledCard>
                                <StyledCardHeader color={color}>
                                    <Typography variant="h6">{title} Tasks</Typography>
                                </StyledCardHeader>
                                <CardContent>
                                    {Object.keys(assignedTasks[key]).length > 0 ? (
                                        renderTaskList(assignedTasks[key], key)
                                    ) : (
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                color: "text.secondary",
                                                py: 2,
                                                textAlign: 'center'
                                            }}>
                                            No {title.toLowerCase()} tasks assigned. Nobody selected can take any of them.
                                        </Typography>
                                    )}
                                </CardContent>
                            </StyledCard>
                        </Grid>
                    ))}
                </Grid>
            )}
              </>
            )}
            {activeTab === 1 && (
              <Paper sx={{p: 3, mb: 3, borderRadius: 2}} elevation={3}>
                <Typography variant="h6" gutterBottom sx={{display: 'flex', alignItems: 'center'}}>
                    <FormatListBulletedIcon sx={{mr: 1}} color="primary"/>
                    Past Assignments
                </Typography>

                {historyLoading ? (
                    <Box sx={{display: 'flex', justifyContent: 'center', py: 4}}>
                        <CircularProgress/>
                    </Box>
                ) : history.length === 0 ? (
                    <Typography
                        variant="body2"
                        sx={{
                            color: "text.secondary",
                            py: 2
                        }}>
                        No task assignments have been saved yet. Assign tasks on the Assign tab to start tracking history.
                    </Typography>
                ) : (
                    history.map((record) => (
                        <Accordion key={record.id}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon/>}>
                                <Box sx={{display: 'flex', flexDirection: 'column'}}>
                                    <Typography variant="subtitle1">
                                        {record.session_title || 'No linked session'}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        color: "text.secondary"
                                    }}>
                                        {formatInCampaignTimezone(record.created_at, timezone, 'PPpp')}
                                        {` • ${record.character_count} characters`}
                                        {record.late_count > 0 ? `, ${record.late_count} late` : ''}
                                        {record.created_by_name ? ` • by ${record.created_by_name}` : ''}
                                    </Typography>
                                </Box>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Grid container spacing={2}>
                                    {PHASES.map(({key, title}) => (
                                        <Grid key={key} size={{xs: 12, md: 4}}>
                                            <Typography variant="subtitle2" gutterBottom>{title}</Typography>
                                            {renderTaskList(record.assignments?.[key] || {})}
                                        </Grid>
                                    ))}
                                </Grid>
                            </AccordionDetails>
                        </Accordion>
                    ))
                )}
              </Paper>
            )}
        </Container>
    );
};

export default Tasks;
