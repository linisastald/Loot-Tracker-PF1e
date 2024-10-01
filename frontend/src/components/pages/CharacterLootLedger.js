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
} from '@mui/material';

const CharacterLootLedger = () => {
  const [ledgerData, setLedgerData] = useState([]);

  useEffect(() => {
    fetchLedgerData();
  }, []);

  const fetchLedgerData = async () => {
    try {
      const response = await api.get('/loot/character-ledger');
      setLedgerData(response.data);
    } catch (error) {
      console.error('Error fetching ledger data:', error);
    }
  };

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
                <TableCell align="right">{parseFloat(row.lootvalue).toFixed(2)}</TableCell>
                <TableCell align="right">{parseFloat(row.payments).toFixed(2)}</TableCell>
                <TableCell align="right">{row.balance.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
};

export default CharacterLootLedger;