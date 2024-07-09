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
  Checkbox,
  Button,
  Typography
} from '@mui/material';

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

  useEffect(() => {
    const fetchLoot = async () => {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://192.168.0.64:5000/api/loot', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLoot(response.data);
    };

    fetchLoot();
  }, []);

  const handleSelectItem = (id) => {
    setSelectedItems((prevSelectedItems) =>
      prevSelectedItems.includes(id)
        ? prevSelectedItems.filter((itemId) => itemId !== id)
        : [...prevSelectedItems, id]
    );
  };

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Unprocessed Loot</Typography>
      </Paper>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Select</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Unidentified</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Believed Value</TableCell>
              <TableCell>Average Appraisal</TableCell>
              <TableCell>Pending Sale</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loot.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedItems.includes(item.id)}
                    onChange={() => handleSelectItem(item.id)}
                  />
                </TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.unidentified ? 'Yes' : 'No'}</TableCell>
                <TableCell>{item.type}</TableCell>
                <TableCell>{item.size}</TableCell>
                <TableCell>{item.believed_value || ''}</TableCell>
                <TableCell>{item.average_appraisal || ''}</TableCell>
                <TableCell>{item.status === 'Pending Sale' ? '✔' : ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }}>
        Sell
      </Button>
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }}>
        Trash
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }}>
        Keep Self
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2 }}>
        Keep Party
      </Button>
    </Container>
  );
};

export default UnprocessedLoot;
