// frontend/src/components/pages/Infamy.js
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    CircularProgress,
    Container,
    Divider,
    FormControl,
    Grid,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Slider,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Accordion,
    AccordionDetails,
    AccordionSummary,
} from '@mui/material';
import {
    Add as AddIcon,
    Remove as RemoveIcon,
    ExpandMore as ExpandMoreIcon,
    Star as StarIcon,
    Warning as WarningIcon,
    LocationOn as LocationOnIcon,
    History as HistoryIcon,
    ShoppingCart as ShoppingCartIcon,
    EmojiEvents as EmojiEventsIcon,
    Sailing as SailingIcon,
    Public as PublicIcon,
    Bolt as BoltIcon,
} from '@mui/icons-material';
import api from '../../utils/api';
import { fetchActiveUser } from '../../utils/utils';

// Tab panel component for tab layout
function TabPanel(props) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`tabpanel-${index}`}
            aria-labelledby={`tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

const Infamy = () => {
    // State variables
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [tabValue, setTabValue] = useState(0);

    // Infamy data
    const [infamyStatus, setInfamyStatus] = useState({
        infamy: 0,
        disrepute: 0,
        threshold: 'None',
        favored_ports: []
    });

    // Impositions data
    const [impositions, setImpositions] = useState({
        disgraceful: [],
        despicable: [],
        notorious: [],
        loathsome: [],
        vile: []
    });

    // Port visit data
    const [ports, setPorts] = useState([]);
    const [portHistory, setPortHistory] = useState({});
    const [availablePorts, setAvailablePorts] = useState([
        'Port Peril', 'Bloodcove', 'Quent', 'Rickety Squibs', 'Senghor',
        'Ollo', 'Beachcomber', 'Slipcove', 'Tidewater Rock', 'Drenchport',
        'Bag Island', 'Hell Harbor', 'Firegrass Isle', 'Cypress Point'
    ]);

    // History data
    const [infamyHistory, setInfamyHistory] = useState([]);

    // Form values
    const [selectedPort, setSelectedPort] = useState('');
    const [skillCheck, setSkillCheck] = useState('');
    const [skillUsed, setSkillUsed] = useState('Intimidate');
    const [plunderSpent, setPlunderSpent] = useState(0);
    const [rerollWithPlunder, setRerollWithPlunder] = useState(false);

    // Imposition purchase
    const [selectedImposition, setSelectedImposition] = useState(null);
    const [impositionDialogOpen, setImpositionDialogOpen] = useState(false);

    // Sacrifice crew (Despicable feature)
    const [crewName, setCrewName] = useState('');
    const [sacrificeDialogOpen, setSacrificeDialogOpen] = useState(false);

    // Favored port selection
    const [newFavoredPort, setNewFavoredPort] = useState('');
    const [favoredPortDialogOpen, setFavoredPortDialogOpen] = useState(false);

    // Load data on component mount
    useEffect(() => {
        fetchData();
    }, []);

    // Main data fetch function
    const fetchData = async () => {
        setLoading(true);
        try {
            // Get infamy status
            const statusResponse = await api.get('/infamy/status');
            setInfamyStatus(statusResponse.data);

            // Get available impositions
            const impositionsResponse = await api.get('/infamy/impositions');
            setImpositions(impositionsResponse.data.impositions);

            // Get port visit history
            const portsResponse = await api.get('/infamy/ports');
            setPorts(portsResponse.data.ports);

            // Build port history object for easier access
            const portHistoryObj = {};
            portsResponse.data.ports.forEach(port => {
                portHistoryObj[port.name] = port.thresholds;
            });
            setPortHistory(portHistoryObj);

            // Get infamy history
            const historyResponse = await api.get('/infamy/history');
            setInfamyHistory(historyResponse.data.history);

            setLoading(false);
        } catch (error) {
            console.error('Error fetching infamy data:', error);
            setError('Failed to load infamy data. Please try again.');
            setLoading(false);
        }
    };

    // Handle tab change
    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    // Calculate port status based on infamy threshold
    const getPortStatus = (portName) => {
        if (!portHistory[portName]) {
            return { gained: 0, max: 5, available: true };
        }

        // Determine current threshold number
        let thresholdNum = 0;
        if (infamyStatus.threshold === 'Vile') thresholdNum = 55;
        else if (infamyStatus.threshold === 'Loathsome') thresholdNum = 40;
        else if (infamyStatus.threshold === 'Notorious') thresholdNum = 30;
        else if (infamyStatus.threshold === 'Despicable') thresholdNum = 20;
        else if (infamyStatus.threshold === 'Disgraceful') thresholdNum = 10;

        const gained = portHistory[portName][thresholdNum] || 0;
        return {
            gained,
            max: 5,
            available: gained < 5
        };
    };

    // Get port name with current bonus
    const getPortWithBonus = (portName) => {
        const favoredPort = infamyStatus.favored_ports.find(p => p.port_name === portName);
        if (favoredPort) {
            return `${portName} (+${favoredPort.bonus})`;
        }
        return portName;
    };

    // Handle gaining infamy at a port
    const handleGainInfamy = async () => {
        try {
            setError('');
            setSuccess('');

            if (!selectedPort) {
                setError('Please select a port');
                return;
            }

            if (!skillCheck && plunderSpent === 0) {
                setError('Please enter a skill check result or spend plunder');
                return;
            }

            const response = await api.post('/infamy/gain', {
                port: selectedPort,
                skillCheck: parseInt(skillCheck) || 0,
                skillUsed,
                plunderSpent: parseInt(plunderSpent) || 0,
                reroll: rerollWithPlunder
            });

            setSuccess(`Gained ${response.data.infamyGained} Infamy at ${selectedPort}`);

            // If a new threshold was reached
            if (response.data.newThreshold) {
                setSuccess(`Gained ${response.data.infamyGained} Infamy at ${selectedPort}! You have reached the ${response.data.newThreshold} threshold!`);
            }

            // Reset form
            setSkillCheck('');
            setPlunderSpent(0);
            setRerollWithPlunder(false);

            // Refresh data
            fetchData();
        } catch (error) {
            console.error('Error gaining infamy:', error);
            if (error.response && error.response.data && error.response.data.message) {
                setError(error.response.data.message);
            } else {
                setError('Failed to gain infamy. Please try again.');
            }
        }
    };

    // Handle opening imposition dialog
    const handleOpenImpositionDialog = (imposition) => {
        setSelectedImposition(imposition);
        setImpositionDialogOpen(true);
    };

    // Handle purchasing an imposition
    const handlePurchaseImposition = async () => {
        try {
            const response = await api.post('/infamy/purchase', {
                impositionId: selectedImposition.id
            });

            setImpositionDialogOpen(false);
            setSuccess(`Successfully purchased "${selectedImposition.name}" for ${response.data.costPaid} Disrepute`);

            // Refresh data
            fetchData();
        } catch (error) {
            console.error('Error purchasing imposition:', error);
            if (error.response && error.response.data && error.response.data.message) {
                setError(error.response.data.message);
            } else {
                setError('Failed to purchase imposition. Please try again.');
            }
            setImpositionDialogOpen(false);
        }
    };

    // Handle setting a favored port
    const handleSetFavoredPort = async () => {
        try {
            if (!newFavoredPort) {
                setError('Please select a port');
                return;
            }

            const response = await api.post('/infamy/favored-port', {
                port: newFavoredPort
            });

            setFavoredPortDialogOpen(false);
            setSuccess(`${newFavoredPort} set as a favored port with +${response.data.bonus} bonus`);

            // Reset form
            setNewFavoredPort('');

            // Refresh data
            fetchData();
        } catch (error) {
            console.error('Error setting favored port:', error);
            if (error.response && error.response.data && error.response.data.message) {
                setError(error.response.data.message);
            } else {
                setError('Failed to set favored port. Please try again.');
            }
            setFavoredPortDialogOpen(false);
        }
    };

    // Handle sacrificing a crew member
    const handleSacrificeCrew = async () => {
        try {
            if (!crewName) {
                setError('Please enter a crew member name');
                return;
            }

            const response = await api.post('/infamy/sacrifice', {
                crewName
            });

            setSacrificeDialogOpen(false);
            setSuccess(`Sacrificed ${crewName} and gained ${response.data.disreputeGained} Disrepute`);

            // Reset form
            setCrewName('');

            // Refresh data
            fetchData();
        } catch (error) {
            console.error('Error sacrificing crew:', error);
            if (error.response && error.response.data && error.response.data.message) {
                setError(error.response.data.message);
            } else {
                setError('Failed to sacrifice crew member. Please try again.');
            }
            setSacrificeDialogOpen(false);
        }
    };

    // Format date for display
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    // Get sphere of influence based on infamy level
    const getSphereOfInfluence = () => {
        const { infamy } = infamyStatus;
        // Base sphere of influence is 100 miles
        let sphere = 100;
        if (infamy >= 10) sphere += 100;
        if (infamy >= 20) sphere += 100;
        if (infamy >= 30) sphere += 100;
        if (infamy >= 40) sphere += 100;
        if (infamy >= 55) sphere += 100;

        return sphere;
    };

    // Render skill selector
    const renderSkillSelector = () => (
        <FormControl fullWidth margin="normal">
            <InputLabel id="skill-used-label">Skill Used</InputLabel>
            <Select
                labelId="skill-used-label"
                value={skillUsed}
                onChange={(e) => setSkillUsed(e.target.value)}
                label="Skill Used"
            >
                <MenuItem value="Bluff">Bluff</MenuItem>
                <MenuItem value="Intimidate">Intimidate</MenuItem>
                <MenuItem value="Perform">Perform</MenuItem>
            </Select>
        </FormControl>
    );

    // Loading indicator
    if (loading) {
        return (
            <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
                <CircularProgress />
                <Typography variant="body1" sx={{ ml: 2 }}>Loading Infamy data...</Typography>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg">
            <Paper sx={{ p: 3, mb: 3 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h5">Ship's Infamy & Disrepute</Typography>
                    <Chip
                        label={infamyStatus.threshold}
                        color={infamyStatus.infamy < 10 ? "default" : "primary"}
                        icon={<SailingIcon />}
                    />
                </Box>

                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}

                <Grid container spacing={3} sx={{ mt: 1 }}>
                    <Grid item xs={12} md={6}>
                        <Card elevation={3}>
                            <CardHeader
                                title="Reputation"
                                subheader="Your ship's standing in the Shackles"
                                avatar={<SailingIcon color="primary" />}
                            />
                            <CardContent>
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="subtitle1">Infamy</Typography>
                                    <Typography variant="h3">{infamyStatus.infamy}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Your ship's legends and stories throughout the Shackles
                                    </Typography>
                                </Box>

                                <Divider sx={{ my: 2 }} />

                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="subtitle1">Disrepute</Typography>
                                    <Typography variant="h3">{infamyStatus.disrepute}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Spendable points used to purchase impositions and benefits
                                    </Typography>
                                </Box>

                                <Divider sx={{ my: 2 }} />

                                <Box>
                                    <Typography variant="subtitle1">Sphere of Influence</Typography>
                                    <Typography variant="h5">{getSphereOfInfluence()} miles</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        The range in which your reputation holds sway
                                    </Typography>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <Card elevation={3}>
                            <CardHeader
                                title="Favored Ports"
                                subheader="Ports where your reputation precedes you"
                                avatar={<LocationOnIcon color="primary" />}
                                action={
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={() => setFavoredPortDialogOpen(true)}
                                        disabled={infamyStatus.infamy < 10 || infamyStatus.favored_ports.length >= (
                                            infamyStatus.infamy >= 55 ? 3 :
                                            infamyStatus.infamy >= 30 ? 2 :
                                            infamyStatus.infamy >= 10 ? 1 : 0
                                        )}
                                    >
                                        Add Port
                                    </Button>
                                }
                            />
                            <CardContent>
                                {infamyStatus.favored_ports.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary" align="center">
                                        {infamyStatus.infamy < 10
                                            ? "Reach Disgraceful threshold (10+ Infamy) to designate favored ports"
                                            : "No favored ports designated yet"}
                                    </Typography>
                                ) : (
                                    <List>
                                        {infamyStatus.favored_ports.map((port) => (
                                            <ListItem key={port.port_name}>
                                                <ListItemIcon>
                                                    <PublicIcon color="primary" />
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={port.port_name}
                                                    secondary={`+${port.bonus} bonus to Infamy checks`}
                                                />
                                            </ListItem>
                                        ))}
                                    </List>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            </Paper>

            <Box sx={{ width: '100%' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={handleTabChange} aria-label="infamy tabs">
                        <Tab label="Gain Infamy" icon={<AddIcon />} iconPosition="start" />
                        <Tab label="Impositions" icon={<ShoppingCartIcon />} iconPosition="start" />
                        <Tab label="History" icon={<HistoryIcon />} iconPosition="start" />
                        <Tab label="Rules" icon={<EmojiEventsIcon />} iconPosition="start" />
                    </Tabs>
                </Box>

                {/* Gain Infamy Tab */}
                <TabPanel value={tabValue} index={0}>
                    <Typography variant="h6" gutterBottom>Boast at Port</Typography>
                    <Typography variant="body2" paragraph>
                        When your ship is moored at a port for 1 full day, you can boast about your infamous deeds to gain Infamy.
                        The DC for the Infamy check is 15 + 2 × your APL (Average Party Level).
                    </Typography>

                    <Paper sx={{ p: 3 }}>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth margin="normal">
                                    <InputLabel id="port-select-label">Port</InputLabel>
                                    <Select
                                        labelId="port-select-label"
                                        value={selectedPort}
                                        onChange={(e) => setSelectedPort(e.target.value)}
                                        label="Port"
                                    >
                                        {availablePorts.map((port) => {
                                            const status = getPortStatus(port);
                                            return (
                                                <MenuItem
                                                    key={port}
                                                    value={port}
                                                    disabled={!status.available}
                                                >
                                                    {getPortWithBonus(port)} {status.gained > 0 && `(${status.gained}/5)`}
                                                </MenuItem>
                                            );
                                        })}
                                    </Select>
                                    <Typography variant="caption" color="text.secondary">
                                        Each port can provide a maximum of 5 Infamy points per threshold.
                                    </Typography>
                                </FormControl>

                                {renderSkillSelector()}

                                <TextField
                                    fullWidth
                                    margin="normal"
                                    label="Skill Check Result"
                                    type="number"
                                    value={skillCheck}
                                    onChange={(e) => setSkillCheck(e.target.value)}
                                    helperText="Enter the total result of your Bluff, Intimidate, or Perform check"
                                />
                            </Grid>

                            <Grid item xs={12} md={6}>
                                <Box sx={{ p: 2, border: '1px dashed gray', borderRadius: 1, mt: 2 }}>
                                    <Typography variant="subtitle2" gutterBottom>Spend Plunder for Bonus</Typography>
                                    <Typography variant="body2" paragraph>
                                        Every point of plunder spent adds a +2 bonus to your skill check.
                                    </Typography>

                                    <Box sx={{ width: '100%', display: 'flex', alignItems: 'center' }}>
                                        <Typography variant="body2" sx={{ mr: 2 }}>Plunder: </Typography>
                                        <Slider
                                            value={plunderSpent}
                                            onChange={(e, newValue) => setPlunderSpent(newValue)}
                                            step={1}
                                            min={0}
                                            max={10}
                                            valueLabelDisplay="auto"
                                            sx={{ flexGrow: 1 }}
                                        />
                                        <Typography variant="body2" sx={{ ml: 2, minWidth: 40 }}>{plunderSpent}</Typography>
                                    </Box>

                                    <Typography variant="body2" color="primary" sx={{ mt: 1 }}>
                                        +{plunderSpent * 2} bonus to skill check
                                    </Typography>
                                </Box>

                                <Box sx={{ mt: 2 }}>
                                    <FormControl fullWidth>
                                        <Tooltip title="If your check fails, you can spend 3 plunder to reroll (once per day)">
                                            <FormControl fullWidth component="fieldset">
                                                <label>
                                                    <input
                                                        type="checkbox"
                                                        checked={rerollWithPlunder}
                                                        onChange={(e) => setRerollWithPlunder(e.target.checked)}
                                                    />
                                                    <Typography variant="body2" component="span" sx={{ ml: 1 }}>
                                                        Spend 3 Plunder to reroll if failed (requires at least 3 plunder)
                                                    </Typography>
                                                </label>
                                            </FormControl>
                                        </Tooltip>
                                    </FormControl>
                                </Box>
                            </Grid>

                            <Grid item xs={12}>
                                <Button
                                    variant="contained"
                                    color="primary"
                                    fullWidth
                                    size="large"
                                    onClick={handleGainInfamy}
                                    disabled={!selectedPort}
                                    sx={{ mt: 2 }}
                                >
                                    Boast at Port
                                </Button>
                            </Grid>
                        </Grid>
                    </Paper>

                    {infamyStatus.infamy >= 20 && (
                        <Paper sx={{ p: 3, mt: 3 }}>
                            <Grid container spacing={2} alignItems="center">
                                <Grid item xs={12} md={8}>
                                    <Typography variant="h6" color="error">Sacrifice Crew Member</Typography>
                                    <Typography variant="body2">
                                        Once per week, you can sacrifice a prisoner or crew member to gain 1d3 points of Disrepute.
                                        This sacrifice is always fatal.
                                    </Typography>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        fullWidth
                                        onClick={() => setSacrificeDialogOpen(true)}
                                        startIcon={<SailingIcon />}
                                    >
                                        Sacrifice Crew
                                    </Button>
                                </Grid>
                            </Grid>
                        </Paper>
                    )}
                </TabPanel>

                {/* Impositions Tab */}
                <TabPanel value={tabValue} index={1}>
                    <Typography variant="h6" gutterBottom>Available Impositions</Typography>
                    <Typography variant="body2" paragraph>
                        Impositions are benefits you can purchase using your Disrepute. Your current Disrepute: <strong>{infamyStatus.disrepute}</strong>
                    </Typography>

                    {/* Disgraceful Impositions */}
                    <Accordion defaultExpanded={true}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="h6">
                                Disgraceful Impositions
                                {infamyStatus.infamy < 10 && (
                                    <Chip size="small" label="Locked" color="default" sx={{ ml: 2 }} />
                                )}
                            </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Typography variant="body2" paragraph color="text.secondary">
                                Requires 10+ Infamy (Disgraceful threshold)
                            </Typography>

                            {impositions.disgraceful.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">No disgraceful impositions available</Typography>
                            ) : (
                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Imposition</TableCell>
                                                <TableCell>Cost</TableCell>
                                                <TableCell>Effect</TableCell>
                                                <TableCell>Action</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {impositions.disgraceful.map((imposition) => (
                                                <TableRow key={imposition.id}>
                                                    <TableCell>{imposition.name}</TableCell>
                                                    <TableCell>{imposition.displayCost}</TableCell>
                                                    <TableCell>{imposition.effect}</TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant="outlined"
                                                            size="small"
                                                            onClick={() => handleOpenImpositionDialog(imposition)}
                                                            disabled={!imposition.isAvailable || infamyStatus.infamy < 10}
                                                        >
                                                            Purchase
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </AccordionDetails>
                    </Accordion>

                    {/* Despicable Impositions */}
                    <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="h6">
                                Despicable Impositions
                                {infamyStatus.infamy < 20 && (
                                    <Chip size="small" label="Locked" color="default" sx={{ ml: 2 }} />
                                )}
                            </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Typography variant="body2" paragraph color="text.secondary">
                                Requires 20+ Infamy (Despicable threshold)
                            </Typography>

                            {impositions.despicable.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">No despicable impositions available</Typography>
                            ) : (
                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Imposition</TableCell>
                                                <TableCell>Cost</TableCell>
                                                <TableCell>Effect</TableCell>
                                                <TableCell>Action</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {impositions.despicable.map((imposition) => (
                                                <TableRow key={imposition.id}>
                                                    <TableCell>{imposition.name}</TableCell>
                                                    <TableCell>{imposition.displayCost}</TableCell>
                                                    <TableCell>{imposition.effect}</TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant="outlined"
                                                            size="small"
                                                            onClick={() => handleOpenImpositionDialog(imposition)}
                                                            disabled={!imposition.isAvailable || infamyStatus.infamy < 20}
                                                        >
                                                            Purchase
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </AccordionDetails>
                    </Accordion>

                    {/* Notorious Impositions */}
                    <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="h6">
                                Notorious Impositions
                                {infamyStatus.infamy < 30 && (
                                    <Chip size="small" label="Locked" color="default" sx={{ ml: 2 }} />
                                )}
                            </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Typography variant="body2" paragraph color="text.secondary">
                                Requires 30+ Infamy (Notorious threshold)
                            </Typography>

                            {impositions.notorious.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">No notorious impositions available</Typography>
                            ) : (
                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Imposition</TableCell>
                                                <TableCell>Cost</TableCell>
                                                <TableCell>Effect</TableCell>
                                                <TableCell>Action</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {impositions.notorious.map((imposition) => (
                                                <TableRow key={imposition.id}>
                                                    <TableCell>{imposition.name}</TableCell>
                                                    <TableCell>{imposition.displayCost}</TableCell>
                                                    <TableCell>{imposition.effect}</TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant="outlined"
                                                            size="small"
                                                            onClick={() => handleOpenImpositionDialog(imposition)}
                                                            disabled={!imposition.isAvailable || infamyStatus.infamy < 30}
                                                        >
                                                            Purchase
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </AccordionDetails>
                    </Accordion>

                    {/* Loathsome Impositions */}
                    <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="h6">
                                Loathsome Impositions
                                {infamyStatus.infamy < 40 && (
                                    <Chip size="small" label="Locked" color="default" sx={{ ml: 2 }} />
                                )}
                            </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Typography variant="body2" paragraph color="text.secondary">
                                Requires 40+ Infamy (Loathsome threshold)
                            </Typography>

                            {impositions.loathsome.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">No loathsome impositions available</Typography>
                            ) : (
                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Imposition</TableCell>
                                                <TableCell>Cost</TableCell>
                                                <TableCell>Effect</TableCell>
                                                <TableCell>Action</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {impositions.loathsome.map((imposition) => (
                                                <TableRow key={imposition.id}>
                                                    <TableCell>{imposition.name}</TableCell>
                                                    <TableCell>{imposition.displayCost}</TableCell>
                                                    <TableCell>{imposition.effect}</TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant="outlined"
                                                            size="small"
                                                            onClick={() => handleOpenImpositionDialog(imposition)}
                                                            disabled={!imposition.isAvailable || infamyStatus.infamy < 40}
                                                        >
                                                            Purchase
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </AccordionDetails>
                    </Accordion>

                    {/* Vile Impositions */}
                    <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="h6">
                                Vile Impositions
                                {infamyStatus.infamy < 55 && (
                                    <Chip size="small" label="Locked" color="default" sx={{ ml: 2 }} />
                                )}
                            </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Typography variant="body2" paragraph color="text.secondary">
                                Requires 55+ Infamy (Vile threshold)
                            </Typography>

                            {impositions.vile.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">No vile impositions available</Typography>
                            ) : (
                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Imposition</TableCell>
                                                <TableCell>Cost</TableCell>
                                                <TableCell>Effect</TableCell>
                                                <TableCell>Action</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {impositions.vile.map((imposition) => (
                                                <TableRow key={imposition.id}>
                                                    <TableCell>{imposition.name}</TableCell>
                                                    <TableCell>{imposition.displayCost}</TableCell>
                                                    <TableCell>{imposition.effect}</TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant="outlined"
                                                            size="small"
                                                            onClick={() => handleOpenImpositionDialog(imposition)}
                                                            disabled={!imposition.isAvailable || infamyStatus.infamy < 55}
                                                        >
                                                            Purchase
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </AccordionDetails>
                    </Accordion>
                </TabPanel>

                {/* History Tab */}
                <TabPanel value={tabValue} index={2}>
                    <Typography variant="h6" gutterBottom>Infamy & Disrepute History</Typography>

                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Date</TableCell>
                                    <TableCell>Action</TableCell>
                                    <TableCell>Infamy</TableCell>
                                    <TableCell>Disrepute</TableCell>
                                    <TableCell>Port</TableCell>
                                    <TableCell>Performed By</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {infamyHistory.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center">No history recorded yet</TableCell>
                                    </TableRow>
                                ) : (
                                    infamyHistory.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell>{formatDate(entry.created_at)}</TableCell>
                                            <TableCell>{entry.reason}</TableCell>
                                            <TableCell>
                                                {entry.infamy_change > 0 && '+'}
                                                {entry.infamy_change !== 0 ? entry.infamy_change : '-'}
                                            </TableCell>
                                            <TableCell>
                                                {entry.disrepute_change > 0 && '+'}
                                                {entry.disrepute_change !== 0 ? entry.disrepute_change : '-'}
                                            </TableCell>
                                            <TableCell>{entry.port || '-'}</TableCell>
                                            <TableCell>{entry.username || 'Unknown'}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </TabPanel>

                {/* Rules Tab */}
                <TabPanel value={tabValue} index={3}>
                    <Typography variant="h6" gutterBottom>Infamy System Rules</Typography>

                    <Paper sx={{ p: 3 }}>
                        <Typography variant="body1" paragraph>
                            Some pirates only do what they do for the promise of wealth, being little more than brigands of the waves.
                            Others do it for the reputation, fearsomeness, and power that comes with numbering among the most notorious
                            scallywags on the seas. That's where Infamy comes in.
                        </Typography>

                        <Typography variant="h6" gutterBottom>Infamy and Disrepute Scores</Typography>
                        <Typography variant="body1" paragraph>
                            A party has two related scores, Infamy and Disrepute. Infamy tracks how many points the crew has gained over
                            its career—think of this as the sum of all the outlandish stories and rumors about the PCs being told throughout
                            the Shackles. Infamy rarely, if ever, decreases, and reaching certain Infamy thresholds provides useful benefits.
                        </Typography>

                        <Typography variant="body1" paragraph>
                            Disrepute is a spendable resource—a group's actual ability to cash in on its reputation. This currency is used to
                            purchase impositions, deeds others might not want to do for the group, but that they perform either to curry the
                            group's favor or to avoid its disfavor.
                        </Typography>

                        <Typography variant="h6" gutterBottom>Winning Infamy and Disrepute</Typography>
                        <Typography variant="body1" paragraph>
                            To gain Infamy, the PCs must moor their ship at a port for 1 full day, and the PC determined by the
                            group to be its main storyteller must spend this time on shore carousing and boasting of infamous deeds.
                            This PC must make either a Bluff, Intimidate, or Perform check. The DC of this check is equal to 15 + twice
                            the group's average party level (APL).
                        </Typography>

                        <Box sx={{ my: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                            <Typography variant="subtitle1" gutterBottom>Success Results:</Typography>
                            <Typography variant="body2">• Success: +1 Infamy and Disrepute</Typography>
                            <Typography variant="body2">• Success by 5 or more: +2 Infamy and Disrepute</Typography>
                            <Typography variant="body2">• Success by 10 or more: +3 Infamy and Disrepute</Typography>
                            <Typography variant="body2">• Failure: No change in Infamy or Disrepute</Typography>
                        </Box>

                        <Typography variant="h6" gutterBottom>Infamy and Disrepute per Port</Typography>
                        <Typography variant="body1" paragraph>
                            No matter how impressionable (or drunk) the crowd, no one wants to hear the same tales and boasts over and over again.
                            Thus, a group can only gain a maximum of 5 points of Infamy and Disrepute from any particular port. However, this amount
                            resets every time a group reaches a new Infamy threshold.
                        </Typography>

                        <Typography variant="h6" gutterBottom>Plunder and Infamy</Typography>
                        <Typography variant="body1" paragraph>
                            Before making an Infamy check, the party can choose to spend plunder to influence
                            the result—any tale is more believable when it comes from someone throwing around her wealth and buying drinks
                            for the listeners. Every point of plunder expended adds a +2 bonus to the character's skill check to earn Infamy.
                        </Typography>

                        <Typography variant="body1" paragraph>
                            If a PC fails an Infamy check, the party can choose to spend 3 points of plunder to immediately reroll
                            the check. The party may only make one reroll attempt per day.
                        </Typography>

                        <Typography variant="h6" gutterBottom>Infamy Thresholds</Typography>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Title & Infamy Required</TableCell>
                                        <TableCell>Benefit</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    <TableRow>
                                        <TableCell>
                                            <strong>Disgraceful</strong><br />(10+ Infamy)
                                        </TableCell>
                                        <TableCell>
                                            <ul>
                                                <li>Characters may purchase disgraceful impositions.</li>
                                                <li>The PCs may choose one favored port. They gain a +2 bonus on all Infamy checks made at that port.</li>
                                            </ul>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>
                                            <strong>Despicable</strong><br />(20+ Infamy)
                                        </TableCell>
                                        <TableCell>
                                            <ul>
                                                <li>Characters may purchase despicable impositions.</li>
                                                <li>Once per week, the PCs can sacrifice a prisoner or crew member to immediately gain 1d3 points of Disrepute.</li>
                                            </ul>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>
                                            <strong>Notorious</strong><br />(30+ Infamy)
                                        </TableCell>
                                        <TableCell>
                                            <ul>
                                                <li>Characters may purchase notorious impositions.</li>
                                                <li>Disgraceful impositions can be purchased for half price (rounded down).</li>
                                                <li>The PCs may choose a second favored port. They gain a +2 bonus on all Infamy checks made at this port and a +4 bonus at their first favored port.</li>
                                            </ul>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>
                                            <strong>Loathsome</strong><br />(40+ Infamy)
                                        </TableCell>
                                        <TableCell>
                                            <ul>
                                                <li>Characters may purchase loathsome impositions.</li>
                                                <li>Despicable impositions can be purchased for half price (rounded down).</li>
                                                <li>PCs gain a +5 bonus on skill checks made to sell plunder.</li>
                                            </ul>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>
                                            <strong>Vile</strong><br />(55+ Infamy)
                                        </TableCell>
                                        <TableCell>
                                            <ul>
                                                <li>Characters may purchase vile impositions.</li>
                                                <li>Notorious impositions can be purchased for half price (rounded down).</li>
                                                <li>Disgraceful impositions are free.</li>
                                                <li>The PCs may choose a third favored port. They gain a +2 bonus on all Infamy checks made at this port, a +4 bonus at their second favored port, and a +6 bonus at their first favored port.</li>
                                            </ul>
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </TabPanel>
            </Box>

            {/* Purchase Imposition Dialog */}
            <Dialog open={impositionDialogOpen} onClose={() => setImpositionDialogOpen(false)}>
                <DialogTitle>Purchase Imposition</DialogTitle>
                <DialogContent>
                    {selectedImposition && (
                        <>
                            <Typography variant="h6">{selectedImposition.name}</Typography>
                            <Typography variant="body2" paragraph>
                                Cost: <strong>{selectedImposition.displayCost} Disrepute</strong>
                            </Typography>
                            <Typography variant="body1" paragraph>{selectedImposition.effect}</Typography>
                            {selectedImposition.description && (
                                <Typography variant="body2" color="text.secondary" paragraph>
                                    {selectedImposition.description}
                                </Typography>
                            )}
                            <DialogContentText>
                                Your current Disrepute: <strong>{infamyStatus.disrepute}</strong>
                            </DialogContentText>
                            <DialogContentText color="error">
                                Are you sure you want to purchase this imposition?
                            </DialogContentText>
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setImpositionDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handlePurchaseImposition} color="primary" variant="contained">
                        Purchase
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Set Favored Port Dialog */}
            <Dialog open={favoredPortDialogOpen} onClose={() => setFavoredPortDialogOpen(false)}>
                <DialogTitle>Set Favored Port</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Choose a port to designate as a favored port. This will grant a bonus to all Infamy checks made at this port.
                    </DialogContentText>
                    <FormControl fullWidth margin="normal">
                        <InputLabel id="favored-port-select-label">Port</InputLabel>
                        <Select
                            labelId="favored-port-select-label"
                            value={newFavoredPort}
                            onChange={(e) => setNewFavoredPort(e.target.value)}
                            label="Port"
                        >
                            {availablePorts
                                .filter(port => !infamyStatus.favored_ports.some(p => p.port_name === port))
                                .map((port) => (
                                    <MenuItem key={port} value={port}>
                                        {port}
                                    </MenuItem>
                                ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setFavoredPortDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSetFavoredPort} color="primary" variant="contained" disabled={!newFavoredPort}>
                        Set as Favored Port
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Sacrifice Crew Dialog */}
            <Dialog open={sacrificeDialogOpen} onClose={() => setSacrificeDialogOpen(false)}>
                <DialogTitle>Sacrifice Crew Member</DialogTitle>
                <DialogContent>
                    <DialogContentText color="error">
                        <WarningIcon /> This sacrifice is always fatal, and returning the victim to life results in the loss of 1d6 points of Disrepute.
                    </DialogContentText>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Crew Member Name"
                        type="text"
                        fullWidth
                        value={crewName}
                        onChange={(e) => setCrewName(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSacrificeDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSacrificeCrew} color="error" variant="contained" disabled={!crewName}>
                        Sacrifice
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default Infamy;