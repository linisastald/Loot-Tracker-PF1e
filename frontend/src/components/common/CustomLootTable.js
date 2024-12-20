import React, { useState, useEffect, useMemo } from 'react';
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
  Box,
  Button,
  Menu,
  MenuItem,
  FormControlLabel,
  Switch,
  Grid,
} from '@mui/material';
import { KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';
import { formatDate } from '../../utils/utils';
import { styled } from '@mui/system';
import api from '../../utils/api';

const SubItemTableRow = styled(TableRow)(({ theme }) => ({
  backgroundColor: theme.palette.action.hover,
  '& .MuiTableCell-root': {
    padding: '0px', // Adjust padding to make the rows thinner
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
  const [showPendingSales, setShowPendingSales] = useState(true);
  const [showOnlyUnidentified, setShowOnlyUnidentified] = useState(false);
  const [anchorElType, setAnchorElType] = useState(null);
  const [anchorElSize, setAnchorElSize] = useState(null);
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
  const [anchorElWhoHas, setAnchorElWhoHas] = useState(null);

  useEffect(() => {
    const fetchWhoHasFilters = async () => {
      try {
        const response = await api.get(`/user/active-characters`);
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
    const passesUnidentifiedFilter = !showOnlyUnidentified || item.unidentified === true;
    const passesTypeFilter = Object.keys(typeFilters).some(type => {
      const itemType = (item.type || '').toLowerCase();
      const filterType = type.toLowerCase();
      return (
        (filterType === 'other' && (!itemType || itemType === '') && typeFilters[type]) ||
        (itemType === filterType && typeFilters[type])
      );
    });
    const passesSizeFilter = sizeFilters[item.size] || (sizeFilters['Unknown'] && (!item.size || item.size === ''));
    const passesWhoHasFilter = whoHasFilters.every((filter) => !filter.checked) ||
      whoHasFilters.some((filter) => filter.checked && item.character_names && item.character_names.includes(filter.name));
    const passesPendingSaleFilter = showPendingSales || item.status !== 'Pending Sale';

    return passesUnidentifiedFilter && passesTypeFilter && passesSizeFilter &&
           passesWhoHasFilter && passesPendingSaleFilter;
  });

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedLoot = [...filteredLoot].sort((a, b) => {
    if (a[sortConfig.key] === b[sortConfig.key]) {
      return 0;
    }

    switch (sortConfig.key) {
      case 'session_date':
      case 'lastupdate':
        return sortConfig.direction === 'asc'
          ? new Date(a[sortConfig.key]) - new Date(b[sortConfig.key])
          : new Date(b[sortConfig.key]) - new Date(a[sortConfig.key]);
      case 'quantity':
      case 'believedvalue':
      case 'average_appraisal':
        return sortConfig.direction === 'asc'
          ? Number(a[sortConfig.key]) - Number(b[sortConfig.key])
          : Number(b[sortConfig.key]) - Number(a[sortConfig.key]);
      case 'unidentified':
      case 'status':
        return sortConfig.direction === 'asc'
          ? (a[sortConfig.key] === b[sortConfig.key] ? 0 : a[sortConfig.key] ? -1 : 1)
          : (a[sortConfig.key] === b[sortConfig.key] ? 0 : b[sortConfig.key] ? -1 : 1);
      default:
        return sortConfig.direction === 'asc'
          ? String(a[sortConfig.key]).localeCompare(String(b[sortConfig.key]))
          : String(b[sortConfig.key]).localeCompare(String(a[sortConfig.key]));
    }
  });

  const mainCellStyle = { padding: '16px' };
  const subCellStyle = { padding: '4px' };

  console.log('Loot data:', loot);
  console.log('Individual loot data:', individualLoot);

   const aggregatedAppraisals = useMemo(() => {
    const appraisalMap = new Map();

    individualLoot.forEach(item => {
      const key = `${item.name}-${item.unidentified}-${item.masterwork}-${item.type}-${item.size}`;
      if (!appraisalMap.has(key)) {
        appraisalMap.set(key, []);
      }
      if (item.appraisals) {
        appraisalMap.get(key).push(...item.appraisals);
      }
    });

    return appraisalMap;
  }, [individualLoot]);

  const getAppraisals = (item) => {
    // Check if the item has appraisals directly
    if (item.appraisals && Array.isArray(item.appraisals)) {
      return item.appraisals;
    }

    // If not, try to find matching individual items and collect their appraisals
    const matchingItems = individualLoot.filter(
      indItem =>
        indItem.name === item.name &&
        indItem.unidentified === item.unidentified &&
        indItem.masterwork === item.masterwork &&
        indItem.type === item.type &&
        indItem.size === item.size
    );

    // Collect all unique appraisals from matching items
    const allAppraisals = matchingItems.flatMap(indItem => indItem.appraisals || []);
    const uniqueAppraisals = Array.from(new Set(allAppraisals.map(JSON.stringify))).map(JSON.parse);

    return uniqueAppraisals;
  };



  const formatAppraisalDetails = (item) => {
    console.log('Formatting appraisal details for item:', item);

    const appraisals = getAppraisals(item);

    if (!appraisals || appraisals.length === 0) {
      console.log('No appraisals found for item');
      return 'No appraisals available';
    }

    return appraisals.map(appraisal => {
      console.log('Appraisal:', appraisal);
      return `${appraisal.character_name}: ${appraisal.believedvalue}`;
    }).join('\n');
  };

  const formatAverageAppraisal = (item) => {
    console.log('Formatting average appraisal for item:', item);

    const appraisals = getAppraisals(item);

    if (!appraisals || appraisals.length === 0) {
      console.log('No appraisals found for item');
      return '';
    }

    const totalValue = appraisals.reduce((sum, appraisal) => sum + parseFloat(appraisal.believedvalue), 0);
    const averageValue = totalValue / appraisals.length;

    const formattedValue = Number.isInteger(averageValue) ? averageValue.toString() : averageValue.toFixed(2).replace(/\.?0+$/, '');

    return (
      <Tooltip title={formatAppraisalDetails(item)} arrow>
        <span>{formattedValue}</span>
      </Tooltip>
    );
  };



  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ position: 'sticky', top: 0, backgroundColor: 'background.paper', zIndex: 1 }}>
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
              <Button onClick={(e) => setAnchorElType(e.currentTarget)}>Type Filters</Button>
              <Menu
                anchorEl={anchorElType}
                open={Boolean(anchorElType)}
                onClose={() => setAnchorElType(null)}
              >
                {Object.entries(typeFilters).map(([type, checked]) => (
                  <MenuItem key={type}>
                    <FormControlLabel
                      control={<Checkbox checked={checked} onChange={() => handleTypeFilterChange(type)} />}
                      label={type}
                    />
                  </MenuItem>
                ))}
              </Menu>
            </Grid>
          )}
          {showFilters.size && (
            <Grid item>
              <Button onClick={(e) => setAnchorElSize(e.currentTarget)}>Size Filters</Button>
              <Menu
                anchorEl={anchorElSize}
                open={Boolean(anchorElSize)}
                onClose={() => setAnchorElSize(null)}
              >
                {Object.entries(sizeFilters).map(([size, checked]) => (
                  <MenuItem key={size}>
                    <FormControlLabel
                      control={<Checkbox checked={checked} onChange={() => handleSizeFilterChange(size)} />}
                      label={size}
                    />
                  </MenuItem>
                ))}
              </Menu>
            </Grid>
          )}
          {showFilters.whoHas && (
            <Grid item>
              <Button onClick={(e) => setAnchorElWhoHas(e.currentTarget)}>Who Has Filters</Button>
              <Menu
                anchorEl={anchorElWhoHas}
                open={Boolean(anchorElWhoHas)}
                onClose={() => setAnchorElWhoHas(null)}
              >
                {whoHasFilters.map((filter) => (
                  <MenuItem key={filter.name}>
                    <FormControlLabel
                      control={<Checkbox checked={filter.checked} onChange={() => handleWhoHasFilterChange(filter.name)} />}
                      label={filter.name}
                    />
                  </MenuItem>
                ))}
              </Menu>
            </Grid>
          )}
        </Grid>
      </Box>

      <TableContainer sx={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              {showColumns.select && <TableCell>Select</TableCell>}
              {showColumns.quantity && (
                <TableCell>
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
              {showColumns.whoHasIt && (
                <TableCell style={mainCellStyle}>
                  <TableSortLabel
                    active={sortConfig.key === 'character_names'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('character_names')}
                  >
                    Who Has It?
                  </TableSortLabel>
                </TableCell>
              )}
              {showColumns.believedValue && (
                <TableCell style={mainCellStyle}>
                  <TableSortLabel
                    active={sortConfig.key === 'believedvalue'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('believedvalue')}
                  >
                    Believed Value
                  </TableSortLabel>
                </TableCell>
              )}
              {showColumns.averageAppraisal && (
                <TableCell style={mainCellStyle}>
                  <TableSortLabel
                    active={sortConfig.key === 'average_appraisal'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('average_appraisal')}
                  >
                    Average Appraisal
                  </TableSortLabel>
                </TableCell>
              )}
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
              {showColumns.lastUpdate && (
                <TableCell style={mainCellStyle}>
                  <TableSortLabel
                    active={sortConfig.key === 'lastupdate'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('lastupdate')}
                  >
                    Last Update
                  </TableSortLabel>
                </TableCell>
              )}
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
                          {item.unidentified === true
                              ? <strong>Unidentified</strong>
                              : item.unidentified === false
                                  ? ''
                                  : ''}
                        </TableCell>
                    )}
                    {showColumns.type && <TableCell style={mainCellStyle}>{item.type}</TableCell>}
                    {showColumns.size && <TableCell style={mainCellStyle}>{item.size}</TableCell>}
                    {showColumns.whoHasIt && <TableCell style={mainCellStyle}>{item.character_names}</TableCell>}
                    {showColumns.believedValue && <TableCell style={mainCellStyle}>{item.believedvalue || ''}</TableCell>}
                    {showColumns.averageAppraisal && (
                      <TableCell style={mainCellStyle}>
                        {formatAverageAppraisal(item)}
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
                                {showColumns.whoHasIt && <TableCell style={subCellStyle}>Who Has It?</TableCell>}
                                <TableCell style={subCellStyle}>Notes</TableCell>
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
                                  {showColumns.whoHasIt && <TableCell style={subCellStyle}>{subItem.character_name}</TableCell>}
                                  <TableCell style={subCellStyle}>
                                    {subItem.notes ? (
                                      <Tooltip title={subItem.notes} arrow>
                                        <span>Hover for Notes</span>
                                      </Tooltip>
                                    ) : ''}
                                  </TableCell>
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