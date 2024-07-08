import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Grid,
} from '@mui/material';

const GoldTransactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [totals, setTotals] = useState({
    copper: 0,
    silver: 0,
    gold: 0,
    platinum: 0,
    totalValue: 0,
  });

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('http://192.168.0.64:5000/api/gold', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setTransactions(response.data);
        calculateTotals(response.data);
      } catch (error) {
        console.error('Error fetching transactions', error);
      }
    };

    fetchTransactions();
  }, []);

  const calculateTotals = (transactions) => {
    const totals = transactions.reduce(
      (acc, transaction) => {
        acc.copper += transaction.copper || 0;
        acc.silver += transaction.silver || 0;
        acc.gold += transaction.gold || 0;
        acc.platinum += transaction.platinum || 0;
        acc.totalValue += (transaction.platinum * 10) + transaction.gold + (transaction.silver / 10) + (transaction.copper / 100);
        return acc;
      },
      { copper: 0, silver: 0, gold: 0, platinum: 0, totalValue: 0 }
    );
    setTotals(totals);
  };

  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Total Party Gold</Typography>
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <Typography variant="body1">Copper: {totals.copper}</Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="body1">Silver: {totals.silver}</Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="body1">Gold: {totals.gold}</Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="body1">Platinum: {totals.platinum}</Typography>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="h6">Total Value: {totals.totalValue.toFixed(2)}</Typography>
          </Grid>
        </Grid>
      </Paper>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Session Date</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell>Total</TableCell>
              <TableCell>Platinum</TableCell>
              <TableCell>Gold</TableCell>
              <TableCell>Silver</TableCell>
              <TableCell>Copper</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {transactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell>{formatDate(transaction.session_date)}</TableCell>
                <TableCell>{transaction.transaction_type}</TableCell>
                <TableCell>{transaction.notes}</TableCell>
                <TableCell>{((transaction.platinum * 10) + transaction.gold + (transaction.silver / 10) + (transaction.copper / 100)).toFixed(2)}</TableCell>
                <TableCell>{transaction.platinum}</TableCell>
                <TableCell>{transaction.gold}</TableCell>
                <TableCell>{transaction.silver}</TableCell>
                <TableCell>{transaction.copper}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
};

export default GoldTransactions;
