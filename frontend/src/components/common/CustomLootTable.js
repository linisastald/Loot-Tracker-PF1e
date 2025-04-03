import React, { useState, useCallback } from 'react';
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
import PropTypes from 'prop-types';

// Styled components
const SubItemTableRow = styled(TableRow)(({theme}) => ({
    backgroundColor: theme.palette.action.hover,
    '& .MuiTableCell-root': {
        padding: '0px',
    },
}));

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
    // Simple filter states
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

    // Filter handlers
    const handleTogglePendingSales = () => setShowPendingSales(!showPendingSales);
    const handleToggleUnidentified = () => setShowOnlyUnidentified(!showOnlyUnidentified);

    const handleTypeFilterChange = (type) => {
        setTypeFilters(prev => ({
            ...prev,
            [type]: !prev[type]
        }));
    };

    const handleSizeFilterChange = (size) => {
        setSizeFilters(prev => ({
            ...prev,
            [size]: !prev[size]
        }));
    };

    // Menu handlers
    const handleTypeMenuOpen = (event) => setAnchorElType(event.currentTarget);
    const handleTypeMenuClose = () => setAnchorElType(null);
    const handleSizeMenuOpen = (event) => setAnchorElSize(event.currentTarget);
    const handleSizeMenuClose = () => setAnchorElSize(null);

    // Toggle item expansion
    const handleToggleOpen = useCallback((name, unidentified, masterwork, type, size) => {
        const key = `${name}-${unidentified}-${masterwork}-${type}-${size}`;
        setOpenItems(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    }, [setOpenItems]);

    // Sort handler
    const handleSort = useCallback((key) => {
        setSortConfig(prevConfig => ({
            key,
            direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
        }));
    }, [setSortConfig]);

    // Filter the data (simple implementation)
    const filteredLoot = loot.filter(item => {
        if (showOnlyUnidentified && item.unidentified !== true) return false;
        if (!showPendingSales && item.status === 'Pending Sale') return false;

        // Type filter
        const hasType = item.type && typeFilters[item.type];
        const isOther = !item.type && typeFilters['Other'];
        if (!hasType && !isOther) return false;

        // Size filter
        if (item.size && !sizeFilters[item.size]) return false;
        if (!item.size && !sizeFilters['Unknown']) return false;

        return true;
    });

    // Sort the filtered data
    const sortedLoot = [...filteredLoot].sort((a, b) => {
        if (!sortConfig.key) return 0;

        const valueA = a[sortConfig.key];
        const valueB = b[sortConfig.key];

        if (valueA === valueB) return 0;
        if (valueA === undefined || valueA === null) return 1;
        if (valueB === undefined || valueB === null) return -1;

        const direction = sortConfig.direction === 'asc' ? 1 : -1;

        if (typeof valueA === 'number' && typeof valueB === 'number') {
            return direction * (valueA - valueB);
        }

        if (sortConfig.key === 'session_date' || sortConfig.key === 'lastupdate') {
            return direction * (new Date(valueA) - new Date(valueB));
        }

        return direction * String(valueA).localeCompare(String(valueB));
    });

    // Get individual items for a group
    const getIndividualItems = (name, unidentified, masterwork, type, size) => {
        return individualLoot.filter(item => {
            return item.name === name &&
                   item.unidentified === unidentified &&
                   item.masterwork === masterwork &&
                   (item.type || '') === (type || '') &&
                   (item.size || '') === (size || '');
        });
    };

    // Format appraisal tooltip
    const formatAppraisalDetails = (item) => {
        const appraisals = item.appraisals || [];
        if (appraisals.length === 0) return 'No appraisals available';

        return appraisals.map(appraisal => {
            const characterName = appraisal.character_name || 'Unknown';
            const value = parseFloat(appraisal.believedvalue);
            return `${characterName}: ${isNaN(value) ? '?' : value.toFixed(2)}`;
        }).join('\n');
    };

    // Render header cells
    const renderHeaderCells = () => {
        const cells = [];

        if (showColumns.select) {
            cells.push(<TableCell key="select">Select</TableCell>);
        }
        if (showColumns.quantity) {
            cells.push(
                <TableCell key="quantity">
                    <TableSortLabel
                        active={sortConfig.key === 'quantity'}
                        direction={sortConfig.direction || 'asc'}
                        onClick={() => handleSort('quantity')}
                    >
                        Quantity
                    </TableSortLabel>
                </TableCell>
            );
        }
        if (showColumns.name) {
            cells.push(
                <TableCell key="name">
                    <TableSortLabel
                        active={sortConfig.key === 'name'}
                        direction={sortConfig.direction || 'asc'}
                        onClick={() => handleSort('name')}
                    >
                        Name
                    </TableSortLabel>
                </TableCell>
            );
        }
        if (showColumns.unidentified) {
            cells.push(
                <TableCell key="unidentified">
                    <TableSortLabel
                        active={sortConfig.key === 'unidentified'}
                        direction={sortConfig.direction || 'asc'}
                        onClick={() => handleSort('unidentified')}
                    >
                        Unidentified
                    </TableSortLabel>
                </TableCell>
            );
        }
        if (showColumns.type) {
            cells.push(
                <TableCell key="type">
                    <TableSortLabel
                        active={sortConfig.key === 'type'}
                        direction={sortConfig.direction || 'asc'}
                        onClick={() => handleSort('type')}
                    >
                        Type
                    </TableSortLabel>
                </TableCell>
            );
        }
        if (showColumns.size) {
            cells.push(
                <TableCell key="size">
                    <TableSortLabel
                        active={sortConfig.key === 'size'}
                        direction={sortConfig.direction || 'asc'}
                        onClick={() => handleSort('size')}
                    >
                        Size
                    </TableSortLabel>
                </TableCell>
            );
        }
        if (showColumns.whoHasIt) {
            cells.push(
                <TableCell key="character_names">
                    <TableSortLabel
                        active={sortConfig.key === 'character_names'}
                        direction={sortConfig.direction || 'asc'}
                        onClick={() => handleSort('character_names')}
                    >
                        Who Has It?
                    </TableSortLabel>
                </TableCell>
            );
        }
        if (showColumns.believedValue) {
            cells.push(
                <TableCell key="believedvalue">
                    <TableSortLabel
                        active={sortConfig.key === 'believedvalue'}
                        direction={sortConfig.direction || 'asc'}
                        onClick={() => handleSort('believedvalue')}
                    >
                        Believed Value
                    </TableSortLabel>
                </TableCell>
            );
        }
        if (showColumns.averageAppraisal) {
            cells.push(
                <TableCell key="average_appraisal">
                    <TableSortLabel
                        active={sortConfig.key === 'average_appraisal'}
                        direction={sortConfig.direction || 'asc'}
                        onClick={() => handleSort('average_appraisal')}
                    >
                        Average Appraisal
                    </TableSortLabel>
                </TableCell>
            );
        }
        if (showColumns.pendingSale) {
            cells.push(
                <TableCell key="status">
                    <TableSortLabel
                        active={sortConfig.key === 'status'}
                        direction={sortConfig.direction || 'asc'}
                        onClick={() => handleSort('status')}
                    >
                        Pending Sale
                    </TableSortLabel>
                </TableCell>
            );
        }
        if (showColumns.sessionDate) {
            cells.push(
                <TableCell key="session_date">
                    <TableSortLabel
                        active={sortConfig.key === 'session_date'}
                        direction={sortConfig.direction || 'asc'}
                        onClick={() => handleSort('session_date')}
                    >
                        Session Date
                    </TableSortLabel>
                </TableCell>
            );
        }
        if (showColumns.lastUpdate) {
            cells.push(
                <TableCell key="lastupdate">
                    <TableSortLabel
                        active={sortConfig.key === 'lastupdate'}
                        direction={sortConfig.direction || 'asc'}
                        onClick={() => handleSort('lastupdate')}
                    >
                        Last Update
                    </TableSortLabel>
                </TableCell>
            );
        }

        return cells;
    };

    return (
        <Paper sx={{p: 2}}>
            <Box sx={{position: 'sticky', top: 0, backgroundColor: 'background.paper', zIndex: 1}}>
                <Grid container spacing={2} sx={{mb: 2}}>
                    {showFilters.pendingSale && (
                        <Grid item>
                            <FormControlLabel
                                control={<Switch checked={showPendingSales} onChange={handleTogglePendingSales}/>}
                                label="Show Pending Sales"
                            />
                        </Grid>
                    )}

                    {showFilters.unidentified && (
                        <Grid item>
                            <FormControlLabel
                                control={<Switch checked={showOnlyUnidentified} onChange={handleToggleUnidentified}/>}
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
                                {Object.entries(typeFilters).map(([key, checked]) => (
                                    <MenuItem key={key}>
                                        <FormControlLabel
                                            control={<Checkbox checked={checked} onChange={() => handleTypeFilterChange(key)}/>}
                                            label={key}
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
                                {Object.entries(sizeFilters).map(([key, checked]) => (
                                    <MenuItem key={key}>
                                        <FormControlLabel
                                            control={<Checkbox checked={checked} onChange={() => handleSizeFilterChange(key)}/>}
                                            label={key}
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
                                <React.Fragment key={key}>
                                    <TableRow>
                                        {showColumns.select && (
                                            <TableCell>
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
                                            <TableCell>{totalQuantity}</TableCell>
                                        )}

                                        {showColumns.name && (
                                            <TableCell>
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
                                            <TableCell>
                                                {item.unidentified === true
                                                    ? <strong>Unidentified</strong>
                                                    : ''}
                                            </TableCell>
                                        )}

                                        {showColumns.type && <TableCell>{item.type || ''}</TableCell>}
                                        {showColumns.size && <TableCell>{item.size || ''}</TableCell>}
                                        {showColumns.whoHasIt && <TableCell>{item.character_names || ''}</TableCell>}
                                        {showColumns.believedValue && <TableCell>{item.believedvalue || ''}</TableCell>}

                                        {showColumns.averageAppraisal && (
                                            <TableCell>
                                                {item.average_appraisal && (
                                                    <Tooltip title={formatAppraisalDetails(item)} arrow>
                                                        <span>
                                                            {parseFloat(item.average_appraisal).toFixed(2).replace(/\.0+$/, '')}
                                                        </span>
                                                    </Tooltip>
                                                )}
                                            </TableCell>
                                        )}

                                        {showColumns.pendingSale && (
                                            <TableCell>{item.status === 'Pending Sale' ? '✔' : ''}</TableCell>
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

                                    {individualItems.length > 1 && (
                                        <TableRow>
                                            <TableCell style={{paddingBottom: 0, paddingTop: 0}}
                                                      colSpan={Object.values(showColumns).filter(Boolean).length}>
                                                <Collapse in={isOpen} timeout="auto" unmountOnExit>
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
                                                            {individualItems.map((subItem) => (
                                                                <SubItemTableRow key={subItem.id}>
                                                                    {showColumns.select && (
                                                                        <TableCell>
                                                                            <Checkbox
                                                                                checked={selectedItems.includes(subItem.id)}
                                                                                onChange={() => handleSelectItem(subItem.id)}
                                                                                inputProps={{ 'aria-label': `Select ${subItem.name}` }}
                                                                            />
                                                                        </TableCell>
                                                                    )}
                                                                    <TableCell>{subItem.quantity || ''}</TableCell>
                                                                    {showColumns.size && <TableCell>{subItem.size || ''}</TableCell>}
                                                                    {showColumns.whoHasIt && <TableCell>{subItem.character_name || ''}</TableCell>}
                                                                    <TableCell>
                                                                        {subItem.notes ? (
                                                                            <Tooltip title={subItem.notes} arrow>
                                                                                <span>View Notes</span>
                                                                            </Tooltip>
                                                                        ) : ''}
                                                                    </TableCell>
                                                                    {showColumns.sessionDate &&
                                                                        <TableCell>
                                                                            {subItem.session_date ? formatDate(subItem.session_date) : ''}
                                                                        </TableCell>}
                                                                    {showColumns.lastUpdate &&
                                                                        <TableCell>
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