import React, {useCallback, useEffect, useMemo, useState} from 'react';
import api from '../../utils/api';
import lootService from '../../services/lootService';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import {DatePicker, LocalizationProvider} from '@mui/x-date-pickers';
import {AdapterDateFns} from '@mui/x-date-pickers/AdapterDateFns';

interface TabPanelProps {
    children?: React.ReactNode;
    value: number;
    index: number;
}

interface GoldEntry {
    id: number;
    session_date: string;
    transaction_type: string;
    platinum: number;
    gold: number;
    silver: number;
    copper: number;
    notes?: string;
}

interface GoldTotals {
    platinum: number;
    gold: number;
    silver: number;
    copper: number;
    fullTotal: number;
}

interface NewEntry {
    sessionDate: Date;
    transactionType: string;
    platinum: string;
    gold: string;
    silver: string;
    copper: string;
    notes: string;
}

interface LedgerEntry {
    id: number;
    date: string;
    type: string;
    description: string;
    amount: number;
    balance: number;
    character?: string;
    lootvalue?: string;
    payments?: string;
    active?: boolean;
}

// Tab Panel component
function TabPanel(props: TabPanelProps) {
    const {children, value, index, ...other} = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`gold-tabpanel-${index}`}
            aria-labelledby={`gold-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{p: 3}}>
                    {children}
                </Box>
            )}
        </div>
    );
}

function a11yProps(index: number) {
    return {
        id: `gold-tab-${index}`,
        'aria-controls': `gold-tabpanel-${index}`,
    };
}

const GoldTransactions: React.FC = () => {
    const [goldEntries, setGoldEntries] = useState<GoldEntry[]>([]);
    const [overviewTotals, setOverviewTotals] = useState<GoldTotals>({platinum: 0, gold: 0, silver: 0, copper: 0, fullTotal: 0});
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [totals, setTotals] = useState<GoldTotals>({platinum: 0, gold: 0, silver: 0, copper: 0, fullTotal: 0});
    const [userRole, setUserRole] = useState<string>('');
    const [startDate, setStartDate] = useState<Date>(new Date(new Date().setMonth(new Date().getMonth() - 6)));
    const [endDate, setEndDate] = useState<Date>(new Date());
    const [activeTab, setActiveTab] = useState<number>(0);
    const [ledgerData, setLedgerData] = useState<LedgerEntry[]>([]);
    const [ledgerLoading, setLedgerLoading] = useState<boolean>(false);

    // Memoized utility function to safely format numbers
    const formatCurrency = useCallback((value: number | string, defaultValue: string = '0.00'): string => {
        const num = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(num) || !isFinite(num)) {
            return defaultValue;
        }
        return num.toFixed(2);
    }, []);

    // New gold entry form state
    const [newEntry, setNewEntry] = useState<NewEntry>({
        sessionDate: new Date(),
        transactionType: 'Deposit',
        platinum: '',
        gold: '',
        silver: '',
        copper: '',
        notes: ''
    });

    useEffect(() => {
        fetchUserRole();
        fetchOverviewTotals();
        fetchLedgerData();
    }, []);

    useEffect(() => {
        // Only fetch filtered entries when on Transaction History tab
        if (activeTab === 2) {
            fetchGoldEntries();
        }
    }, [startDate, endDate, activeTab]);

    const fetchGoldEntries = async (): Promise<void> => {
        try {
            setError(null);
            const response = await api.get(`/gold`, {
                params: {startDate, endDate}
            });

            // Sort entries by complete session_date timestamp (not just the date part)
            const sortedEntries = [...response.data].sort((a: GoldEntry, b: GoldEntry) => {
                return new Date(b.session_date).getTime() - new Date(a.session_date).getTime();
            });

            setGoldEntries(sortedEntries);
            calculateTotals(sortedEntries);
        } catch (error) {
            console.error('Error fetching gold entries:', error);
            setError('Failed to fetch gold entries.');
        }
    };

    const fetchUserRole = async (): Promise<void> => {
        try {
            const response = await api.get(`/auth/status`);
            if (response.data && response.data.user) {
                setUserRole(response.data.user.role);
            }
        } catch (error) {
            console.error('Error fetching user role:', error);
        }
    };

    const fetchOverviewTotals = async (): Promise<void> => {
        try {
            setError(null);
            // Use the dedicated overview totals endpoint for efficiency
            const response = await api.get(`/gold/overview-totals`);
            
            // Response already contains calculated totals
            setOverviewTotals(response.data);
        } catch (error) {
            console.error('Error fetching overview totals:', error);
            setError('Failed to fetch overview totals.');
        }
    };

    const calculateTotals = (entries: GoldEntry[]): void => {
        const totals = entries.reduce(
            (acc, entry) => {
                acc.platinum += Number(entry.platinum) || 0;
                acc.gold += Number(entry.gold) || 0;
                acc.silver += Number(entry.silver) || 0;
                acc.copper += Number(entry.copper) || 0;
                return acc;
            },
            {platinum: 0, gold: 0, silver: 0, copper: 0, fullTotal: 0}
        );

        // Calculate full total in gold pieces
        totals.fullTotal = (10 * totals.platinum) + totals.gold + (totals.silver / 10) + (totals.copper / 100);
        setTotals(totals);
    };


    const handleDistributeAll = async (): Promise<void> => {
        try {
            setError(null);
            await api.post(`/gold/distribute-all`, {});
            setSuccess('Gold distributed successfully!');
            fetchOverviewTotals(); // Refresh overview totals
            if (activeTab === 2) {
                fetchGoldEntries(); // Refresh the gold entries if on history tab
            }
        } catch (error) {
            console.error('Error distributing gold:', error);
            setError('Failed to distribute gold.');
        }
    };

    const handleDistributePlusPartyLoot = async (): Promise<void> => {
        try {
            setError(null);
            await api.post(`/gold/distribute-plus-party-loot`, {});
            setSuccess('Gold distributed with party loot successfully!');
            fetchOverviewTotals(); // Refresh overview totals
            if (activeTab === 2) {
                fetchGoldEntries(); // Refresh the gold entries if on history tab
            }
        } catch (error) {
            console.error('Error distributing gold plus party loot:', error);
            setError('Failed to distribute gold plus party loot.');
        }
    };

    const handleBalance = async (): Promise<void> => {
        try {
            setError(null);
            await api.post(`/gold/balance`, {});
            setSuccess('Currency balanced successfully!');
            fetchOverviewTotals(); // Refresh overview totals
            if (activeTab === 2) {
                fetchGoldEntries(); // Refresh the gold entries if on history tab
            }
        } catch (error) {
            console.error('Error balancing gold:', error);
            setError('Failed to balance gold.');
        }
    };

    const handleQuickFilter = (months) => {
        const startDate = new Date(new Date().setMonth(new Date().getMonth() - months));
        const endDate = new Date();
        setStartDate(startDate);
        setEndDate(endDate);
    };

    const formatDate = useCallback((dateString: string) => {
        const options: Intl.DateTimeFormatOptions = {year: 'numeric', month: 'long', day: 'numeric'};
        return new Date(dateString).toLocaleDateString(undefined, options);
    }, []);

    // Memoized processing of ledger data for display
    const processedLedgerData = useMemo(() => {
        return ledgerData.map((row) => {
            // Safely parse numeric values with fallback to 0
            const lootValue = parseFloat(row.lootvalue) || 0;
            const payments = parseFloat(row.payments) || 0;
            const balance = lootValue - payments;
            
            // Check for valid balance calculation
            const isValidBalance = !isNaN(balance) && isFinite(balance);
            const isOverpaid = isValidBalance && balance < -0.01; // Small tolerance for floating point
            const isUnderpaid = isValidBalance && balance > 0.01;
            const isBalanced = isValidBalance && Math.abs(balance) <= 0.01;
            
            // Safely handle character name display
            const characterName = row.character || 'Unknown Character';
            const displayName = characterName.length > 30 
                ? `${characterName.substring(0, 27)}...` 
                : characterName;

            return {
                ...row,
                lootValue,
                payments,
                balance,
                isValidBalance,
                isOverpaid,
                isUnderpaid,
                isBalanced,
                characterName,
                displayName
            };
        });
    }, [ledgerData]);

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
        // Fetch gold entries when switching to Transaction History tab
        if (newValue === 2 && goldEntries.length === 0) {
            fetchGoldEntries();
        }
    };

    const handleEntryChange = (field, value) => {
        setNewEntry(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSubmitEntry = async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();

        try {
            setError(null);

            // Validate form
            if (!newEntry.transactionType) {
                setError('Transaction type is required');
                return;
            }

            if (!newEntry.platinum && !newEntry.gold && !newEntry.silver && !newEntry.copper) {
                setError('At least one currency amount is required');
                return;
            }

            // Prepare entry
            const entry = {
                sessionDate: newEntry.sessionDate,
                transactionType: newEntry.transactionType,
                platinum: newEntry.platinum === '' ? 0 : parseInt(newEntry.platinum),
                gold: newEntry.gold === '' ? 0 : parseInt(newEntry.gold),
                silver: newEntry.silver === '' ? 0 : parseInt(newEntry.silver),
                copper: newEntry.copper === '' ? 0 : parseInt(newEntry.copper),
                notes: newEntry.notes
            };

            await api.post('/gold', {goldEntries: [entry]});

            // Success! Clear form and refresh
            setSuccess('Gold entry created successfully!');
            setNewEntry({
                sessionDate: new Date(),
                transactionType: 'Deposit',
                platinum: '',
                gold: '',
                silver: '',
                copper: '',
                notes: ''
            });

            fetchOverviewTotals(); // Always refresh overview totals after new entry
            if (activeTab === 2) {
                fetchGoldEntries(); // Refresh filtered entries if on history tab
            }
            // Also refresh ledger data if new entry affects character balances
            if (newEntry.transactionType === 'Party Payment' || newEntry.transactionType === 'Party Payback') {
                fetchLedgerData();
            }
        } catch (error) {
            console.error('Error creating gold entry:', error);
            setError('Failed to create gold entry.');
        }
    };

    // Function to fetch character loot ledger data
    const fetchLedgerData = async (): Promise<void> => {
        try {
            setLedgerLoading(true);
            setError(null); // Clear any previous errors
            const response = await lootService.getCharacterLedger();

            if (response.data && Array.isArray(response.data.ledger)) {
                // Validate and clean the ledger data
                const validatedData = response.data.ledger
                    .filter(row => row && typeof row === 'object') // Filter out null/invalid rows
                    .map(row => ({
                        ...row,
                        character: row.character || 'Unknown Character',
                        lootvalue: row.lootvalue || '0',
                        payments: row.payments || '0',
                        active: Boolean(row.active)
                    }));

                // Sort active characters first, then by name
                const sortedData = validatedData
                    .sort((a, b) => {
                        if (a.active !== b.active) return b.active - a.active;
                        return (a.character || '').localeCompare(b.character || '');
                    });

                setLedgerData(sortedData);
            } else if (response.data && Array.isArray(response.data.characters)) {
                // Fallback for old API format with validation
                const validatedData = response.data.characters
                    .filter(row => row && typeof row === 'object')
                    .map(row => ({
                        ...row,
                        character: row.character || 'Unknown Character',
                        lootvalue: row.lootvalue || '0',
                        payments: row.payments || '0',
                        active: Boolean(row.active)
                    }));

                const sortedData = validatedData
                    .sort((a, b) => {
                        if (a.active !== b.active) return b.active - a.active;
                        return (a.character || '').localeCompare(b.character || '');
                    });

                setLedgerData(sortedData);
            } else {
                console.error('Invalid ledger data format:', response.data);
                setLedgerData([]);
                setError('Received invalid data format from server. Please contact support if this issue persists.');
            }
        } catch (error) {
            console.error('Error fetching ledger data:', error);
            setError('Failed to load ledger data. Please check your connection and try again.');
            setLedgerData([]); // Ensure we have empty data on error
        } finally {
            setLedgerLoading(false);
        }
    };

    return (
        <Container maxWidth={false} component="main">
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {success && <Alert severity="success" sx={{mb: 2}}>{success}</Alert>}

            <Paper sx={{p: 2, mb: 2}}>
                <Box sx={{borderBottom: 1, borderColor: 'divider', mb: 2}}>
                    <Tabs value={activeTab} onChange={handleTabChange} aria-label="gold management tabs">
                        <Tab label="Overview" {...a11yProps(0)} />
                        <Tab label="Add Transaction" {...a11yProps(1)} />
                        <Tab label="Transaction History" {...a11yProps(2)} />
                        <Tab label="Management" {...a11yProps(3)} />
                        <Tab label="Character Ledger" {...a11yProps(4)} />
                    </Tabs>
                </Box>

                {/* Overview Tab */}
                <TabPanel value={activeTab} index={0}>
                    <Card sx={{mb: 3}}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Currency Summary</Typography>
                            <Grid container spacing={3}>
                                <Grid size={{xs: 12, sm: 6, md: 3}}>
                                    <Paper sx={{
                                        p: 2,
                                        textAlign: 'center',
                                        bgcolor: 'background.default',
                                        borderLeft: '5px solid #E5E4E2'
                                    }}>
                                        <Typography variant="subtitle2" color="text.secondary">Platinum</Typography>
                                        <Typography variant="h4" sx={{color: '#E5E4E2'}}>{overviewTotals.platinum}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid size={{xs: 12, sm: 6, md: 3}}>
                                    <Paper sx={{
                                        p: 2,
                                        textAlign: 'center',
                                        bgcolor: 'background.default',
                                        borderLeft: '5px solid #FFD700'
                                    }}>
                                        <Typography variant="subtitle2" color="text.secondary">Gold</Typography>
                                        <Typography variant="h4" sx={{color: '#FFD700'}}>{overviewTotals.gold}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid size={{xs: 12, sm: 6, md: 3}}>
                                    <Paper sx={{
                                        p: 2,
                                        textAlign: 'center',
                                        bgcolor: 'background.default',
                                        borderLeft: '5px solid #C0C0C0'
                                    }}>
                                        <Typography variant="subtitle2" color="text.secondary">Silver</Typography>
                                        <Typography variant="h4" sx={{color: '#C0C0C0'}}>{overviewTotals.silver}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid size={{xs: 12, sm: 6, md: 3}}>
                                    <Paper sx={{
                                        p: 2,
                                        textAlign: 'center',
                                        bgcolor: 'background.default',
                                        borderLeft: '5px solid #B87333'
                                    }}>
                                        <Typography variant="subtitle2" color="text.secondary">Copper</Typography>
                                        <Typography variant="h4" sx={{color: '#B87333'}}>{overviewTotals.copper}</Typography>
                                    </Paper>
                                </Grid>
                            </Grid>
                            <Paper sx={{p: 3, mt: 3, textAlign: 'center', bgcolor: 'background.default'}}>
                                <Typography variant="subtitle1" color="text.secondary">Total Value (in
                                    Gold)</Typography>
                                <Typography variant="h3" color="primary">{overviewTotals.fullTotal.toFixed(2)} GP</Typography>
                            </Paper>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Quick Actions</Typography>
                            <Grid container spacing={2}>
                                <Grid size={{xs: 12, sm: 4}}>
                                    <Button
                                        variant="outlined"
                                        color="primary"
                                        onClick={() => setActiveTab(1)}
                                        fullWidth
                                        sx={{
                                            borderColor: 'rgba(144, 202, 249, 0.5)',
                                            color: 'text.secondary',
                                            '&:hover': {
                                                backgroundColor: 'rgba(144, 202, 249, 0.08)',
                                                borderColor: 'rgba(144, 202, 249, 0.7)'
                                            }
                                        }}
                                    >
                                        Add New Transaction
                                    </Button>
                                </Grid>
                                <Grid size={{xs: 12, sm: 4}}>
                                    <Button
                                        variant="outlined"
                                        color="secondary"
                                        onClick={() => setActiveTab(3)}
                                        fullWidth
                                        sx={{
                                            borderColor: 'rgba(244, 143, 177, 0.5)',
                                            color: 'text.secondary',
                                            '&:hover': {
                                                backgroundColor: 'rgba(244, 143, 177, 0.08)',
                                                borderColor: 'rgba(244, 143, 177, 0.7)'
                                            }
                                        }}
                                    >
                                        Manage Gold
                                    </Button>
                                </Grid>
                                <Grid size={{xs: 12, sm: 4}}>
                                    <Button
                                        variant="outlined"
                                        onClick={() => setActiveTab(2)}
                                        fullWidth
                                        sx={{
                                            borderColor: 'rgba(255, 255, 255, 0.23)',
                                            color: 'text.secondary',
                                            '&:hover': {
                                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                                borderColor: 'rgba(255, 255, 255, 0.5)'
                                            }
                                        }}
                                    >
                                        View History
                                    </Button>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                </TabPanel>

                {/* Add Transaction Tab */}
                <TabPanel value={activeTab} index={1}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Add New Gold Transaction</Typography>
                            <form onSubmit={handleSubmitEntry}>
                                <Grid container spacing={3}>
                                    <Grid size={{xs: 12, md: 4}}>
                                        <LocalizationProvider dateAdapter={AdapterDateFns}>
                                            <DatePicker
                                                label="Session Date"
                                                value={newEntry.sessionDate}
                                                onChange={(date) => handleEntryChange('sessionDate', date)}
                                                slots={{
                                                    textField: TextField
                                                }}
                                                slotProps={{
                                                    textField: { fullWidth: true }
                                                }}
                                            />
                                        </LocalizationProvider>
                                    </Grid>
                                    <Grid size={{xs: 12, md: 8}}>
                                        <FormControl fullWidth>
                                            <InputLabel>Transaction Type</InputLabel>
                                            <Select
                                                value={newEntry.transactionType}
                                                onChange={(e) => handleEntryChange('transactionType', e.target.value)}
                                                label="Transaction Type"
                                            >
                                                <MenuItem value="Deposit">Deposit</MenuItem>
                                                <MenuItem value="Withdrawal">Withdrawal</MenuItem>
                                                <MenuItem value="Sale">Sale</MenuItem>
                                                <MenuItem value="Purchase">Purchase</MenuItem>
                                                <MenuItem value="Party Loot Purchase">Party Loot Purchase</MenuItem>
                                                <MenuItem value="Party Payment">Party Payment</MenuItem>
                                                <MenuItem value="Party Payback">Party Payback</MenuItem>
                                                <MenuItem value="Balance">Balance</MenuItem>
                                                <MenuItem value="Other">Other</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>

                                    <Grid size={12}>
                                        <Typography variant="subtitle1" gutterBottom>Amount</Typography>
                                    </Grid>

                                    <Grid size={{xs: 12, sm: 6, md: 3}}>
                                        <TextField
                                            label="Platinum"
                                            type="number"
                                            fullWidth
                                            inputProps={{min: 0}}
                                            value={newEntry.platinum}
                                            onChange={(e) => handleEntryChange('platinum', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid size={{xs: 12, sm: 6, md: 3}}>
                                        <TextField
                                            label="Gold"
                                            type="number"
                                            fullWidth
                                            inputProps={{min: 0}}
                                            value={newEntry.gold}
                                            onChange={(e) => handleEntryChange('gold', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid size={{xs: 12, sm: 6, md: 3}}>
                                        <TextField
                                            label="Silver"
                                            type="number"
                                            fullWidth
                                            inputProps={{min: 0}}
                                            value={newEntry.silver}
                                            onChange={(e) => handleEntryChange('silver', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid size={{xs: 12, sm: 6, md: 3}}>
                                        <TextField
                                            label="Copper"
                                            type="number"
                                            fullWidth
                                            inputProps={{min: 0}}
                                            value={newEntry.copper}
                                            onChange={(e) => handleEntryChange('copper', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid size={12}>
                                        <TextField
                                            label="Notes"
                                            fullWidth
                                            multiline
                                            rows={2}
                                            value={newEntry.notes}
                                            onChange={(e) => handleEntryChange('notes', e.target.value)}
                                        />
                                    </Grid>
                                    <Grid size={12}>
                                        <Button
                                            type="submit"
                                            variant="outlined"
                                            color="primary"
                                            size="large"
                                            sx={{
                                                borderColor: 'rgba(144, 202, 249, 0.5)',
                                                color: 'text.secondary',
                                                '&:hover': {
                                                    backgroundColor: 'rgba(144, 202, 249, 0.08)',
                                                    borderColor: 'rgba(144, 202, 249, 0.7)'
                                                }
                                            }}
                                        >
                                            Add Transaction
                                        </Button>
                                    </Grid>
                                </Grid>
                            </form>
                        </CardContent>
                    </Card>
                </TabPanel>

                {/* Transaction History Tab */}
                <TabPanel value={activeTab} index={2}>
                    <Card sx={{mb: 3}}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Filter Transactions</Typography>
                            <LocalizationProvider dateAdapter={AdapterDateFns}>
                                <Grid container spacing={2}>
                                    <Grid size={{xs: 12, sm: 4}}>
                                        <DatePicker
                                            label="Start Date"
                                            value={startDate}
                                            onChange={(date) => setStartDate(date)}
                                            slots={{
                                                textField: TextField
                                            }}
                                            slotProps={{
                                                textField: { fullWidth: true }
                                            }}
                                        />
                                    </Grid>
                                    <Grid size={{xs: 12, sm: 4}}>
                                        <DatePicker
                                            label="End Date"
                                            value={endDate}
                                            onChange={(date) => setEndDate(date)}
                                            slots={{
                                                textField: TextField
                                            }}
                                            slotProps={{
                                                textField: { fullWidth: true }
                                            }}
                                        />
                                    </Grid>
                                    <Grid size={{xs: 12, sm: 4}}>
                                        <Button
                                            variant="outlined"
                                            color="primary"
                                            onClick={fetchGoldEntries}
                                            fullWidth
                                            sx={{
                                                borderColor: 'rgba(144, 202, 249, 0.5)',
                                                color: 'text.secondary',
                                                '&:hover': {
                                                    backgroundColor: 'rgba(144, 202, 249, 0.08)',
                                                    borderColor: 'rgba(144, 202, 249, 0.7)'
                                                }
                                            }}
                                        >
                                            Apply Filter
                                        </Button>
                                    </Grid>
                                </Grid>
                            </LocalizationProvider>
                            <Box sx={{mt: 2}}>
                                <Button
                                    variant="outlined"
                                    onClick={() => handleQuickFilter(1)}
                                    sx={{
                                        mr: 1,
                                        mb: 1,
                                        borderColor: 'rgba(255, 255, 255, 0.23)',
                                        color: 'text.secondary',
                                        '&:hover': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                            borderColor: 'rgba(255, 255, 255, 0.5)'
                                        }
                                    }}
                                >
                                    Last Month
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={() => handleQuickFilter(3)}
                                    sx={{
                                        mr: 1,
                                        mb: 1,
                                        borderColor: 'rgba(255, 255, 255, 0.23)',
                                        color: 'text.secondary',
                                        '&:hover': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                            borderColor: 'rgba(255, 255, 255, 0.5)'
                                        }
                                    }}
                                >
                                    Last 3 Months
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={() => handleQuickFilter(6)}
                                    sx={{
                                        mr: 1,
                                        mb: 1,
                                        borderColor: 'rgba(255, 255, 255, 0.23)',
                                        color: 'text.secondary',
                                        '&:hover': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                            borderColor: 'rgba(255, 255, 255, 0.5)'
                                        }
                                    }}
                                >
                                    Last 6 Months
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={() => handleQuickFilter(12)}
                                    sx={{
                                        mr: 1,
                                        mb: 1,
                                        borderColor: 'rgba(255, 255, 255, 0.23)',
                                        color: 'text.secondary',
                                        '&:hover': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                            borderColor: 'rgba(255, 255, 255, 0.5)'
                                        }
                                    }}
                                >
                                    Last Year
                                </Button>
                            </Box>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Transaction History</Typography>
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Session Date</TableCell>
                                            <TableCell>Transaction Type</TableCell>
                                            <TableCell align="right">Platinum</TableCell>
                                            <TableCell align="right">Gold</TableCell>
                                            <TableCell align="right">Silver</TableCell>
                                            <TableCell align="right">Copper</TableCell>
                                            <TableCell>Notes</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {goldEntries.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} align="center">No transactions found</TableCell>
                                            </TableRow>
                                        ) : (
                                            goldEntries.map((entry) => (
                                                <TableRow key={entry.id}>
                                                    <TableCell>{formatDate(entry.session_date)}</TableCell>
                                                    <TableCell>{entry.transaction_type}</TableCell>
                                                    <TableCell align="right">{entry.platinum}</TableCell>
                                                    <TableCell align="right">{entry.gold}</TableCell>
                                                    <TableCell align="right">{entry.silver}</TableCell>
                                                    <TableCell align="right">{entry.copper}</TableCell>
                                                    <TableCell>{entry.notes}</TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </CardContent>
                    </Card>
                </TabPanel>

                {/* Management Tab */}
                <TabPanel value={activeTab} index={3}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Gold Management</Typography>
                            <Grid container spacing={3}>
                                <Grid size={{xs: 12, md: 4}}>
                                    <Paper sx={{p: 3, textAlign: 'center', height: '100%'}}>
                                        <Typography variant="subtitle1" gutterBottom>Equal Distribution</Typography>
                                        <Typography variant="body2" sx={{mb: 2}}>
                                            Distribute all available gold equally among active characters.
                                        </Typography>
                                        <Button
                                            variant="outlined"
                                            color="primary"
                                            onClick={handleDistributeAll}
                                            fullWidth
                                            sx={{
                                                borderColor: 'rgba(144, 202, 249, 0.5)',
                                                color: 'text.secondary',
                                                '&:hover': {
                                                    backgroundColor: 'rgba(144, 202, 249, 0.08)',
                                                    borderColor: 'rgba(144, 202, 249, 0.7)'
                                                }
                                            }}
                                        >
                                            Distribute All
                                        </Button>
                                    </Paper>
                                </Grid>

                                <Grid size={{xs: 12, md: 4}}>
                                    <Paper sx={{p: 3, textAlign: 'center', height: '100%'}}>
                                        <Typography variant="subtitle1" gutterBottom>Party Loot Share</Typography>
                                        <Typography variant="body2" sx={{mb: 2}}>
                                            Distribute gold with one share reserved for party loot.
                                        </Typography>
                                        <Button
                                            variant="outlined"
                                            color="primary"
                                            onClick={handleDistributePlusPartyLoot}
                                            fullWidth
                                            sx={{
                                                borderColor: 'rgba(144, 202, 249, 0.5)',
                                                color: 'text.secondary',
                                                '&:hover': {
                                                    backgroundColor: 'rgba(144, 202, 249, 0.08)',
                                                    borderColor: 'rgba(144, 202, 249, 0.7)'
                                                }
                                            }}
                                        >
                                            Distribute + Party Loot
                                        </Button>
                                    </Paper>
                                </Grid>

                                {userRole === 'DM' && (
                                    <Grid size={{xs: 12, md: 4}}>
                                        <Paper sx={{p: 3, textAlign: 'center', height: '100%'}}>
                                            <Typography variant="subtitle1" gutterBottom>Balance Currency</Typography>
                                            <Typography variant="body2" sx={{mb: 2}}>
                                                Convert smaller denominations to larger ones.
                                            </Typography>
                                            <Button
                                                variant="outlined"
                                                color="primary"
                                                onClick={handleBalance}
                                                fullWidth
                                                sx={{
                                                    borderColor: 'rgba(144, 202, 249, 0.5)',
                                                    color: 'text.secondary',
                                                    '&:hover': {
                                                        backgroundColor: 'rgba(144, 202, 249, 0.08)',
                                                        borderColor: 'rgba(144, 202, 249, 0.7)'
                                                    }
                                                }}
                                            >
                                                Balance Currencies
                                            </Button>
                                        </Paper>
                                    </Grid>
                                )}
                            </Grid>
                        </CardContent>
                    </Card>
                </TabPanel>

                {/* Character Ledger Tab */}
                <TabPanel value={activeTab} index={4}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Character Loot Ledger</Typography>
                            <Typography variant="body2" paragraph>
                                This table shows the value of items kept by each character and payments made to them.
                                The balance column shows the difference between loot value and payments.
                            </Typography>

                            {ledgerLoading ? (
                                <Box display="flex" justifyContent="center" p={3}>
                                    <CircularProgress/>
                                </Box>
                            ) : (
                                <TableContainer component={Paper}>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Character</TableCell>
                                                <TableCell align="right">Value of Loot</TableCell>
                                                <TableCell align="right">Payments</TableCell>
                                                <TableCell align="right">Balance</TableCell>
                                                <TableCell align="center">Status</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {processedLedgerData.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} align="center">No ledger data
                                                        available</TableCell>
                                                </TableRow>
                                            ) : (
                                                processedLedgerData.map((row) => (
                                                    <TableRow
                                                        key={row.character || Math.random()}
                                                        sx={{
                                                            bgcolor: row.active ? 'rgba(144, 202, 249, 0.1)' : 'inherit',
                                                            fontWeight: row.active ? 'bold' : 'normal'
                                                        }}
                                                    >
                                                        <TableCell 
                                                            component="th" 
                                                            scope="row"
                                                            title={row.characterName} // Show full name on hover
                                                            sx={{ maxWidth: '200px' }}
                                                        >
                                                            {row.displayName} {row.active && '(Active)'}
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            {formatCurrency(row.lootValue)}
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            {formatCurrency(row.payments)}
                                                        </TableCell>
                                                        <TableCell
                                                            align="right"
                                                            sx={{
                                                                color: !row.isValidBalance ? 'text.disabled' : 
                                                                       row.isOverpaid ? 'error.main' : 
                                                                       row.isUnderpaid ? 'warning.main' : 'inherit',
                                                                fontWeight: (row.isOverpaid || row.isUnderpaid) ? 'bold' : 'normal'
                                                            }}
                                                        >
                                                            {formatCurrency(row.balance)}
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            {!row.isValidBalance ? 'Invalid Data' :
                                                             row.isOverpaid ? 'Overpaid' : 
                                                             row.isUnderpaid ? 'Underpaid' : 
                                                             row.isBalanced ? 'Balanced' : 'Balanced'}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}

                            <Box mt={3} display="flex" justifyContent="center">
                                <Button
                                    variant="outlined"
                                    color="primary"
                                    onClick={fetchLedgerData}
                                    disabled={ledgerLoading}
                                    sx={{
                                        borderColor: 'rgba(144, 202, 249, 0.5)',
                                        color: 'text.secondary',
                                        '&:hover': {
                                            backgroundColor: 'rgba(144, 202, 249, 0.08)',
                                            borderColor: 'rgba(144, 202, 249, 0.7)'
                                        },
                                        '&.Mui-disabled': {
                                            borderColor: 'rgba(255, 255, 255, 0.12)',
                                            color: 'rgba(255, 255, 255, 0.3)'
                                        }
                                    }}
                                >
                                    Refresh Ledger Data
                                </Button>
                            </Box>
                        </CardContent>
                    </Card>
                </TabPanel>
            </Paper>
        </Container>
    );
};

export default React.memo(GoldTransactions);