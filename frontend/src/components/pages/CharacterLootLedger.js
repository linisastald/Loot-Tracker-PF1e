import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  Container,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
} from '@mui/material';

// Helper function to safely convert to number
const safeNumber = (value) => {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

const CharacterLootLedger = () => {
  const [ledgerData, setLedgerData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLedgerData();
  }, []);

  const fetchLedgerData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/loot/character-ledger');
      console.log('API response:', response.data); // Log the raw API response
      if (!response.data.characters || !Array.isArray(response.data.characters)) {
        throw new Error('Invalid response format: characters array not found');
      }
      const activeCharacterData = response.data.characters
        .filter(character => character.active)
        .map(character => ({
          ...character,
          lootvalue: safeNumber(character.lootvalue),
          payments: safeNumber(character.payments),
        }));
      console.log('Processed data:', activeCharacterData); // Log the processed data
      setLedgerData(activeCharacterData);
    } catch (error) {
      console.error('Error fetching ledger data:', error);
      setError('Failed to load ledger data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth={false} component="main">
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth={false} component="main">
        <Typography color="error">{error}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Character Loot Ledger</Typography>
      </Paper>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Character</TableCell>
              <TableCell align="right">Value of Loot</TableCell>
              <TableCell align="right">Payments</TableCell>
              <TableCell align="right">Balance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ledgerData.map((row) => (
              <TableRow key={row.character}>
                <TableCell component="th" scope="row">
                  {row.character}
                </TableCell>
                <TableCell align="right">{row.lootvalue.toFixed(2)}</TableCell>
                <TableCell align="right">{row.payments.toFixed(2)}</TableCell>
                <TableCell align="right">{(row.lootvalue - row.payments).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
};

export default CharacterLootLedger;