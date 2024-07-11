import React, { useState, useEffect } from 'react';
import axios from 'axios';
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
} from '@mui/material';

const GoldTransactions = () => {
  const [goldEntries, setGoldEntries] = useState([]);
  const [error, setError] = useState(null);
  const [totals, setTotals] = useState({ platinum: 0, gold: 0, silver: 0, copper: 0 });

  useEffect(() => {
    fetchGoldEntries();
  }, []);

  const fetchGoldEntries = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://192.168.0.64:5000/api/gold', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGoldEntries(response.data);
      calculateTotals(response.data);
    } catch (error) {
      console.error('Error fetching gold entries:', error);
      setError('Failed to fetch gold entries.');
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
    setTotals(totals);
  };

  const handleDistributeAll = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://192.168.0.64:5000/api/gold/distribute-all', {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchGoldEntries(); // Refresh the gold entries after distribution
    } catch (error) {
      console.error('Error distributing gold:', error);
      setError('Failed to distribute gold.');
    }
  };

  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Gold Transactions</Typography>
      </Paper>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="body1">Total Platinum: {totals.platinum}</Typography>
        <Typography variant="body1">Total Gold: {totals.gold}</Typography>
        <Typography variant="body1">Total Silver: {totals.silver}</Typography>
        <Typography variant="body1">Total Copper: {totals.copper}</Typography>
      </Paper>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Button variant="contained" color="primary" onClick={handleDistributeAll}>
          Distribute All
        </Button>
        {error && <Typography color="error">{error}</Typography>}
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
