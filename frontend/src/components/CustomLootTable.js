import React from 'react';
import { TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Paper, Checkbox, IconButton, Collapse, TableSortLabel, Tooltip } from '@mui/material';
import { KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';
import { formatDate } from '../utils/utils'; // Adjust the path as necessary

const CustomLootTable = ({ loot, individualLoot, selectedItems, setSelectedItems, openItems, setOpenItems, handleSelectItem, handleSort, sortConfig }) => {
  const handleToggleOpen = (name) => {
    setOpenItems((prevOpenItems) => ({
      ...prevOpenItems,
      [name]: !prevOpenItems[name],
    }));
  };

  const getIndividualItems = (name) => {
    return individualLoot.filter((item) => item.name === name);
  };

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Select</TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.key === 'quantity'}
                direction={sortConfig.direction}
                onClick={() => handleSort('quantity')}
              >
                Quantity
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.key === 'name'}
                direction={sortConfig.direction}
                onClick={() => handleSort('name')}
              >
                Name
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.key === 'unidentified'}
                direction={sortConfig.direction}
                onClick={() => handleSort('unidentified')}
              >
                Unidentified
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.key === 'type'}
                direction={sortConfig.direction}
                onClick={() => handleSort('type')}
              >
                Type
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.key === 'size'}
                direction={sortConfig.direction}
                onClick={() => handleSort('size')}
              >
                Size
              </TableSortLabel>
            </TableCell>
            <TableCell>Believed Value</TableCell>
            <TableCell>Average Appraisal</TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.key === 'status'}
                direction={sortConfig.direction}
                onClick={() => handleSort('status')}
              >
                Pending Sale
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.k
