import React, {useEffect, useState} from 'react';
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
  Snackbar,
  Tab,
  Tabs,
  Tooltip,
  Typography
} from '@mui/material';
import {styled} from '@mui/material/styles';
import api from '../../utils/api';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import HistoryIcon from '@mui/icons-material/History';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {grey} from '@mui/material/colors';
import {formatInCampaignTimezone} from '../../utils/timezoneUtils';
import {useCampaignTimezone} from '../../hooks/useCampaignTimezone';

interface Character {
    id: number;
    name: string;
    player_name: string;
}

type TaskMap = Record<string, string[]>;

type TaskPhase = 'pre' | 'during' | 'post';

// A DM-defined task (DM Settings -> Task Management)
interface TaskDefinition {
    id: number;
    phase: TaskPhase;
    name: string;
    quantity: number;
    min_characters: number | null;
    is_snack_master: boolean;
    // Only dealt to characters marked "Was at last session" (e.g. Recap)
    requires_previous_attendance: boolean;
    sort_order: number;
}

// One slot in a phase's deal pool
interface PoolTask {
    name: string;
    requiresPreviousAttendance: boolean;
}

// Someone who can be dealt a task: a character, or the DM for post-session
interface Dealee {
    id: number | 'DM';
    name: string;
}

// Where the "Was at last session" pre-fill came from
interface LastSessionInfo {
    source: 'task_history' | 'rsvp';
    session_title: string | null;
    recorded_at: string;
    character_ids: number[];
}

interface TaskAssignment {
    pre: TaskMap;
    during: TaskMap;
    post: TaskMap;
}

interface TaskHistoryRecord {
    id: number;
    session_id: number | null;
    session_title: string | null;
    assignments: TaskAssignment;
    character_count: number;
    late_count: number;
    created_by_name: string | null;
    created_at: string;
}

interface Alert {
    show: boolean;
    severity: 'info' | 'warning' | 'error' | 'success';
    message: string;
}

const COLORS = {
    PRE_SESSION: 8311585,  // Purple
    DURING_SESSION: 16776960,  // Yellow
    POST_SESSION: 16711680  // Red
};

const CompactListItem = styled(ListItem)(({theme}) => ({
    padding: theme.spacing(0, 1),
}));

const CompactListItemText = styled(ListItemText)(({theme}) => ({
    margin: 0,
    '& .MuiListItemText-primary': {
        fontSize: '0.9rem',
    },
}));

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

const Tasks: React.FC = () => {
    const [activeCharacters, setActiveCharacters] = useState<Character[]>([]);
    const [selectedCharacters, setSelectedCharacters] = useState<Record<number, boolean>>({});
    const [lateArrivals, setLateArrivals] = useState<Record<number, boolean>>({});
    const [attendedLastSession, setAttendedLastSession] = useState<Record<number, boolean>>({});
    const [lastSessionInfo, setLastSessionInfo] = useState<LastSessionInfo | null>(null);
    const [assignedTasks, setAssignedTasks] = useState<TaskAssignment | null>(null);
    const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
    const [snackbarMessage, setSnackbarMessage] = useState<string>('');
    const [alert, setAlert] = useState<Alert>({show: false, severity: 'info', message: ''});
    const [discordSendFailed, setDiscordSendFailed] = useState<boolean>(false);
    const [lastTaskAssignment, setLastTaskAssignment] = useState<TaskAssignment | null>(null);
    const [activeTab, setActiveTab] = useState<number>(0);
    const [upcomingSession, setUpcomingSession] = useState<{id: number; title: string} | null>(null);
    const [history, setHistory] = useState<TaskHistoryRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState<boolean>(false);
    const [taskDefinitions, setTaskDefinitions] = useState<TaskDefinition[]>([]);
    const [taskDefinitionsStatus, setTaskDefinitionsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const {timezone} = useCampaignTimezone();

    useEffect(() => {
        loadInitialState();
    }, []);

    useEffect(() => {
        loadTaskDefinitions();
    }, []);

    useEffect(() => {
        if (activeTab === 1) {
            fetchHistory();
        }
    }, [activeTab]);

    const loadTaskDefinitions = async () => {
        try {
            const response: any = await api.get('/session-tasks');
            const definitions = response.data?.data || response.data || [];
            setTaskDefinitions(Array.isArray(definitions) ? definitions : []);
            setTaskDefinitionsStatus('ready');
        } catch (error) {
            console.error('Error loading task definitions:', error);
            setTaskDefinitionsStatus('error');
            showSnackbar('Failed to load the task list. Check DM Settings > Task Management.');
        }
    };

    const loadInitialState = async () => {
        try {
            // Fetch all active characters
            const charResponse = await api.get('/user/active-characters');
            const characters = charResponse.data;
            setActiveCharacters(characters);

            // Initialize everyone as unchecked
            const initialSelectedState = characters.reduce((acc, char) => {
                acc[char.id] = false;
                return acc;
            }, {});
            const initialLateState = characters.reduce((acc, char) => {
                acc[char.id] = false;
                return acc;
            }, {});
            const initialAttendedState = characters.reduce((acc, char) => {
                acc[char.id] = false;
                return acc;
            }, {});

            // Try to pre-populate from the next upcoming session's attendance
            try {
                const sessionResponse = await api.get('/sessions/next-with-attendance');
                const sessionData = sessionResponse.data;

                if (sessionData && sessionData.session) {
                    setUpcomingSession({
                        id: sessionData.session.id,
                        title: sessionData.session.title
                    });
                }

                if (sessionData && sessionData.attendance) {
                    const attendance = sessionData.attendance;
                    // Build a map: character_id -> response_type
                    const responseByCharacter: Record<number, string> = {};
                    attendance.forEach((record: any) => {
                        if (record.character_id && ['yes', 'late', 'early', 'late_and_early'].includes(record.response_type)) {
                            responseByCharacter[record.character_id] = record.response_type;
                        }
                    });

                    // Pre-check characters that have an attending response
                    characters.forEach(char => {
                        const response = responseByCharacter[char.id];
                        if (response) {
                            initialSelectedState[char.id] = true;
                            if (response === 'late' || response === 'late_and_early') {
                                initialLateState[char.id] = true;
                            }
                        }
                    });

                    if (Object.keys(responseByCharacter).length > 0) {
                        showSnackbar(`Pre-selected ${Object.keys(responseByCharacter).length} characters from next session's RSVPs`);
                    }
                }
            } catch (sessionErr) {
                // Non-fatal - just means no session data to pre-populate from
                console.warn('Could not pre-populate from session attendance:', sessionErr);
            }

            // Pre-mark who was at the previous session (from the last task
            // assignment, or last session's RSVPs) for tasks that require it.
            try {
                const lastResponse: any = await api.get('/sessions/last-session-attendees');
                const lastData: LastSessionInfo | null = lastResponse.data?.data ?? lastResponse.data ?? null;
                if (lastData && Array.isArray(lastData.character_ids)) {
                    setLastSessionInfo(lastData);
                    lastData.character_ids.forEach((id) => {
                        if (id in initialAttendedState) {
                            initialAttendedState[id] = true;
                        }
                    });
                }
            } catch (lastErr) {
                // Non-fatal - the DM can mark attendance by hand
                console.warn('Could not load last session attendees:', lastErr);
            }

            setSelectedCharacters(initialSelectedState);
            setLateArrivals(initialLateState);
            setAttendedLastSession(initialAttendedState);
        } catch (error) {
            console.error('Error loading initial task state:', error);
            showSnackbar('Error fetching active characters');
        }
    };

    const handleToggle = (id) => {
        setSelectedCharacters(prev => ({...prev, [id]: !prev[id]}));
    };

    const handleToggleLateArrival = (id) => {
        setLateArrivals(prev => ({...prev, [id]: !prev[id]}));
    };

    const handleToggleAttendedLastSession = (id: number) => {
        setAttendedLastSession(prev => ({...prev, [id]: !prev[id]}));
    };

    // Whether any task in the campaign is restricted to last session's attendees
    const hasPreviousAttendanceTasks = taskDefinitions.some(def => def.requires_previous_attendance);

    // The DM is always treated as having been at the last session.
    const wasAtLastSession = (person: Dealee) => person.id === 'DM' || attendedLastSession[person.id] === true;

    const createEmbed = (title, description, fields, color) => ({
        embeds: [{
            title,
            description,
            fields,
            color,
            author: {
                name: "Task Assignments"
            }
        }]
    });

    const formatTasksForEmbed = (tasks: Record<string, string[]>) => {
        return Object.entries(tasks)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([character, characterTasks]) => ({
                name: character,
                value: characterTasks.map(task => `• ${task}`).join('\n'),
                inline: false
            }));
    };

    const shuffleArray = (array: any[]) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
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
        } catch (error) {
            console.error('Error saving task assignment to history:', error);
            showSnackbar('Tasks assigned, but failed to save to history.');
        }
    };

    const fetchHistory = async () => {
        try {
            setHistoryLoading(true);
            const response: any = await api.get('/sessions/task-history');
            const records = response.data?.data || response.data || [];
            setHistory(records);
        } catch (error) {
            console.error('Error fetching task assignment history:', error);
            showSnackbar('Failed to load assignment history.');
        } finally {
            setHistoryLoading(false);
        }
    };

    const assignTasks = async () => {
        try {
            setDiscordSendFailed(false);

            const selectedChars = activeCharacters.filter(char => selectedCharacters[char.id]);

            if (selectedChars.length === 0) {
                setAlert({
                    show: true,
                    severity: 'warning',
                    message: 'Please select at least one character to assign tasks'
                });
                return;
            }

            if (taskDefinitionsStatus === 'loading') {
                setAlert({
                    show: true,
                    severity: 'info',
                    message: 'The task list is still loading. Try again in a moment.'
                });
                return;
            }
            if (taskDefinitionsStatus === 'error') {
                setAlert({
                    show: true,
                    severity: 'error',
                    message: 'The task list could not be loaded. Reload the page and try again.'
                });
                return;
            }
            if (taskDefinitions.length === 0) {
                setAlert({
                    show: true,
                    severity: 'warning',
                    message: 'No tasks are defined for this campaign. Add some under DM Settings > Task Management.'
                });
                return;
            }

            // Get non-late arrivals for pre-session tasks
            const onTimeChars: Dealee[] = selectedChars.filter(char => !lateArrivals[char.id]);
            const postChars: Dealee[] = [...selectedChars, {id: 'DM', name: 'DM'}];

            // Task pools come from DM Settings -> Task Management. A task with
            // min_characters only joins the pool when enough characters are
            // selected; quantity controls how many copies go in, clamped to the
            // number of people in the phase so nobody draws the same task twice.
            // A task that requires attendance at the last session is clamped to
            // (and later dealt only among) the people who were there, and is
            // skipped entirely when none of them are.
            const skippedTasks: string[] = [];
            const buildPool = (phase: TaskPhase, phaseChars: Dealee[]): PoolTask[] => {
                const pool: PoolTask[] = [];
                const eligibleCount = phaseChars.filter(wasAtLastSession).length;
                taskDefinitions
                    .filter(def => def.phase === phase)
                    .filter(def => !def.min_characters || selectedChars.length >= def.min_characters)
                    .forEach(def => {
                        const requiresPreviousAttendance = def.requires_previous_attendance === true;
                        if (requiresPreviousAttendance && eligibleCount === 0) {
                            skippedTasks.push(def.name);
                            return;
                        }
                        const headcount = requiresPreviousAttendance ? eligibleCount : phaseChars.length;
                        const copies = Math.max(1, Math.min(def.quantity, headcount));
                        for (let i = 0; i < copies; i++) {
                            pool.push({name: def.name, requiresPreviousAttendance});
                        }
                    });
                return pool;
            };

            const preTasks = buildPool('pre', onTimeChars);
            const duringTasks = buildPool('during', selectedChars);
            const postTasks = buildPool('post', postChars);

            const assignTasksToChars = (tasks: PoolTask[], chars: Dealee[]): TaskMap => {
                if (chars.length === 0) return {};

                const charCount = chars.length;

                // Build the task pool with the same Free Space padding as before
                // so each character ends up with the usual number of slots.
                const pool = [...tasks];
                const freeSpace: PoolTask = {name: 'Free Space', requiresPreviousAttendance: false};
                if (tasks.length > charCount) {
                    while (pool.length < charCount * 2) pool.push(freeSpace);
                } else if (tasks.length < charCount) {
                    while (pool.length < charCount) pool.push(freeSpace);
                }

                // Group identical tasks together, then deal with a single
                // continuously-advancing pointer. Because copies of the same
                // task are consecutive, they always land on adjacent (different)
                // people - so the two Loot Masters can never go to one person,
                // and the Free Space padding spreads out too. (Holds as long as
                // no single task has more copies than there are characters.)
                // The group order is shuffled so it isn't always alphabetical.
                const groupByName = (items: PoolTask[]): PoolTask[] => {
                    const groups: Record<string, PoolTask[]> = {};
                    items.forEach(task => {
                        (groups[task.name] = groups[task.name] || []).push(task);
                    });
                    return shuffleArray(Object.keys(groups)).flatMap(key => groups[key]);
                };

                const order: Dealee[] = shuffleArray([...chars]);
                const assigned: TaskMap = {};
                order.forEach(person => {
                    assigned[person.name] = [];
                });

                // Pass 1: tasks that need last session's attendees are dealt
                // only among those people (buildPool guarantees at least one).
                const eligibleOrder = order.filter(wasAtLastSession);
                const restricted = groupByName(pool.filter(task => task.requiresPreviousAttendance));
                const open = groupByName(pool.filter(task => !task.requiresPreviousAttendance));
                if (eligibleOrder.length > 0) {
                    restricted.forEach((task, index) => {
                        assigned[eligibleOrder[index % eligibleOrder.length].name].push(task.name);
                    });
                } else {
                    // Unreachable (buildPool already skipped these) but never
                    // let a restricted task fall through to the open deal.
                    restricted.forEach(task => skippedTasks.push(task.name));
                }

                // Pass 2: everything else. Each copy goes to whoever currently
                // holds the fewest tasks (first in shuffled order on ties), so
                // totals stay even no matter how pass 1 landed. Copies of one
                // task still can't collide: taking a copy lifts that person
                // above the others until everyone has caught up.
                open.forEach(task => {
                    let target = order[0];
                    for (const person of order) {
                        if (assigned[person.name].length < assigned[target.name].length) {
                            target = person;
                        }
                    }
                    assigned[target.name].push(task.name);
                });

                return assigned;
            };


            const newAssignedTasks = {
                pre: assignTasksToChars(preTasks, onTimeChars),
                during: assignTasksToChars(duringTasks, selectedChars),
                post: assignTasksToChars(postTasks, postChars)
            };

            setAssignedTasks(newAssignedTasks);
            setLastTaskAssignment(newAssignedTasks);

            if (skippedTasks.length > 0) {
                setAlert({
                    show: true,
                    severity: 'info',
                    message: `Skipped ${skippedTasks.join(', ')}: nobody selected is marked as having been at the last session.`
                });
            }

            // Persist the assignment to history (independent of the Discord send,
            // so a Discord failure doesn't lose the record).
            const lateCount = selectedChars.length - onTimeChars.length;
            await saveAssignmentToHistory(newAssignedTasks, selectedChars.length, lateCount);

            // Send tasks to Discord
            try {
                const preSessionEmbed = createEmbed(
                    "Pre-Session Tasks:",
                    "",
                    formatTasksForEmbed(newAssignedTasks.pre),
                    COLORS.PRE_SESSION
                );

                const duringSessionEmbed = createEmbed(
                    "During Session Tasks:",
                    "",
                    formatTasksForEmbed(newAssignedTasks.during),
                    COLORS.DURING_SESSION
                );

                const postSessionEmbed = createEmbed(
                    "Post-Session Tasks:",
                    "",
                    formatTasksForEmbed(newAssignedTasks.post),
                    COLORS.POST_SESSION
                );

                const embeds = [preSessionEmbed, duringSessionEmbed, postSessionEmbed];

                await api.post('/discord/send-message', {embeds});
                showSnackbar('Tasks assigned and sent to Discord successfully!');
                setDiscordSendFailed(false);
            } catch (error) {
                console.error('Error sending tasks to Discord:', error);
                showSnackbar('Tasks assigned, but failed to send to Discord. You can try again.');
                setDiscordSendFailed(true);
            }
        } catch (error) {
            console.error('Error assigning tasks:', error);
            setAlert({
                show: true,
                severity: 'error',
                message: 'Error assigning tasks. Please try again.'
            });
        }
    };

    const retrySendToDiscord = async () => {
        if (!lastTaskAssignment) {
            showSnackbar('No tasks to send to Discord');
            return;
        }

        try {
            const preSessionEmbed = createEmbed(
                "Pre-Session Tasks:",
                "",
                formatTasksForEmbed(lastTaskAssignment.pre),
                COLORS.PRE_SESSION
            );

            const duringSessionEmbed = createEmbed(
                "During Session Tasks:",
                "",
                formatTasksForEmbed(lastTaskAssignment.during),
                COLORS.DURING_SESSION
            );

            const postSessionEmbed = createEmbed(
                "Post-Session Tasks:",
                "",
                formatTasksForEmbed(lastTaskAssignment.post),
                COLORS.POST_SESSION
            );

            const embeds = [preSessionEmbed, duringSessionEmbed, postSessionEmbed];

            await api.post('/discord/send-message', {embeds});
            showSnackbar('Tasks sent to Discord successfully!');
            setDiscordSendFailed(false);
        } catch (error) {
            console.error('Error sending tasks to Discord:', error);
            showSnackbar('Failed to send to Discord. You can try again.');
            setDiscordSendFailed(true);
        }
    };

    const renderTaskList = (tasks: Record<string, string[]>) => (
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
                                            <CompactListItemText primary={`• ${task}`}/>
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

    const showSnackbar = (message) => {
        setSnackbarMessage(message);
        setSnackbarOpen(true);
    };

    const handleSnackbarClose = (event, reason) => {
        if (reason === 'clickaway') {
            return;
        }
        setSnackbarOpen(false);
    };

    const handleAlertClose = () => {
        setAlert({...alert, show: false});
    };

    const getCharacterCount = () => {
        return activeCharacters.filter(char => selectedCharacters[char.id]).length;
    };

    const getLateArrivalsCount = () => {
        return activeCharacters.filter(char => selectedCharacters[char.id] && lateArrivals[char.id]).length;
    };

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
                    responded "late" are pre-marked as arriving late. Adjust selections as needed, then click Assign
                    Tasks. Late arrivals will be excluded from pre-session tasks.
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
                                Characters ({getCharacterCount()} selected, {getLateArrivalsCount()} arriving late)
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
                                                <Tooltip title="Was at the last session (needed for tasks like Recap)">
                                                    <FormControlLabel
                                                        control={
                                                            <Checkbox
                                                                size="small"
                                                                checked={attendedLastSession[char.id] || false}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    handleToggleAttendedLastSession(char.id);
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        }
                                                        label={<Typography variant="caption">Was at last session</Typography>}
                                                        sx={{m: 0}}
                                                    />
                                                </Tooltip>
                                            )}
                                            <Tooltip title="Mark as arriving late">
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            size="small"
                                                            checked={lateArrivals[char.id] || false}
                                                            onChange={(e) => {
                                                                e.stopPropagation();
                                                                handleToggleLateArrival(char.id);
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    }
                                                    label={<Typography variant="caption">Late</Typography>}
                                                    sx={{m: 0}}
                                                />
                                            </Tooltip>
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
                                Tasks will be randomly assigned to selected characters.
                                Late arrivals will not receive pre-session tasks.
                            </Typography>

                            <Button
                                variant="outlined"
                                color="primary"
                                fullWidth
                                size="large"
                                onClick={assignTasks}
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
                    <Grid size={{xs: 12, md: 4}}>
                        <StyledCard>
                            <StyledCardHeader color="#673AB7">
                                <Typography variant="h6">Pre-Session Tasks</Typography>
                            </StyledCardHeader>
                            <CardContent>
                                {Object.keys(assignedTasks.pre).length > 0 ? (
                                    renderTaskList(assignedTasks.pre)
                                ) : (
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            color: "text.secondary",
                                            py: 2,
                                            textAlign: 'center'
                                        }}>
                                        No pre-session tasks assigned. All selected players are marked as arriving late.
                                    </Typography>
                                )}
                            </CardContent>
                        </StyledCard>
                    </Grid>

                    <Grid size={{xs: 12, md: 4}}>
                        <StyledCard>
                            <StyledCardHeader color="#FFC107">
                                <Typography variant="h6">During Session Tasks</Typography>
                            </StyledCardHeader>
                            <CardContent>
                                {renderTaskList(assignedTasks.during)}
                            </CardContent>
                        </StyledCard>
                    </Grid>

                    <Grid size={{xs: 12, md: 4}}>
                        <StyledCard>
                            <StyledCardHeader color="#F44336">
                                <Typography variant="h6">Post-Session Tasks</Typography>
                            </StyledCardHeader>
                            <CardContent>
                                {renderTaskList(assignedTasks.post)}
                            </CardContent>
                        </StyledCard>
                    </Grid>
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
                                    <Grid size={{xs: 12, md: 4}}>
                                        <Typography variant="subtitle2" gutterBottom>Pre-Session</Typography>
                                        {renderTaskList(record.assignments?.pre || {})}
                                    </Grid>
                                    <Grid size={{xs: 12, md: 4}}>
                                        <Typography variant="subtitle2" gutterBottom>During Session</Typography>
                                        {renderTaskList(record.assignments?.during || {})}
                                    </Grid>
                                    <Grid size={{xs: 12, md: 4}}>
                                        <Typography variant="subtitle2" gutterBottom>Post-Session</Typography>
                                        {renderTaskList(record.assignments?.post || {})}
                                    </Grid>
                                </Grid>
                            </AccordionDetails>
                        </Accordion>
                    ))
                )}
              </Paper>
            )}
            <Snackbar
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'left',
                }}
                open={snackbarOpen}
                autoHideDuration={6000}
                onClose={handleSnackbarClose}
                message={snackbarMessage}
            />
        </Container>
    );
};

export default Tasks;