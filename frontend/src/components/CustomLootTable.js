// /frontend/src/components/CustomLootTable.js
import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Checkbox, FormControl, InputLabel, Select, MenuItem, Grid, TextField } from '@mui/material';
import { formatDate } from '../utils/utils';

const CustomLootTable = ({ loot, selectedItems, handleSelectItem, hiddenColumns = [] }) => {
  const [filters, setFilters] = useState({
    unidentified: '',
    masterwork: '',
    type: '',
    size: '',
    pending_sale: '',
    who_has: '',
  });

  const columns = [
    { id: 'select', label: 'Select' },
    { id: 'session_date', label: 'Session Date' },
    { id: 'quantity', label: 'Quantity' },
    { id: 'name', label: 'Name' },
    { id: 'unidentified', label: 'Unidentified' },
    { id: 'masterwork', label: 'Masterwork', render: (value) => (value ? '✔' : '') },
    { id: 'type', label: 'Type' },
    { id: 'size', label: 'Size' },
    { id: 'pending_sale', label: 'Pending Sale' },
    { id: 'charges', label: 'Charges' },
    { id: 'who_has', label: 'Who Has?' },
    { id: 'last_update', label: 'Last Update', render: (value) => formatDate(value) },
    { id: 'notes', label: 'Notes' },
  ];

  const visibleColumns = columns.filter(column => !hiddenColumns.includes(column.id));

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prevFilters => ({
      ...prevFilters,
      [name]: value,
    }));
  };

  const filteredLoot = loot.filter(item => {
    return (
      (filters.unidentified ? item.unidentified === (filters.unidentified === 'true') : true) &&
      (filters.masterwork ? item.masterwork === (filters.masterwork === 'true') : true) &&
      (filters.type ? item.type === filters.type : true) &&
      (filters.size ? item.size === filters.size : true) &&
      (filters.pending_sale ? item.pending_sale === (filters.pending_sale === 'true') : true) &&
      (filters.who_has ? item.who_has === filters.who_has : true)
    );
  });

  return (
    <>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel>Unidentified</InputLabel>
            <Select
              name="unidentified"
              value={filters.unidentified}
              onChange={handleFilterChange}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Yes</MenuItem>
              <MenuItem value="false">No</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel>Masterwork</InputLabel>
            <Select
              name="masterwork"
              value={filters.masterwork}
              onChange={handleFilterChange}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Yes</MenuItem>
              <MenuItem value="false">No</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
            <Select
              name="type"
              value={filters.type}
              onChange={handleFilterChange}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="Weapon">Weapon</MenuItem>
              <MenuItem value="Armor">Armor</MenuItem>
              <MenuItem value="Magic">Magic</MenuItem>
              <MenuItem value="Gear">Gear</MenuItem>
              <MenuItem value="Trade Good">Trade Good</MenuItem>
              <MenuItem value="Other">Other</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel>Size</InputLabel>
            <Select
              name="size"
              value={filters.size}
              onChange={handleFilterChange}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="Fine">Fine</MenuItem>
              <MenuItem value="Diminutive">Diminutive</MenuItem>
              <MenuItem value="Tiny">Tiny</MenuItem>
              <MenuItem value="Small">Small</MenuItem>
              <MenuItem value="Medium">Medium</MenuItem>
              <MenuItem value="Large">Large</MenuItem>
              <MenuItem value="Huge">Huge</MenuItem>
              <MenuItem value="Gargantuan">Gargantuan</MenuItem>
              <MenuItem value="Colossal">Colossal</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel>Pending Sale</InputLabel>
            <Select
              name="pending_sale"
              value={filters.pending_sale}
              onChange={handleFilterChange}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Yes</MenuItem>
              <MenuItem value="false">No</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            label="Who Has?"
            name="who_has"
            value={filters.who_has}
            onChange={handleFilterChange}
            fullWidth
          />
        </Grid>
      </Grid>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              {visibleColumns.map(column => (
                <TableCell key={column.id}>{column.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredLoot.map(item => (
              <TableRow key={item.id}>
                {visibleColumns.map(column => (
                  <TableCell key={column.id}>
                    {column.id === 'select' ? (
                      <Checkbox
                        checked={selectedItems.includes(item.id)}
                        onChange={() => handleSelectItem(item.id)}
                      />
                    ) : column.render ? (
                      column.render(item[column.id])
                    ) : (
                      item[column.id] || ''
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

export default CustomLootTable;
