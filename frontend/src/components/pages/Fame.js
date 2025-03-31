// frontend/src/components/pages/Fame.js
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Container,
    Divider,
    FormControl,
    Grid,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
    Card,
    CardContent,
    CardHeader,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    CircularProgress,
    Chip
} from '@mui/material';
import {
    Add as AddIcon,
    Remove as RemoveIcon,
    ExpandMore as ExpandMoreIcon,
    Star as StarIcon,
    Info as InfoIcon,
    EmojiEvents as EmojiEventsIcon,
    History as HistoryIcon,
    ArrowUpward as ArrowUpwardIcon,
    ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';
import api from '../../utils/api';
import { fetchActiveUser } from '../../utils/utils';
import { isDM } from '../../utils/auth';

const Fame = () => {
    // State variables
    const [famePoints, setFamePoints] = useState(0);
    const [prestige, setPrestige] = useState(0);
    const [characters, setCharacters] = useState([]);
    const [activeCharacterId, setActiveCharacterId] = useState(null);
    const [activeCharacter, setActiveCharacter] = useState(null);
    const [fameSystem, setFameSystem] = useState('fame');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isDMUser, setIsDMUser] = useState(false);
    const [fameHistory, setFameHistory] = useState([]);
    const [fameEvents, setFameEvents] = useState([]);
    const [historyExpanded, setHistoryExpanded] = useState(false);
    const [rulesExpanded, setRulesExpanded] = useState(false);

    // For fame/infamy entry form
    const [characterToModify, setCharacterToModify] = useState('');
    const [pointsToAdd, setPointsToAdd] = useState(0);
    const [reason, setReason] = useState('');
    const [selectedEvent, setSelectedEvent] = useState('');

    // For sphere of influence
    const [sphereOfInfluence, setSphereOfInfluence] = useState(100); // Base 100 miles

    useEffect(() => {
        const initializeComponent = async () => {
            setLoading(true);
            setIsDMUser(isDM());

            try {
                // Fetch fame system type (fame or infamy)
                const fameSystemResponse = await api.get('/settings/fame-system');
                const systemType = fameSystemResponse.data?.value || 'fame';
                setFameSystem(systemType);

                // Fetch fame events
                await fetchFameEvents();

                // Fetch active character
                const activeUser = await fetchActiveUser();
                if (activeUser?.activeCharacterId) {
                    setActiveCharacterId(activeUser.activeCharacterId);
                    setCharacterToModify(activeUser.activeCharacterId);

                    // Fetch fame points for the active character
                    await fetchFamePoints(activeUser.activeCharacterId);

                    // Get character details
                    const characterResponse = await api.get(`/user/characters`);
                    const activeChar = characterResponse.data.find(c => c.id === activeUser.activeCharacterId);
                    if (activeChar) {
                        setActiveCharacter(activeChar);
                    }
                }

                // If DM, fetch all characters
                if (isDM()) {
                    const charactersResponse = await api.get('/user/active-characters');
                    setCharacters(charactersResponse.data);
                }
            } catch (error) {
                console.error('Error initializing Fame component:', error);
                setError('Failed to load fame data. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        initializeComponent();
    }, []);

    const fetchFameEvents = async () => {
        try {
            const response = await api.get('/fame/events');
            if (response.data && response.data.events) {
                setFameEvents(response.data.events);
            }
        } catch (error) {
            console.error('Error fetching fame events:', error);
        }
    };

    const fetchFamePoints = async (characterId) => {
        try {
            const response = await api.get(`/fame/${characterId}`);
            if (response.data) {
                setFamePoints(response.data.points || 0);
                setPrestige(response.data.prestige || 0);
                setSphereOfInfluence(calculateSphereOfInfluence(response.data.points || 0));

                // Get fame history
                if (response.data.history) {
                    setFameHistory(response.data.history);
                } else {
                    await fetchFameHistory(characterId);
                }
            }
        } catch (error) {
            console.error('Error fetching fame points:', error);
            if (error.response && error.response.status !== 404) {
                setError('Failed to fetch fame points.');
            }
        }
    };

    const fetchFameHistory = async (characterId) => {
        try {
            const response = await api.get(`/fame/history/${characterId}`);
            if (response.data && response.data.history) {
                setFameHistory(response.data.history);
            }
        } catch (error) {
            console.error('Error fetching fame history:', error);
        }
    };

    const calculateSphereOfInfluence = (fame) => {
        // Base sphere of influence is 100 miles
        // Increases by 100 miles at fame levels 10, 20, 30, 40, and 55
        let sphere = 100;
        if (fame >= 10) sphere += 100;
        if (fame >= 20) sphere += 100;
        if (fame >= 30) sphere += 100;
        if (fame >= 40) sphere += 100;
        if (fame >= 55) sphere += 100;
        return sphere;
    };

    const handleAddPoints = async () => {
        try {
            setError('');
            setSuccess('');

            if (!characterToModify) {
                setError('Please select a character');
                return;
            }

            if (!pointsToAdd || pointsToAdd === 0) {
                setError('Please enter a non-zero value');
                return;
            }

            // Get event details if an event was selected
            let eventDetails = null;
            if (selectedEvent) {
                eventDetails = fameEvents.find(e => e.id === selectedEvent);
            }

            await api.post('/fame/add-points', {
                characterId: characterToModify,
                points: parseInt(pointsToAdd, 10),
                reason: reason,
                event: eventDetails ? eventDetails.name : null
            });

            setSuccess(`Successfully ${pointsToAdd > 0 ? 'added' : 'removed'} ${Math.abs(pointsToAdd)} ${fameSystem === 'fame' ? 'Fame' : 'Infamy'} points`);

            // Reset form
            setPointsToAdd(0);
            setReason('');
            setSelectedEvent('');

            // Refresh data if needed
            if (characterToModify === activeCharacterId) {
                fetchFamePoints(activeCharacterId);
            }
        } catch (error) {
            console.error('Error adding points:', error);
            if (error.response && error.response.data && error.response.data.message) {
                setError(error.response.data.message);
            } else {
                setError('Failed to update points.');
            }
        }
    };

    const handleEventSelect = (event) => {
        const selectedEventId = event.target.value;
        setSelectedEvent(selectedEventId);

        if (selectedEventId) {
            const eventDetails = fameEvents.find(e => e.id === selectedEventId);
            if (eventDetails) {
                setPointsToAdd(eventDetails.points);
            }
        }
    };

    const getPageTitle = () => {
        return fameSystem === 'fame' ? 'Fame' : 'Infamy';
    };

    const getPrestigeTitle = () => {
        return fameSystem === 'fame' ? 'Prestige' : 'Disrepute';
    };

    const getFameTitle = () => {
        const title = fameSystem === 'fame' ? 'Fame' : 'Infamy';

        if (famePoints <= 0) return title;
        if (famePoints < 10) return 'Disgraceful';
        if (famePoints < 20) return 'Despicable';
        if (famePoints < 30) return 'Notorious';
        if (famePoints < 40) return 'Loathsome';
        return 'Vile';
    };

    const getFameRules = () => {
        if (fameSystem === 'fame') {
            return (
                <Box mt={2}>
                    <Typography variant="h6">Fame Rules</Typography>
                    <Typography variant="body1" paragraph>
                        Fame represents your character's reputation and standing within a particular organization or region.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Fame Points:</strong> These are earned through completing missions, helping NPCs, and advancing the goals of factions you belong to.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Prestige:</strong> For every 10 Fame points, you gain 1 Prestige point. Prestige can be spent on special rewards, favors, and benefits.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Sphere of Influence:</strong> Your reputation extends in a {sphereOfInfluence} mile radius around you. Outside this area, your Fame is considered to be 0.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Benefits:</strong> Higher Fame may grant access to special equipment, services, or information from allied organizations.
                    </Typography>
                </Box>
            );
        } else {
            return (
                <Box mt={2}>
                    <Typography variant="h6">Infamy Rules (Skull & Shackles)</Typography>
                    <Typography variant="body1" paragraph>
                        Infamy represents your reputation as a fearsome pirate in the Shackles and beyond.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Infamy Points:</strong> You earn these by plundering, performing daring deeds, defeating worthy foes, and building your pirate legend.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Disrepute:</strong> For every 10 Infamy points, you gain 1 Disrepute point, which can be spent on special rewards and favors from other pirates.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Sphere of Influence:</strong> Your reputation extends in a {sphereOfInfluence} mile radius around you. Outside this area, your Infamy is considered to be 0.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Benefits:</strong> Higher Infamy may intimidate enemies, grant access to pirate havens, and earn respect from other captains.
                    </Typography>
                </Box>
            );
        }
    };

    const getPositiveEvents = () => {
        return fameEvents.filter(event => event.points > 0);
    };

    const getNegativeEvents = () => {
        return fameEvents.filter(event => event.points < 0);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    if (loading) {
        return (
            <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
                <CircularProgress />
                <Typography variant="body1" sx={{ ml: 2 }}>Loading {fameSystem === 'fame' ? 'Fame' : 'Infamy'} data...</Typography>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg">
            <Paper sx={{ p: 3, mb: 3 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h5">{getPageTitle()} System</Typography>
                    <Chip
                        label={getFameTitle()}
                        color={famePoints < 0 ? "error" : "primary"}
                        icon={<EmojiEventsIcon />}
                    />
                </Box>

                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}

                <Grid container spacing={3} sx={{ mt: 1 }}>
                    <Grid item xs={12} md={6}>
                        <Card elevation={3}>
                            <CardHeader
                                title={activeCharacter ? activeCharacter.name : "Your Character"}
                                subheader={`${fameSystem === 'fame' ? 'Fame' : 'Infamy'} Profile`}
                            />
                            <CardContent>
                                <Box display="flex" alignItems="center" mb={2}>
                                    <StarIcon fontSize="large" color={famePoints < 0 ? "error" : "primary"} />
                                    <Box ml={1}>
                                        <Typography variant="h3">{famePoints}</Typography>
                                        <Typography variant="subtitle1">{fameSystem === 'fame' ? 'Fame' : 'Infamy'} Points</Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <Card elevation={3}>
                            <CardHeader
                                title="Recent History"
                                action={
                                    <Button
                                        startIcon={<HistoryIcon />}
                                        onClick={() => setHistoryExpanded(!historyExpanded)}
                                    >
                                        {historyExpanded ? "Show Less" : "Show More"}
                                    </Button>
                                }
                            />
                            <CardContent>
                                {fameHistory.length === 0 ? (
                                    <Typography variant="body2" color="textSecondary" align="center">
                                        No {fameSystem} history recorded yet
                                    </Typography>
                                ) : (
                                    <List dense={!historyExpanded}>
                                        {fameHistory.slice(0, historyExpanded ? 10 : 3).map((entry) => (
                                            <ListItem key={entry.id}>
                                                <ListItemIcon>
                                                    {entry.points > 0 ?
                                                        <ArrowUpwardIcon color="success" /> :
                                                        <ArrowDownwardIcon color="error" />}
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={
                                                        <span>
                                                            <strong>{entry.points > 0 ? "+" : ""}{entry.points}</strong> - {entry.event || entry.reason || "No reason provided"}
                                                        </span>
                                                    }
                                                    secondary={formatDate(entry.created_at)}
                                                />
                                            </ListItem>
                                        ))}
                                    </List>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>

                <Accordion expanded={rulesExpanded} onChange={() => setRulesExpanded(!rulesExpanded)} sx={{ mt: 3 }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography variant="h6">{fameSystem === 'fame' ? 'Fame' : 'Infamy'} System Rules</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        {getFameRules()}
                    </AccordionDetails>
                </Accordion>
            </Paper>

            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Add/Modify {fameSystem === 'fame' ? 'Fame' : 'Infamy'} Points</Typography>
                <Box mt={2} component="form" noValidate>
                    {isDMUser && (
                        <Box mb={2}>
                            <FormControl fullWidth>
                                <InputLabel id="character-select-label">Character</InputLabel>
                                <Select
                                    labelId="character-select-label"
                                    value={characterToModify}
                                    onChange={(e) => setCharacterToModify(e.target.value)}
                                    label="Character"
                                >
                                    <MenuItem value="">Select a character</MenuItem>
                                    {characters.map((char) => (
                                        <MenuItem key={char.id} value={char.id}>
                                            {char.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Box>
                    )}

                    <Box mb={2}>
                        <FormControl fullWidth>
                            <InputLabel id="event-select-label">Select an Event</InputLabel>
                            <Select
                                labelId="event-select-label"
                                value={selectedEvent}
                                onChange={handleEventSelect}
                                label="Select an Event"
                            >
                                <MenuItem value="">Custom Entry</MenuItem>
                                <MenuItem disabled divider>--- Positive Events ---</MenuItem>
                                {getPositiveEvents().map((event) => (
                                    <MenuItem key={event.id} value={event.id}>
                                        {event.name} (+{event.points})
                                    </MenuItem>
                                ))}
                                <MenuItem disabled divider>--- Negative Events ---</MenuItem>
                                {getNegativeEvents().map((event) => (
                                    <MenuItem key={event.id} value={event.id}>
                                        {event.name} ({event.points})
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    <Box mb={2}>
                        <TextField
                            fullWidth
                            label={`Points to ${pointsToAdd > 0 ? 'add' : 'remove'}`}
                            type="number"
                            value={pointsToAdd}
                            onChange={(e) => setPointsToAdd(e.target.value)}
                            helperText="Use negative values to remove points"
                        />
                    </Box>

                    <Box mb={2}>
                        <TextField
                            fullWidth
                            label="Reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            multiline
                            rows={2}
                            helperText="Provide details about why points are being added or removed"
                        />
                    </Box>

                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleAddPoints}
                        disabled={!characterToModify || pointsToAdd === 0}
                        startIcon={pointsToAdd > 0 ? <AddIcon /> : <RemoveIcon />}
                    >
                        {pointsToAdd > 0 ? 'Add' : 'Remove'} Points
                    </Button>
                </Box>
            </Paper>
        </Container>
    );
};

export default Fame;                </Box>

                                <Box display="flex" alignItems="center" mb={2}>
                                    <EmojiEventsIcon fontSize="large" color="primary" />
                                    <Box ml={1}>
                                        <Typography variant="h4">{prestige}</Typography>
                                        <Typography variant="subtitle1">{getPrestigeTitle()} Points</Typography>
                                        <Typography variant="caption">Earned from {famePoints} {fameSystem === 'fame' ? 'Fame' : 'Infamy'}</Typography>
                                    </Box>
                                </Box>

                                <Box display="flex" alignItems="center">
                                    <InfoIcon fontSize="large" color="primary" />
                                    <Box ml={1}>
                                        <Typography variant="h6">{sphereOfInfluence} miles</Typography>
                                        <Typography variant="subtitle1">Sphere of Influence</Typography>
                                    </Box>