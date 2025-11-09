import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  FormControlLabel,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import { formatDate } from '../../utils/utils';
import { styled } from '@mui/system';
import api from '../../utils/api';

// Styled components
const SubItemTableRow = styled(TableRow)(({ theme }) => ({
  backgroundColor: theme.palette.action.hover,
  '& .MuiTableCell-root': {
    padding: '0px',
  },
}));

// Reusable components
const FilterMenu = ({ anchorEl, open, onClose, filters, onChange }) => (
  <Menu anchorEl={anchorEl} open={open} onClose={onClose}>
    {Object.entries(filters).map(([key, checked]) => (
      <MenuItem key={key}>
        <FormControlLabel
          control={<Checkbox checked={checked} onChange={() => onChange(key)} />}
          label={key}
        />
      </MenuItem>
    ))}
  </Menu>
);

const SortableTableCell = ({ label, field, sortConfig, onSort }) => (
  <TableCell>
    <TableSortLabel
      active={sortConfig.key === field}
      direction={sortConfig.direction}
      onClick={() => onSort(field)}
    >
      {label}
    </TableSortLabel>
  </TableCell>
);

// Custom Hook for filter management
const useFilterMenu = (initialFilters) => {
  const [filters, setFilters] = useState(initialFilters);
  const [anchorEl, setAnchorEl] = useState(null);

  const handleMenuOpen = useCallback((event) => setAnchorEl(event.currentTarget), []);
  const handleMenuClose = useCallback(() => setAnchorEl(null), []);
  const handleFilterChange = useCallback((key) => {
    setFilters(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  return {
    filters,
    setFilters,
    anchorEl,
    handleMenuOpen,
    handleMenuClose,
    handleFilterChange,
  };
};

// Utility function for formatting appraisal details
const formatAppraisalDetails = (item) => {
  const appraisals = item.appraisals || [];
  if (!appraisals.length) return 'No appraisals available';

  return appraisals.map(appraisal => {
    const characterName = appraisal.character_name || 'Unknown';
    const value = parseFloat(appraisal.believedvalue);
    return `${characterName}: ${isNaN(value) ? '?' : value.toFixed(2)}`;
  }).join('\n');
};

// Component for formatting average appraisal
const FormatAverageAppraisal = ({ item }) => {
  if (item.average_appraisal === undefined || item.average_appraisal === null) return null;

  const value = parseFloat(item.average_appraisal);
  const formattedValue = isNaN(value) ? '' : value.toFixed(2).replace(/\.0+$/, '');

  return (
    <Tooltip title={formatAppraisalDetails(item)} arrow>
      <span>{formattedValue}</span>
    </Tooltip>
  );
};

// Component for formatting believed value for active character
const FormatBelievedValue = ({ item }) => {
  const [activeCharacterId, setActiveCharacterId] = React.useState(null);

  // Get active character ID on component mount
  React.useEffect(() => {
    const fetchActiveCharacter = async () => {
      try {
        const response = await api.get('/user/me');
        if (response.data && response.data.activeCharacterId) {
          setActiveCharacterId(response.data.activeCharacterId);
        }
      } catch (error) {
        console.error('Error fetching active character:', error);
      }
    };
    fetchActiveCharacter();
  }, []);

  // Try multiple possible locations for the believed value
  let rawValue = null;

  // Check if directly on the item
  if (item.believedvalue !== undefined && item.believedvalue !== null) {
    rawValue = item.believedvalue;
  }
  // Check if we need to find the active character's appraisal
  else if (item.appraisals && Array.isArray(item.appraisals) && item.appraisals.length > 0 && activeCharacterId) {
    // Find appraisal for the active character specifically
    const activeCharacterAppraisal = item.appraisals.find(a => 
      a.character_id === activeCharacterId || a.characterId === activeCharacterId
    );
    if (activeCharacterAppraisal) {
      rawValue = activeCharacterAppraisal.believedvalue;
    }
    // If no appraisal for active character, don't show any value (don't fall back to random character)
  }

  // Return empty if no valid value found
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  // Format the value
  const value = parseFloat(rawValue);
  if (isNaN(value)) {
    console.log('Parsed value is NaN');
    return null;
  }

  const formattedValue = value.toFixed(2).replace(/\.0+$/, '');
  console.log('Formatted value:', formattedValue);

  return <span>{formattedValue}</span>;
};

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
    quantity: true,
    name: true,
    type: true,
    size: true,
    whoHasIt: true,
    believedValue: true,
    averageAppraisal: true,
    sessionDate: true,
    lastUpdate: true,
    unidentified: true,
    pendingSale: true
  },
  showFilters = {
    pendingSale: true,
    unidentified: true,
    type: true,
    size: true,
    whoHas: true,
  },
}) => {
  // Filter states
  const [showPendingSales, setShowPendingSales] = useState(true);
  const [showOnlyUnidentified, setShowOnlyUnidentified] = useState(false);

  // Type filter setup with custom hook
  const {
    filters: typeFilters,
    anchorEl: anchorElType,
    handleMenuOpen: handleTypeMenuOpen,
    handleMenuClose: handleTypeMenuClose,
    handleFilterChange: handleTypeFilterChange,
  } = useFilterMenu({
    Weapon: true,
    Armor: true,
    Magic: true,
    Gear: true,
    'Trade Good': true,
    Other: true,
  });

  // Size filter setup with custom hook
  const {
    filters: sizeFilters,
    anchorEl: anchorElSize,
    handleMenuOpen: handleSizeMenuOpen,
    handleMenuClose: handleSizeMenuClose,
    handleFilterChange: handleSizeFilterChange,
  } = useFilterMenu({
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

  // Who has filter states
  const [whoHasFilters, setWhoHasFilters] = useState([]);
  const [anchorElWhoHas, setAnchorElWhoHas] = useState(null);

  // Cell styles
  const mainCellStyle = { padding: '16px' };
  const subCellStyle = { padding: '4px' };

  // Fetch active characters for "who has" filters
  useEffect(() => {
    const fetchWhoHasFilters = async () => {
      try {
        const response = await api.get(`/user/active-characters`);
        setWhoHasFilters(response.data.map(character => ({
          name: character.name,
          checked: false,
        })));
      } catch (error) {
        console.error('Error fetching characters:', error);
      }
    };

    fetchWhoHasFilters();
  }, []);

  // Helper functions
  const handleToggleOpen = useCallback((itemId) => {
    setOpenItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  }, [setOpenItems]);

  const getItemKey = useCallback((item) => `${item.row_type}-${item.id}`, []);

  const getIndividualItems = useCallback((summary) => {
    if (!summary || summary.row_type !== 'summary') return [];

    return individualLoot.filter(item =>
      item.name === summary.name &&
      item.unidentified === summary.unidentified &&
      item.masterwork === summary.masterwork &&
      item.type === summary.type &&
      item.size === summary.size
    );
  }, [individualLoot]);

  const handleWhoHasFilterChange = useCallback((name) => {
    setWhoHasFilters(prev =>
      prev.map(filter =>
        filter.name === name ? { ...filter, checked: !filter.checked } : filter
      )
    );
  }, []);

  // Sort handler
  const handleSort = useCallback((key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }, [sortConfig, setSortConfig]);

  // Column configuration (defines visible columns and their sort fields)
  const columnConfig = useMemo(() => [
    { key: "select", label: "Select", field: null, show: showColumns.select },
    { key: "quantity", label: "Quantity", field: "quantity", show: showColumns.quantity },
    { key: "name", label: "Name", field: "name", show: showColumns.name },
    { key: "unidentified", label: "Unidentified", field: "unidentified", show: showColumns.unidentified },
    { key: "type", label: "Type", field: "type", show: showColumns.type },
    { key: "size", label: "Size", field: "size", show: showColumns.size },
    { key: "whoHasIt", label: "Who Has It?", field: "character_name", show: showColumns.whoHasIt },
    { key: "believedValue", label: "Believed Value", field: "believedvalue", show: showColumns.believedValue },
    { key: "averageAppraisal", label: "Average Appraisal", field: "average_appraisal", show: showColumns.averageAppraisal },
    { key: "pendingSale", label: "Pending Sale", field: "statuspage", show: showColumns.pendingSale },
    { key: "sessionDate", label: "Session Date", field: "session_date", show: showColumns.sessionDate },
    { key: "lastUpdate", label: "Last Update", field: "lastupdate", show: showColumns.lastUpdate },
  ], [showColumns]);

  const visibleColumnsCount = useMemo(() =>
    columnConfig.filter(col => col.show).length,
  [columnConfig]);

  // Apply filters to data
  const filteredLoot = useMemo(() => {
    if (!loot || !Array.isArray(loot)) return [];
    return loot.filter((item) => {
      if (item.row_type !== 'summary') return false;

      // Apply all active filters
      return (
        // Unidentified filter
        (!showOnlyUnidentified || item.unidentified === true) &&

        // Type filter - if all filters are checked, show all items
        // Otherwise, apply specific filtering
        (Object.values(typeFilters).every(checked => checked) || 
          Object.entries(typeFilters).some(([type, isChecked]) => {
            if (!isChecked) return false;
            
            const itemType = (item.type || '').toLowerCase();
            const filterType = type.toLowerCase();
            
            // Direct match or 'other' for anything not explicitly defined
            if (itemType === filterType) return true;
            
            // 'other' catches everything that doesn't match a defined filter
            if (filterType === 'other') {
              const definedTypes = ['weapon', 'armor', 'magic', 'gear', 'trade good'];
              return !definedTypes.includes(itemType);
            }
            
            return false;
          })
        ) &&

        // Size filter - handle case differences and various formats
        (Object.values(sizeFilters).every(checked => checked) ||
          (() => {
            // Handle null/undefined/empty sizes
            if (!item.size || item.size === '') {
              return sizeFilters['Unknown'] || false;
            }

            // Normalize size to proper case (e.g., "medium" -> "Medium")
            const normalizedSize = item.size.trim()
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');

            // Check if the normalized size matches any filter
            return sizeFilters[normalizedSize] || false;
          })()
        ) &&

        // Who has filter - handle both summary rows (character_names array) and individual rows (character_name string)
        (whoHasFilters.every(filter => !filter.checked) ||
          whoHasFilters.some(filter => {
            if (!filter.checked) return false;

            // For summary rows (have character_names array)
            if (item.character_names && Array.isArray(item.character_names)) {
              return item.character_names.includes(filter.name);
            }

            // For individual rows (have character_name string)
            if (item.character_name) {
              return item.character_name === filter.name;
            }

            return false;
          })
        ) &&

        // Pending sale filter
        (showPendingSales || item.statuspage !== 'Pending Sale')
      );
    });
  }, [
    loot,
    showOnlyUnidentified,
    typeFilters,
    sizeFilters,
    whoHasFilters,
    showPendingSales
  ]);

  // Sort the filtered data
  const sortedLoot = useMemo(() => {
    if (!sortConfig.key) return filteredLoot;

    return [...filteredLoot].sort((a, b) => {
      // Handle null/undefined values
      if (a[sortConfig.key] === undefined && b[sortConfig.key] === undefined) return 0;
      if (a[sortConfig.key] === undefined) return sortConfig.direction === 'asc' ? -1 : 1;
      if (b[sortConfig.key] === undefined) return sortConfig.direction === 'asc' ? 1 : -1;

      const direction = sortConfig.direction === 'asc' ? 1 : -1;

      // Different sort logic based on field type
      switch (sortConfig.key) {
        case 'session_date':
        case 'lastupdate':
          return (new Date(a[sortConfig.key]) - new Date(b[sortConfig.key])) * direction;

        case 'quantity':
        case 'believedvalue':
        case 'average_appraisal':
          return (Number(a[sortConfig.key] || 0) - Number(b[sortConfig.key] || 0)) * direction;

        case 'unidentified':
        case 'status':
        case 'statuspage':
          return ((a[sortConfig.key] === b[sortConfig.key])
            ? 0
            : (a[sortConfig.key] ? 1 : -1)) * direction;

        default:
          return String(a[sortConfig.key] || '').localeCompare(String(b[sortConfig.key] || '')) * direction;
      }
    });
  }, [filteredLoot, sortConfig]);

  // Render table header cells based on column configuration
  const renderHeaderCells = useCallback(() => {
    return columnConfig
      .filter(col => col.show)
      .map(col => col.field
        ? <SortableTableCell
            key={col.key}
            label={col.label}
            field={col.field}
            sortConfig={sortConfig}
            onSort={handleSort}
          />
        : <TableCell key={col.key}>{col.label}</TableCell>
      );
  }, [columnConfig, sortConfig, handleSort]);

  return (
    <Paper sx={{ p: 2 }}>
      {/* Filters section */}
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
              <Button onClick={handleTypeMenuOpen}>Type Filters</Button>
              <FilterMenu
                anchorEl={anchorElType}
                open={Boolean(anchorElType)}
                onClose={handleTypeMenuClose}
                filters={typeFilters}
                onChange={handleTypeFilterChange}
              />
            </Grid>
          )}

          {showFilters.size && (
            <Grid item>
              <Button onClick={handleSizeMenuOpen}>Size Filters</Button>
              <FilterMenu
                anchorEl={anchorElSize}
                open={Boolean(anchorElSize)}
                onClose={handleSizeMenuClose}
                filters={sizeFilters}
                onChange={handleSizeFilterChange}
              />
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
                {whoHasFilters.map(filter => (
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

      {/* Table section */}
      <TableContainer sx={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              {renderHeaderCells()}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedLoot.map(summaryItem => {
              const itemKey = getItemKey(summaryItem);
              const individualItems = getIndividualItems(summaryItem);
              const isOpen = openItems[itemKey];

              return (
                <React.Fragment key={itemKey}>
                  {/* Main row */}
                  <TableRow>
                    {showColumns.select && (
                      <TableCell style={mainCellStyle}>
                        <Checkbox
                          checked={individualItems.length > 0 && individualItems.every(item => selectedItems.includes(item.id))}
                          indeterminate={
                            individualItems.some(item => selectedItems.includes(item.id)) &&
                            !individualItems.every(item => selectedItems.includes(item.id))
                          }
                          onChange={() => individualItems.forEach(item => handleSelectItem(item.id))}
                        />
                      </TableCell>
                    )}

                    {showColumns.quantity && <TableCell style={mainCellStyle}>{summaryItem.quantity}</TableCell>}

                    {showColumns.name && (
                      <TableCell style={mainCellStyle}>
                        {individualItems.length > 1 && (
                          <IconButton size="small" onClick={() => handleToggleOpen(itemKey)}>
                            {isOpen ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                          </IconButton>
                        )}
                        <Tooltip title={summaryItem.notes || 'No notes'} arrow>
                          <span>{summaryItem.masterwork ? 'Well Made ' : ''}{summaryItem.name}</span>
                        </Tooltip>
                      </TableCell>
                    )}

                    {showColumns.unidentified && (
                      <TableCell style={mainCellStyle}>
                        {summaryItem.unidentified === true ? <strong>Unidentified</strong> : ''}
                      </TableCell>
                    )}

                    {showColumns.type && <TableCell style={mainCellStyle}>{summaryItem.type}</TableCell>}
                    {showColumns.size && <TableCell style={mainCellStyle}>{summaryItem.size}</TableCell>}
                    {showColumns.whoHasIt && <TableCell style={mainCellStyle}>{summaryItem.character_name}</TableCell>}

                    {showColumns.believedValue && (
                      <TableCell style={mainCellStyle}>
                        <FormatBelievedValue item={summaryItem} />
                      </TableCell>
                    )}

                    {showColumns.averageAppraisal && (
                      <TableCell style={mainCellStyle}>
                        <FormatAverageAppraisal item={summaryItem} />
                      </TableCell>
                    )}

                    {showColumns.pendingSale && (
                      <TableCell style={mainCellStyle}>{summaryItem.statuspage === 'Pending Sale' ? '✔' : ''}</TableCell>
                    )}

                    {showColumns.sessionDate && (
                      <TableCell style={mainCellStyle}>
                        {summaryItem.session_date ? formatDate(summaryItem.session_date) : ''}
                      </TableCell>
                    )}

                    {showColumns.lastUpdate && (
                      <TableCell style={mainCellStyle}>
                        {summaryItem.lastupdate ? formatDate(summaryItem.lastupdate) : ''}
                      </TableCell>
                    )}
                  </TableRow>

                  {/* Sub-items row for expanded items */}
                  {individualItems.length > 1 && (
                    <TableRow>
                      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={visibleColumnsCount}>
                        <Collapse in={isOpen} timeout="auto" unmountOnExit>
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
                              {individualItems.map(subItem => (
                                <SubItemTableRow key={subItem.id}>
                                  {showColumns.select && (
                                    <TableCell style={subCellStyle}>
                                      <Checkbox
                                        checked={selectedItems.includes(subItem.id)}
                                        onChange={() => handleSelectItem(subItem.id)}
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
                                  {showColumns.sessionDate && (
                                    <TableCell style={subCellStyle}>
                                      {subItem.session_date ? formatDate(subItem.session_date) : ''}
                                    </TableCell>
                                  )}
                                  {showColumns.lastUpdate && (
                                    <TableCell style={subCellStyle}>
                                      {subItem.lastupdate ? formatDate(subItem.lastupdate) : ''}
                                    </TableCell>
                                  )}
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