import React, { useState } from 'react';
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

// Styled components
const SubItemTableRow = styled(TableRow)(({theme}) => ({
    backgroundColor: theme.palette.action.hover,
    '& .MuiTableCell-root': {
        padding: '0px',
    },
}));

// Main component without optimization techniques that might cause issues
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
    // Basic filter states without complex interactions
    const [showPendingSales, setShowPendingSales] = useState(true);
    const [showOnlyUnidentified, setShowOnlyUnidentified] = useState(false);
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

    // Menu anchor states
    const [anchorElType, setAnchorElType] = useState(null);
    const [anchorElSize, setAnchorElSize] = useState(null);

    // Simple handler functions without dependencies
    const handleTypeMenuOpen = (event) => setAnchorElType(event.currentTarget);
    const handleTypeMenuClose = () => setAnchorElType(null);
    const handleSizeMenuOpen = (event) => setAnchorElSize(event.currentTarget);
    const handleSizeMenuClose = () => setAnchorElSize(null);

    // Apply filtering logic
    let filteredData = [...loot];

    // Only apply filters if needed to avoid unnecessary processing
    if (showOnlyUnidentified) {
        filteredData = filteredData.filter(item => item.unidentified === true);
    }

    if (!showPendingSales) {
        filteredData = filteredData.filter(item => item.status !== 'Pending Sale');
    }

    // Type filters
    filteredData = filteredData.filter(item => {
        if (!item.type && typeFilters['Other']) return true;
        return item.type && typeFilters[item.type];
    });

    // Size filters
    filteredData = filteredData.filter(item => {
        if (!item.size && sizeFilters['Unknown']) return true;
        return item.size && sizeFilters[item.size];
    });

    // Apply sorting
    if (sortConfig.key) {
        filteredData.sort((a, b) => {
            // Handle null values
            if (a[sortConfig.key] === null) return 1;
            if (b[sortConfig.key] === null) return -1;
            if (a[sortConfig.key] === undefined) return 1;
            if (b[sortConfig.key] === undefined) return -1;

            // Sort based on type
            const direction = sortConfig.direction === 'asc' ? 1 : -1;

            if (sortConfig.key === 'session_date' || sortConfig.key === 'lastupdate') {
                return direction * (new Date(a[sortConfig.key]) - new Date(b[sortConfig.key]));
            }

            if (typeof a[sortConfig.key] === 'number') {
                return direction * (a[sortConfig.key] - b[sortConfig.key]);
            }

            return direction * String(a[sortConfig.key]).localeCompare(String(b[sortConfig.key]));
        });
    }

    // Get items that match the main item's properties
    const getMatchingItems = (item) => {
        return individualLoot.filter(i =>
            i.name === item.name &&
            i.unidentified === item.unidentified &&
            i.masterwork === item.masterwork &&
            i.type === item.type &&
            i.size === item.size
        );
    };

    // Simple toggle function
    const toggleItemOpen = (item) => {
        const key = `${item.name}-${item.unidentified}-${item.masterwork}-${item.type}-${item.size}`;
        setOpenItems({
            ...openItems,
            [key]: !openItems[key]
        });
    };

    // Format for tooltips
    const formatAppraisalInfo = (item) => {
        if (!item.appraisals || item.appraisals.length === 0) {
            return 'No appraisals';
        }

        return item.appraisals
            .map(a => `${a.character_name || 'Unknown'}: ${parseFloat(a.believedvalue || 0).toFixed(2)}`)
            .join('\n');
    };

    return (
        <Paper sx={{p: 2}}>
            {/* Filter controls */}
            <Box sx={{mb: 2}}>
                <Grid container spacing={2}>
                    {showFilters.pendingSale && (
                        <Grid item>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={showPendingSales}
                                        onChange={() => setShowPendingSales(!showPendingSales)}
                                    />
                                }
                                label="Show Pending Sales"
                            />
                        </Grid>
                    )}

                    {showFilters.unidentified && (
                        <Grid item>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={showOnlyUnidentified}
                                        onChange={() => setShowOnlyUnidentified(!showOnlyUnidentified)}
                                    />
                                }
                                label="Show Only Unidentified"
                            />
                        </Grid>
                    )}

                    {showFilters.type && (
                        <Grid item>
                            <Button onClick={handleTypeMenuOpen}>Type Filters</Button>
                            <Menu
                                anchorEl={anchorElType}
                                open={Boolean(anchorElType)}
                                onClose={handleTypeMenuClose}
                            >
                                {Object.entries(typeFilters).map(([type, checked]) => (
                                    <MenuItem key={type}>
                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={checked}
                                                    onChange={() => {
                                                        setTypeFilters({
                                                            ...typeFilters,
                                                            [type]: !checked
                                                        });
                                                    }}
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
                            <Button onClick={handleSizeMenuOpen}>Size Filters</Button>
                            <Menu
                                anchorEl={anchorElSize}
                                open={Boolean(anchorElSize)}
                                onClose={handleSizeMenuClose}
                            >
                                {Object.entries(sizeFilters).map(([size, checked]) => (
                                    <MenuItem key={size}>
                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={checked}
                                                    onChange={() => {
                                                        setSizeFilters({
                                                            ...sizeFilters,
                                                            [size]: !checked
                                                        });
                                                    }}
                                                />
                                            }
                                            label={size}
                                        />
                                    </MenuItem>
                                ))}
                            </Menu>
                        </Grid>
                    )}
                </Grid>
            </Box>

            {/* Table */}
            <TableContainer sx={{maxHeight: 'calc(100vh - 300px)', overflow: 'auto'}}>
                <Table stickyHeader>
                    <TableHead>
                        <TableRow>
                            {/* Header cells */}
                            {showColumns.select && <TableCell>Select</TableCell>}

                            {showColumns.quantity && (
                                <TableCell>
                                    <TableSortLabel
                                        active={sortConfig.key === 'quantity'}
                                        direction={sortConfig.direction || 'asc'}
                                        onClick={() => setSortConfig({
                                            key: 'quantity',
                                            direction: sortConfig.key === 'quantity' && sortConfig.direction === 'asc' ? 'desc' : 'asc'
                                        })}
                                    >
                                        Quantity
                                    </TableSortLabel>
                                </TableCell>
                            )}

                            {showColumns.name && (
                                <TableCell>
                                    <TableSortLabel
                                        active={sortConfig.key === 'name'}
                                        direction={sortConfig.direction || 'asc'}
                                        onClick={() => setSortConfig({
                                            key: 'name',
                                            direction: sortConfig.key === 'name' && sortConfig.direction === 'asc' ? 'desc' : 'asc'
                                        })}
                                    >
                                        Name
                                    </TableSortLabel>
                                </TableCell>
                            )}

                            {showColumns.unidentified && <TableCell>Unidentified</TableCell>}
                            {showColumns.type && <TableCell>Type</TableCell>}
                            {showColumns.size && <TableCell>Size</TableCell>}
                            {showColumns.whoHasIt && <TableCell>Who Has It?</TableCell>}
                            {showColumns.believedValue && <TableCell>Believed Value</TableCell>}
                            {showColumns.averageAppraisal && <TableCell>Average Appraisal</TableCell>}
                            {showColumns.pendingSale && <TableCell>Pending Sale</TableCell>}
                            {showColumns.sessionDate && <TableCell>Session Date</TableCell>}
                            {showColumns.lastUpdate && <TableCell>Last Update</TableCell>}
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {filteredData.map(item => {
                            const matchingItems = getMatchingItems(item);
                            const totalQuantity = matchingItems.reduce((sum, i) => {
                                const qty = parseInt(i.quantity, 10);
                                return sum + (isNaN(qty) ? 0 : qty);
                            }, 0);

                            const key = `${item.name}-${item.unidentified}-${item.masterwork}-${item.type}-${item.size}`;
                            const isOpen = Boolean(openItems[key]);

                            return (
                                <React.Fragment key={key}>
                                    {/* Main row */}
                                    <TableRow>
                                        {showColumns.select && (
                                            <TableCell>
                                                <Checkbox
                                                    checked={matchingItems.every(i => selectedItems.includes(i.id))}
                                                    indeterminate={
                                                        matchingItems.some(i => selectedItems.includes(i.id)) &&
                                                        !matchingItems.every(i => selectedItems.includes(i.id))
                                                    }
                                                    onChange={() => {
                                                        matchingItems.forEach(i => handleSelectItem(i.id));
                                                    }}
                                                />
                                            </TableCell>
                                        )}

                                        {showColumns.quantity && <TableCell>{totalQuantity}</TableCell>}

                                        {showColumns.name && (
                                            <TableCell>
                                                {matchingItems.length > 1 && (
                                                    <IconButton size="small" onClick={() => toggleItemOpen(item)}>
                                                        {isOpen ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                                                    </IconButton>
                                                )}
                                                <Tooltip title={item.notes || ''}>
                                                    <span>{item.name}</span>
                                                </Tooltip>
                                            </TableCell>
                                        )}

                                        {showColumns.unidentified && (
                                            <TableCell>
                                                {item.unidentified === true ? <strong>Unidentified</strong> : ''}
                                            </TableCell>
                                        )}

                                        {showColumns.type && <TableCell>{item.type || ''}</TableCell>}
                                        {showColumns.size && <TableCell>{item.size || ''}</TableCell>}
                                        {showColumns.whoHasIt && <TableCell>{item.character_names || ''}</TableCell>}
                                        {showColumns.believedValue && <TableCell>{item.believedvalue || ''}</TableCell>}

                                        {showColumns.averageAppraisal && (
                                            <TableCell>
                                                {item.average_appraisal && (
                                                    <Tooltip title={formatAppraisalInfo(item)}>
                                                        <span>{parseFloat(item.average_appraisal).toFixed(2)}</span>
                                                    </Tooltip>
                                                )}
                                            </TableCell>
                                        )}

                                        {showColumns.pendingSale && (
                                            <TableCell>{item.status === 'Pending Sale' ? '✓' : ''}</TableCell>
                                        )}

                                        {showColumns.sessionDate && (
                                            <TableCell>
                                                {item.session_date ? formatDate(item.session_date) : ''}
                                            </TableCell>
                                        )}

                                        {showColumns.lastUpdate && (
                                            <TableCell>
                                                {item.lastupdate ? formatDate(item.lastupdate) : ''}
                                            </TableCell>
                                        )}
                                    </TableRow>

                                    {/* Expandable section for items with multiple entries */}
                                    {matchingItems.length > 1 && (
                                        <TableRow>
                                            <TableCell padding="0" colSpan={Object.values(showColumns).filter(Boolean).length}>
                                                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                                                    <Box p={1}>
                                                        <Table size="small">
                                                            <TableHead>
                                                                <TableRow>
                                                                    {showColumns.select && <TableCell>Select</TableCell>}
                                                                    <TableCell>Quantity</TableCell>
                                                                    {showColumns.size && <TableCell>Size</TableCell>}
                                                                    {showColumns.whoHasIt && <TableCell>Who Has It?</TableCell>}
                                                                    <TableCell>Notes</TableCell>
                                                                    {showColumns.sessionDate && <TableCell>Session Date</TableCell>}
                                                                    {showColumns.lastUpdate && <TableCell>Last Update</TableCell>}
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {matchingItems.map(subItem => (
                                                                    <SubItemTableRow key={`subitem-${subItem.id}`}>
                                                                        {showColumns.select && (
                                                                            <TableCell>
                                                                                <Checkbox
                                                                                    checked={selectedItems.includes(subItem.id)}
                                                                                    onChange={() => handleSelectItem(subItem.id)}
                                                                                />
                                                                            </TableCell>
                                                                        )}
                                                                        <TableCell>{subItem.quantity || ''}</TableCell>
                                                                        {showColumns.size && <TableCell>{subItem.size || ''}</TableCell>}
                                                                        {showColumns.whoHasIt && <TableCell>{subItem.character_name || ''}</TableCell>}
                                                                        <TableCell>
                                                                            {subItem.notes ? (
                                                                                <Tooltip title={subItem.notes}>
                                                                                    <span>View Notes</span>
                                                                                </Tooltip>
                                                                            ) : ''}
                                                                        </TableCell>
                                                                        {showColumns.sessionDate && (
                                                                            <TableCell>
                                                                                {subItem.session_date ? formatDate(subItem.session_date) : ''}
                                                                            </TableCell>
                                                                        )}
                                                                        {showColumns.lastUpdate && (
                                                                            <TableCell>
                                                                                {subItem.lastupdate ? formatDate(subItem.lastupdate) : ''}
                                                                            </TableCell>
                                                                        )}
                                                                    </SubItemTableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </Box>
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