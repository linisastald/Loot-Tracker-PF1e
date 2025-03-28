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
  CardHeader,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  IconButton,
  Collapse
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

const GoldTransactions = () => {
  const [goldEntries, setGoldEntries] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [totals, setTotals] = useState({ platinum: 0, gold: 0, silver: 0, copper: 0, fullTotal: 0 });
  const [userRole, setUserRole] = useState('');
  const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 6)));
  const [endDate, setEndDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState(0);
  const [entryFormOpen, setEntryFormOpen] = useState(false);

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
    } catch (error) {
      console.error('Error creating gold entry:', error);
      setError('Failed to create gold entry.');
    }
  };

  return (
    <Container maxWidth={false} component="main">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Grid container spacing={2}>
        {/* Summary Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Currency Summary" />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="subtitle2">Platinum</Typography>
                  <Typography variant="h6">{totals.platinum}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="subtitle2">Gold</Typography>
                  <Typography variant="h6">{totals.gold}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="subtitle2">Silver</Typography>
                  <Typography variant="h6">{totals.silver}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="subtitle2">Copper</Typography>
                  <Typography variant="h6">{totals.copper}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2">Total Value (in Gold)</Typography>
                  <Typography variant="h5">{totals.fullTotal.toFixed(2)} GP</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Actions Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Currency Actions" />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleDistributeAll}
                    fullWidth
                  >
                    Distribute All
                  </Button>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleDistributePlusPartyLoot}
                    fullWidth
                  >
                    Distribute + Party Loot
                  </Button>
                </Grid>
                {userRole === 'DM' && (
                  <Grid item xs={12} sm={4}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleBalance}
                      fullWidth
                    >
                      Balance Currencies
                    </Button>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* New Entry Form */}
      <Card sx={{ mt: 2 }}>
        <CardHeader
          title="Add New Gold Entry"
          action={
            <IconButton onClick={() => setEntryFormOpen(!entryFormOpen)}>
              {entryFormOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          }
        />
        <Collapse in={entryFormOpen}>
          <CardContent>
            <form onSubmit={handleSubmitEntry}>
              <Grid container spacing={2}>
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
                  <Button type="submit" variant="contained" color="primary">
                    Add Transaction
                  </Button>
                </Grid>
              </Grid>
            </form>
          </CardContent>
        </Collapse>
      </Card>

      {/* Filtering */}
      <Card sx={{ mt: 2 }}>
        <CardHeader title="Filter Transactions" />
        <CardContent>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={3}>
                <DatePicker
                  label="Start Date"
                  value={startDate}
                  onChange={(date) => setStartDate(date)}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <DatePicker
                  label="End Date"
                  value={endDate}
                  onChange={(date) => setEndDate(date)}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
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

      {/* Transactions Table */}
      <Card sx={{ mt: 2 }}>
        <CardHeader title="Transactions History" />
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
      </Card>
    </Container>
  );
};

export default GoldTransactions;