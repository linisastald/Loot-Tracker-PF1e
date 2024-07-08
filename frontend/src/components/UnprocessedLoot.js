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
  TableSortLabel,
  TextField,
  MenuItem,
  Grid,
} from '@mui/material';

const itemTypes = ['Weapon', 'Armor', 'Magic', 'Gear', 'Trade Good', 'Other'];

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState([]);
  const [selected, setSelected] = useState([]);
  const [order, setOrder] = useState('asc');
  const [orderBy, setOrderBy] = useState('name');
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

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const filteredLoot = loot.filter(item => {
    return (
      (unidentifiedFilter === '' || item.unidentified === (unidentifiedFilter === 'true')) &&
      (typeFilter === '' || item.type === typeFilter)
    );
  });

  const sortedLoot = filteredLoot.sort((a, b) => {
    if (orderBy === 'unidentified') {
      return order === 'asc'
        ? (a.unidentified === b.unidentified ? 0 : a.unidentified ? -1 : 1)
        : (a.unidentified === b.unidentified ? 0 : a.unidentified ? 1 : -1);
    }
    if (a[orderBy] < b[orderBy]) {
      return order === 'asc' ? -1 : 1;
    }
    if (a[orderBy] > b[orderBy]) {
      return order === 'asc' ? 1 : -1;
    }
    return 0;
  });

  return (
    <Container component="main">
      <Paper sx={{ p: 2 }}>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6} sm={6}>
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
          <Grid item xs={6} sm={6}>
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
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selected.length === loot.length}
                    onChange={() => setSelected(selected.length === loot.length ? [] : loot.map((item) => item.id))}
                  />
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'quantity'}
                    direction={orderBy === 'quantity' ? order : 'asc'}
                    onClick={() => handleRequestSort('quantity')}
                  >
                    Quantity
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'name'}
                    direction={orderBy === 'name' ? order : 'asc'}
                    onClick={() => handleRequestSort('name')}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'unidentified'}
                    direction={orderBy === 'unidentified' ? order : 'asc'}
                    onClick={() => handleRequestSort('unidentified')}
                  >
                    Unidentified
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'type'}
                    direction={orderBy === 'type' ? order : 'asc'}
                    onClick={() => handleRequestSort('type')}
                  >
                    Type
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'size'}
                    direction={orderBy === 'size' ? order : 'asc'}
                    onClick={() => handleRequestSort('size')}
                  >
                    Size
                  </TableSortLabel>
                </TableCell>
                <TableCell>Believed Value</TableCell>
                <TableCell>Average Appraisal</TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'status'}
                    direction={orderBy === 'status' ? order : 'asc'}
                    onClick={() => handleRequestSort('status')}
                  >
                    Pending Sale
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedLoot.map((item) => (
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
          onClick={() => console.log('Sell selected items')}
        >
          Sell
        </Button>
        <Button
          variant="contained"
          color="secondary"
          sx={{ mt: 2, ml: 2 }}
          onClick={() => console.log('Trash selected items')}
        >
          Trash
        </Button>
        <Button
          variant="contained"
          sx={{ mt: 2, ml: 2 }}
          onClick={() => console.log('Keep selected items for self')}
        >
          Keep Self
        </Button>
        <Button
          variant="contained"
          color="success"
          sx={{ mt: 2, ml: 2 }}
          onClick={() => console.log('Keep selected items for party')}
        >
          Keep Party
        </Button>
      </Paper>
    </Container>
  );
};

export default UnprocessedLoot;
