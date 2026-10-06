// frontend/src/components/pages/ItemManagement/PendingSaleManagement.js
import {useEffect, useState, useCallback, useMemo} from 'react';
import lootService from '../../../services/lootService';
import * as salesService from '../../../services/salesService';
import {formatItemNameWithMods, updateItemAsDM} from '../../../utils/utils';
import {getErrorMessage} from '../../../utils/apiErrors';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    CircularProgress,
    Grid,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import ItemManagementDialog from '../../common/dialogs/ItemManagementDialog';
import { useCampaignTimezone } from '../../../hooks/useCampaignTimezone';
import { formatInCampaignTimezone } from '../../../utils/timezoneUtils';

const PendingSaleManagement = () => {
    const { timezone } = useCampaignTimezone();
    const [pendingItems, setPendingItems] = useState([]);
    const [saleValues, setSaleValues] = useState({}); // Store calculated sale values by item ID
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [pendingSaleTotal, setPendingSaleTotal] = useState(0);
    const [pendingSaleCount, setPendingSaleCount] = useState(0);
    const [sellUpToAmount, setSellUpToAmount] = useState('');
    const [selectedPendingItems, setSelectedPendingItems] = useState([]);
    const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState({});
    const [itemsMap, setItemsMap] = useState({});
    const [modsMap, setModsMap] = useState({});

    useEffect(() => {
        fetchPendingItems();
        fetchMods();
    }, []);

    // Once the pending list arrives, resolve the catalog items for each
    // distinct `itemid` referenced by those rows. This is what backs the
    // "Real Item" column — looking up loot rows in `items` (as the previous
    // implementation did) cannot work because `loot.itemid` references the
    // catalog `item` table, not the loot table itself.
    useEffect(() => {
        if (!Array.isArray(pendingItems) || pendingItems.length === 0) {
            setItemsMap({});
            return;
        }
        const itemIds = pendingItems
            .map(it => it.itemid)
            .filter(id => id != null)
            .filter((id, idx, arr) => arr.indexOf(id) === idx);
        if (itemIds.length === 0) {
            setItemsMap({});
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const response = await lootService.getItemsByIds(itemIds);
                if (cancelled) return;
                const catalogItems = response?.data?.items || [];
                const map = {};
                catalogItems.forEach(ci => {
                    if (ci && ci.id != null) map[ci.id] = ci;
                });
                setItemsMap(map);
            } catch (err) {
                if (!cancelled) {
                    console.error('Error fetching catalog items for pending sale list:', err);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [pendingItems]);

    const fetchPendingItems = useCallback(async () => {
        try {
            setLoading(true);
            const response = await lootService.getPendingSaleItems();

            // Check for proper data structure
            if (response.data && Array.isArray(response.data.items)) {
                setPendingItems(response.data.items);
                
                // Calculate sale values for all items
                try {
                    const saleCalculation = await salesService.calculateSaleValues(response.data.items);
                    const saleValuesMap = {};
                    saleCalculation.items.forEach(item => {
                        saleValuesMap[item.id] = item.saleValue;
                    });
                    setSaleValues(saleValuesMap);
                    
                    // The backend already rounds the total to two decimals
                    setPendingSaleTotal(saleCalculation.totalSaleValue);
                    setPendingSaleCount(saleCalculation.validCount);
                } catch (error) {
                    console.error('Error calculating sale values:', error);
                    // Keep the list usable (the backend still validates every sale)
                    setSaleValues({});
                    setPendingSaleTotal(0);
                    setPendingSaleCount(response.data.items.length);
                    setError('Failed to calculate the sale values.');
                }

                
            } else {
                console.error('Unexpected data structure:', response.data);
                setPendingItems([]);
                setError('Invalid data structure received from server');
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching pending items:', error);
            setError('Failed to fetch pending items.');
            setPendingItems([]);
            setLoading(false);
        }
    }, []);

    const fetchMods = useCallback(async () => {
        try {
            const response = await lootService.getMods();

            // Check if response.data is an array or has a mods property that's an array
            const modsArray = Array.isArray(response.data) ? response.data :
                (response.data && Array.isArray(response.data.mods) ? response.data.mods : []);

            const modsWithDisplayNames = modsArray.map(mod => ({
                ...mod,
                displayName: `${mod.name}${mod.target ? ` (${mod.target}${mod.subtarget ? `: ${mod.subtarget}` : ''})` : ''}`
            }));

            // Create a map for easier lookups
            const newModsMap = {};
            modsWithDisplayNames.forEach(mod => {
                newModsMap[mod.id] = mod;
            });
            setModsMap(newModsMap);
        } catch (error) {
            console.error('Error fetching mods:', error);
        }
    }, []);

    // Shared skeleton of the four sale actions: reset the banners, check the precondition,
    // call the service, refresh the list and report what was sold.
    //   validate()      -> an error message to show instead of selling, or null
    //   call()          -> the salesService request
    //   describe(data, sold) -> the success message
    //   onSold()        -> state to reset once the sale went through
    //   failureMessage  -> shown when the server gives no reason
    const runSale = async ({validate, call, describe, onSold, failureMessage = 'Failed to sell items.'}) => {
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            const problem = validate ? validate() : null;
            if (problem) {
                setError(problem);
                return;
            }

            const response = await call();
            const data = response?.data ?? {};
            const sold = data.sold ?? {};
            const summary = `Successfully sold ${sold.count || 0} items for ${(sold.total || 0).toFixed(2)} gold`;

            if (onSold) onSold();
            // Refresh first so the list is current when the message appears
            await fetchPendingItems();
            setSuccess(describe(data, summary));
        } catch (error) {
            console.error('Error selling items:', error);
            setError(getErrorMessage(error, failureMessage));
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmSale = () => runSale({
        call: () => lootService.confirmSale({}),
        failureMessage: 'Failed to complete the sale process.',
        describe: (data, summary) => `${summary}.`,
    });

    const handleSellUpTo = () => {
        const amount = parseFloat(sellUpToAmount);
        return runSale({
            validate: () => (isNaN(amount) || amount <= 0 ? 'Please enter a valid amount' : null),
            call: () => lootService.sellUpTo({amount}),
            describe: (data, summary) => `${summary}.`,
            onSold: () => setSellUpToAmount(''),
        });
    };

    const handleSellAllExcept = () => runSale({
        validate: () => (selectedItemsInfo.hasSelectedItems ? null : 'No items selected to keep.'),
        call: () => lootService.sellAllExcept({itemsToKeep: selectedPendingItems}),
        describe: (data, summary) => `${summary}, kept ${data.kept?.count || 0} items.`,
        onSold: () => setSelectedPendingItems([]),
    });

    const handleSellSelected = () => runSale({
        validate: () => {
            if (!selectedItemsInfo.hasSelectedItems) return 'No items selected to sell.';
            if (selectedItemsInfo.validSelectedItems.length === 0) {
                return 'None of the selected items can be sold. Items must be identified and have a value.';
            }
            return null;
        },
        // Only valid item IDs go to the backend
        call: () => lootService.sellSelected({
            itemsToSell: selectedItemsInfo.validSelectedItems.map(item => item.id)
        }),
        describe: (data, summary) => {
            const skippedCount = data.skipped?.count || 0;
            return skippedCount > 0 ? `${summary}. (${skippedCount} items were skipped)` : `${summary}.`;
        },
        onSold: () => setSelectedPendingItems([]),
    });

    const handlePendingItemSelect = useCallback((itemId) => {
        setSelectedPendingItems(prev =>
            prev.includes(itemId)
                ? prev.filter(id => id !== itemId)
                : [...prev, itemId]
        );
    }, []);

    const handleItemUpdateSubmit = async (updatedData) => {
        // Use the utility function for updating
        await updateItemAsDM(
            selectedItem.id,
            updatedData,
            (successMessage) => {
                setSuccess(successMessage);
                setUpdateDialogOpen(false);
                fetchPendingItems();
            },
            (errorMessage) => {
                setError(errorMessage);
            },
            () => setLoading(false)
        );
    };

    // Memoized function to get formatted item names with mods
    const getRealItemName = useCallback((item) => {
        return formatItemNameWithMods(item, itemsMap, modsMap);
    }, [itemsMap, modsMap]);

    // Memoized computation for selected items count and validation
    const selectedItemsInfo = useMemo(() => {
        const selectedCount = selectedPendingItems.length;
        const hasSelectedItems = selectedCount > 0;
        const validSelectedItems = pendingItems.filter(item =>
            selectedPendingItems.includes(item.id) &&
            item.unidentified !== true &&
            item.value !== null &&
            item.value !== undefined
        );
        return {
            selectedCount,
            hasSelectedItems,
            validSelectedItems,
            validSelectedCount: validSelectedItems.length
        };
    }, [selectedPendingItems, pendingItems]);

    return (
        <>
            <Typography variant="h6" gutterBottom>Pending Sale Items</Typography>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {success && <Alert severity="success" sx={{mb: 2}}>{success}</Alert>}
            <Card sx={{mb: 3}}>
                <CardContent>
                    <Typography variant="h6" gutterBottom>Pending Sale Summary</Typography>
                    <Grid container spacing={2} sx={{
                        alignItems: "center"
                    }}>
                        <Grid size={{xs: 12, md: 4}}>
                            <Typography>Number of Items: {pendingSaleCount}</Typography>
                            <Typography>Total Value: {pendingSaleTotal.toFixed(2)} gold</Typography>
                        </Grid>
                        <Grid size={{xs: 12, md: 8}}>
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                    gap: 2
                                }}>
                                <TextField
                                    label="Sell up to amount"
                                    type="number"
                                    size="small"
                                    value={sellUpToAmount}
                                    onChange={(e) => setSellUpToAmount(e.target.value)}
                                />
                                <Button
                                    variant="outlined"
                                    color="primary"
                                    onClick={handleSellUpTo}
                                    disabled={loading || !sellUpToAmount}
                                >
                                    Sell Up To
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="primary"
                                    onClick={handleConfirmSale}
                                    disabled={loading || pendingSaleCount === 0}
                                >
                                    Sell All
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="primary"
                                    onClick={handleSellAllExcept}
                                    disabled={loading || !selectedItemsInfo.hasSelectedItems}
                                >
                                    Sell All Except Selected
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="primary"
                                    onClick={handleSellSelected}
                                    disabled={loading || !selectedItemsInfo.hasSelectedItems}
                                >
                                    Sell Selected
                                </Button>
                            </Box>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>
            {loading ? (
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "center",
                        my: 4
                    }}>
                    <CircularProgress/>
                </Box>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell padding="checkbox">Select</TableCell>
                                <TableCell>Session Date</TableCell>
                                <TableCell>Quantity</TableCell>
                                <TableCell>Name</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Real Item</TableCell>
                                <TableCell>Value</TableCell>
                                <TableCell>Sale Value</TableCell>
                                <TableCell>Notes</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {pendingItems.map((item) => {
                                const saleValue = saleValues[item.id] || 0;

                                return (
                                    <TableRow
                                        key={item.id}
                                        hover
                                        onClick={() => {
                                            setSelectedItem(item);
                                            setUpdateDialogOpen(true);
                                        }}
                                        sx={{cursor: 'pointer'}}
                                    >
                                        <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                checked={selectedPendingItems.includes(item.id)}
                                                onChange={() => handlePendingItemSelect(item.id)}
                                            />
                                        </TableCell>
                                        <TableCell>{timezone && item.session_date ? formatInCampaignTimezone(item.session_date, timezone, 'PP') : ''}</TableCell>
                                        <TableCell>{item.quantity}</TableCell>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell>{item.type}</TableCell>
                                        <TableCell>{getRealItemName(item)}</TableCell>
                                        <TableCell>{item.value}</TableCell>
                                        <TableCell>{typeof saleValue === 'number' && !isNaN(saleValue)
                                            ? saleValue.toFixed(2)
                                            : '0.00'}</TableCell>
                                        <TableCell>{item.notes}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
            <ItemManagementDialog
                open={updateDialogOpen}
                onClose={() => setUpdateDialogOpen(false)}
                item={selectedItem}
                onSave={handleItemUpdateSubmit}
                title="Update Pending Sale Item"
            />
        </>
    );
};

export default PendingSaleManagement;