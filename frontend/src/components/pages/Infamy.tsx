import React, {useEffect, useState} from 'react';
import {
    Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, CardHeader,
    Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogContentText,
    DialogTitle, Divider, FormControl, Grid, IconButton, InputLabel, List, ListItem, ListItemIcon,
    ListItemText, MenuItem, Paper, Select, Slider, Tab, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Tabs, TextField, Tooltip, Typography
} from '@mui/material';
import {
    Add as AddIcon, EmojiEvents as EmojiEventsIcon, ExpandMore as ExpandMoreIcon,
    History as HistoryIcon, LocationOn as LocationOnIcon, Public as PublicIcon,
    Remove as RemoveIcon, Sailing as SailingIcon, ShoppingCart as ShoppingCartIcon,
    Warning as WarningIcon,
} from '@mui/icons-material';
import api from '../../utils/api';
import lootService from '../../services/lootService';
import {fetchActiveUser} from '../../utils/utils';

interface TabPanelProps {
    children?: React.ReactNode;
    value: number;
    index: number;
}

interface Imposition {
    id: number;
    name: string;
    cost: number;
    displayCost: string;
    effect: string;
    description?: string;
    isAvailable?: boolean;
}

interface InfamyData {
    infamy: number;
    disrepute: number;
    events: any[];
}

interface User {
    id: number;
    username: string;
    role: string;
}

// Extract TabPanel component
function TabPanel({children, value, index, ...other}: TabPanelProps) {
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

// Extract basic dialogs as reusable components  
interface ImpositionDialogProps {
    open: boolean;
    onClose: () => void;
    onPurchase: () => void;
    imposition: Imposition | null;
    disrepute: number;
}

const ImpositionDialog: React.FC<ImpositionDialogProps> = ({open, onClose, onPurchase, imposition, disrepute}) => (
    <Dialog open={open} onClose={onClose}>
        <DialogTitle>Purchase Imposition</DialogTitle>
        <DialogContent>
            {imposition && (
                <>
                    <Typography variant="h6">{imposition.name}</Typography>
                    <Typography variant="body2" paragraph>
                        Cost: <strong>{imposition.displayCost} Disrepute</strong>
                    </Typography>
                    <Typography variant="body1" paragraph>{imposition.effect}</Typography>
                    {imposition.description && (
                        <Typography variant="body2" color="text.secondary" paragraph>
                            {imposition.description}
                        </Typography>
                    )}
                    <DialogContentText>
                        Your current Disrepute: <strong>{disrepute}</strong>
                    </DialogContentText>
                    <DialogContentText color="error">
                        Are you sure you want to purchase this imposition?
                    </DialogContentText>
                </>
            )}
        </DialogContent>
        <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button onClick={onPurchase} color="primary" variant="contained">Purchase</Button>
        </DialogActions>
    </Dialog>
);

interface PortDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: () => void;
    value: string;
    onChange: (e: any) => void;
    availablePorts: any[];
    favoredPorts: any[];
}

const PortDialog: React.FC<PortDialogProps> = ({open, onClose, onSubmit, value, onChange, availablePorts, favoredPorts}) => (
    <Dialog open={open} onClose={onClose}>
        <DialogTitle>Set Favored Port</DialogTitle>
        <DialogContent>
            <DialogContentText>
                Choose a port to designate as a favored port. This will grant a bonus to all Infamy checks made at this port.
            </DialogContentText>
            <FormControl fullWidth margin="normal">
                <InputLabel id="favored-port-select-label">Port</InputLabel>
                <Select
                    labelId="favored-port-select-label"
                    value={value}
                    onChange={onChange}
                    label="Port"
                >
                    {availablePorts
                        .filter(port => !favoredPorts.some(p => p.port_name === port))
                        .map((port) => (
                            <MenuItem key={port} value={port}>{port}</MenuItem>
                        ))}
                </Select>
            </FormControl>
        </DialogContent>
        <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button onClick={onSubmit} color="primary" variant="contained" disabled={!value}>
                Set as Favored Port
            </Button>
        </DialogActions>
    </Dialog>
);

const SacrificeDialog = ({open, onClose, onSubmit, value, onChange}) => (
    <Dialog open={open} onClose={onClose}>
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
                value={value}
                onChange={onChange}
            />
        </DialogContent>
        <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button onClick={onSubmit} color="error" variant="contained" disabled={!value}>
                Sacrifice
            </Button>
        </DialogActions>
    </Dialog>
);

// Extract Impositions Table component
interface ImpositionsTableProps {
    impositions: Imposition[];
    infamyThreshold: number;
    canPurchase: boolean;
    onPurchase: (imposition: Imposition) => void;
}

const ImpositionsTable: React.FC<ImpositionsTableProps> = ({impositions, infamyThreshold, canPurchase, onPurchase}) => (
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
                {impositions.map((imposition) => (
                    <TableRow key={imposition.id}>
                        <TableCell>{imposition.name}</TableCell>
                        <TableCell>{imposition.displayCost}</TableCell>
                        <TableCell>{imposition.effect}</TableCell>
                        <TableCell>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => onPurchase(imposition)}
                                disabled={!imposition.isAvailable || !canPurchase}
                            >
                                Purchase
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </TableContainer>
);

const Infamy: React.FC = () => {
    // State variables - grouped by purpose
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [tabValue, setTabValue] = useState(0);
    const [isDM, setIsDM] = useState(false);

    // Infamy data
    const [infamyStatus, setInfamyStatus] = useState<{infamy: number; disrepute: number; threshold: string; favored_ports: {port_name: string; bonus: number}[]}>({
        infamy: 0,
        disrepute: 0,
        threshold: 'None',
        favored_ports: []
    });
    const [impositions, setImpositions] = useState<Record<string, Imposition[]>>({
        disgraceful: [],
        despicable: [],
        notorious: [],
        loathsome: [],
        vile: []
    });
    const [ports, setPorts] = useState<any[]>([]);
    const [portHistory, setPortHistory] = useState<Record<string, any>>({});
    const [availablePorts, setAvailablePorts] = useState<string[]>([
    'Alendruan Harbor', 'Arena', 'Banukmaud', 'Beachcomber', 'Blackblood Cay',
    'Bogsbridge', 'Chalk Harbor', 'Cho-Tzu', 'Colvaas Gibbet', 'Downpour',
    'Dragonsthrall', 'Drenchport', 'Drowning Rock', 'Falchion Point', 'Fort Benbem',
    'Fort Holiday', 'Ganagsau', 'Genzei', 'Ghrinitshahara', 'Goatshead',
    'Haigui Wan', 'Halabad', 'Heggapnod', 'Hell Harbor', 'Heslandaena',
    'Kora', 'Kukgukmol', 'Lilywhite', 'Little Oppara', 'Maidenspool',
    'Mezdrubal', 'Moak Harbor', 'Myscurial', 'Neruma', 'Ngozu',
    'Ollo', 'Oyster Cay', 'Parley Point', 'Peshaka Naeu', 'Pex',
    'Plumetown', 'Port Peril', 'Queen Bes', 'Quent', 'Raketooth',
    'Rapier Bay', 'Rickety\'s Squibs', 'Robu', 'Rumbutter', 'Slipcove',
    'Tyvas-Devas', 'Vezhnu', 'Vilelock', 'Yelligo Wharf', 'Zeibo',
    'Zhenbarghua'
]);
    const [infamyHistory, setInfamyHistory] = useState<any[]>([]);

    // Form values
    const [selectedPort, setSelectedPort] = useState('');
    const [skillCheck, setSkillCheck] = useState('');
    const [skillUsed, setSkillUsed] = useState('Intimidate');
    const [plunderSpent, setPlunderSpent] = useState(0);
    const [rerollWithPlunder, setRerollWithPlunder] = useState(false);
    const [availablePlunder, setAvailablePlunder] = useState(0);

    // DM Adjustment
    const [infamyChange, setInfamyChange] = useState(0);
    const [disreputeChange, setDisreputeChange] = useState(0);
    const [adjustmentReason, setAdjustmentReason] = useState('');
    const [adjusting, setAdjusting] = useState(false);

    // Dialog states
    const [selectedImposition, setSelectedImposition] = useState(null);
    const [impositionDialogOpen, setImpositionDialogOpen] = useState(false);
    const [crewName, setCrewName] = useState('');
    const [sacrificeDialogOpen, setSacrificeDialogOpen] = useState(false);
    const [newFavoredPort, setNewFavoredPort] = useState('');
    const [favoredPortDialogOpen, setFavoredPortDialogOpen] = useState(false);

    // Load data on component mount
    useEffect(() => {
        fetchUserRole();
        fetchData();
        fetchAvailablePlunder();
    }, []);

    const fetchUserRole = async () => {
        try {
            const user = await fetchActiveUser();
            setIsDM(user?.role === 'DM');
        } catch (error) {
            console.error('Error fetching user role:', error);
        }
    };

    // Consolidated fetch function
    const fetchData = async () => {
        setLoading(true);
        try {
            // Use Promise.all to fetch data in parallel
            const [statusResponse, impositionsResponse, portsResponse, historyResponse] = await Promise.all([
                api.get('/infamy/status'),
                api.get('/infamy/impositions'),
                api.get('/infamy/ports'),
                api.get('/infamy/history')
            ]);

            setInfamyStatus(statusResponse.data);
            setImpositions(impositionsResponse.data.impositions);
            setPorts(portsResponse.data.ports);

            // Build port history object
            const portHistoryObj = {};
            portsResponse.data.ports.forEach(port => {
                portHistoryObj[port.name] = port.thresholds;
            });
            setPortHistory(portHistoryObj);

            setInfamyHistory(historyResponse.data.history);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching infamy data:', error);
            setError('Failed to load infamy data. Please try again.');
            setLoading(false);
        }
    };

    const fetchAvailablePlunder = async () => {
        try {
            const plunderItems = await lootService.searchLoot({
                itemid: '7807'
            });

            let plunderCount = 0;
            if (plunderItems?.data?.items) {
                plunderItems.data.items.forEach(item => {
                    // Only count items with null status (available for spending)
                    if (item.status === null || item.status === undefined) {
                        plunderCount += parseInt(item.quantity) || 0;
                    }
                });
            }

            setAvailablePlunder(plunderCount);
        } catch (error) {
            console.error('Error fetching plunder count:', error);
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

    // Handle gaining infamy
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

            // Ensure at least 3 plunder is spent when reroll is selected
            let effectivePlunderSpent = typeof plunderSpent === 'string' ? parseInt(plunderSpent) || 0 : plunderSpent;
            if (rerollWithPlunder && effectivePlunderSpent < 3) {
                effectivePlunderSpent = 3; // Force minimum plunder to 3 for reroll
            }

            if (effectivePlunderSpent > availablePlunder) {
                setError(`Not enough plunder available. You have ${availablePlunder} but tried to spend ${effectivePlunderSpent}.`);
                return;
            }

            const response = await api.post('/infamy/gain', {
                port: selectedPort,
                skillCheck: parseInt(skillCheck) || 0,
                skillUsed,
                plunderSpent: effectivePlunderSpent,
                reroll: rerollWithPlunder
            });

            // If a new threshold was reached
            if (response.data.newThreshold) {
                setSuccess(`Gained ${response.data.infamyGained} Infamy at ${selectedPort}! You have reached the ${response.data.newThreshold} threshold!`);
            } else {
                setSuccess(`Gained ${response.data.infamyGained} Infamy at ${selectedPort}`);
            }

            // Reset form
            setSkillCheck('');
            setPlunderSpent(0);
            setRerollWithPlunder(false);

            // Refresh data
            fetchData();
            fetchAvailablePlunder();
        } catch (error) {
            console.error('Error gaining infamy:', error);
            if (error.response?.data?.message) {
                setError(error.response.data.message);
            } else {
                setError('Failed to gain infamy. Please try again.');
            }
        }
    };

    // Handle DM adjustment of infamy/disrepute - fix the created_at date issue
    const handleAdjustInfamy = async () => {
        if (!adjustmentReason) {
            setError('Please provide a reason for this adjustment');
            return;
        }

        // Both values can't be zero
        if (infamyChange === 0 && disreputeChange === 0) {
            setError('Please specify an amount to change Infamy or Disrepute');
            return;
        }

        try {
            setAdjusting(true);

            const response = await api.post('/infamy/adjust', {
                infamyChange,
                disreputeChange,
                reason: adjustmentReason,
                created_at: new Date().toISOString() // Add created_at date to fix history issue
            });

            setAdjusting(false);
            setInfamyChange(0);
            setDisreputeChange(0);
            setAdjustmentReason('');

            setSuccess(`Infamy ${infamyChange >= 0 ? 'increased' : 'decreased'} by ${Math.abs(infamyChange)} and Disrepute ${disreputeChange >= 0 ? 'increased' : 'decreased'} by ${Math.abs(disreputeChange)}`);

            // Refresh data
            fetchData();
        } catch (error) {
            setAdjusting(false);
            if (error.response?.data?.message) {
                setError(error.response.data.message);
            } else {
                setError('Error adjusting infamy/disrepute');
            }
        }
    };

    // Dialog handlers - consolidated for simplicity
    const handleOpenImpositionDialog = (imposition) => {
        setSelectedImposition(imposition);
        setImpositionDialogOpen(true);
    };

    const handlePurchaseImposition = async () => {
        try {
            const response = await api.post('/infamy/purchase', {
                impositionId: selectedImposition.id
            });

            setImpositionDialogOpen(false);
            setSuccess(`Successfully purchased "${selectedImposition.name}" for ${response.data.costPaid} Disrepute`);
            fetchData();
        } catch (error) {
            console.error('Error purchasing imposition:', error);
            if (error.response?.data?.message) {
                setError(error.response.data.message);
            } else {
                setError('Failed to purchase imposition. Please try again.');
            }
            setImpositionDialogOpen(false);
        }
    };

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
            setNewFavoredPort('');
            fetchData();
        } catch (error) {
            console.error('Error setting favored port:', error);
            if (error.response?.data?.message) {
                setError(error.response.data.message);
            } else {
                setError('Failed to set favored port. Please try again.');
            }
            setFavoredPortDialogOpen(false);
        }
    };

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
            setCrewName('');
            fetchData();
        } catch (error) {
            console.error('Error sacrificing crew:', error);
            if (error.response?.data?.message) {
                setError(error.response.data.message);
            } else {
                setError('Failed to sacrifice crew member. Please try again.');
            }
            setSacrificeDialogOpen(false);
        }
    };

    // Format date for display
    const formatDate = (dateString) => {
        if (!dateString) return '';
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

    // Render ImpositionAccordion for each threshold level
    const renderImpositionAccordion = (title, threshold, impositionsList) => (
        <Accordion defaultExpanded={threshold === 10}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">
                    {title} Impositions
                    {infamyStatus.infamy < threshold && (
                        <Chip size="small" label="Locked" color="default" sx={{ ml: 2 }} />
                    )}
                </Typography>
            </AccordionSummary>
            <AccordionDetails>
                <Typography variant="body2" paragraph color="text.secondary">
                    Requires {threshold}+ Infamy ({title} threshold)
                </Typography>

                {impositionsList.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No {title.toLowerCase()} impositions available</Typography>
                ) : (
                    <ImpositionsTable
                        impositions={impositionsList}
                        infamyThreshold={threshold}
                        canPurchase={infamyStatus.infamy >= threshold}
                        onPurchase={handleOpenImpositionDialog}
                    />
                )}
            </AccordionDetails>
        </Accordion>
    );

    return (
        <Container maxWidth="lg">
            <Paper sx={{ p: 3, mb: 3 }}>
                <Box display="flex" justifyContent="end" alignItems="center">
                    <Chip
                        label={infamyStatus.threshold}
                        color={infamyStatus.infamy < 10 ? "default" : "primary"}
                        icon={<SailingIcon />}
                    />
                </Box>

                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}

                <Grid container spacing={3} size={12} sx={{ mt: 1 }}>
                    <Grid size={{xs: 12, md: 6}}>
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

                    <Grid size={{xs: 12, md: 6}}>
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
                        <Grid container spacing={3} size={12}>
                            <Grid size={{xs: 12, md: 6}}>
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
                                    helperText="Enter the total result of your skill check including bonuses"
                                />
                            </Grid>

                            <Grid size={{xs: 12, md: 6}}>
                                <Box sx={{ p: 2, border: '1px dashed gray', borderRadius: 1, mt: 2 }}>
                                    <Typography variant="subtitle2" gutterBottom>Spend Plunder for Bonus</Typography>
                                    <Typography variant="body2" paragraph>
                                        Every point of plunder spent adds a +2 bonus to your skill check.
                                        Available plunder: <strong>{availablePlunder}</strong>
                                    </Typography>

                                    <Box sx={{ width: '100%', display: 'flex', alignItems: 'center' }}>
                                        <Typography variant="body2" sx={{ mr: 2 }}>Plunder: </Typography>
                                        <Slider
                                            value={plunderSpent}
                                            onChange={(e, newValue) => setPlunderSpent(newValue)}
                                            step={1}
                                            min={0}
                                            max={Math.min(10, availablePlunder)}
                                            valueLabelDisplay="auto"
                                            sx={{ flexGrow: 1 }}
                                            disabled={availablePlunder === 0}
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
                                                        disabled={availablePlunder < 3}
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

                            <Grid size={12}>
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

                    {/* DM Controls */}
                    {isDM && (
                        <Paper sx={{ p: 3, mt: 3, borderLeft: '4px solid #c62828' }}>
                            <Typography variant="h6" color="error" gutterBottom>
                                DM Controls
                            </Typography>

                            <Grid container spacing={3} size={12}>
                                <Grid size={{xs: 12, md: 6}}>
                                    <TextField
                                        fullWidth
                                        label="Infamy Change"
                                        type="number"
                                        value={infamyChange}
                                        onChange={(e) => setInfamyChange(parseInt(e.target.value) || 0)}
                                        InputProps={{
                                            startAdornment: (
                                                <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
                                                    <IconButton size="small" onClick={() => setInfamyChange(prev => prev - 1)}>
                                                        <RemoveIcon fontSize="small" />
                                                    </IconButton>
                                                    <IconButton size="small" onClick={() => setInfamyChange(prev => prev + 1)}>
                                                        <AddIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            )
                                        }}
                                    />
                                </Grid>

                                <Grid size={{xs: 12, md: 6}}>
                                    <TextField
                                        fullWidth
                                        label="Disrepute Change"
                                        type="number"
                                        value={disreputeChange}
                                        onChange={(e) => setDisreputeChange(parseInt(e.target.value) || 0)}
                                        InputProps={{
                                            startAdornment: (
                                                <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
                                                    <IconButton size="small" onClick={() => setDisreputeChange(prev => prev - 1)}>
                                                        <RemoveIcon fontSize="small" />
                                                    </IconButton>
                                                    <IconButton size="small" onClick={() => setDisreputeChange(prev => prev + 1)}>
                                                        <AddIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            )
                                        }}
                                    />
                                </Grid>

                                <Grid size={12}>
                                    <TextField
                                        fullWidth
                                        label="Reason for Adjustment"
                                        value={adjustmentReason}
                                        onChange={(e) => setAdjustmentReason(e.target.value)}
                                        required
                                    />
                                </Grid>

                                <Grid size={12}>
                                    <Button
                                        variant="contained"
                                        color="error"
                                        fullWidth
                                        disabled={adjusting}
                                        onClick={handleAdjustInfamy}
                                    >
                                        {adjusting ? <CircularProgress size={24} /> : 'Adjust Infamy/Disrepute'}
                                    </Button>
                                </Grid>
                            </Grid>
                        </Paper>
                    )}

                    {infamyStatus.infamy >= 20 && (
                        <Paper sx={{ p: 3, mt: 3 }}>
                            <Grid container spacing={2} size={12} alignItems="center">
                                <Grid size={{xs: 12, md: 8}}>
                                    <Typography variant="h6" color="error">Sacrifice Crew Member</Typography>
                                    <Typography variant="body2">
                                        Once per week, you can sacrifice a prisoner or crew member to gain 1d3 points of Disrepute.
                                        This sacrifice is always fatal.
                                    </Typography>
                                </Grid>
                                <Grid size={{xs: 12, md: 4}}>
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

                    {/* Render accordions for each threshold level */}
                    {renderImpositionAccordion('Disgraceful', 10, impositions.disgraceful)}
                    {renderImpositionAccordion('Despicable', 20, impositions.despicable)}
                    {renderImpositionAccordion('Notorious', 30, impositions.notorious)}
                    {renderImpositionAccordion('Loathsome', 40, impositions.loathsome)}
                    {renderImpositionAccordion('Vile', 55, impositions.vile)}
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

            {/* Dialogs */}
            <ImpositionDialog
                open={impositionDialogOpen}
                onClose={() => setImpositionDialogOpen(false)}
                onPurchase={handlePurchaseImposition}
                imposition={selectedImposition}
                disrepute={infamyStatus.disrepute}
            />

            <PortDialog
                open={favoredPortDialogOpen}
                onClose={() => setFavoredPortDialogOpen(false)}
                onSubmit={handleSetFavoredPort}
                value={newFavoredPort}
                onChange={(e) => setNewFavoredPort(e.target.value)}
                availablePorts={availablePorts}
                favoredPorts={infamyStatus.favored_ports}
            />

            <SacrificeDialog
                open={sacrificeDialogOpen}
                onClose={() => setSacrificeDialogOpen(false)}
                onSubmit={handleSacrificeCrew}
                value={crewName}
                onChange={(e) => setCrewName(e.target.value)}
            />
        </Container>
    );
};

export default Infamy;