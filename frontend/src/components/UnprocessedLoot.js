import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Container,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Button,
  TableSortLabel,
} from '@mui/material';

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState([]);
  const [selected, setSelected] = useState([]);
  const [order, setOrder] = useState('asc');
  const [orderBy, setOrderBy] = useState('item_name');

  useEffect(() => {
    const fetchLoot = async () => {
      try {
        const response = await axios.get('http://192.168.0.64:5000/api/loot');
        setLoot(response.data);
      } catch (error) {
        console.error('Error fetching loot', error);
      }
    };

    fetchLoot();
  }, []);

  const handleSelect = (item) => {
    setSelected((prevSelected) =>
      prevSelected.includes(item.id)
        ? prevSelected.filter((id) => id !== item.id)
        : [...prevSelected, item.id]
    );
  };

  const handleSelectAll = () => {
    setSelected((prevSelected) =>
      prevSelected.length === loot.length ? [] : loot.map((item) => item.id)
    );
  };

  const isSelected = (id) => selected.includes(id);

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const sortedLoot = [...loot].sort((a, b) => {
    if (a[orderBy] < b[orderBy]) return order === 'asc' ? -1 : 1;
    if (a[orderBy] > b[orderBy]) return order === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <Container component="main">
      <Typography component="h1" variant="h5" sx={{ mt: 3 }}>
        Unprocessed Loot
      </Typography>
      <TableContainer component={Box} sx={{ mt: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selected.length > 0 && selected.length < loot.length}
                  checked={loot.length > 0 && selected.length === loot.length}
                  onChange={handleSelectAll}
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
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedLoot.map((item) => (
              <TableRow key={item.id} selected={isSelected(item.id)}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={isSelected(item.id)}
                    onChange={() => handleSelect(item)}
                  />
                </TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.item_name}</TableCell>
                <TableCell>{item.unidentified ? 'Yes' : 'No'}</TableCell>
                <TableCell>{item.type}</TableCell>
                <TableCell>{item.size}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button variant="contained" color="primary" sx={{ mr: 1 }}>
          Sell
        </Button>
        <Button variant="contained" color="secondary" sx={{ mr: 1 }}>
          Trash
        </Button>
        <Button variant="contained" color="primary" sx={{ mr: 1 }}>
          Keep Self
        </Button>
        <Button variant="contained" color="primary">
          Keep Party
        </Button>
      </Box>
    </Container>
  );
};

export default UnprocessedLoot;
