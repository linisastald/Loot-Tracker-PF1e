// frontend/src/components/pages/ItemManagement/GeneralItemManagement.js
import React, {useState} from 'react';
import lootService from '../../../services/lootService';
import {updateItemAsDM} from '../../../utils/utils';
import {
  Alert,
  Box,
  Button,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import ItemManagementDialog from '../../common/dialogs/ItemManagementDialog';
import { useCampaignTimezone } from '../../../hooks/useCampaignTimezone';
import { formatInCampaignTimezone } from '../../../utils/timezoneUtils';
import { ITEM_SIZES, ITEM_TYPES } from '../../../utils/itemOptions';

const ANY = {value: '', label: 'Any'};
const NULL_OR_VALUE = (valueLabel) => [ANY, {value: 'null', label: 'Null'}, {value: 'notnull', label: valueLabel}];

// One entry per advanced-search dropdown; the key is the search parameter name
const FILTERS = [
    {key: 'unidentified', label: 'Unidentified', options: [ANY, {value: 'true', label: 'Yes'}, {value: 'false', label: 'No'}]},
    {key: 'type', label: 'Type', options: [ANY, ...ITEM_TYPES]},
    {key: 'size', label: 'Size', options: [ANY, ...ITEM_SIZES.map((size) => ({value: size, label: size}))]},
    {
        key: 'status', label: 'Status',
        options: [ANY, ...['Pending Sale', 'Kept Character', 'Kept Party', 'Trashed', 'Sold'].map((status) => ({value: status, label: status}))],
    },
    {key: 'itemid', label: 'Item ID', options: NULL_OR_VALUE('Has Value')},
    {key: 'modids', label: 'Mod IDs', options: NULL_OR_VALUE('Has Values')},
    {key: 'value', label: 'Value', options: NULL_OR_VALUE('Has Value')},
];

const EMPTY_FILTERS = Object.fromEntries(FILTERS.map(({key}) => [key, '']));

const COLUMNS = [
    {key: 'session_date', label: 'Session Date'},
    {key: 'quantity', label: 'Quantity', numeric: true},
    {key: 'name', label: 'Name'},
    {key: 'unidentified', label: 'Unidentified'},
    {key: 'masterwork', label: 'Masterwork'},
    {key: 'type', label: 'Type'},
    {key: 'size', label: 'Size'},
    {key: 'status', label: 'Status'},
    {key: 'value', label: 'Value', numeric: true},
    {key: 'notes', label: 'Notes'},
];

// Missing values sort first ascending; numeric columns compare as numbers
const compareValues = (a, b, numeric) => {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (numeric) return Number(a) - Number(b);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
};

const GeneralItemManagement = () => {
    const { timezone } = useCampaignTimezone();
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredItems, setFilteredItems] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    // direction is the MUI value: 'asc' | 'desc'
    const [sortConfig, setSortConfig] = useState({key: null, direction: 'asc'});
    const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState({});
    const [advancedSearch, setAdvancedSearch] = useState(EMPTY_FILTERS);

    const handleSearch = async () => {
        try {
            const searchParams = {
                query: searchTerm,
                ...Object.fromEntries(
                    Object.entries(advancedSearch).filter(([, value]) => value)
                )
            };
            const response = await lootService.searchLoot(searchParams);
            // Check if the response has the expected structure
            if (response.data && response.data.items) {
                setFilteredItems(response.data.items);
            } else if (Array.isArray(response.data)) {
                setFilteredItems(response.data);
            } else {
                setError('Unexpected response structure from server');
                setFilteredItems([]);
            }
        } catch {
            setError('Error searching items');
            setFilteredItems([]);
        }
    };

    const handleClearSearch = () => {
        setFilteredItems([]);
        setSearchTerm('');
        setAdvancedSearch(EMPTY_FILTERS);
    };

    const requestSort = (key) => {
        const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
        setSortConfig({key, direction});
    };

    const sortedItems = React.useMemo(() => {
        if (!filteredItems || !Array.isArray(filteredItems)) {
            return [];
        }
        const sortableItems = [...filteredItems];
        if (sortConfig.key !== null) {
            const {numeric} = COLUMNS.find(({key}) => key === sortConfig.key) || {};
            const sign = sortConfig.direction === 'asc' ? 1 : -1;
            sortableItems.sort((a, b) => sign * compareValues(a[sortConfig.key], b[sortConfig.key], numeric));
        }
        return sortableItems;
    }, [filteredItems, sortConfig]);

    const handleItemUpdateSubmit = async (updatedData) => {
        // Use the utility function for updating
        await updateItemAsDM(
            selectedItem.id,
            updatedData,
            (successMessage) => {
                setSuccess(successMessage);
                setUpdateDialogOpen(false);
                // Refresh the search results to show updated data
                handleSearch();
            },
            (errorMessage) => {
                setError(errorMessage);
            }
        );
    };

    return (
        <>
            <Typography variant="h6" gutterBottom>General Item Search</Typography>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {success && <Alert severity="success" sx={{mb: 2}}>{success}</Alert>}
            <Box
                sx={{
                    mt: 2,
                    mb: 2
                }}>
                <Grid container spacing={2} size={12}>
                    <Grid size={{xs: 12, md: 6}}>
                        <TextField
                            label="Search Items"
                            variant="outlined"
                            fullWidth
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                    handleSearch();
                                }
                            }}
                        />
                    </Grid>
                    {FILTERS.map(({key, label, options}) => (
                        <Grid key={key} size={{xs: 12, md: 3}}>
                            <FormControl fullWidth>
                                <InputLabel>{label}</InputLabel>
                                <Select
                                    value={advancedSearch[key]}
                                    onChange={(e) => setAdvancedSearch(prev => ({...prev, [key]: e.target.value}))}
                                >
                                    {options.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                    ))}
                    <Grid size={{xs: 12, md: 3}}>
                        <Box sx={{display: 'flex', gap: 1}}>
                            <Button variant="outlined" color="primary" onClick={handleSearch} fullWidth>
                                Search
                            </Button>
                            <Button variant="outlined" color="secondary" onClick={handleClearSearch} fullWidth>
                                Clear
                            </Button>
                        </Box>
                    </Grid>
                </Grid>
            </Box>
            {filteredItems.length > 0 && (
                <TableContainer component={Paper} sx={{mt: 2}}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                {COLUMNS.map((column) => (
                                    <TableCell
                                        key={column.key}
                                        sortDirection={sortConfig.key === column.key ? sortConfig.direction : false}
                                    >
                                        <TableSortLabel
                                            active={sortConfig.key === column.key}
                                            direction={sortConfig.key === column.key ? sortConfig.direction : 'asc'}
                                            onClick={() => requestSort(column.key)}
                                        >
                                            {column.label}
                                        </TableSortLabel>
                                    </TableCell>
                                ))}
                                <TableCell>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sortedItems.map((item) => (
                                <TableRow
                                    key={item.id}
                                    hover
                                    onClick={() => {
                                        setSelectedItem(item);
                                        setUpdateDialogOpen(true);
                                    }}
                                    sx={{cursor: 'pointer'}}
                                >
                                    <TableCell>{timezone && item.session_date ? formatInCampaignTimezone(item.session_date, timezone, 'PP') : ''}</TableCell>
                                    <TableCell>{item.quantity}</TableCell>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell>{item.unidentified ? '✓' : ''}</TableCell>
                                    <TableCell>{item.masterwork ? '✓' : ''}</TableCell>
                                    <TableCell>{item.type}</TableCell>
                                    <TableCell>{item.size}</TableCell>
                                    <TableCell>{item.status}</TableCell>
                                    <TableCell>{item.value}</TableCell>
                                    <TableCell>{item.notes}</TableCell>
                                    <TableCell>
                                        <Typography variant="caption" sx={{
                                            color: "text.secondary"
                                        }}>
                                            Click row to edit
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
            <ItemManagementDialog
                open={updateDialogOpen}
                onClose={() => setUpdateDialogOpen(false)}
                item={selectedItem}
                onSave={handleItemUpdateSubmit}
                title="Update Item"
            />
        </>
    );
};

export default GeneralItemManagement;