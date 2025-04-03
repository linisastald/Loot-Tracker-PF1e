import React, { useMemo, useState, useCallback, useEffect } from 'react';
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
import PropTypes from 'prop-types';

// Styled components
const SubItemTableRow = styled(TableRow)(({theme}) => ({
    backgroundColor: theme.palette.action.hover,
    '& .MuiTableCell-root': {
        padding: '0px',
    },
}));

// Reusable components
const FilterMenu = React.memo(({anchorEl, open, onClose, title, filters, onChange}) => (
    <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={onClose}
    >
        {Object.entries(filters).map(([key, checked]) => (
            <MenuItem key={key}>
                <FormControlLabel
                    control={<Checkbox checked={checked} onChange={() => onChange(key)}/>}
                    label={key}
                />
            </MenuItem>
        ))}
    </Menu>
));

const SortableTableCell = React.memo(({label, field, sortConfig, onSort}) => (
    <TableCell>
        <TableSortLabel
            active={sortConfig.key === field}
            direction={sortConfig.direction || 'asc'}
            onClick={() => onSort(field)}
        >
            {label}
        </TableSortLabel>
    </TableCell>
));

// Utility function to safely normalize string values for comparison
const normalizeItemProperty = (value) => {
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase();
};

// The main component
const CustomLootTable = ({
    loot = [],
    individualLoot = [],
    selectedItems = [],
    setSelectedItems,
    openItems = {},
    setOpenItems,
    handleSelectItem,
    sortConfig = { key: '', direction: 'asc' },
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
    // Initial filter state with default values
    const [filters, setFilters] = useState(() => ({
        showPendingSales: true,
        showOnlyUnidentified: false,
        types: {
            Weapon: true,
            Armor: true,
            Magic: true,
            Gear: true,
            'Trade Good': true,
            Other: true,
        },
        sizes: {
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
        },
        whoHas: []
    }));

    // State for who has filters from API
    const [whoHasFilters, setWhoHasFilters] = useState([]);

    // Menu anchor states
    const [anchorElType, setAnchorElType] = useState(null);
    const [anchorElSize, setAnchorElSize] = useState(null);
    const [anchorElWhoHas, setAnchorElWhoHas] = useState(null);

    // Fetch active characters for "who has" filters (only once)
    useEffect(() => {
        const fetchWhoHasFilters = async () => {
            try {
                const response = await api.get(`/user/active-characters`);
                const characters = response.data.map(character => ({
                    name: character.name,
                    checked: false,
                }));
                setWhoHasFilters(characters);
            } catch (error) {
                console.error('Error fetching characters:', error);
            }
        };

        fetchWhoHasFilters();
    }, []);

    // Filter handlers with useCallback
    const handleTogglePendingSales = useCallback(() => {
        setFilters(prev => ({
            ...prev,
            showPendingSales: !prev.showPendingSales
        }));
    }, []);

    const handleToggleUnidentified = useCallback(() => {
        setFilters(prev => ({
            ...prev,
            showOnlyUnidentified: !prev.showOnlyUnidentified
        }));
    }, []);

    const handleTypeFilterChange = useCallback((type) => {
        setFilters(prev => ({
            ...prev,
            types: {
                ...prev.types,
                [type]: !prev.types[type]
            }
        }));
    }, []);

    const handleSizeFilterChange = useCallback((size) => {
        setFilters(prev => ({
            ...prev,
            sizes: {
                ...prev.sizes,
                [size]: !prev.sizes[size]
            }
        }));
    }, []);

    const handleWhoHasFilterChange = useCallback((name) => {
        setWhoHasFilters(prev =>
            prev.map(filter =>
                filter.name === name ? {...filter, checked: !filter.checked} : filter
            )
        );
    }, []);

    // Menu handlers
    const handleMenuOpen = useCallback((setter) => (event) => {
        setter(event.currentTarget);
    }, []);

    const handleMenuClose = useCallback((setter) => () => {
        setter(null);
    }, []);

    // Toggle item expansion
    const handleToggleOpen = useCallback((name, unidentified, masterwork, type, size) => {
        setOpenItems((prevOpenItems) => {
            const key = `${name}-${unidentified}-${masterwork}-${type}-${size}`;
            return {
                ...prevOpenItems,
                [key]: !prevOpenItems[key]
            };
        });
    }, [setOpenItems]);

    // Sort handler
    const handleSort = useCallback((key) => {
        setSortConfig(prevConfig => ({
            key,
            direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
        }));
    }, [setSortConfig]);

    // Apply filters to the data
    const filteredLoot = useMemo(() => {
        if (!loot || !Array.isArray(loot) || loot.length === 0) return [];

        return loot.filter((item) => {
            // Unidentified filter
            if (filters.showOnlyUnidentified && item.unidentified !== true) {
                return false;
            }

            // Pending sale filter
            if (!filters.showPendingSales && item.status === 'Pending Sale') {
                return false;
            }

            // Type filter
            const itemType = (item.type || '').toLowerCase();
            let typeFilterPassed = false;

            if (!itemType && filters.types['Other']) {
                typeFilterPassed = true;
            } else if (itemType && filters.types[item.type]) {
                typeFilterPassed = true;
            }

            if (!typeFilterPassed) {
                return false;
            }

            // Size filter
            const sizeFilterPassed =
                (item.size && filters.sizes[item.size]) ||
                (!item.size && filters.sizes['Unknown']);

            if (!sizeFilterPassed) {
                return false;
            }

            // Who has filter - only check if any filter is active
            const activeWhoHasFilters = whoHasFilters.filter(f => f.checked);
            if (activeWhoHasFilters.length > 0) {
                if (!item.character_names) {
                    return false;
                }

                const whoHasFilterPassed = activeWhoHasFilters.some(filter =>
                    item.character_names.includes(filter.name)
                );

                if (!whoHasFilterPassed) {
                    return false;
                }
            }

            return true;
        });
    }, [loot, filters, whoHasFilters]);

    // Sort the filtered data
    const sortedLoot = useMemo(() => {
        if (!filteredLoot.length) return [];

        return [...filteredLoot].sort((a, b) => {
            // Handle null/undefined values
            const valueA = a[sortConfig.key];
            const valueB = b[sortConfig.key];

            if (valueA === valueB) return 0;
            if (valueA === undefined || valueA === null) return 1;
            if (valueB === undefined || valueB === null) return -1;

            const direction = sortConfig.direction === 'asc' ? 1 : -1;

            switch (sortConfig.key) {
                case 'session_date':
                case 'lastupdate':
                    return direction * (new Date(valueA) - new Date(valueB));
                case 'quantity':
                case 'believedvalue':
                case 'average_appraisal':
                    return direction * (Number(valueA) - Number(valueB));
                case 'unidentified':
                case 'status':
                    // Boolean sort
                    return direction * (valueA === valueB ? 0 : valueA ? -1 : 1);
                default:
                    // String sort
                    return direction * String(valueA).localeCompare(String(valueB));
            }
        });
    }, [filteredLoot, sortConfig]);

    // Function to get individual items for a group
    const getIndividualItems = useCallback((name, unidentified, masterwork, type, size) => {
        return individualLoot.filter(item => {
            const nameMatches = item.name.toLowerCase() === name.toLowerCase();
            const unidentifiedMatches = item.unidentified === unidentified;
            const masterworkMatches = item.masterwork === masterwork;
            const typeMatches = (item.type || '') === (type || '');
            const sizeMatches = (item.size || '') === (size || '');

            return nameMatches && unidentifiedMatches && masterworkMatches && typeMatches && sizeMatches;
        });
    }, [individualLoot]);

    // Format appraisal details for tooltip
    const formatAppraisalDetails = useCallback((item) => {
        const appraisals = item.appraisals || [];
        if (!appraisals || appraisals.length === 0) {
            return 'No appraisals available';
        }
        return appraisals.map(appraisal => {
            const characterName = appraisal.character_name || 'Unknown';
            const value = parseFloat(appraisal.believedvalue);
            return `${characterName}: ${isNaN(value) ? '?' : value.toFixed(2)}`;
        }).join('\n');
    }, []);

    // Format average appraisal with tooltip
    const formatAverageAppraisal = useCallback((item) => {
        if (item.average_appraisal !== undefined && item.average_appraisal !== null) {
            const value = parseFloat(item.average_appraisal);
            const formattedValue = isNaN(value) ? '' : value.toFixed(2).replace(/\.0+$/, '');

            return (
                <Tooltip title={formatAppraisalDetails(item)} arrow>
                    <span>{formattedValue}</span>
                </Tooltip>
            );
        }
        return null;
    }, [formatAppraisalDetails]);

    // Render header cells
    const renderHeaderCells = useMemo(() => {
        const headerCells = [];

        if (showColumns.select) {
            headerCells.push(<TableCell key="select">Select</TableCell>);
        }

        if (showColumns.quantity) {
            headerCells.push(
                <SortableTableCell
                    key="quantity"
                    label="Quantity"
                    field="quantity"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
            );
        }

        if (showColumns.name) {
            headerCells.push(
                <SortableTableCell
                    key="name"
                    label="Name"
                    field="name"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
            );
        }

        if (showColumns.unidentified) {
            headerCells.push(
                <SortableTableCell
                    key="unidentified"
                    label="Unidentified"
                    field="unidentified"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
            );
        }

        if (showColumns.type) {
            headerCells.push(
                <SortableTableCell
                    key="type"
                    label="Type"
                    field="type"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
            );
        }

        if (showColumns.size) {
            headerCells.push(
                <SortableTableCell
                    key="size"
                    label="Size"
                    field="size"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
            );
        }

        if (showColumns.whoHasIt) {
            headerCells.push(
                <SortableTableCell
                    key="character_names"
                    label="Who Has It?"
                    field="character_names"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
            );
        }

        if (showColumns.believedValue) {
            headerCells.push(
                <SortableTableCell
                    key="believedvalue"
                    label="Believed Value"
                    field="believedvalue"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
            );
        }

        if (showColumns.averageAppraisal) {
            headerCells.push(
                <SortableTableCell
                    key="average_appraisal"
                    label="Average Appraisal"
                    field="average_appraisal"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
            );
        }

        if (showColumns.pendingSale) {
            headerCells.push(
                <SortableTableCell
                    key="status"
                    label="Pending Sale"
                    field="status"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
            );
        }

        if (showColumns.sessionDate) {
            headerCells.push(
                <SortableTableCell
                    key="session_date"
                    label="Session Date"
                    field="session_date"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
            );
        }

        if (showColumns.lastUpdate) {
            headerCells.push(
                <SortableTableCell
                    key="lastupdate"
                    label="Last Update"
                    field="lastupdate"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />
            );
        }

        return headerCells;
    }, [showColumns, sortConfig, handleSort]);

    // Cell styles
    const mainCellStyle = {padding: '16px'};
    const subCellStyle = {padding: '4px'};

    return (
        <Paper sx={{p: 2}}>
            <Box sx={{position: 'sticky', top: 0, backgroundColor: 'background.paper', zIndex: 1}}>
                <Grid container spacing={2} sx={{mb: 2}}>
                    {showFilters.pendingSale && (
                        <Grid item>
                            <FormControlLabel
                                control={<Switch checked={filters.showPendingSales}
                                                 onChange={handleTogglePendingSales}/>}
                                label="Show Pending Sales"
                            />
                        </Grid>
                    )}

                    {showFilters.unidentified && (
                        <Grid item>
                            <FormControlLabel
                                control={<Switch checked={filters.showOnlyUnidentified}
                                                 onChange={handleToggleUnidentified}/>}
                                label="Show Only Unidentified"
                            />
                        </Grid>
                    )}

                    {showFilters.type && (
                        <Grid item>
                            <Button onClick={handleMenuOpen(setAnchorElType)}>Type Filters</Button>
                            <FilterMenu
                                anchorEl={anchorElType}
                                open={Boolean(anchorElType)}
                                onClose={handleMenuClose(setAnchorElType)}
                                title="Type Filters"
                                filters={filters.types}
                                onChange={handleTypeFilterChange}
                            />
                        </Grid>
                    )}

                    {showFilters.size && (
                        <Grid item>
                            <Button onClick={handleMenuOpen(setAnchorElSize)}>Size Filters</Button>
                            <FilterMenu
                                anchorEl={anchorElSize}
                                open={Boolean(anchorElSize)}
                                onClose={handleMenuClose(setAnchorElSize)}
                                title="Size Filters"
                                filters={filters.sizes}
                                onChange={handleSizeFilterChange}
                            />
                        </Grid>
                    )}

                    {showFilters.whoHas && (
                        <Grid item>
                            <Button onClick={handleMenuOpen(setAnchorElWhoHas)}>Who Has Filters</Button>
                            <Menu
                                anchorEl={anchorElWhoHas}
                                open={Boolean(anchorElWhoHas)}
                                onClose={handleMenuClose(setAnchorElWhoHas)}
                            >
                                {whoHasFilters.map((filter) => (
                                    <MenuItem key={filter.name}>
                                        <FormControlLabel
                                            control={<Checkbox checked={filter.checked || false}
                                                               onChange={() => handleWhoHasFilterChange(filter.name)}/>}
                                            label={filter.name}
                                        />
                                    </MenuItem>
                                ))}
                            </Menu>
                        </Grid>
                    )}
                </Grid>
            </Box>

            <TableContainer sx={{maxHeight: 'calc(100vh - 300px)', overflow: 'auto'}}>
                <Table stickyHeader>
                    <TableHead>
                        <TableRow>
                            {renderHeaderCells}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sortedLoot.map((item) => {
                            const individualItems = getIndividualItems(
                                item.name,
                                item.unidentified,
                                item.masterwork,
                                item.type,
                                item.size
                            );
                            const totalQuantity = individualItems.reduce((sum, item) => {
                                const qty = parseInt(item.quantity, 10);
                                return sum + (isNaN(qty) ? 0 : qty);
                            }, 0);

                            const key = `${item.name}-${item.unidentified}-${item.masterwork}-${item.type}-${item.size}`;
                            const isOpen = Boolean(openItems[key]);

                            return (
                                <React.Fragment key={key || `item-${item.id}`}>
                                    <TableRow>
                                        {showColumns.select && (
                                            <TableCell style={mainCellStyle}>
                                                <Checkbox
                                                    checked={individualItems.every((item) => selectedItems.includes(item.id))}
                                                    indeterminate={
                                                        individualItems.some((item) => selectedItems.includes(item.id)) &&
                                                        !individualItems.every((item) => selectedItems.includes(item.id))
                                                    }
                                                    onChange={() => individualItems.forEach((item) => handleSelectItem(item.id))}
                                                    inputProps={{ 'aria-label': `Select ${item.name}` }}
                                                />
                                            </TableCell>
                                        )}

                                        {showColumns.quantity && (
                                            <TableCell style={mainCellStyle}>{totalQuantity}</TableCell>
                                        )}

                                        {showColumns.name && (
                                            <TableCell style={mainCellStyle}>
                                                {individualItems.length > 1 && (
                                                    <IconButton
                                                        aria-label={isOpen ? "collapse row" : "expand row"}
                                                        size="small"
                                                        onClick={() => handleToggleOpen(
                                                            item.name,
                                                            item.unidentified,
                                                            item.masterwork,
                                                            item.type,
                                                            item.size
                                                        )}
                                                    >
                                                        {isOpen ? <KeyboardArrowUp/> : <KeyboardArrowDown/>}
                                                    </IconButton>
                                                )}
                                                <Tooltip title={item.notes || ''} arrow>
                                                    <span>{item.name || ''}</span>
                                                </Tooltip>
                                            </TableCell>
                                        )}

                                        {showColumns.unidentified && (
                                            <TableCell style={mainCellStyle}>
                                                {item.unidentified === true
                                                    ? <strong>Unidentified</strong>
                                                    : ''}
                                            </TableCell>
                                        )}

                                        {showColumns.type && <TableCell style={mainCellStyle}>{item.type || ''}</TableCell>}
                                        {showColumns.size && <TableCell style={mainCellStyle}>{item.size || ''}</TableCell>}
                                        {showColumns.whoHasIt && <TableCell style={mainCellStyle}>{item.character_names || ''}</TableCell>}
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
                                            <TableCell style={mainCellStyle}>
                                                {item.session_date ? formatDate(item.session_date) : ''}
                                            </TableCell>
                                        )}

                                        {showColumns.lastUpdate && (
                                            <TableCell style={mainCellStyle}>
                                                {item.lastupdate ? formatDate(item.lastupdate) : ''}
                                            </TableCell>
                                        )}
                                    </TableRow>

                                    {individualItems.length > 1 && (
                                        <TableRow>
                                            <TableCell style={{paddingBottom: 0, paddingTop: 0}}
                                                      colSpan={Object.values(showColumns).filter(Boolean).length}>
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
                                                            {individualItems.map((subItem) => (
                                                                <SubItemTableRow key={subItem.id || `subitem-${key}`}>
                                                                    {showColumns.select && (
                                                                        <TableCell style={subCellStyle}>
                                                                            <Checkbox
                                                                                checked={selectedItems.includes(subItem.id)}
                                                                                onChange={() => handleSelectItem(subItem.id)}
                                                                                inputProps={{ 'aria-label': `Select ${subItem.name}` }}
                                                                            />
                                                                        </TableCell>
                                                                    )}
                                                                    <TableCell style={subCellStyle}>{subItem.quantity || ''}</TableCell>
                                                                    {showColumns.size && <TableCell style={subCellStyle}>{subItem.size || ''}</TableCell>}
                                                                    {showColumns.whoHasIt && <TableCell style={subCellStyle}>{subItem.character_name || ''}</TableCell>}
                                                                    <TableCell style={subCellStyle}>
                                                                        {subItem.notes ? (
                                                                            <Tooltip title={subItem.notes} arrow>
                                                                                <span>View Notes</span>
                                                                            </Tooltip>
                                                                        ) : ''}
                                                                    </TableCell>
                                                                    {showColumns.sessionDate &&
                                                                        <TableCell style={subCellStyle}>
                                                                            {subItem.session_date ? formatDate(subItem.session_date) : ''}
                                                                        </TableCell>}
                                                                    {showColumns.lastUpdate &&
                                                                        <TableCell style={subCellStyle}>
                                                                            {subItem.lastupdate ? formatDate(subItem.lastupdate) : ''}
                                                                        </TableCell>}
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

CustomLootTable.propTypes = {
    loot: PropTypes.array,
    individualLoot: PropTypes.array,
    selectedItems: PropTypes.array,
    setSelectedItems: PropTypes.func.isRequired,
    openItems: PropTypes.object,
    setOpenItems: PropTypes.func.isRequired,
    handleSelectItem: PropTypes.func.isRequired,
    sortConfig: PropTypes.shape({
        key: PropTypes.string,
        direction: PropTypes.oneOf(['asc', 'desc'])
    }),
    setSortConfig: PropTypes.func.isRequired,
    showColumns: PropTypes.object,
    showFilters: PropTypes.object
};

export default CustomLootTable;