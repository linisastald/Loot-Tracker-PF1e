import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
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
import { styled } from '@mui/material/styles';
import api from '../../utils/api';
import { useCampaignTimezone } from '../../hooks/useCampaignTimezone';
import { formatInCampaignTimezone } from '../../utils/timezoneUtils';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuth } from '../../contexts/AuthContext';
import { ITEM_TYPES, ITEM_SIZES } from '../../utils/itemOptions';
import LootItemCard from './LootItemCard';
import {
  FormatAverageAppraisal,
  FormatBelievedValue,
  formatLootDate,
  getBelievedValue,
} from './lootFormatters';

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

// Filter predicates. Each menu is a { label: checked } map; when every box is
// checked nothing is filtered out.
const allChecked = (filters) => Object.values(filters).every(Boolean);

const matchesType = (item, typeFilters) => {
  if (allChecked(typeFilters)) return true;
  const itemType = (item.type || '').toLowerCase();
  // 'other' catches every type that has no filter of its own
  const definedTypes = Object.keys(typeFilters).map(label => label.toLowerCase()).filter(label => label !== 'other');
  return Object.entries(typeFilters).some(([label, checked]) => {
    if (!checked) return false;
    const filterType = label.toLowerCase();
    return itemType === filterType || (filterType === 'other' && !definedTypes.includes(itemType));
  });
};

const matchesSize = (item, sizeFilters) => {
  if (allChecked(sizeFilters)) return true;
  if (!item.size) return Boolean(sizeFilters.Unknown);
  // "medium" -> "Medium"
  const normalizedSize = item.size.trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return Boolean(sizeFilters[normalizedSize]);
};

// character_name is available on both summary and individual rows
const matchesWhoHas = (item, whoHasFilters) =>
  Object.values(whoHasFilters).every(checked => !checked) ||
  Boolean(item.character_name && whoHasFilters[item.character_name]);

const CustomLootTable = ({
  loot,
  individualLoot,
  selectedItems,
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
  // Campaign timezone
  const { timezone } = useCampaignTimezone();

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
  } = useFilterMenu(Object.fromEntries(ITEM_TYPES.map(({ label }) => [label, true])));

  // Size filter setup with custom hook
  const {
    filters: sizeFilters,
    anchorEl: anchorElSize,
    handleMenuOpen: handleSizeMenuOpen,
    handleMenuClose: handleSizeMenuClose,
    handleFilterChange: handleSizeFilterChange,
  } = useFilterMenu({
    ...Object.fromEntries(ITEM_SIZES.map((size) => [size, true])),
    Unknown: true,
  });

  // Who has filter ({ character name: checked }), filled once the characters load
  const {
    filters: whoHasFilters,
    setFilters: setWhoHasFilters,
    anchorEl: anchorElWhoHas,
    handleMenuOpen: handleWhoHasMenuOpen,
    handleMenuClose: handleWhoHasMenuClose,
    handleFilterChange: handleWhoHasFilterChange,
  } = useFilterMenu({});

  // Believed values are looked up for the active character
  const { user } = useAuth();
  const activeCharacterId = user?.activeCharacterId ?? null;

  // Cell styles
  const mainCellStyle = { padding: '16px' };
  const subCellStyle = { padding: '4px' };

  // Fetch active characters for "who has" filters
  useEffect(() => {
    const fetchWhoHasFilters = async () => {
      try {
        const response = await api.get(`/user/active-characters`);
        setWhoHasFilters(Object.fromEntries(response.data.map(character => [character.name, false])));
      } catch (error) {
        // Error fetching characters - filters remain empty
      }
    };

    fetchWhoHasFilters();
  }, [setWhoHasFilters]);

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
      item.size === summary.size &&
      // loot_view groups summaries by status too; null-safe
      (item.statuspage ?? null) === (summary.statuspage ?? null)
    );
  }, [individualLoot]);

  const selectedSet = useMemo(() => new Set(selectedItems), [selectedItems]);

  // Selection state of one summary row's individual items
  const getGroupSelection = useCallback((items) => {
    const selectedCount = items.filter(item => selectedSet.has(item.id)).length;
    return {
      allSelected: items.length > 0 && selectedCount === items.length,
      someSelected: selectedCount > 0,
    };
  }, [selectedSet]);

  // Select every item of a group, or clear the group when it is already fully selected
  const handleSelectGroup = useCallback((items) => {
    const { allSelected } = getGroupSelection(items);
    items
      .filter(item => allSelected || !selectedSet.has(item.id))
      .forEach(item => handleSelectItem(item.id));
  }, [getGroupSelection, selectedSet, handleSelectItem]);

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
    return loot.filter((item) =>
      item.row_type === 'summary' &&
      (!showOnlyUnidentified || item.unidentified === true) &&
      matchesType(item, typeFilters) &&
      matchesSize(item, sizeFilters) &&
      matchesWhoHas(item, whoHasFilters) &&
      (showPendingSales || item.statuspage !== 'Pending Sale')
    );
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

    // The believed value is the active character's own appraisal
    const valueOf = (item) =>
      sortConfig.key === 'believedvalue' ? getBelievedValue(item, activeCharacterId) : item[sortConfig.key];
    const direction = sortConfig.direction === 'asc' ? 1 : -1;

    return [...filteredLoot].sort((a, b) => {
      const aValue = valueOf(a);
      const bValue = valueOf(b);

      // Missing values sort first ascending, last descending
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return -direction;
      if (bValue == null) return direction;

      // Different sort logic based on field type
      switch (sortConfig.key) {
        case 'session_date':
        case 'lastupdate':
          return (new Date(aValue) - new Date(bValue)) * direction;

        case 'quantity':
        case 'believedvalue':
        case 'average_appraisal':
          return (Number(aValue || 0) - Number(bValue || 0)) * direction;

        case 'unidentified':
          return (Number(Boolean(aValue)) - Number(Boolean(bValue))) * direction;

        default:
          return String(aValue || '').localeCompare(String(bValue || '')) * direction;
      }
    });
  }, [filteredLoot, sortConfig, activeCharacterId]);

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

  const isMobile = useIsMobile();

  // Sort options for mobile dropdown
  const sortOptions = useMemo(() =>
    columnConfig.filter(col => col.show && col.field).map(col => ({
      label: col.label,
      field: col.field,
    })),
  [columnConfig]);

  // Render mobile card list
  const renderMobileView = () => (
    <Box>
      {/* Mobile sort dropdown */}
      <FormControl size="small" sx={{ minWidth: 150, mb: 1 }}>
        <InputLabel>Sort by</InputLabel>
        <Select
          value={sortConfig.key || ''}
          label="Sort by"
          onChange={(e) => handleSort(e.target.value)}
        >
          {sortOptions.map(opt => (
            <MenuItem key={opt.field} value={opt.field}>
              {opt.label} {sortConfig.key === opt.field ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {sortedLoot.map(summaryItem => {
        const itemKey = getItemKey(summaryItem);
        const items = getIndividualItems(summaryItem);
        const isOpen = openItems[itemKey];

        return (
          <LootItemCard
            key={itemKey}
            item={summaryItem}
            individualItems={items}
            isOpen={isOpen}
            onToggleOpen={() => handleToggleOpen(itemKey)}
            onSelectAll={() => handleSelectGroup(items)}
            onSelectItem={handleSelectItem}
            selectedItems={selectedItems}
            selection={getGroupSelection(items)}
            showColumns={showColumns}
          />
        );
      })}
    </Box>
  );

  // Render desktop table
  const renderDesktopView = () => (
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
            const { allSelected, someSelected } = getGroupSelection(individualItems);

            return (
              <React.Fragment key={itemKey}>
                <TableRow>
                  {showColumns.select && (
                    <TableCell style={mainCellStyle}>
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected && !allSelected}
                        onChange={() => handleSelectGroup(individualItems)}
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
                      {formatLootDate(summaryItem.session_date)}
                    </TableCell>
                  )}

                  {showColumns.lastUpdate && (
                    <TableCell style={mainCellStyle}>
                      {summaryItem.lastupdate && timezone ? formatInCampaignTimezone(summaryItem.lastupdate, timezone, 'PPpp z') : ''}
                    </TableCell>
                  )}
                </TableRow>

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
                                    {formatLootDate(subItem.session_date)}
                                  </TableCell>
                                )}
                                {showColumns.lastUpdate && (
                                  <TableCell style={subCellStyle}>
                                    {subItem.lastupdate && timezone ? formatInCampaignTimezone(subItem.lastupdate, timezone, 'PPpp z') : ''}
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
  );

  return (
    <Paper sx={{ p: { xs: 1, md: 2 } }}>
      {/* Filters section */}
      <Box sx={{ position: 'sticky', top: 0, backgroundColor: 'background.paper', zIndex: 1 }}>
        <Grid container spacing={1} sx={{ mb: 2 }}>
          {showFilters.pendingSale && (
            <Grid size={{ xs: 12, sm: 'auto' }}>
              <FormControlLabel
                control={<Switch size={isMobile ? 'small' : 'medium'} checked={showPendingSales} onChange={() => setShowPendingSales(!showPendingSales)} />}
                label="Show Pending Sales"
              />
            </Grid>
          )}

          {showFilters.unidentified && (
            <Grid size={{ xs: 12, sm: 'auto' }}>
              <FormControlLabel
                control={<Switch size={isMobile ? 'small' : 'medium'} checked={showOnlyUnidentified} onChange={() => setShowOnlyUnidentified(!showOnlyUnidentified)} />}
                label="Show Only Unidentified"
              />
            </Grid>
          )}

          {showFilters.type && (
            <Grid size="auto">
              <Button size={isMobile ? 'small' : 'medium'} onClick={handleTypeMenuOpen}>Type Filters</Button>
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
            <Grid size="auto">
              <Button size={isMobile ? 'small' : 'medium'} onClick={handleSizeMenuOpen}>Size Filters</Button>
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
            <Grid size="auto">
              <Button size={isMobile ? 'small' : 'medium'} onClick={handleWhoHasMenuOpen}>Who Has Filters</Button>
              <FilterMenu
                anchorEl={anchorElWhoHas}
                open={Boolean(anchorElWhoHas)}
                onClose={handleWhoHasMenuClose}
                filters={whoHasFilters}
                onChange={handleWhoHasFilterChange}
              />
            </Grid>
          )}
        </Grid>
      </Box>

      {isMobile ? renderMobileView() : renderDesktopView()}
    </Paper>
  );
};

export default CustomLootTable;