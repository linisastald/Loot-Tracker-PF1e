import React, {useEffect, useState} from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Container,
  FormControlLabel,
  Grid,
  List,
  ListItem,
  ListItemText,
  Paper,
  Snackbar,
  Tooltip,
  Typography
} from '@mui/material';
import {styled} from '@mui/material/styles';
import api from '../../utils/api';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import {grey} from '@mui/material/colors';

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

const StyledCardHeader = styled(Box)(({theme, color}) => ({
    padding: theme.spacing(2),
    backgroundColor: color,
    color: theme.palette.getContrastText(color),
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

const CharacterChip = styled(Box)(({theme, selected, late}) => ({
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

const Tasks = () => {
    const [activeCharacters, setActiveCharacters] = useState([]);
    const [selectedCharacters, setSelectedCharacters] = useState({});
    const [lateArrivals, setLateArrivals] = useState({});
    const [assignedTasks, setAssignedTasks] = useState(null);
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [alert, setAlert] = useState({show: false, severity: 'info', message: ''});
    const [discordSendFailed, setDiscordSendFailed] = useState(false);
    const [lastTaskAssignment, setLastTaskAssignment] = useState(null);

    useEffect(() => {
        fetchActiveCharacters();
    }, []);

    const fetchActiveCharacters = async () => {
        try {
            const response = await api.get('/user/active-characters');
            setActiveCharacters(response.data);
            const initialSelectedState = response.data.reduce((acc, char) => {
                acc[char.id] = false;
                return acc;
            }, {});
            setSelectedCharacters(initialSelectedState);
            const initialLateState = response.data.reduce((acc, char) => {
                acc[char.id] = false;
                return acc;
            }, {});
            setLateArrivals(initialLateState);
        } catch (error) {
            console.error('Error fetching active characters:', error);
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

    const formatTasksForEmbed = (tasks) => {
        return Object.entries(tasks).map(([character, characterTasks]) => ({
            name: character,
            value: characterTasks.map(task => `• ${task}`).join('\n'),
            inline: false
        }));
    };

    const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
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
                'Lore Master',
                'Rule & Battle Master',
                'Loot Master',
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
                let adjustedTasks = [...tasks];

                if (tasks.length === charCount) {
                    adjustedTasks = shuffleArray(adjustedTasks);
                } else if (tasks.length > charCount) {
                    while (adjustedTasks.length < charCount * 2) {
                        adjustedTasks.push('Free Space');
                    }
                    adjustedTasks = shuffleArray(adjustedTasks);
                } else {
                    while (adjustedTasks.length < charCount) {
                        adjustedTasks.push('Free Space');
                    }
                    adjustedTasks = shuffleArray(adjustedTasks);
                }

                const assigned = {};
                chars.forEach(char => {
                    assigned[char.name] = [];
                });

                adjustedTasks.forEach((task, index) => {
                    const charName = chars[index % charCount].name;
                    assigned[charName].push(task);
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

    const renderTaskList = (tasks) => (
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
            <Paper sx={{p: 3, mb: 3, borderRadius: 2}} elevation={3}>
                <Typography variant="h5" gutterBottom
                            sx={{display: 'flex', alignItems: 'center', mb: 2, fontWeight: 'bold'}}>
                    <FormatListBulletedIcon sx={{mr: 1}} color="primary"/>
                    Session Task Assignments
                </Typography>

                {alert.show && (
                    <Alert
                        severity={alert.severity}
                        sx={{mb: 2}}
                        onClose={handleAlertClose}
                    >
                        {alert.message}
                    </Alert>
                )}

                <Typography variant="body1" paragraph>
                    Select which characters will be present for the session. You can mark players who will arrive late
                    to exclude them from pre-session tasks.
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
                                    <Box display="flex" alignItems="center">
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

                            <Typography variant="body2" color="text.secondary" paragraph sx={{textAlign: 'center'}}>
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
                    <Grid item xs={12} md={4}>
                        <StyledCard>
                            <StyledCardHeader color="#673AB7">
                                <Typography variant="h6">Pre-Session Tasks</Typography>
                            </StyledCardHeader>
                            <CardContent>
                                {Object.keys(assignedTasks.pre).length > 0 ? (
                                    renderTaskList(assignedTasks.pre)
                                ) : (
                                    <Typography variant="body2" color="text.secondary"
                                                sx={{py: 2, textAlign: 'center'}}>
                                        No pre-session tasks assigned. All selected players are marked as arriving late.
                                    </Typography>
                                )}
                            </CardContent>
                        </StyledCard>
                    </Grid>

                    <Grid item xs={12} md={4}>
                        <StyledCard>
                            <StyledCardHeader color="#FFC107">
                                <Typography variant="h6">During Session Tasks</Typography>
                            </StyledCardHeader>
                            <CardContent>
                                {renderTaskList(assignedTasks.during)}
                            </CardContent>
                        </StyledCard>
                    </Grid>

                    <Grid item xs={12} md={4}>
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