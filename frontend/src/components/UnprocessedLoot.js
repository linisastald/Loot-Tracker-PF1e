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
  Checkbox,
  Button,
  Paper,
  TextField,
  MenuItem,
  Grid,
} from '@mui/material';

const itemTypes = ['Weapon', 'Armor', 'Magic', 'Gear', 'Trade Good', 'Other'];

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState([]);
  const [selected, setSelected] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [unidentifiedFilter, setUnidentifiedFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    const fetchLoot = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('http://192.168.0.64:5000/api/loot', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setLoot(response.data);
      } catch (error) {
        console.error('Error fetching loot', error);
      }
    };

    fetchLoot();
  }, []);

  const handleSelect = (id) => {
    setSelected((prevSelected) =>
      prevSelected.includes(id)
        ? prevSelected.filter((item) => item !== id)
        : [...prevSelected, id]
    );
  };

  const filteredLoot = loot.filter(item => {
    return (
      (searchQuery === '' || item.name.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (unidentifiedFilter === '' || item.unidentified === (unidentifiedFilter === 'true')) &&
      (typeFilter === '' || item.type === typeFilter)
    );
  });

  return (
    <Container component="main">
      <Paper sx={{ p: 2 }}>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Search"
              variant="outlined"
              fullWidth
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField
              label="Unidentified"
              select
              variant="outlined"
              fullWidth
              value={unidentifiedFilter}
              onChange={(e) => setUnidentifiedFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Yes</MenuItem>
              <MenuItem value="false">No</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField
              label="Type"
              select
              variant="outlined"
              fullWidth
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {itemTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
        <TableContainer>
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
              {filteredLoot.map((item) => (
                <TableRow key={item.id} selected={selected.includes(item.id)} sx={{ height: '40px' }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.includes(item.id)}
                      onChange={() => handleSelect(item.id)}
                    />
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.unidentified ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>{item.size}</TableCell>
                  <TableCell></TableCell> {/* Believed Value - Blank for now */}
                  <TableCell></TableCell> {/* Average Appraisal - Blank for now */}
                  <TableCell>{item.status === 'Pending Sale' ? '✔️' : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Button
          variant="contained"
          color="primary"
          sx={{ mt: 2 }}
          onClick={() => console.log('Process selected items')}
        >
          Process Selected
        </Button>
      </Paper>
    </Container>
  );
};

export default UnprocessedLoot;
