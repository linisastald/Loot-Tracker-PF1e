import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
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

// Helper function to safely normalize item properties for consistent keys
const normalizeItemProperty = (value) => {
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase();
};

// Custom hook for character data
const useCharacterData = () => {
    const [characters, setCharacters] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchCharacters = async () => {
            try {
                setIsLoading(true);
                const response = await api.get('/user/active-characters');
                const characterFilters = response.data.map(character => ({
                    name: character.name,
                    id: character.id,
                    checked: false
                }));
                setCharacters(characterFilters);
                setError(null);
            } catch (err) {
                console.error('Error fetching characters:', err);
                setError(err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCharacters();
    }, []);

    return { characters, isLoading, error };
};

// Accessible tooltip component
const AccessibleTooltip = React.memo(({ title, children }) => {
    if (!title) return children;

    return (
        <Tooltip
            title={title}
            arrow
            enterDelay={500}
            leaveDelay={200}
        >
            <span
                tabIndex={0}
                role="button"
                aria-label={`${children} (press for details)`}
                style={{ display: 'inline-block' }}
            >
                {children}
            </span>
        </Tooltip>
    );
});

// Table row component
const LootTableRow = React.memo(({
    item,
    isOpen,
    onToggleOpen,
    individualItems,
    selectedItems,
    onSelectItem,
    showColumns,
    totalQuantity,
    baseKey,
}) => {
    // Safe date formatter
    const safeFormatDate = useCallback((dateString) => {
        if (!dateString) return '';
        try {
            return formatDate(dateString);
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'Invalid date';
        }
    }, []);

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
                <AccessibleTooltip title={formatAppraisalDetails(item)}>
                    <span>{formattedValue}</span>
                </AccessibleTooltip>
            );
        }
        return null;
    }, [formatAppraisalDetails]);

    // Handle keyboard actions
    const handleKeyDown = useCallback((e, callback) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            callback();
        }
    }, []);

    const mainCellStyle = { padding: '16px' };
    const subCellStyle = { padding: '4px' };

    return (
        <React.Fragment>
            <TableRow>
                {showColumns.select && (
                    <TableCell style={mainCellStyle}>
                        <Checkbox
                            checked={individualItems.every((item) => selectedItems.includes(item.id))}
                            indeterminate={
                                individualItems.some((item) => selectedItems.includes(item.id)) &&
                                !individualItems.every((item) => selectedItems.includes(item.id))
                            }
                            onChange={() => individualItems.forEach((item) => onSelectItem(item.id))}
                            inputProps={{ 'aria-label': `Select ${item.name}` }}
                        />
                    </TableCell>
                )}

                {showColumns.quantity && <TableCell style={mainCellStyle}>{totalQuantity}</TableCell>}

                {showColumns.name && (
                    <TableCell style={mainCellStyle}>
                        {individualItems.length > 1 && (
                            <IconButton
                                aria-label={isOpen ? "collapse row" : "expand row"}
                                size="small"
                                onClick={() => onToggleOpen(baseKey)}
                                onKeyDown={(e) => handleKeyDown(e, () => onToggleOpen(baseKey))}
                            >
                                {isOpen ? <KeyboardArrowUp/> : <KeyboardArrowDown/>}
                            </IconButton>
                        )}
                        <AccessibleTooltip title={item.notes || ''}>
                            <span>{item.name || 'Unknown Item'}</span>
                        </AccessibleTooltip>
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
                    <TableCell style={mainCellStyle}>{safeFormatDate(item.session_date)}</TableCell>
                )}

                {showColumns.lastUpdate && (
                    <TableCell style={mainCellStyle}>{safeFormatDate(item.lastupdate)}</TableCell>
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
                                        <SubItemTableRow key={subItem.id || `subitem-${baseKey}-${subItem.quantity}`}>
                                            {showColumns.select && (
                                                <TableCell style={subCellStyle}>
                                                    <Checkbox
                                                        checked={selectedItems.includes(subItem.id)}
                                                        onChange={() => onSelectItem(subItem.id)}
                                                        inputProps={{ 'aria-label': `Select ${subItem.name}` }}
                                                    />
                                                </TableCell>
                                            )}
                                            <TableCell style={subCellStyle}>{subItem.quantity || 0}</TableCell>
                                            {showColumns.size && <TableCell style={subCellStyle}>{subItem.size || ''}</TableCell>}
                                            {showColumns.whoHasIt && <TableCell style={subCellStyle}>{subItem.character_name || ''}</TableCell>}
                                            <TableCell style={subCellStyle}>
                                                {subItem.notes ? (
                                                    <AccessibleTooltip title={subItem.notes}>
                                                        <span>View Notes</span>
                                                    </AccessibleTooltip>
                                                ) : ''}
                                            </TableCell>
                                            {showColumns.sessionDate &&
                                                <TableCell style={subCellStyle}>{safeFormatDate(subItem.session_date)}</TableCell>}
                                            {showColumns.lastUpdate &&
                                                <TableCell style={subCellStyle}>{safeFormatDate(subItem.lastupdate)}</TableCell>}
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
});

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
    // Get character data with custom hook
    const { characters } = useCharacterData();

    // Use a single state for all filters
    const [filters, setFilters] = useState({
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
    });

    // Initialize character filters when characters data loads
    useEffect(() => {
        if (characters.length > 0) {
            setFilters(prev => ({
                ...prev,
                whoHas: characters
            }));
        }
    }, [characters]);

    // Derive filter options from data - run once on component mount
    useEffect(() => {
        const typeOptions = { ...filters.types };
        const sizeOptions = { ...filters.sizes };

        // Extract unique types and sizes
        loot.forEach(item => {
            if (item.type && !typeOptions[item.type]) {
                typeOptions[item.type] = true;
            }
            if (item.size && !sizeOptions[item.size]) {
                sizeOptions[item.size] = true;
            }
        });

        setFilters(prev => ({
            ...prev,
            types: typeOptions,
            sizes: sizeOptions
        }));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Menu anchor states
    const [anchorElType, setAnchorElType] = useState(null);
    const [anchorElSize, setAnchorElSize] = useState(null);
    const [anchorElWhoHas, setAnchorElWhoHas] = useState(null);

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
        setFilters(prev => ({
            ...prev,
            whoHas: prev.whoHas.map(filter =>
                filter.name === name ? {...filter, checked: !filter.checked} : filter
            )
        }));
    }, []);

    // Menu handlers
    const handleMenuOpen = useCallback((setter) => (event) => {
        setter(event.currentTarget);
    }, []);

    const handleMenuClose = useCallback((setter) => () => {
        setter(null);
    }, []);

    // Toggle item expansion
    const handleToggleOpen = useCallback((key) => {
        setOpenItems((prevOpenItems) => ({
            ...prevOpenItems,
            [key]: !prevOpenItems[key]
        }));
    }, [setOpenItems]);

    // Sort handler
    const handleSort = useCallback((key) => {
        setSortConfig(prevConfig => ({
            key,
            direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
        }));
    }, [setSortConfig]);

    // Apply filters to the data - memoized
    const filteredLoot = useMemo(() => {
        if (!loot || !Array.isArray(loot)) return [];

        return loot.filter((item) => {
            // Early return for simple cases
            if (filters.showOnlyUnidentified && item.unidentified !== true) {
                return false;
            }

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
            const activeWhoHasFilters = filters.whoHas.filter(f => f.checked);
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
    }, [loot, filters]);

    // Sort the filtered data - memoized
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

    // Process individual items - memoized
    const processedItems = useMemo(() => {
        const itemsMap = new Map();

        // Group by key attributes
        sortedLoot.forEach(item => {
            const normalizedName = normalizeItemProperty(item.name);
            const normalizedType = normalizeItemProperty(item.type);
            const normalizedSize = normalizeItemProperty(item.size);
            const key = `${normalizedName}-${item.unidentified}-${item.masterwork}-${normalizedType}-${normalizedSize}`;

            if (!itemsMap.has(key)) {
                itemsMap.set(key, {
                    key,
                    item,
                    items: [],
                });
            }

            // Add this item to its group
            itemsMap.get(key).items.push(item);
        });

        // Convert map to array
        return Array.from(itemsMap.values());
    }, [sortedLoot]);

    // Get individual items matching the given criteria
    const getIndividualItems = useCallback((name, unidentified, masterwork, type, size) => {
        return individualLoot.filter(
            (item) =>
                item.name === name &&
                item.unidentified === unidentified &&
                item.masterwork === masterwork &&
                item.type === type &&
                item.size === size
        );
    }, [individualLoot]);

    // Render header cells based on showColumns configuration
    const renderHeaderCells = useCallback(() => {
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
    }, [sortConfig, showColumns, handleSort]);

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
                                {filters.whoHas.map((filter) => (
                                    <MenuItem key={filter.name || filter.id}>
                                        <FormControlLabel
                                            control={<Checkbox checked={!!filter.checked}
                                                               onChange={() => handleWhoHasFilterChange(filter.name)}/>}
                                            label={filter.name || ''}
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
                            {renderHeaderCells()}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {processedItems.map(({ key, item, items }) => {
                            const individualItems = getIndividualItems(
                                item.name,
                                item.unidentified,
                                item.masterwork,
                                item.type,
                                item.size
                            );
                            const totalQuantity = individualItems.reduce(
                                (sum, item) => sum + (parseInt(item.quantity) || 0),
                                0
                            );
                            const isOpen = !!openItems[key];

                            return (
                                <LootTableRow
                                    key={key}
                                    item={item}
                                    isOpen={isOpen}
                                    onToggleOpen={handleToggleOpen}
                                    individualItems={individualItems}
                                    selectedItems={selectedItems}
                                    onSelectItem={handleSelectItem}
                                    showColumns={showColumns}
                                    totalQuantity={totalQuantity}
                                    baseKey={key}
                                />
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

// Prop types
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

export default React.memo(CustomLootTable);