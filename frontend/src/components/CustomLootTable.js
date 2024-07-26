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
  FormControlLabel,
  Switch,
  Button,
  Menu,
  MenuItem,
} from '@mui/material';
import { KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';
import { formatDate } from '../utils/utils'; // Adjust the path as necessary
import { styled } from '@mui/system';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL;

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
  sortConfig,
  setSortConfig,
  showColumns = {
    select: true,
    unidentified: true,
    pendingSale: true,
    whoHasIt: true, // Ensure the whoHasIt column is included by default
  },
  showFilters = {
    pendingSale: true,
    unidentified: true,
    type: true,
    size: true,
    whoHas: true,
  },
}) => {
  const [showPendingSales, setShowPendingSales] = useState(true); // New filter state
  const [showOnlyUnidentified, setShowOnlyUnidentified] = useState(false); // New filter state
  const [anchorElType, setAnchorElType] = useState(null); // State for the type filter menu
  const [anchorElSize, setAnchorElSize] = useState(null); // State for the size filter menu
  const [typeFilters, setTypeFilters] = useState({
    Weapon: true,
    Armor: true,
    Magic: true,
    Gear: true,
    'Trade Good': true,
    Other: true,
  });
  const [sizeFilters, setSizeFilters] = useState({
    Fine: true,
    Diminutive: true,
    Tiny: true,
    Small: true,
    Medium: true,
    Large: true,
    Huge: true,
    Gargantuan: true,
    Colossal: true,
    Unknown: true,
  });
  const [whoHasFilters, setWhoHasFilters] = useState([]);
  const [anchorElWhoHas, setAnchorElWhoHas] = useState(null); // State for the who has filter menu

  useEffect(() => {
    const fetchWhoHasFilters = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/user/active-characters`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const characters = response.data;
        const filters = characters.map((character) => ({
          name: character.name,
          checked: false,
        }));
        setWhoHasFilters(filters);
      } catch (error) {
        console.error('Error fetching characters:', error);
      }
    };

    fetchWhoHasFilters();
  }, []);

  const handleToggleOpen = (name, unidentified, masterwork, type, size) => {
    setOpenItems((prevOpenItems) => ({
      ...prevOpenItems,
      [`${name}-${unidentified}-${masterwork}-${type}-${size}`]: !prevOpenItems[`${name}-${unidentified}-${masterwork}-${type}-${size}`],
    }));
  };

  const getIndividualItems = (name, unidentified, masterwork, type, size) => {
    return individualLoot.filter(
      (item) =>
        item.name === name &&
        item.unidentified === unidentified &&
        item.masterwork === masterwork &&
        item.type === type &&
        item.size === size
    );
  };

  const handleTypeFilterChange = (type) => {
    setTypeFilters((prevFilters) => ({
      ...prevFilters,
      [type]: !prevFilters[type],
    }));
  };

  const handleSizeFilterChange = (size) => {
    setSizeFilters((prevFilters) => ({
      ...prevFilters,
      [size]: !prevFilters[size],
    }));
  };

  const handleWhoHasFilterChange = (name) => {
    setWhoHasFilters((prevFilters) =>
      prevFilters.map((filter) =>
        filter.name === name ? { ...filter, checked: !filter.checked } : filter
      )
    );
  };

  const handleTypeFilterMenuOpen = (event) => {
    setAnchorElType(event.currentTarget);
  };

  const handleSizeFilterMenuOpen = (event) => {
    setAnchorElSize(event.currentTarget);
  };

  const handleWhoHasFilterMenuOpen = (event) => {
    setAnchorElWhoHas(event.currentTarget);
  };

  const handleTypeFilterMenuClose = () => {
    setAnchorElType(null);
  };

  const handleSizeFilterMenuClose = () => {
    setAnchorElSize(null);
  };

  const handleWhoHasFilterMenuClose = () => {
    setAnchorElWhoHas(null);
  };

  const filteredLoot = loot.filter((item) => {
    const whoHasChecked = whoHasFilters.some((filter) => filter.checked && item.character_name === filter.name);
    return (
      (showPendingSales || item.status !== 'Pending Sale') &&
      (!showOnlyUnidentified || item.unidentified !== false) &&
      (typeFilters[item.type] || (typeFilters['Other'] && !item.type)) &&
      (sizeFilters[item.size] || (sizeFilters['Unknown'] && !item.size)) &&
      (whoHasFilters.every((filter) => !filter.checked) || whoHasChecked)
    );
  });

  // Add sorting logic
  const sortedLoot = [...filteredLoot].sort((a, b) => {
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const mainCellStyle = { padding: '16px' }; // Default padding for main rows
  const subCellStyle = { padding: '4px' }; // Smaller padding for sub-item rows

  const formatAverageAppraisal = (value) => {
    if (value === null || value === undefined) return '';
    const numValue = Number(value);
    if (Number.isInteger(numValue)) return numValue.toString();
    return numValue.toFixed(2).replace(/\.?0+$/, '');
  };
  console.log('Loot prop in CustomLootTable:', loot);
  console.log('IndividualLoot prop in CustomLootTable:', individualLoot);

  return (
    <Paper sx={{ p: 2 }}>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {showFilters.pendingSale && (
          <Grid item>
            <FormControlLabel
              control={<Switch checked={showPendingSales} onChange={() => setShowPendingSales(!showPendingSales)} />}
              label="Show Pending Sales"
            />
          </Grid>
        )}
        {showFilters.unidentified && (
          <Grid item>
            <FormControlLabel
              control={<Switch checked={showOnlyUnidentified} onChange={() => setShowOnlyUnidentified(!showOnlyUnidentified)} />}
              label="Show Only Unidentified"
            />
          </Grid>
        )}
        {showFilters.type && (
          <Grid item>
            <Button variant="contained" onClick={handleTypeFilterMenuOpen}>
              Type Filters
            </Button>
            <Menu
              anchorEl={anchorElType}
              open={Boolean(anchorElType)}
              onClose={handleTypeFilterMenuClose}
            >
              {Object.keys(typeFilters).map((type) => (
                <MenuItem key={type}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={typeFilters[type]}
                        onChange={() => handleTypeFilterChange(type)}
                      />
                    }
                    label={type}
                  />
                </MenuItem>
              ))}
            </Menu>
          </Grid>
        )}
        {showFilters.size && (
          <Grid item>
            <Button variant="contained" onClick={handleSizeFilterMenuOpen}>
              Size Filters
            </Button>
            <Menu
              anchorEl={anchorElSize}
              open={Boolean(anchorElSize)}
              onClose={handleSizeFilterMenuClose}
            >
              {Object.keys(sizeFilters).map((size) => (
                <MenuItem key={size}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={sizeFilters[size]}
                        onChange={() => handleSizeFilterChange(size)}
                      />
                    }
                    label={size}
                  />
                </MenuItem>
              ))}
            </Menu>
          </Grid>
        )}
        {showFilters.whoHas && (
          <Grid item>
            <Button variant="contained" onClick={handleWhoHasFilterMenuOpen}>
              Who Has Filters
            </Button>
            <Menu
              anchorEl={anchorElWhoHas}
              open={Boolean(anchorElWhoHas)}
              onClose={handleWhoHasFilterMenuClose}
            >
              {whoHasFilters.map((filter) => (
                <MenuItem key={filter.name}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={filter.checked}
                        onChange={() => handleWhoHasFilterChange(filter.name)}
                      />
                    }
                    label={filter.name}
                  />
                </MenuItem>
              ))}
            </Menu>
          </Grid>
        )}
      </Grid>
      <TableContainer component={Paper} sx={{ maxWidth: '100vw', overflowX: 'auto' }}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              {showColumns.select && <TableCell style={mainCellStyle}>Select</TableCell>}
              {showColumns.quantity && (
                <TableCell style={mainCellStyle}>
                  <TableSortLabel
                    active={sortConfig.key === 'quantity'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('quantity')}
                  >
                    Quantity
                  </TableSortLabel>
                </TableCell>
              )}
              {showColumns.name && (
                <TableCell style={mainCellStyle}>
                  <TableSortLabel
                    active={sortConfig.key === 'name'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('name')}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
              )}
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
              {showColumns.type && (
                <TableCell style={mainCellStyle}>
                  <TableSortLabel
                    active={sortConfig.key === 'type'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('type')}
                  >
                    Type
                  </TableSortLabel>
                </TableCell>
              )}
              {showColumns.size && (
                <TableCell style={mainCellStyle}>
                  <TableSortLabel
                    active={sortConfig.key === 'size'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('size')}
                  >
                    Size
                  </TableSortLabel>
                </TableCell>
              )}
              {showColumns.whoHasIt && <TableCell style={mainCellStyle}>Who Has It?</TableCell>}
              {showColumns.believedValue && <TableCell style={mainCellStyle}>Believed Value</TableCell>}
              {showColumns.averageAppraisal && <TableCell style={mainCellStyle}>Average Appraisal</TableCell>}
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
              {showColumns.sessionDate && (
                <TableCell style={mainCellStyle}>
                  <TableSortLabel
                    active={sortConfig.key === 'session_date'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('session_date')}
                  >
                    Session Date
                  </TableSortLabel>
                </TableCell>
              )}
              {showColumns.lastUpdate && <TableCell style={mainCellStyle}>Last Update</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedLoot.map((item) => {
              const individualItems = getIndividualItems(item.name, item.unidentified, item.masterwork, item.type, item.size);
              const totalQuantity = individualItems.reduce((sum, item) => sum + item.quantity, 0);

              return (
                <React.Fragment key={`${item.name}-${item.unidentified}-${item.masterwork}-${item.type}-${item.size}`}>
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
                    {showColumns.quantity && <TableCell style={mainCellStyle}>{totalQuantity}</TableCell>}
                    {showColumns.name && (
                      <TableCell style={mainCellStyle}>
                        {individualItems.length > 1 && (
                          <IconButton
                            aria-label="expand row"
                            size="small"
                            onClick={() => handleToggleOpen(item.name, item.unidentified, item.masterwork, item.type, item.size)}
                          >
                            {openItems[`${item.name}-${item.unidentified}-${item.masterwork}-${item.type}-${item.size}`] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                          </IconButton>
                        )}
                        <Tooltip title={item.notes || 'No notes'} arrow>
                          <span>{item.name}</span>
                        </Tooltip>
                      </TableCell>
                    )}
                    {showColumns.unidentified && (
                      <TableCell style={mainCellStyle}>
                        {console.log('Unidentified value:', item.unidentified)}
                        {item.unidentified === null || item.unidentified === false
                          ? ''
                          : item.unidentified
                          ? <strong>Unidentified</strong>
                          : 'Identified'}
                      </TableCell>
                    )}
                    {showColumns.type && <TableCell style={mainCellStyle}>{item.type}</TableCell>}
                    {showColumns.size && <TableCell style={mainCellStyle}>{item.size}</TableCell>}
                    {showColumns.whoHasIt && <TableCell style={mainCellStyle}>{item.character_name}</TableCell>}
                    {showColumns.believedValue && <TableCell style={mainCellStyle}>{item.believedvalue || ''}</TableCell>}
                    {showColumns.averageAppraisal && (
                      <TableCell style={mainCellStyle}>
                        {formatAverageAppraisal(item.average_appraisal)}
                      </TableCell>
                    )}
                    {showColumns.pendingSale && (
                      <TableCell style={mainCellStyle}>{item.status === 'Pending Sale' ? '✔' : ''}</TableCell>
                    )}
                    {showColumns.sessionDate && (
                      <TableCell style={mainCellStyle}>{item.session_date ? formatDate(item.session_date) : ''}</TableCell>
                    )}
                    {showColumns.lastUpdate && (
                      <TableCell style={mainCellStyle}>{item.lastupdate ? formatDate(item.lastupdate) : ''}</TableCell>
                    )}
                  </TableRow>
                  {individualItems.length > 1 && (
                    <TableRow>
                      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={Object.values(showColumns).filter(Boolean).length}>
                        <Collapse in={openItems[`${item.name}-${item.unidentified}-${item.masterwork}-${item.type}-${item.size}`]} timeout="auto" unmountOnExit>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                {showColumns.select && <TableCell style={subCellStyle}>Select</TableCell>}
                                <TableCell style={subCellStyle}>Quantity</TableCell>
                                {showColumns.size && <TableCell style={subCellStyle}>Size</TableCell>}
                                {showColumns.sessionDate && <TableCell style={subCellStyle}>Session Date</TableCell>}
                                {showColumns.lastUpdate && <TableCell style={subCellStyle}>Last Update</TableCell>}
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
                                  {showColumns.size && <TableCell style={subCellStyle}>{subItem.size}</TableCell>}
                                  {showColumns.sessionDate && <TableCell style={subCellStyle}>{subItem.session_date ? formatDate(subItem.session_date) : ''}</TableCell>}
                                  {showColumns.lastUpdate && <TableCell style={subCellStyle}>{subItem.lastupdate ? formatDate(subItem.lastupdate) : ''}</TableCell>}
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
