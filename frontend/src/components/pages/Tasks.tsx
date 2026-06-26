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
    const {timezone} = useCampaignTimezone();

    useEffect(() => {
        loadInitialState();
    }, []);

    useEffect(() => {
        if (activeTab === 1) {
            fetchHistory();
        }
    }, [activeTab]);

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

            setSelectedCharacters(initialSelectedState);
            setLateArrivals(initialLateState);
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
        return Object.entries(tasks).map(([character, characterTasks]) => ({
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

            // Get non-late arrivals for pre-session tasks
            const onTimeChars = selectedChars.filter(char => !lateArrivals[char.id]);

            const preTasks = [
                'Get Dice Trays',
                'Put Initiative name tags on tracker',
                'Wipe TV',
                'Recap'
            ];
            if (selectedChars.length >= 6) {
                preTasks.push('Bring in extra chairs if needed');
            }

            const duringTasks = [
                'Calendar Master',
                'Loot Master',
                'Loot Master',
                'Lore Master',
                'Rule & Battle Master',
                'Inspiration Master'
            ];

            const postTasks = [
                'Food, Drink, and Trash Clear Check',
                'TV(s) wiped and turned off',
                'Dice Trays and Books put away',
                'Clean Initiative tracker and put away name labels',
                'Chairs pushed in and extra chairs put back',
                'Windows shut and locked and Post Discord Reminders',
                'Ensure no duplicate snacks for next session'
            ];

            const assignTasksToChars = (tasks, chars) => {
                if (chars.length === 0) return {};

                const charCount = chars.length;

                // Build the task pool with the same Free Space padding as before
                // so each character ends up with the usual number of slots.
                const pool = [...tasks];
                if (tasks.length > charCount) {
                    while (pool.length < charCount * 2) pool.push('Free Space');
                } else if (tasks.length < charCount) {
                    while (pool.length < charCount) pool.push('Free Space');
                }

                // Group identical tasks together, then deal with a single
                // continuously-advancing pointer. Because copies of the same
                // task are consecutive, they always land on adjacent (different)
                // people - so the two Loot Masters can never go to one person,
                // and the Free Space padding spreads out too. (Holds as long as
                // no single task has more copies than there are characters.)
                const groups = {};
                pool.forEach(task => {
                    (groups[task] = groups[task] || []).push(task);
                });
                // Shuffle the group order so it isn't always alphabetical, while
                // keeping each group's copies contiguous.
                const grouped = shuffleArray(Object.keys(groups)).flatMap(key => groups[key]);

                const order = shuffleArray(chars.map(char => char.name));

                const assigned = {};
                order.forEach(name => {
                    assigned[name] = [];
                });

                grouped.forEach((task, index) => {
                    assigned[order[index % charCount]].push(task);
                });

                return assigned;
            };

            const postChars = [...selectedChars, {id: 'DM', name: 'DM'}];

            const newAssignedTasks = {
                pre: assignTasksToChars(preTasks, onTimeChars),
                during: assignTasksToChars(duringTasks, selectedChars),
                post: assignTasksToChars(postTasks, postChars)
            };

            setAssignedTasks(newAssignedTasks);
            setLastTaskAssignment(newAssignedTasks);

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
            {Object.entries(tasks).map(([character, characterTasks]) => (
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
                                    </Box>
                                    {selectedCharacters[char.id] && (
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