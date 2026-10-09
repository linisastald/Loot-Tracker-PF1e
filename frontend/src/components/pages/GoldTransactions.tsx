import React, { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import lootService from '../../services/lootService';
import { useIsDM } from '../../contexts/CampaignContext';
import { getErrorMessage } from '../../utils/apiErrors';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  FormControl,
  FormHelperText,
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
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import TableSkeleton from '../common/TableSkeleton';

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

type CurrencyKey = 'platinum' | 'gold' | 'silver' | 'copper';

interface NewEntry {
    sessionDate: Date | null;
    transactionType: string;
    platinum: string;
    gold: string;
    silver: string;
    copper: string;
    notes: string;
    characterId: string;
}

interface CharacterOption {
    id: number;
    name: string;
}

/** One row of GET /reports/ledger (reportsController.getCharacterLedger). */
interface LedgerRow {
    character?: string | null;
    active?: boolean | null;
    lootValue?: number | string | null;
    payments?: number | string | null;
    withdrawn?: number | string | null;
}

interface LedgerEntry {
    character: string;
    active: boolean;
    lootValue: number;
    payments: number;
    withdrawn: number;
}

interface GoldListBody {
    data?: GoldEntry[];
    pagination?: { hasNext?: boolean };
}

type QuickFilterMonths = 'all' | number;

const CURRENCIES: Array<{ key: CurrencyKey; label: string; color: string }> = [
    {key: 'platinum', label: 'Platinum', color: '#E5E4E2'},
    {key: 'gold', label: 'Gold', color: '#FFD700'},
    {key: 'silver', label: 'Silver', color: '#C0C0C0'},
    {key: 'copper', label: 'Copper', color: '#B87333'}
];

const QUICK_FILTERS: Array<{ label: string; months: QuickFilterMonths }> = [
    {label: 'All Time', months: 'all'},
    {label: 'Last Month', months: 1},
    {label: 'Last 3 Months', months: 3},
    {label: 'Last 6 Months', months: 6},
    {label: 'Last Year', months: 12}
];

const TRANSACTION_TYPES = [
    'Deposit', 'Withdrawal', 'Sale', 'Purchase', 'Party Loot Purchase',
    'Party Payment', 'Party Payback', 'Balance', 'Other'
];

// Page size and cap for the Transaction History (the backend caps limit at 500)
const HISTORY_PAGE_SIZE = 500;
const HISTORY_MAX_PAGES = 20;

const createEmptyEntry = (): NewEntry => ({
    sessionDate: new Date(),
    transactionType: 'Deposit',
    platinum: '',
    gold: '',
    silver: '',
    copper: '',
    notes: '',
    characterId: ''
});

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
                <Box sx={{p: { xs: 1, md: 3 }}}>
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

// Safely format numbers
const formatCurrency = (value: number | string, defaultValue: string = '0.00'): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num) || !isFinite(num)) {
        return defaultValue;
    }
    return num.toFixed(2);
};

const formatDate = (dateString: string): string => {
    const options: Intl.DateTimeFormatOptions = {year: 'numeric', month: 'long', day: 'numeric'};
    return new Date(dateString).toLocaleDateString(undefined, options);
};

/** Local calendar date as YYYY-MM-DD; the server treats the end date as inclusive of that whole day. */
const toDateParam = (date: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Parse one currency field of the entry form. Empty means 0; anything that is
 * not a non-negative whole number is rejected (null).
 */
const parseAmount = (value: string): number | null => {
    const trimmed = value.trim();
    if (trimmed === '') return 0;
    return /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : null;
};

const GoldTransactions: React.FC = () => {
    const [goldEntries, setGoldEntries] = useState<GoldEntry[]>([]);
    const [historyTruncated, setHistoryTruncated] = useState<boolean>(false);
    const [overviewTotals, setOverviewTotals] = useState<GoldTotals>({platinum: 0, gold: 0, silver: 0, copper: 0, fullTotal: 0});
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const isDM = useIsDM();
    const [startDate, setStartDate] = useState<Date>(new Date(new Date().setMonth(new Date().getMonth() - 6)));
    const [endDate, setEndDate] = useState<Date>(new Date());
    const [activeTab, setActiveTab] = useState<number>(0);
    const [ledgerData, setLedgerData] = useState<LedgerEntry[]>([]);
    const [ledgerLoading, setLedgerLoading] = useState<boolean>(false);
    const [characters, setCharacters] = useState<CharacterOption[]>([]);

    // New gold entry form state
    const [newEntry, setNewEntry] = useState<NewEntry>(createEmptyEntry);

    useEffect(() => {
        fetchOverviewTotals();
        fetchLedgerData();
    }, []);

    // DMs can attribute a transaction to any character, so load the list for them
    useEffect(() => {
        if (!isDM) return;
        const fetchCharacters = async () => {
            try {
                const response = await api.get('/user/active-characters') as { data?: CharacterOption[] } | CharacterOption[];
                const rows = Array.isArray(response) ? response : response.data;
                setCharacters(Array.isArray(rows) ? rows.map((r) => ({ id: r.id, name: r.name })) : []);
            } catch {
                // The selector simply stays empty; an entry can still be saved unattributed
            }
        };
        fetchCharacters();
    }, [isDM]);

    useEffect(() => {
        // Only fetch filtered entries when on Transaction History tab
        if (activeTab === 2) {
            fetchGoldEntries();
        }
    }, [startDate, endDate, activeTab]);

    const fetchGoldEntries = async (): Promise<void> => {
        try {
            setError(null);
            const entries: GoldEntry[] = [];
            let truncated = false;

            // The server paginates (newest first); walk the pages so a long range
            // is not silently cut off after the first one.
            for (let page = 1; page <= HISTORY_MAX_PAGES; page++) {
                const response = await api.get('/gold', {
                    params: {
                        startDate: toDateParam(startDate),
                        endDate: toDateParam(endDate),
                        page,
                        limit: HISTORY_PAGE_SIZE
                    }
                });
                const body = response.data as GoldListBody | GoldEntry[];
                const rows = Array.isArray(body) ? body : (body?.data || []);
                entries.push(...rows);

                const hasNext = !Array.isArray(body) && body?.pagination?.hasNext === true;
                if (!hasNext) break;
                if (page === HISTORY_MAX_PAGES) truncated = true;
            }

            setGoldEntries(entries);
            setHistoryTruncated(truncated);
        } catch {
            setError('Failed to fetch gold entries.');
        }
    };

    const fetchOverviewTotals = async (): Promise<void> => {
        try {
            setError(null);
            // Use the dedicated overview totals endpoint for efficiency
            const response = await api.get('/gold/overview-totals');

            // Response already contains calculated totals
            setOverviewTotals(response.data);
        } catch {
            setError('Failed to fetch overview totals.');
        }
    };

    /** Refresh the totals and, when it is showing, the history list. */
    const refreshAfterChange = (): void => {
        fetchOverviewTotals();
        if (activeTab === 2) {
            // endDate is captured once at mount; move it to now so new entries stay in
            // range. The date effect below then refetches the list.
            setEndDate(new Date());
        }
    };

    const runGoldAction = async (path: string, successMessage: string, failureMessage: string): Promise<void> => {
        try {
            setError(null);
            await api.post(path, {});
            setSuccess(successMessage);
            refreshAfterChange();
        } catch {
            setError(failureMessage);
        }
    };

    const handleDistributeAll = () =>
        runGoldAction('/gold/distribute-all', 'Gold distributed successfully!', 'Failed to distribute gold.');

    const handleDistributePlusPartyLoot = () =>
        runGoldAction(
            '/gold/distribute-plus-party-loot',
            'Gold distributed with party loot successfully!',
            'Failed to distribute gold plus party loot.'
        );

    const handleBalance = () =>
        runGoldAction('/gold/balance', 'Currency balanced successfully!', 'Failed to balance gold.');

    const handleQuickFilter = (months: QuickFilterMonths): void => {
        if (months === 'all') {
            // For "All Time", set a very early start date to get all transactions
            setStartDate(new Date('2000-01-01'));
        } else {
            setStartDate(new Date(new Date().setMonth(new Date().getMonth() - months)));
        }
        setEndDate(new Date());
    };

    // Memoized processing of ledger data for display
    const processedLedgerData = useMemo(() => {
        return ledgerData.map((row) => {
            const balance = row.lootValue - row.payments;

            // Check for valid balance calculation
            const isValidBalance = !isNaN(balance) && isFinite(balance);
            const isOverpaid = isValidBalance && balance < -0.01; // Small tolerance for floating point
            const isUnderpaid = isValidBalance && balance > 0.01;

            const displayName = row.character.length > 30
                ? `${row.character.substring(0, 27)}...`
                : row.character;

            return {
                ...row,
                balance,
                isValidBalance,
                isOverpaid,
                isUnderpaid,
                displayName
            };
        });
    }, [ledgerData]);

    const handleEntryChange = (field: keyof NewEntry, value: NewEntry[keyof NewEntry]): void => {
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

            // Amounts are always sent as non-negative whole numbers: the backend
            // derives the sign from the transaction type (e.g. withdrawals are
            // negated server-side) and rejects fractions and negatives.
            const amounts = {} as Record<CurrencyKey, number>;
            for (const {key, label} of CURRENCIES) {
                const amount = parseAmount(newEntry[key]);
                if (amount === null) {
                    setError(`${label} must be a whole number of zero or more`);
                    return;
                }
                amounts[key] = amount;
            }

            if (CURRENCIES.every(({key}) => amounts[key] === 0)) {
                setError('At least one currency amount greater than zero is required');
                return;
            }

            const entry: Record<string, unknown> = {
                sessionDate: newEntry.sessionDate ?? new Date(),
                transactionType: newEntry.transactionType,
                ...amounts,
                notes: newEntry.notes
            };

            // Only a DM may attribute a transaction to a chosen character. For
            // players the server forces their own active character, so we don't
            // send a character_id at all.
            if (isDM && newEntry.characterId) {
                entry.character_id = parseInt(newEntry.characterId, 10);
            }

            await api.post('/gold', {goldEntries: [entry]});

            // Success! Clear form and refresh
            setSuccess('Gold entry created successfully!');
            setNewEntry(createEmptyEntry());

            refreshAfterChange();
            // Also refresh ledger data if new entry affects character balances
            if (newEntry.transactionType === 'Party Payment' || newEntry.transactionType === 'Party Payback') {
                fetchLedgerData();
            }
        } catch (error) {
            setError(getErrorMessage(error, 'Failed to create gold entry.'));
        }
    };

    // Function to fetch character loot ledger data
    const fetchLedgerData = async (): Promise<void> => {
        try {
            setLedgerLoading(true);
            setError(null); // Clear any previous errors
            const response = await lootService.getCharacterLedger();
            const rows: LedgerRow[] | undefined = response.data?.ledger;

            if (!Array.isArray(rows)) {
                setLedgerData([]);
                setError('Received invalid data format from server. Please contact support if this issue persists.');
                return;
            }

            const normalised: LedgerEntry[] = rows
                .filter((row) => row && typeof row === 'object') // Filter out null/invalid rows
                .map((row) => ({
                    character: row.character || 'Unknown Character',
                    active: Boolean(row.active),
                    lootValue: Number(row.lootValue) || 0,
                    payments: Number(row.payments) || 0,
                    withdrawn: Number(row.withdrawn) || 0
                }))
                // Active characters first, then by name
                .sort((a, b) => {
                    if (a.active !== b.active) return Number(b.active) - Number(a.active);
                    return a.character.localeCompare(b.character);
                });

            setLedgerData(normalised);
        } catch {
            setError('Failed to load ledger data. Please check your connection and try again.');
            setLedgerData([]); // Ensure we have empty data on error
        } finally {
            setLedgerLoading(false);
        }
    };

    const renderDateFilter = (label: string, value: Date, onChange: (date: Date) => void) => (
        <DatePicker
            label={label}
            value={value}
            onChange={(date: Date | null) => {
                // The picker reports null while the field is cleared or incomplete
                if (date) onChange(date);
            }}
            slotProps={{
                textField: { fullWidth: true }
            }}
        />
    );

    return (
        <Container maxWidth={false} component="main">
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {success && <Alert severity="success" sx={{mb: 2}}>{success}</Alert>}
            <Paper sx={{p: { xs: 1, md: 2 }, mb: 2}}>
                <Box sx={{borderBottom: 1, borderColor: 'divider', mb: 2}}>
                    <Tabs value={activeTab} onChange={(_, value: number) => setActiveTab(value)} aria-label="gold management tabs">
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
                                {CURRENCIES.map(({key, label, color}) => (
                                    <Grid key={key} size={{xs: 12, sm: 6, md: 3}}>
                                        <Paper sx={{
                                            p: 2,
                                            textAlign: 'center',
                                            bgcolor: 'background.default',
                                            borderLeft: `5px solid ${color}`
                                        }}>
                                            <Typography variant="subtitle2" sx={{
                                                color: "text.secondary"
                                            }}>{label}</Typography>
                                            <Typography variant="h4" sx={{color}}>{overviewTotals[key]}</Typography>
                                        </Paper>
                                    </Grid>
                                ))}
                            </Grid>
                            <Paper sx={{p: 3, mt: 3, textAlign: 'center', bgcolor: 'background.default'}}>
                                <Typography variant="subtitle1" sx={{
                                    color: "text.secondary"
                                }}>Total Value (in
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
                                    <Button variant="outlined" color="primary" onClick={() => setActiveTab(1)} fullWidth>
                                        Add New Transaction
                                    </Button>
                                </Grid>
                                <Grid size={{xs: 12, sm: 4}}>
                                    <Button variant="outlined" color="secondary" onClick={() => setActiveTab(3)} fullWidth>
                                        Manage Gold
                                    </Button>
                                </Grid>
                                <Grid size={{xs: 12, sm: 4}}>
                                    <Button variant="outlined" onClick={() => setActiveTab(2)} fullWidth>
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
                            <form onSubmit={handleSubmitEntry} noValidate>
                                <Grid container spacing={3}>
                                    <Grid size={{xs: 12, md: 4}}>
                                        <LocalizationProvider dateAdapter={AdapterDateFns}>
                                            <DatePicker
                                                label="Session Date"
                                                value={newEntry.sessionDate}
                                                onChange={(date) => handleEntryChange('sessionDate', date)}
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
                                                {TRANSACTION_TYPES.map((type) => (
                                                    <MenuItem key={type} value={type}>{type}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Grid>

                                    {isDM ? (
                                        <Grid size={{xs: 12}}>
                                            <FormControl fullWidth>
                                                <InputLabel>Character (optional)</InputLabel>
                                                <Select
                                                    value={newEntry.characterId}
                                                    onChange={(e) => handleEntryChange('characterId', e.target.value)}
                                                    label="Character (optional)"
                                                >
                                                    <MenuItem value="">
                                                        <em>None (party / unattributed)</em>
                                                    </MenuItem>
                                                    {characters.map((c) => (
                                                        <MenuItem key={c.id} value={String(c.id)}>
                                                            {c.name}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                                <FormHelperText>
                                                    Attribute this transaction to a character (e.g. a withdrawal). Leave as None for party-level transactions.
                                                </FormHelperText>
                                            </FormControl>
                                        </Grid>
                                    ) : (
                                        <Grid size={{xs: 12}}>
                                            <Typography variant="body2" sx={{
                                                color: "text.secondary"
                                            }}>
                                                This transaction will be recorded under your active character.
                                            </Typography>
                                        </Grid>
                                    )}

                                    <Grid size={12}>
                                        <Typography variant="subtitle1" gutterBottom>Amount</Typography>
                                    </Grid>

                                    {CURRENCIES.map(({key, label}) => (
                                        <Grid key={key} size={{xs: 12, sm: 6, md: 3}}>
                                            <TextField
                                                label={label}
                                                type="number"
                                                fullWidth
                                                slotProps={{ htmlInput: {min: 0, step: 1} }}
                                                value={newEntry[key]}
                                                onChange={(e) => handleEntryChange(key, e.target.value)}
                                            />
                                        </Grid>
                                    ))}
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
                                        <Button type="submit" variant="outlined" color="primary" size="large">
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
                                        {renderDateFilter('Start Date', startDate, setStartDate)}
                                    </Grid>
                                    <Grid size={{xs: 12, sm: 4}}>
                                        {renderDateFilter('End Date', endDate, setEndDate)}
                                    </Grid>
                                    <Grid size={{xs: 12, sm: 4}}>
                                        <Button variant="outlined" color="primary" onClick={fetchGoldEntries} fullWidth>
                                            Apply Filter
                                        </Button>
                                    </Grid>
                                </Grid>
                            </LocalizationProvider>
                            <Box sx={{mt: 2}}>
                                {QUICK_FILTERS.map(({label, months}) => (
                                    <Button
                                        key={label}
                                        variant="outlined"
                                        onClick={() => handleQuickFilter(months)}
                                        sx={{mr: 1, mb: 1}}
                                    >
                                        {label}
                                    </Button>
                                ))}
                            </Box>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Transaction History</Typography>
                            {historyTruncated && (
                                <Alert severity="info" sx={{mb: 2}}>
                                    Only the newest {HISTORY_PAGE_SIZE * HISTORY_MAX_PAGES} transactions are shown.
                                    Narrow the date range to see older ones.
                                </Alert>
                            )}
                            <TableContainer sx={{ WebkitOverflowScrolling: 'touch' }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Date</TableCell>
                                            <TableCell>Type</TableCell>
                                            <TableCell align="right">PP</TableCell>
                                            <TableCell align="right">GP</TableCell>
                                            <TableCell align="right">SP</TableCell>
                                            <TableCell align="right">CP</TableCell>
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
                                        <Button variant="outlined" color="primary" onClick={handleDistributeAll} fullWidth>
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
                                        <Button variant="outlined" color="primary" onClick={handleDistributePlusPartyLoot} fullWidth>
                                            Distribute + Party Loot
                                        </Button>
                                    </Paper>
                                </Grid>

                                {isDM && (
                                    <Grid size={{xs: 12, md: 4}}>
                                        <Paper sx={{p: 3, textAlign: 'center', height: '100%'}}>
                                            <Typography variant="subtitle1" gutterBottom>Balance Currency</Typography>
                                            <Typography variant="body2" sx={{mb: 2}}>
                                                Convert smaller denominations to larger ones.
                                            </Typography>
                                            <Button variant="outlined" color="primary" onClick={handleBalance} fullWidth>
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
                            <Typography variant="body2" sx={{ mb: 2 }}>
                                This table shows the value of items kept by each character, payments made to them,
                                and gold withdrawn (including distributions). The balance column shows the
                                difference between loot value and payments.
                            </Typography>

                            {ledgerLoading ? (
                                <TableSkeleton rows={5} columns={6} />
                            ) : (
                                <TableContainer component={Paper}>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Character</TableCell>
                                                <TableCell align="right">Value of Loot</TableCell>
                                                <TableCell align="right">Payments</TableCell>
                                                <TableCell align="right">Gold Withdrawn</TableCell>
                                                <TableCell align="right">Balance</TableCell>
                                                <TableCell align="center">Status</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {processedLedgerData.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} align="center">No ledger data
                                                        available</TableCell>
                                                </TableRow>
                                            ) : (
                                                processedLedgerData.map((row) => (
                                                    <TableRow
                                                        key={row.character}
                                                        sx={{
                                                            bgcolor: row.active ? 'rgba(144, 202, 249, 0.1)' : 'inherit',
                                                            fontWeight: row.active ? 'bold' : 'normal'
                                                        }}
                                                    >
                                                        <TableCell
                                                            component="th"
                                                            scope="row"
                                                            title={row.character} // Show full name on hover
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
                                                        <TableCell align="right">
                                                            {formatCurrency(row.withdrawn)}
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
                                                             row.isUnderpaid ? 'Underpaid' : 'Balanced'}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}

                            <Box
                                sx={{
                                    mt: 3,
                                    display: "flex",
                                    justifyContent: "center"
                                }}>
                                <Button variant="outlined" color="primary" onClick={fetchLedgerData} disabled={ledgerLoading}>
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
