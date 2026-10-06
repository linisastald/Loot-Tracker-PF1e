import React, {useEffect, useState} from 'react';
import {
    Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, CardHeader,
    Checkbox, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogContentText,
    DialogTitle, Divider, FormControl, FormControlLabel, Grid, IconButton, InputLabel, List, ListItem,
    ListItemIcon, ListItemText, MenuItem, Paper, Select, Slider, Tab, Table, TableBody, TableCell,
    TableContainer, TableHead, TablePagination, TableRow, Tabs, TextField, Tooltip, Typography
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import {
    Add as AddIcon, EmojiEvents as EmojiEventsIcon, ExpandMore as ExpandMoreIcon,
    History as HistoryIcon, LocationOn as LocationOnIcon, Public as PublicIcon,
    Remove as RemoveIcon, Sailing as SailingIcon, ShoppingCart as ShoppingCartIcon,
    Warning as WarningIcon,
} from '@mui/icons-material';
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/apiErrors';
import lootService from '../../services/lootService';
import TabPanel from '../common/TabPanel';
import { useIsDM } from '../../contexts/CampaignContext';
import { useCampaignTimezone } from '../../hooks/useCampaignTimezone';
import { formatInCampaignTimezone } from '../../utils/timezoneUtils';
import InfamyRules from './infamy/InfamyRules';
import {
    FIRST_THRESHOLD, INFAMY_THRESHOLDS, MAX_PORT_INFAMY, SHACKLES_PORTS,
    getMaxFavoredPorts, getSphereOfInfluence, getThresholdValue
} from './infamy/infamyData';

interface Imposition {
    id: number;
    name: string;
    cost: number;
    displayCost: number;
    effect: string;
    description?: string;
    isAvailable?: boolean;
}

interface FavoredPort {
    port_name: string;
    bonus: number;
}

interface InfamyStatus {
    infamy: number;
    disrepute: number;
    threshold: string;
    favored_ports: FavoredPort[];
}

interface HistoryEntry {
    id: number;
    created_at: string;
    reason: string;
    infamy_change: number;
    disrepute_change: number;
    port?: string | null;
    username?: string | null;
}

interface PortVisit {
    name: string;
    thresholds: Record<string, number>;
}

interface GainResult {
    infamyGained: number;
    newThreshold: string | null;
    skillCheck: number;
    dc: number;
    isRerollAttempt: boolean;
}

type ImpositionGroups = Record<string, Imposition[]>;

const EMPTY_IMPOSITIONS: ImpositionGroups = {
    disgraceful: [], despicable: [], notorious: [], loathsome: [], vile: []
};

const HISTORY_PAGE_SIZES = [10, 25, 50, 100];

// Basic dialogs as reusable components
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
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Cost: <strong>{imposition.displayCost} Disrepute</strong>
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 2 }}>{imposition.effect}</Typography>
                    {imposition.description && (
                        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
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
    onChange: (e: SelectChangeEvent) => void;
    availablePorts: string[];
    favoredPorts: FavoredPort[];
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

interface SacrificeDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: () => void;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const SacrificeDialog: React.FC<SacrificeDialogProps> = ({open, onClose, onSubmit, value, onChange}) => (
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

// Impositions table
interface ImpositionsTableProps {
    impositions: Imposition[];
    canPurchase: boolean;
    onPurchase: (imposition: Imposition) => void;
}

const ImpositionsTable: React.FC<ImpositionsTableProps> = ({impositions, canPurchase, onPurchase}) => (
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

// Number field with minus/plus buttons (DM adjustment)
interface StepperFieldProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
}

const StepperField: React.FC<StepperFieldProps> = ({label, value, onChange}) => (
    <TextField
        fullWidth
        label={label}
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        slotProps={{ input: {
            startAdornment: (
                <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
                    <IconButton size="small" aria-label={`Decrease ${label}`} onClick={() => onChange(value - 1)}>
                        <RemoveIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" aria-label={`Increase ${label}`} onClick={() => onChange(value + 1)}>
                        <AddIcon fontSize="small" />
                    </IconButton>
                </Box>
            )
        } }}
    />
);

const Infamy: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [tabValue, setTabValue] = useState(0);
    const isDM = useIsDM();

    const { timezone } = useCampaignTimezone();

    // Infamy data
    const [infamyStatus, setInfamyStatus] = useState<InfamyStatus>({
        infamy: 0,
        disrepute: 0,
        threshold: 'None',
        favored_ports: []
    });
    const [impositions, setImpositions] = useState<ImpositionGroups>(EMPTY_IMPOSITIONS);
    const [portHistory, setPortHistory] = useState<Record<string, Record<string, number>>>({});
    const [infamyHistory, setInfamyHistory] = useState<HistoryEntry[]>([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyPage, setHistoryPage] = useState(0);
    const [historyRowsPerPage, setHistoryRowsPerPage] = useState(HISTORY_PAGE_SIZES[1]);

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
    const [selectedImposition, setSelectedImposition] = useState<Imposition | null>(null);
    const [impositionDialogOpen, setImpositionDialogOpen] = useState(false);
    const [crewName, setCrewName] = useState('');
    const [sacrificeDialogOpen, setSacrificeDialogOpen] = useState(false);
    const [newFavoredPort, setNewFavoredPort] = useState('');
    const [favoredPortDialogOpen, setFavoredPortDialogOpen] = useState(false);

    const loadStatus = async () => {
        const [statusResponse, impositionsResponse, portsResponse] = await Promise.all([
            api.get('/infamy/status'),
            api.get('/infamy/impositions'),
            api.get('/infamy/ports')
        ]);

        setInfamyStatus(statusResponse.data);
        setImpositions(impositionsResponse.data.impositions);

        const portHistoryObj: Record<string, Record<string, number>> = {};
        (portsResponse.data.ports as PortVisit[]).forEach((port) => {
            portHistoryObj[port.name] = port.thresholds;
        });
        setPortHistory(portHistoryObj);
    };

    const loadHistory = async (page: number, rowsPerPage: number) => {
        const response = await api.get('/infamy/history', {
            params: { limit: rowsPerPage, offset: page * rowsPerPage }
        });
        const history: HistoryEntry[] = response.data.history || [];
        setInfamyHistory(history);
        setHistoryTotal(response.data.pagination?.total ?? history.length);
    };

    const loadPlunder = async () => {
        try {
            const plunderItems = await lootService.searchLoot({ itemid: '7807' });

            let plunderCount = 0;
            if (plunderItems?.data?.items) {
                plunderItems.data.items.forEach((item: { status?: string | null; quantity?: string | number }) => {
                    // Only count items with null status (available for spending)
                    if (item.status === null || item.status === undefined) {
                        plunderCount += parseInt(String(item.quantity)) || 0;
                    }
                });
            }

            setAvailablePlunder(plunderCount);
        } catch {
            // Keep the previous plunder count; the next refresh retries
        }
    };

    // Refresh everything after an action without swapping the page for the spinner
    const refresh = async () => {
        try {
            await Promise.all([loadStatus(), loadHistory(historyPage, historyRowsPerPage), loadPlunder()]);
        } catch (err) {
            setError(getErrorMessage(err, 'Failed to refresh infamy data. Please try again.'));
        }
    };

    useEffect(() => {
        const initialLoad = async () => {
            try {
                await Promise.all([loadStatus(), loadHistory(0, historyRowsPerPage), loadPlunder()]);
            } catch {
                setError('Failed to load infamy data. Please try again.');
            } finally {
                setLoading(false);
            }
        };
        initialLoad();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleHistoryPageChange = async (_event: unknown, newPage: number) => {
        setHistoryPage(newPage);
        try {
            await loadHistory(newPage, historyRowsPerPage);
        } catch (err) {
            setError(getErrorMessage(err, 'Failed to load history.'));
        }
    };

    const handleHistoryRowsPerPageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const rows = parseInt(event.target.value, 10);
        setHistoryRowsPerPage(rows);
        setHistoryPage(0);
        try {
            await loadHistory(0, rows);
        } catch (err) {
            setError(getErrorMessage(err, 'Failed to load history.'));
        }
    };

    const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    // Shared shape of the action handlers: clear stale alerts, run, show the
    // server's message on failure, always refresh, then close any dialog.
    const runAction = async (
        action: () => Promise<void>,
        fallbackError: string,
        closeDialog?: () => void
    ) => {
        setError('');
        setSuccess('');
        try {
            await action();
        } catch (err) {
            setError(getErrorMessage(err, fallbackError));
        } finally {
            closeDialog?.();
        }
        await refresh();
    };

    // Infamy already gained at a port during the current threshold
    const getPortStatus = (portName: string) => {
        const gained = portHistory[portName]?.[getThresholdValue(infamyStatus.infamy)] || 0;
        return {
            gained,
            max: MAX_PORT_INFAMY,
            available: gained < MAX_PORT_INFAMY
        };
    };

    const getPortWithBonus = (portName: string) => {
        const favoredPort = infamyStatus.favored_ports.find(p => p.port_name === portName);
        return favoredPort ? `${portName} (+${favoredPort.bonus})` : portName;
    };

    const handleGainInfamy = async () => {
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

        // The reroll costs at least 3 plunder
        const effectivePlunderSpent = rerollWithPlunder ? Math.max(plunderSpent, 3) : plunderSpent;

        if (effectivePlunderSpent > availablePlunder) {
            setError(`Not enough plunder available. You have ${availablePlunder} but tried to spend ${effectivePlunderSpent}.`);
            return;
        }

        await runAction(async () => {
            const response = await api.post('/infamy/gain', {
                port: selectedPort,
                skillCheck: parseInt(skillCheck) || 0,
                skillUsed,
                plunderSpent: effectivePlunderSpent,
                reroll: rerollWithPlunder
            });
            const result: GainResult = response.data;

            // The attempt (and any plunder) is committed whether or not it succeeded
            setSkillCheck('');
            setPlunderSpent(0);
            setRerollWithPlunder(false);

            if (result.infamyGained > 0) {
                setSuccess(result.newThreshold
                    ? `Gained ${result.infamyGained} Infamy at ${selectedPort}! You have reached the ${result.newThreshold} threshold!`
                    : `Gained ${result.infamyGained} Infamy at ${selectedPort}`);
            } else {
                setError(`Failed to gain Infamy at ${selectedPort}: your check of ${result.skillCheck} did not meet the DC of ${result.dc}. ` +
                    (result.isRerollAttempt
                        ? 'You have used all your attempts for today (in-game).'
                        : 'You may try a reroll by spending 3 plunder.'));
            }
        }, 'Failed to gain infamy. Please try again.');
    };

    // DM adjustment of infamy/disrepute
    const handleAdjustInfamy = async () => {
        setError('');
        setSuccess('');

        if (!adjustmentReason) {
            setError('Please provide a reason for this adjustment');
            return;
        }

        // Both values can't be zero
        if (infamyChange === 0 && disreputeChange === 0) {
            setError('Please specify an amount to change Infamy or Disrepute');
            return;
        }

        setAdjusting(true);
        try {
            await runAction(async () => {
                await api.post('/infamy/adjust', {
                    infamyChange,
                    disreputeChange,
                    reason: adjustmentReason
                });

                setInfamyChange(0);
                setDisreputeChange(0);
                setAdjustmentReason('');

                setSuccess(`Infamy ${infamyChange >= 0 ? 'increased' : 'decreased'} by ${Math.abs(infamyChange)} and Disrepute ${disreputeChange >= 0 ? 'increased' : 'decreased'} by ${Math.abs(disreputeChange)}`);
            }, 'Error adjusting infamy/disrepute');
        } finally {
            setAdjusting(false);
        }
    };

    const handleOpenImpositionDialog = (imposition: Imposition) => {
        setSelectedImposition(imposition);
        setImpositionDialogOpen(true);
    };

    const handlePurchaseImposition = async () => {
        if (!selectedImposition) return;
        await runAction(async () => {
            const response = await api.post('/infamy/purchase', {
                impositionId: selectedImposition.id
            });
            setSuccess(`Successfully purchased "${selectedImposition.name}" for ${response.data.costPaid} Disrepute`);
        }, 'Failed to purchase imposition. Please try again.', () => setImpositionDialogOpen(false));
    };

    const handleSetFavoredPort = async () => {
        if (!newFavoredPort) {
            setError('Please select a port');
            return;
        }

        await runAction(async () => {
            const response = await api.post('/infamy/favored-port', {
                port: newFavoredPort
            });
            setSuccess(`${newFavoredPort} set as a favored port with +${response.data.bonus} bonus`);
            setNewFavoredPort('');
        }, 'Failed to set favored port. Please try again.', () => setFavoredPortDialogOpen(false));
    };

    const handleSacrificeCrew = async () => {
        if (!crewName) {
            setError('Please enter a crew member name');
            return;
        }

        await runAction(async () => {
            const response = await api.post('/infamy/sacrifice', {
                crewName
            });
            setSuccess(`Sacrificed ${crewName} and gained ${response.data.disreputeGained} Disrepute`);
            setCrewName('');
        }, 'Failed to sacrifice crew member. Please try again.', () => setSacrificeDialogOpen(false));
    };

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

    if (loading) {
        return (
            <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
                <CircularProgress />
                <Typography variant="body1" sx={{ ml: 2 }}>Loading Infamy data...</Typography>
            </Container>
        );
    }

    const renderImpositionAccordion = (title: string, threshold: number, impositionsList: Imposition[] = []) => (
        <Accordion key={title} defaultExpanded={threshold === FIRST_THRESHOLD}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">
                    {title} Impositions
                    {infamyStatus.infamy < threshold && (
                        <Chip size="small" label="Locked" color="default" sx={{ ml: 2 }} />
                    )}
                </Typography>
            </AccordionSummary>
            <AccordionDetails>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
                    Requires {threshold}+ Infamy ({title} threshold)
                </Typography>

                {impositionsList.length === 0 ? (
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        No {title.toLowerCase()} impositions available
                    </Typography>
                ) : (
                    <ImpositionsTable
                        impositions={impositionsList}
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
                <Box sx={{ display: "flex", justifyContent: "end", alignItems: "center" }}>
                    <Chip
                        label={infamyStatus.threshold}
                        color={infamyStatus.infamy < FIRST_THRESHOLD ? "default" : "primary"}
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
                                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                        Your ship's legends and stories throughout the Shackles
                                    </Typography>
                                </Box>

                                <Divider sx={{ my: 2 }} />

                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="subtitle1">Disrepute</Typography>
                                    <Typography variant="h3">{infamyStatus.disrepute}</Typography>
                                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                        Spendable points used to purchase impositions and benefits
                                    </Typography>
                                </Box>

                                <Divider sx={{ my: 2 }} />

                                <Box>
                                    <Typography variant="subtitle1">Sphere of Influence</Typography>
                                    <Typography variant="h5">{getSphereOfInfluence(infamyStatus.infamy)} miles</Typography>
                                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
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
                                        disabled={infamyStatus.infamy < FIRST_THRESHOLD ||
                                            infamyStatus.favored_ports.length >= getMaxFavoredPorts(infamyStatus.infamy)}
                                    >
                                        Add Port
                                    </Button>
                                }
                            />
                            <CardContent>
                                {infamyStatus.favored_ports.length === 0 ? (
                                    <Typography variant="body2" align="center" sx={{ color: "text.secondary" }}>
                                        {infamyStatus.infamy < FIRST_THRESHOLD
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
                    <Typography variant="body2" sx={{ mb: 2 }}>
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
                                        {SHACKLES_PORTS.map((port) => {
                                            const status = getPortStatus(port);
                                            return (
                                                <MenuItem
                                                    key={port}
                                                    value={port}
                                                    disabled={!status.available}
                                                >
                                                    {getPortWithBonus(port)} {status.gained > 0 && `(${status.gained}/${MAX_PORT_INFAMY})`}
                                                </MenuItem>
                                            );
                                        })}
                                    </Select>
                                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                        Each port can provide a maximum of {MAX_PORT_INFAMY} Infamy points per threshold.
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
                                    <Typography variant="body2" sx={{ mb: 2 }}>
                                        Every point of plunder spent adds a +2 bonus to your skill check.
                                        Available plunder: <strong>{availablePlunder}</strong>
                                    </Typography>

                                    <Box sx={{ width: '100%', display: 'flex', alignItems: 'center' }}>
                                        <Typography variant="body2" sx={{ mr: 2 }}>Plunder: </Typography>
                                        <Slider
                                            value={plunderSpent}
                                            onChange={(_e, newValue) => setPlunderSpent(newValue as number)}
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
                                    <Tooltip title="If your check fails, you can spend 3 plunder to reroll (once per day)">
                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={rerollWithPlunder}
                                                    onChange={(e) => setRerollWithPlunder(e.target.checked)}
                                                    disabled={availablePlunder < 3}
                                                />
                                            }
                                            label={
                                                <Typography variant="body2" component="span">
                                                    Spend 3 Plunder to reroll if failed (requires at least 3 plunder)
                                                </Typography>
                                            }
                                        />
                                    </Tooltip>
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
                                    <StepperField label="Infamy Change" value={infamyChange} onChange={setInfamyChange} />
                                </Grid>

                                <Grid size={{xs: 12, md: 6}}>
                                    <StepperField label="Disrepute Change" value={disreputeChange} onChange={setDisreputeChange} />
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

                    {infamyStatus.infamy >= INFAMY_THRESHOLDS[1].min && (
                        <Paper sx={{ p: 3, mt: 3 }}>
                            <Grid container spacing={2} size={12} sx={{ alignItems: "center" }}>
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
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Impositions are benefits you can purchase using your Disrepute. Your current Disrepute: <strong>{infamyStatus.disrepute}</strong>
                    </Typography>

                    {INFAMY_THRESHOLDS.map((threshold) =>
                        renderImpositionAccordion(threshold.title, threshold.min, impositions[threshold.key])
                    )}
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
                                            <TableCell>
                                                {timezone && formatInCampaignTimezone(entry.created_at, timezone, 'PPpp z')}
                                            </TableCell>
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
                        <TablePagination
                            component="div"
                            count={historyTotal}
                            page={historyPage}
                            onPageChange={handleHistoryPageChange}
                            rowsPerPage={historyRowsPerPage}
                            onRowsPerPageChange={handleHistoryRowsPerPageChange}
                            rowsPerPageOptions={HISTORY_PAGE_SIZES}
                        />
                    </TableContainer>
                </TabPanel>

                {/* Rules Tab */}
                <TabPanel value={tabValue} index={3}>
                    <InfamyRules />
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
                availablePorts={SHACKLES_PORTS}
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
