import React, { useState, useEffect } from 'react';
import {
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Checkbox,
  IconButton,
  Collapse,
  TableSortLabel,
  Tooltip,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Button,
  Menu,
} from '@mui/material';
import { KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';
import { formatDate } from '../utils/utils'; // Adjust the path as necessary
import { styled } from '@mui/system';
import axios from 'axios';

const SubItemTableRow = styled(TableRow)(({ theme }) => ({
  backgroundColor: theme.palette.action.hover,
  '& .MuiTableCell-root': {
    padding: '4px', // Adjust padding to make the rows thinner
  },
}));

const CustomLootTable = ({
  loot,
  individualLoot,
  selectedItems,
  setSelectedItems,
  openItems,
  setOpenItems,
  handleSelectItem,
  handleSort,
  sortConfig,
  showColumns = {
    select: true,
    unidentified: true,
    pendingSale: true,
    whoHasIt: true, // Ensure the whoHasIt column is included by default
  },
  filters,
  setFilters,
  handleFilterChange,
}) => {
  const [whoHasFilterMenuOpen, setWhoHasFilterMenuOpen] = useState(false);
  const [whoHasFilters, setWhoHasFilters] = useState([]);
  const [characters, setCharacters] = useState([]);

  useEffect(() => {
    fetchCharacters();
  }, []);

  const fetchCharacters = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://192.168.0.64:5000/api/active-characters', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCharacters(response.data);
      setWhoHasFilters(response.data.map(character => ({ id: character.id, name: character.name, checked: false })));
    } catch (error) {
      console.error('Error fetching characters:', error);
    }
  };

  const handleWhoHasFilterChange = (id) => {
    setWhoHasFilters((prevFilters) =>
      prevFilters.map((filter) =>
        filter.id === id ? { ...filter, checked: !filter.checked } : filter
      )
    );
  };

  const renderWhoHasFilter = () => (
    <Button
      variant="contained"
      onClick={() => setWhoHasFilterMenuOpen(true)}
      sx={{ mb: 2 }}
    >
      Who Has Filters
    </Button>
  );

  const whoHasFilterMenu = (
    <Menu
      open={whoHasFilterMenuOpen}
      onClose={() => setWhoHasFilterMenuOpen(false)}
    >
      {whoHasFilters.map((filter) => (
        <MenuItem key={filter.id}>
          <Checkbox
            checked={filter.checked}
            onChange={() => handleWhoHasFilterChange(filter.id)}
          />
          {filter.name}
        </MenuItem>
      ))}
    </Menu>
  );

  const handleToggleOpen = (name) => {
    setOpenItems((prevOpenItems) => ({
      ...prevOpenItems,
      [name]: !prevOpenItems[name],
    }));
  };

  const getIndividualItems = (name) => {
    return individualLoot.filter((item) => item.name === name);
  };

  const renderFilter = (filter) => {
    switch (filter) {
      case 'unidentified':
        return (
          <Grid item xs={3} key={filter}>
            <FormControl fullWidth>
              <InputLabel>Unidentified</InputLabel>
              <Select
                name="unidentified"
                value={filters.unidentified || ''}
                onChange={(e) => handleFilterChange(e, setFilters)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="true">Unidentified</MenuItem>
                <MenuItem value="false">Identified</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        );
      case 'type':
        return (
          <Grid item xs={3} key={filter}>
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                name="type"
                value={filters.type || ''}
                onChange={(e) => handleFilterChange(e, setFilters)}
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
        );
      case 'size':
        return (
          <Grid item xs={3} key={filter}>
            <FormControl fullWidth>
              <InputLabel>Size</InputLabel>
              <Select
                name="size"
                value={filters.size || ''}
                onChange={(e) => handleFilterChange(e, setFilters)}
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
                <MenuItem value="Unknown">Unknown</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        );
      case 'pendingSale':
        return (
          <Grid item xs={3} key={filter}>
            <FormControl fullWidth>
              <InputLabel>Pending Sale</InputLabel>
              <Select
                name="pendingSale"
                value={filters.pendingSale || ''}
                onChange={(e) => handleFilterChange(e, setFilters)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="true">Pending Sale</MenuItem>
                <MenuItem value="false">Not Pending Sale</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        );
      default:
        return null;
    }
  };

  const mainCellStyle = { padding: '16px' }; // Default padding for main rows
  const subCellStyle = { padding: '4px' }; // Smaller padding for sub-item rows

  // Apply filters to loot
  console.log('Applying filters to loot:', loot);
  const filteredLoot = loot.filter((item) => {
    const whoHasChecked = whoHasFilters.some(filter => filter.checked && item.whohas === filter.id);
    return (
      (filters.unidentified === '' || filters.unidentified === undefined || item.unidentified === (filters.unidentified === 'true')) &&
      (filters.type === '' || filters.type === undefined || item.type === filters.type) &&
      (filters.size === '' || filters.size === undefined || item.size === filters.size) &&
      (filters.pendingSale === '' || filters.pendingSale === undefined || item.status === (filters.pendingSale === 'true' ? 'Pending Sale' : '')) &&
      (whoHasFilters.every(filter => !filter.checked) || whoHasChecked)
    );
  });
  console.log('Filtered loot after applying filters:', filteredLoot);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6">Loot Table</Typography>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {filters && filters.map((filter) => renderFilter(filter))}
        {renderWhoHasFilter()}
        {whoHasFilterMenu}
      </Grid>
      <TableContainer component={Paper} sx={{ maxWidth: '100vw', overflowX: 'auto' }}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              {showColumns.select && <TableCell style={mainCellStyle}>Select</TableCell>}
              <TableCell style={mainCellStyle}>
                <TableSortLabel
                  active={sortConfig.key === 'quantity'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('quantity')}
                >
                  Quantity
                </TableSortLabel>
              </TableCell>
              <TableCell style={mainCellStyle}>
                <TableSortLabel
                  active={sortConfig.key === 'name'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('name')}
                >
                  Name
                </TableSortLabel>
              </TableCell>
              {showColumns.unidentified && (
                <TableCell style={mainCellStyle}>
                  <TableSortLabel
                    active={sortConfig.key === 'unidentified'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('unidentified')}
                  >
                    Unidentified
                  </TableSortLabel>
                </TableCell>
              )}
              <TableCell style={mainCellStyle}>
                <TableSortLabel
                  active={sortConfig.key === 'type'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('type')}
                >
                  Type
                </TableSortLabel>
              </TableCell>
              <TableCell style={mainCellStyle}>
                <TableSortLabel
                  active={sortConfig.key === 'size'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('size')}
                >
                  Size
                </TableSortLabel>
              </TableCell>
              {showColumns.whoHasIt && <TableCell style={mainCellStyle}>Who Has It?</TableCell>}
              <TableCell style={mainCellStyle}>Believed Value</TableCell>
              <TableCell style={mainCellStyle}>Average Appraisal</TableCell>
              {showColumns.pendingSale && (
                <TableCell style={mainCellStyle}>
                  <TableSortLabel
                    active={sortConfig.key === 'status'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('status')}
                  >
                    Pending Sale
                  </TableSortLabel>
                </TableCell>
              )}
              <TableCell style={mainCellStyle}>
                <TableSortLabel
                  active={sortConfig.key === 'session_date'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('session_date')}
                >
                  Session Date
                </TableSortLabel>
              </TableCell>
              <TableCell style={mainCellStyle}>Last Update</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredLoot.map((item) => {
              const individualItems = getIndividualItems(item.name);
              const totalQuantity = individualItems.reduce((sum, item) => sum + item.quantity, 0);

              return (
                <React.Fragment key={`${item.name}-${item.unidentified}-${item.type}-${item.size}`}>
                  <TableRow>
                    {showColumns.select && (
                      <TableCell style={mainCellStyle}>
                        <Checkbox
                          checked={individualItems.every((item) => selectedItems.includes(item.id))}
                          indeterminate={
                            individualItems.some((item) => selectedItems.includes(item.id)) &&
                            !individualItems.every((item) => selectedItems.includes(item.id))
                          }
                          onChange={() => individualItems.forEach((item) => handleSelectItem(item.id, setSelectedItems))}
                        />
                      </TableCell>
                    )}
                    <TableCell style={mainCellStyle}>{totalQuantity}</TableCell>
                    <TableCell style={mainCellStyle}>
                      {individualItems.length > 1 && (
                        <IconButton
                          aria-label="expand row"
                          size="small"
                          onClick={() => handleToggleOpen(item.name)}
                        >
                          {openItems[item.name] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                        </IconButton>
                      )}
                      <Tooltip title={item.notes || 'No notes'} arrow>
                        <span>{item.name}</span>
                      </Tooltip>
                    </TableCell>
                    {showColumns.unidentified && (
                      <TableCell style={mainCellStyle}>
                        {item.unidentified === null
                          ? ''
                          : item.unidentified
                          ? <strong>Unidentified</strong>
                          : 'Identified'}
                      </TableCell>
                    )}
                    <TableCell style={mainCellStyle}>{item.type}</TableCell>
                    <TableCell style={mainCellStyle}>{item.size}</TableCell>
                    {showColumns.whoHasIt && <TableCell style={mainCellStyle}>{item.character_name}</TableCell>}
                    <TableCell style={mainCellStyle}>{item.believedvalue || ''}</TableCell>
                    <TableCell style={mainCellStyle}>{item.average_appraisal || ''}</TableCell>
                    {showColumns.pendingSale && (
                      <TableCell style={mainCellStyle}>{item.status === 'Pending Sale' ? '✔' : ''}</TableCell>
                    )}
                    <TableCell style={mainCellStyle}>{item.session_date ? formatDate(item.session_date) : ''}</TableCell>
                    <TableCell style={mainCellStyle}>{item.lastupdate ? formatDate(item.lastupdate) : ''}</TableCell>
                  </TableRow>
                  {individualItems.length > 1 && (
                    <TableRow>
                      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={showColumns.unidentified ? 11 : 10}>
                        <Collapse in={openItems[item.name]} timeout="auto" unmountOnExit>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                {showColumns.select && <TableCell style={subCellStyle}>Select</TableCell>}
                                <TableCell style={subCellStyle}>Quantity</TableCell>
                                <TableCell style={subCellStyle}>Size</TableCell>
                                <TableCell style={subCellStyle}>Session Date</TableCell>
                                <TableCell style={subCellStyle}>Last Update</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {individualItems.map((subItem) => (
                                <SubItemTableRow key={subItem.id}>
                                  {showColumns.select && (
                                    <TableCell style={subCellStyle}>
                                      <Checkbox
                                        checked={selectedItems.includes(subItem.id)}
                                        onChange={() => handleSelectItem(subItem.id, setSelectedItems)}
                                      />
                                    </TableCell>
                                  )}
                                  <TableCell style={subCellStyle}>{subItem.quantity}</TableCell>
                                  <TableCell style={subCellStyle}>{subItem.size}</TableCell>
                                  <TableCell style={subCellStyle}>{subItem.session_date ? formatDate(subItem.session_date) : ''}</TableCell>
                                  <TableCell style={subCellStyle}>{subItem.lastupdate ? formatDate(subItem.lastupdate) : ''}</TableCell>
                                </SubItemTableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default CustomLootTable;
