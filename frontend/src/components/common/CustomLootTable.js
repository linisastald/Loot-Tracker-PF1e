import React, {useEffect, useMemo, useState} from 'react';
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
import {KeyboardArrowDown, KeyboardArrowUp} from '@mui/icons-material';
import {formatDate} from '../../utils/utils';
import {styled} from '@mui/system';
import api from '../../utils/api';

// Styled components
const SubItemTableRow = styled(TableRow)(({theme}) => ({
    backgroundColor: theme.palette.action.hover,
    '& .MuiTableCell-root': {
        padding: '0px',
    },
}));

// Reusable components
const FilterMenu = ({anchorEl, open, onClose, title, filters, onChange}) => (
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
);

const SortableTableCell = ({label, field, sortConfig, onSort}) => (
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
                                 whoHasIt: true,
                             },
                             showFilters = {
                                 pendingSale: true,
                                 unidentified: true,
                                 type: true,
                                 size: true,
                                 whoHas: true,
                             },
                         }) => {
    // State for filters
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
    const [whoHasFilters, setWhoHasFilters] = useState([]);

    // Menu anchor states
    const [anchorElType, setAnchorElType] = useState(null);
    const [anchorElSize, setAnchorElSize] = useState(null);
    const [anchorElWhoHas, setAnchorElWhoHas] = useState(null);

    // Fetch active characters for "who has" filters
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

    // Helper functions
    const handleToggleOpen = (itemKey) => {
        setOpenItems((prevOpenItems) => ({
            ...prevOpenItems,
            [itemKey]: !prevOpenItems[itemKey]
        }));
    };

    // Generate a unique key for each summary item
    const getItemKey = (item) => {
        return `${item.name}-${item.unidentified}-${item.masterwork}-${item.type}-${item.size}-${item.session_date || ''}`;
    };

    const getIndividualItems = (itemKey) => {
        // Parse the key to extract properties
        const keyParts = itemKey.split('-');
        if (keyParts.length < 6) return [];

        const name = keyParts[0];
        const unidentified = keyParts[1] === 'true';
        const masterwork = keyParts[2] === 'true';
        const type = keyParts[3];
        const size = keyParts[4];
        const session_date = keyParts[5];

        return individualLoot.filter(
            (item) =>
                item.name === name &&
                item.unidentified === unidentified &&
                item.masterwork === masterwork &&
                item.type === type &&
                item.size === size &&
                (session_date ? formatDate(item.session_date) === formatDate(session_date) : true)
        );
    };

    // Filter handlers
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
                filter.name === name ? {...filter, checked: !filter.checked} : filter
            )
        );
    };

    // Menu handlers
    const handleMenuOpen = (setter) => (event) => {
        setter(event.currentTarget);
    };

    const handleMenuClose = (setter) => () => {
        setter(null);
    };

    // Sort handler
    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({key, direction});
    };

    // Apply filters to the data
    const filteredLoot = useMemo(() => {
        return loot.filter((item) => {
            // Unidentified filter
            const passesUnidentifiedFilter = !showOnlyUnidentified || item.unidentified === true;

            // Type filter
            const passesTypeFilter = Object.keys(typeFilters).some(type => {
                const itemType = (item.type || '').toLowerCase();
                const filterType = type.toLowerCase();
                return (
                    (filterType === 'other' && (!itemType || itemType === '') && typeFilters[type]) ||
                    (itemType === filterType && typeFilters[type])
                );
            });

            // Size filter
            const passesSizeFilter = sizeFilters[item.size] || (sizeFilters['Unknown'] && (!item.size || item.size === ''));

            // Who has filter
            const passesWhoHasFilter = whoHasFilters.every((filter) => !filter.checked) ||
                whoHasFilters.some((filter) => filter.checked && item.character_names && item.character_names.includes(filter.name));

            // Pending sale filter
            const passesPendingSaleFilter = showPendingSales || item.status !== 'Pending Sale';

            return passesUnidentifiedFilter && passesTypeFilter && passesSizeFilter &&
                passesWhoHasFilter && passesPendingSaleFilter;
        });
    }, [loot, showOnlyUnidentified, typeFilters, sizeFilters, whoHasFilters, showPendingSales]);

    // Sort the filtered data
    const sortedLoot = useMemo(() => {
        return [...filteredLoot].sort((a, b) => {
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
    }, [filteredLoot, sortConfig]);

    // Cell styles
    const mainCellStyle = {padding: '16px'};
    const subCellStyle = {padding: '4px'};

    // Helper function to format appraisal details and render tooltips
    const formatAppraisalDetails = (item) => {
        const appraisals = item.appraisals || [];

        if (!appraisals || appraisals.length === 0) {
            return 'No appraisals available';
        }

        return appraisals.map(appraisal => {
            const characterName = appraisal.character_name || 'Unknown';
            const value = parseFloat(appraisal.believedvalue);
            return `${characterName}: ${isNaN(value) ? '?' : value.toFixed(2)}`;
        }).join('\n');
    };

    const formatAverageAppraisal = (item) => {
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
    };

    // Render table header cells based on showColumns configuration
    const renderHeaderCells = () => {
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
    };

    return (
        <Paper sx={{p: 2}}>
            <Box sx={{position: 'sticky', top: 0, backgroundColor: 'background.paper', zIndex: 1}}>
                <Grid container spacing={2} sx={{mb: 2}}>
                    {showFilters.pendingSale && (
                        <Grid item>
                            <FormControlLabel
                                control={<Switch checked={showPendingSales}
                                                 onChange={() => setShowPendingSales(!showPendingSales)}/>}
                                label="Show Pending Sales"
                            />
                        </Grid>
                    )}

                    {showFilters.unidentified && (
                        <Grid item>
                            <FormControlLabel
                                control={<Switch checked={showOnlyUnidentified}
                                                 onChange={() => setShowOnlyUnidentified(!showOnlyUnidentified)}/>}
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
                                filters={typeFilters}
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
                                filters={sizeFilters}
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
                                            control={<Checkbox checked={filter.checked}
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
                            {renderHeaderCells()}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sortedLoot.map((item) => {
                            const itemKey = getItemKey(item);
                            const individualItems = getIndividualItems(itemKey);
                            const totalQuantity = individualItems.reduce((sum, item) => sum + item.quantity, 0);
                            const isOpen = openItems[itemKey];

                            return (
                                <React.Fragment key={itemKey}>
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

                                        {showColumns.quantity &&
                                            <TableCell style={mainCellStyle}>{totalQuantity}</TableCell>}

                                        {showColumns.name && (
                                            <TableCell style={mainCellStyle}>
                                                {individualItems.length > 1 && (
                                                    <IconButton
                                                        aria-label="expand row"
                                                        size="small"
                                                        onClick={() => handleToggleOpen(itemKey)}
                                                    >
                                                        {isOpen ? <KeyboardArrowUp/> : <KeyboardArrowDown/>}
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
                                        {showColumns.whoHasIt &&
                                            <TableCell style={mainCellStyle}>{item.character_names}</TableCell>}
                                        {showColumns.believedValue &&
                                            <TableCell style={mainCellStyle}>{item.believedvalue || ''}</TableCell>}

                                        {showColumns.averageAppraisal && (
                                            <TableCell style={mainCellStyle}>
                                                {formatAverageAppraisal(item)}
                                            </TableCell>
                                        )}

                                        {showColumns.pendingSale && (
                                            <TableCell
                                                style={mainCellStyle}>{item.status === 'Pending Sale' ? '✔' : ''}</TableCell>
                                        )}

                                        {showColumns.sessionDate && (
                                            <TableCell
                                                style={mainCellStyle}>{item.session_date ? formatDate(item.session_date) : ''}</TableCell>
                                        )}

                                        {showColumns.lastUpdate && (
                                            <TableCell
                                                style={mainCellStyle}>{item.lastupdate ? formatDate(item.lastupdate) : ''}</TableCell>
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
                                                                {showColumns.select &&
                                                                    <TableCell style={subCellStyle}>Select</TableCell>}
                                                                <TableCell style={subCellStyle}>Quantity</TableCell>
                                                                {showColumns.size &&
                                                                    <TableCell style={subCellStyle}>Size</TableCell>}
                                                                {showColumns.whoHasIt &&
                                                                    <TableCell style={subCellStyle}>Who Has
                                                                        It?</TableCell>}
                                                                <TableCell style={subCellStyle}>Notes</TableCell>
                                                                {showColumns.sessionDate &&
                                                                    <TableCell style={subCellStyle}>Session
                                                                        Date</TableCell>}
                                                                {showColumns.lastUpdate &&
                                                                    <TableCell style={subCellStyle}>Last
                                                                        Update</TableCell>}
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
                                                                    <TableCell
                                                                        style={subCellStyle}>{subItem.quantity}</TableCell>
                                                                    {showColumns.size && <TableCell
                                                                        style={subCellStyle}>{subItem.size}</TableCell>}
                                                                    {showColumns.whoHasIt && <TableCell
                                                                        style={subCellStyle}>{subItem.character_name}</TableCell>}
                                                                    <TableCell style={subCellStyle}>
                                                                        {subItem.notes ? (
                                                                            <Tooltip title={subItem.notes} arrow>
                                                                                <span>Hover for Notes</span>
                                                                            </Tooltip>
                                                                        ) : ''}
                                                                    </TableCell>
                                                                    {showColumns.sessionDate && <TableCell
                                                                        style={subCellStyle}>{subItem.session_date ? formatDate(subItem.session_date) : ''}</TableCell>}
                                                                    {showColumns.lastUpdate && <TableCell
                                                                        style={subCellStyle}>{subItem.lastupdate ? formatDate(subItem.lastupdate) : ''}</TableCell>}
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