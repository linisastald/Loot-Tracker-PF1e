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
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';
import jwt_decode from 'jwt-decode';

const GoldTransactions = () => {
  const [goldEntries, setGoldEntries] = useState([]);
  const [error, setError] = useState(null);
  const [totals, setTotals] = useState({ platinum: 0, gold: 0, silver: 0, copper: 0, fullTotal: 0 });
  const [partyLootAmount, setPartyLootAmount] = useState(0);
  const [characterDistributeAmount, setCharacterDistributeAmount] = useState(0);
  const [openPartyLootDialog, setOpenPartyLootDialog] = useState(false);
  const [openCharacterDistributeDialog, setOpenCharacterDistributeDialog] = useState(false);
  const [userRole, setUserRole] = useState('');

  useEffect(() => {
    fetchGoldEntries();
    fetchUserRole();
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

  const fetchUserRole = async () => {
    try {
      const token = localStorage.getItem('token');
      const decodedToken = jwt_decode(token);
      const userId = decodedToken.id;
      const response = await axios.get(`http://192.168.0.64:5000/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUserRole(response.data.role);
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

  const handleDistributePlusPartyLoot = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://192.168.0.64:5000/api/gold/distribute-plus-party-loot', {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchGoldEntries(); // Refresh the gold entries after distribution
    } catch (error) {
      console.error('Error distributing gold plus party loot:', error);
      setError('Failed to distribute gold plus party loot.');
    }
  };

  const handleDefinePartyLootDistribute = async () => {
    if (partyLootAmount > totals.gold) {
      setError('Party loot amount cannot be greater than total gold.');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://192.168.0.64:5000/api/gold/define-party-loot-distribute', { partyLootAmount }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchGoldEntries(); // Refresh the gold entries after distribution
      setOpenPartyLootDialog(false);
    } catch (error) {
      console.error('Error defining party loot distribute:', error);
      setError('Failed to define party loot distribute.');
    }
  };

  const handleDefineCharacterDistribute = async () => {
    const totalDistributeAmount = characterDistributeAmount * activeCharacters.length;
    if (totalDistributeAmount > totals.gold) {
      setError('Not enough gold to distribute to each character.');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://192.168.0.64:5000/api/gold/define-character-distribute', { characterDistributeAmount }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchGoldEntries(); // Refresh the gold entries after distribution
      setOpenCharacterDistributeDialog(false);
    } catch (error) {
      console.error('Error defining character distribute:', error);
      setError('Failed to define character distribute.');
    }
  };

  const handleBalance = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://192.168.0.64:5000/api/gold/balance', {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchGoldEntries(); // Refresh the gold entries after balancing
    } catch (error) {
      console.error('Error balancing gold:', error);
      setError('Failed to balance gold.');
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
        <Button variant="contained" color="primary" onClick={() => setOpenPartyLootDialog(true)} sx={{ mr: 2 }}>
          Define Party Loot Distribute
        </Button>
        <Button variant="contained" color="primary" onClick={() => setOpenCharacterDistributeDialog(true)} sx={{ mr: 2 }}>
          Define Character Distribute
        </Button>
        {userRole === 'DM' && (
          <Button variant="contained" color="primary" onClick={handleBalance}>
            Balance
          </Button>
        )}
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

      {/* Define Party Loot Distribute Dialog */}
      <Dialog open={openPartyLootDialog} onClose={() => setOpenPartyLootDialog(false)}>
        <DialogTitle>Define Party Loot Distribute</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter the amount to leave in party loot:
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Party Loot Amount"
            type="number"
            fullWidth
            value={partyLootAmount}
            onChange={(e) => setPartyLootAmount(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenPartyLootDialog(false)}>Cancel</Button>
          <Button onClick={handleDefinePartyLootDistribute}>Distribute</Button>
        </DialogActions>
      </Dialog>

      {/* Define Character Distribute Dialog */}
      <Dialog open={openCharacterDistributeDialog} onClose={() => setOpenCharacterDistributeDialog(false)}>
        <DialogTitle>Define Character Distribute</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter the amount to give to each active character:
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Character Distribute Amount"
            type="number"
            fullWidth
            value={characterDistributeAmount}
            onChange={(e) => setCharacterDistributeAmount(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCharacterDistributeDialog(false)}>Cancel</Button>
          <Button onClick={handleDefineCharacterDistribute}>Distribute</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default GoldTransactions;
