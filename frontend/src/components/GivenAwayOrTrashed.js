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
} from '@mui/material';

const GivenAwayOrTrashed = () => {
  const [loot, setLoot] = useState([]);

  useEffect(() => {
    const fetchLoot = async () => {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://192.168.0.64:5000/api/loot/trash', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLoot(response.data);
    };

    fetchLoot();
  }, []);

  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Given Away or Trashed</Typography>
      </Paper>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Quantity</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Believed Value</TableCell>
              <TableCell>Average Appraisal</TableCell>
              <TableCell>Trashed On</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loot.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.type}</TableCell>
                <TableCell>{item.size}</TableCell>
                <TableCell>{item.believedvalue || ''}</TableCell>
                <TableCell>{item.average_appraisal || ''}</TableCell>
                <TableCell>{formatDate(item.lastupdate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
};

export default GivenAwayOrTrashed;
