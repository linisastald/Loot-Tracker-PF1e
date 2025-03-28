import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  Container,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Grid,
  TextField,
  Box,
  Tabs,
  Tab,
  Card,
  CardContent,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

// Tab Panel component
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`gold-tabpanel-${index}`}
      aria-labelledby={`gold-tab-${index}`}
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

function a11yProps(index) {
  return {
    id: `gold-tab-${index}`,
    'aria-controls': `gold-tabpanel-${index}`,
  };
}

const GoldTransactions = () => {
  const [goldEntries, setGoldEntries] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [totals, setTotals] = useState({ platinum: 0, gold: 0, silver: 0, copper: 0, fullTotal: 0 });
  const [userRole, setUserRole] = useState('');
  const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 6)));
  const [endDate, setEndDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState(0);
  const [ledgerData, setLedgerData] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // New gold entry form state
  const [newEntry, setNewEntry] = useState({
    sessionDate: new Date(),
    transactionType: 'Deposit',
    platinum: '',
    gold: '',
    silver: '',
    copper: '',
    notes: ''
  });

  useEffect(() => {
    fetchGoldEntries();
    fetchUserRole();

    // Fetch ledger data when the component mounts
    fetchLedgerData();
  }, [startDate, endDate]);

  const fetchGoldEntries = async () => {
    try {
      setError(null);
      const response = await api.get(`/gold`, {
        params: { startDate, endDate }
      });

      // Sort entries by complete session_date timestamp (not just the date part)
      const sortedEntries = [...response.data].sort((a, b) => {
        return new Date(b.session_date) - new Date(a.session_date);
      });

      setGoldEntries(sortedEntries);
      calculateTotals(sortedEntries);
    } catch (error) {
      console.error('Error fetching gold entries:', error);
      setError('Failed to fetch gold entries.');
    }
  };

  const fetchUserRole = async () => {
    try {
      const response = await api.get(`/auth/status`);
      if (response.data && response.data.user) {
        setUserRole(response.data.user.role);
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
    }
  };

  const calculateTotals = (entries) => {
    const totals = entries.reduce(
      (acc, entry) => {
        acc.platinum += Number(entry.platinum) || 0;
        acc.gold += Number(entry.gold) || 0;
        acc.silver += Number(entry.silver) || 0;
        acc.copper += Number(entry.copper) || 0;
        return acc;
      },
      { platinum: 0, gold: 0, silver: 0, copper: 0 }
    );

    // Calculate full total in gold pieces
    totals.fullTotal = (10 * totals.platinum) + totals.gold + (totals.silver / 10) + (totals.copper / 100);
    setTotals(totals);
  };

  const handleDistributeAll = async () => {
    try {
      setError(null);
      await api.post(`/gold/distribute-all`, {});
      setSuccess('Gold distributed successfully!');
      fetchGoldEntries(); // Refresh the gold entries after distribution
    } catch (error) {
      console.error('Error distributing gold:', error);
      setError('Failed to distribute gold.');
    }
  };

  const handleDistributePlusPartyLoot = async () => {
    try {
      setError(null);
      await api.post(`/gold/distribute-plus-party-loot`, {});
      setSuccess('Gold distributed with party loot successfully!');
      fetchGoldEntries(); // Refresh the gold entries after distribution
    } catch (error) {
      console.error('Error distributing gold plus party loot:', error);
      setError('Failed to distribute gold plus party loot.');
    }
  };

  const handleBalance = async () => {
    try {
      setError(null);
      await api.post(`/gold/balance`, {});
      setSuccess('Currency balanced successfully!');
      fetchGoldEntries(); // Refresh the gold entries after balancing
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

  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleEntryChange = (field, value) => {
    setNewEntry(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmitEntry = async (e) => {
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

      await api.post('/gold', { goldEntries: [entry] });

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

      fetchGoldEntries();
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
  const fetchLedgerData = async () => {
    try {
      setLedgerLoading(true);
      const response = await api.get('/loot/character-ledger');

      if (response.data && Array.isArray(response.data.characters)) {
        // Sort active characters first, then by name
        const sortedData = response.data.characters
          .sort((a, b) => {
            if (a.active !== b.active) return b.active - a.active;
            return a.character.localeCompare(b.character);
          });

        setLedgerData(sortedData);
      } else {
        console.error('Invalid ledger data format:', response.data);
        setLedgerData([]);
      }
    } catch (error) {
      console.error('Error fetching ledger data:', error);
      setError('Failed to load ledger data. Please try again later.');
    } finally {
      setLedgerLoading(false);
    }
  };

  return (
    <Container maxWidth={false} component="main">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Gold Transactions</Typography>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2, mt: 2 }}>
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
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Currency Summary</Typography>
              <Grid container spacing={3}>
                <Grid item xs={6} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.default' }}>
                    <Typography variant="subtitle2" color="text.secondary">Platinum</Typography>
                    <Typography variant="h4">{totals.platinum}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.default' }}>
                    <Typography variant="subtitle2" color="text.secondary">Gold</Typography>
                    <Typography variant="h4">{totals.gold}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.default' }}>
                    <Typography variant="subtitle2" color="text.secondary">Silver</Typography>
                    <Typography variant="h4">{totals.silver}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.default' }}>
                    <Typography variant="subtitle2" color="text.secondary">Copper</Typography>
                    <Typography variant="h4">{totals.copper}</Typography>
                  </Paper>
                </Grid>
              </Grid>
              <Paper sx={{ p: 3, mt: 3, textAlign: 'center', bgcolor: 'background.default' }}>
                <Typography variant="subtitle1" color="text.secondary">Total Value (in Gold)</Typography>
                <Typography variant="h3" color="primary">{totals.fullTotal.toFixed(2)} GP</Typography>
              </Paper>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Quick Actions</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Button variant="contained" color="primary" onClick={() => setActiveTab(1)} fullWidth>
                    Add New Transaction
                  </Button>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Button variant="contained" color="secondary" onClick={() => setActiveTab(3)} fullWidth>
                    Manage Gold
                  </Button>
                </Grid>
                <Grid item xs={12} sm={4}>
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
              <form onSubmit={handleSubmitEntry}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={4}>
                    <LocalizationProvider dateAdapter={AdapterDateFns}>
                      <DatePicker
                        label="Session Date"
                        value={newEntry.sessionDate}
                        onChange={(date) => handleEntryChange('sessionDate', date)}
                        renderInput={(params) => <TextField {...params} fullWidth />}
                      />
                    </LocalizationProvider>
                  </Grid>
                  <Grid item xs={12} md={8}>
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

                  <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom>Amount</Typography>
                  </Grid>

                  <Grid item xs={6} sm={3}>
                    <TextField
                      label="Platinum"
                      type="number"
                      fullWidth
                      inputProps={{ min: 0 }}
                      value={newEntry.platinum}
                      onChange={(e) => handleEntryChange('platinum', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      label="Gold"
                      type="number"
                      fullWidth
                      inputProps={{ min: 0 }}
                      value={newEntry.gold}
                      onChange={(e) => handleEntryChange('gold', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      label="Silver"
                      type="number"
                      fullWidth
                      inputProps={{ min: 0 }}
                      value={newEntry.silver}
                      onChange={(e) => handleEntryChange('silver', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      label="Copper"
                      type="number"
                      fullWidth
                      inputProps={{ min: 0 }}
                      value={newEntry.copper}
                      onChange={(e) => handleEntryChange('copper', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Notes"
                      fullWidth
                      multiline
                      rows={2}
                      value={newEntry.notes}
                      onChange={(e) => handleEntryChange('notes', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button type="submit" variant="contained" color="primary" size="large">
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
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Filter Transactions</Typography>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={4}>
                    <DatePicker
                      label="Start Date"
                      value={startDate}
                      onChange={(date) => setStartDate(date)}
                      renderInput={(params) => <TextField {...params} fullWidth />}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <DatePicker
                      label="End Date"
                      value={endDate}
                      onChange={(date) => setEndDate(date)}
                      renderInput={(params) => <TextField {...params} fullWidth />}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Button variant="contained" color="primary" onClick={fetchGoldEntries} fullWidth>
                      Apply Filter
                    </Button>
                  </Grid>
                </Grid>
              </LocalizationProvider>
              <Box sx={{ mt: 2 }}>
                <Button variant="outlined" onClick={() => handleQuickFilter(1)} sx={{ mr: 1, mb: 1 }}>
                  Last Month
                </Button>
                <Button variant="outlined" onClick={() => handleQuickFilter(3)} sx={{ mr: 1, mb: 1 }}>
                  Last 3 Months
                </Button>
                <Button variant="outlined" onClick={() => handleQuickFilter(6)} sx={{ mr: 1, mb: 1 }}>
                  Last 6 Months
                </Button>
                <Button variant="outlined" onClick={() => handleQuickFilter(12)} sx={{ mr: 1, mb: 1 }}>
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
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 3, textAlign: 'center', height: '100%' }}>
                    <Typography variant="subtitle1" gutterBottom>Equal Distribution</Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      Distribute all available gold equally among active characters.
                    </Typography>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleDistributeAll}
                      fullWidth
                    >
                      Distribute All
                    </Button>
                  </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 3, textAlign: 'center', height: '100%' }}>
                    <Typography variant="subtitle1" gutterBottom>Party Loot Share</Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      Distribute gold with one share reserved for party loot.
                    </Typography>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleDistributePlusPartyLoot}
                      fullWidth
                    >
                      Distribute + Party Loot
                    </Button>
                  </Paper>
                </Grid>

                {userRole === 'DM' && (
                  <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, textAlign: 'center', height: '100%' }}>
                      <Typography variant="subtitle1" gutterBottom>Balance Currency</Typography>
                      <Typography variant="body2" sx={{ mb: 2 }}>
                        Convert smaller denominations to larger ones.
                      </Typography>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={handleBalance}
                        fullWidth
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
                  <CircularProgress />
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
                      {ledgerData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} align="center">No ledger data available</TableCell>
                        </TableRow>
                      ) : (
                        ledgerData.map((row) => {
                          const balance = parseFloat(row.lootvalue) - parseFloat(row.payments);
                          const isOverpaid = balance < 0;
                          const isUnderpaid = balance > 0;

                          return (
                            <TableRow
                              key={row.character}
                              sx={{
                                bgcolor: row.active ? 'rgba(144, 202, 249, 0.1)' : 'inherit',
                                fontWeight: row.active ? 'bold' : 'normal'
                              }}
                            >
                              <TableCell component="th" scope="row">
                                {row.character} {row.active && '(Active)'}
                              </TableCell>
                              <TableCell align="right">{parseFloat(row.lootvalue).toFixed(2)}</TableCell>
                              <TableCell align="right">{parseFloat(row.payments).toFixed(2)}</TableCell>
                              <TableCell
                                align="right"
                                sx={{
                                  color: isOverpaid ? 'error.main' : isUnderpaid ? 'warning.main' : 'inherit',
                                  fontWeight: (isOverpaid || isUnderpaid) ? 'bold' : 'normal'
                                }}
                              >
                                {balance.toFixed(2)}
                              </TableCell>
                              <TableCell align="center">
                                {isOverpaid ? 'Overpaid' : isUnderpaid ? 'Underpaid' : 'Balanced'}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              <Box mt={3} display="flex" justifyContent="center">
                <Button
                  variant="contained"
                  color="primary"
                  onClick={fetchLedgerData}
                  disabled={ledgerLoading}
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

export default GoldTransactions;