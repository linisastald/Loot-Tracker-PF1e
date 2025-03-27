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
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

const GoldTransactions = () => {
  const [goldEntries, setGoldEntries] = useState([]);
  const [error, setError] = useState(null);
  const [totals, setTotals] = useState({ platinum: 0, gold: 0, silver: 0, copper: 0, fullTotal: 0 });
  const [partyLootAmount, setPartyLootAmount] = useState(0);
  const [characterDistributeAmount, setCharacterDistributeAmount] = useState(0);
  const [openPartyLootDialog, setOpenPartyLootDialog] = useState(false);
  const [openCharacterDistributeDialog, setOpenCharacterDistributeDialog] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 6)));
  const [endDate, setEndDate] = useState(new Date());

  useEffect(() => {
    fetchGoldEntries();
    fetchUserRole();
  }, [startDate, endDate]);

  const fetchGoldEntries = async () => {
    try {
      const response = await api.get(`/gold`, {
        params: { startDate, endDate }
      });
      setGoldEntries(response.data);
      calculateTotals(response.data);
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
      setError('Failed to fetch user role.');
    }
  };

  const calculateTotals = (entries) => {
    const totals = entries.reduce(
      (acc, entry) => {
        acc.platinum += entry.platinum;
        acc.gold += entry.gold;
        acc.silver += entry.silver;
        acc.copper += entry.copper;
        return acc;
      },
      { platinum: 0, gold: 0, silver: 0, copper: 0 }
    );
    totals.fullTotal = (10 * totals.platinum) + totals.gold + (totals.silver / 10) + (totals.copper / 100);
    setTotals(totals);
  };

  const handleDistributeAll = async () => {
    try {
      await api.post(`/gold/distribute-all`, {});
      fetchGoldEntries(); // Refresh the gold entries after distribution
    } catch (error) {
      console.error('Error distributing gold:', error);
      setError('Failed to distribute gold.');
    }
  };

  const handleDistributePlusPartyLoot = async () => {
    try {
      await api.post(`/gold/distribute-plus-party-loot`, {});
      fetchGoldEntries(); // Refresh the gold entries after distribution
    } catch (error) {
      console.error('Error distributing gold plus party loot:', error);
      setError('Failed to distribute gold plus party loot.');
    }
  };

  const handleBalance = async () => {
    try {
      await api.post(`/gold/balance`, {});
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

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Gold Transactions</Typography>
      </Paper>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="body1"><strong>Total Platinum:</strong> {totals.platinum}</Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="body1"><strong>Total Gold:</strong> {totals.gold}</Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="body1"><strong>Total Silver:</strong> {totals.silver}</Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="body1"><strong>Total Copper:</strong> {totals.copper}</Typography>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="h6"><strong>Full Total (GP):</strong> {totals.fullTotal.toFixed(2)}</Typography>
          </Grid>
        </Grid>
      </Paper>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Button variant="contained" color="primary" onClick={handleDistributeAll} sx={{ mr: 2 }}>
          Distribute All
        </Button>
        <Button variant="contained" color="primary" onClick={handleDistributePlusPartyLoot} sx={{ mr: 2 }}>
          Distribute + Party Loot
        </Button>
        {userRole === 'DM' && (
          <Button variant="contained" color="primary" onClick={handleBalance}>
            Balance
          </Button>
        )}
        {error && <Typography color="error">{error}</Typography>}
      </Paper>
      <Paper sx={{ p: 2, mb: 2 }}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Grid container spacing={2} alignItems="center">
            <Grid item>
              <DatePicker
                label="Start Date"
                value={startDate}
                onChange={(date) => setStartDate(date)}
                renderInput={(params) => <TextField {...params} />}
              />
            </Grid>
            <Grid item>
              <DatePicker
                label="End Date"
                value={endDate}
                onChange={(date) => setEndDate(date)}
                renderInput={(params) => <TextField {...params} />}
              />
            </Grid>
            <Grid item>
              <Button variant="contained" color="primary" onClick={fetchGoldEntries}>Apply</Button>
            </Grid>
          </Grid>
        </LocalizationProvider>
        <Grid container spacing={2} sx={{ mt: 2 }}>
          <Grid item>
            <Button variant="contained" onClick={() => handleQuickFilter(1)}>Last Month</Button>
          </Grid>
          <Grid item>
            <Button variant="contained" onClick={() => handleQuickFilter(3)}>Last 3 Months</Button>
          </Grid>
          <Grid item>
            <Button variant="contained" onClick={() => handleQuickFilter(6)}>Last 6 Months</Button>
          </Grid>
          <Grid item>
            <Button variant="contained" onClick={() => handleQuickFilter(12)}>Last Year</Button>
          </Grid>
        </Grid>
      </Paper>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Session Date</TableCell>
              <TableCell>Transaction Type</TableCell>
              <TableCell>Platinum</TableCell>
              <TableCell>Gold</TableCell>
              <TableCell>Silver</TableCell>
              <TableCell>Copper</TableCell>
              <TableCell>Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {goldEntries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatDate(entry.session_date)}</TableCell>
                <TableCell>{entry.transaction_type}</TableCell>
                <TableCell>{entry.platinum}</TableCell>
                <TableCell>{entry.gold}</TableCell>
                <TableCell>{entry.silver}</TableCell>
                <TableCell>{entry.copper}</TableCell>
                <TableCell>{entry.notes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
};

export default GoldTransactions;