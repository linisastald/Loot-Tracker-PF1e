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
} from '@mui/material';

const GoldTransactions = () => {
  const [goldEntries, setGoldEntries] = useState([]);
  const [error, setError] = useState(null);

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
    } catch (error) {
      console.error('Error fetching gold entries:', error);
      setError('Failed to fetch gold entries.');
    }
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

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Gold Transactions</Typography>
        <Button variant="contained" color="primary" onClick={handleDistributeAll} sx={{ mt: 2 }}>
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
                <TableCell>{entry.session_date}</TableCell>
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
