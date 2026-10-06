// frontend/src/components/pages/ItemManagement/UnidentifiedItemsManagement.js
import React, {useEffect, useState} from 'react';
import lootService from '../../../services/lootService';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from '@mui/material';
import ItemManagementDialog from '../../common/dialogs/ItemManagementDialog';
import {
    calculateSpellcraftDC,
    formatItemNameWithMods,
    identifyItem,
    updateItemAsDM
} from '../../../utils/utils';
import { useCampaignTimezone } from '../../../hooks/useCampaignTimezone';
import { formatInCampaignTimezone } from '../../../utils/timezoneUtils';
import { notifyLootCountsChanged } from '../../../utils/events';
import { getErrorMessage } from '../../../utils/apiErrors';

const UnidentifiedItemsManagement = () => {
    const { timezone } = useCampaignTimezone();
    const [unidentifiedItems, setUnidentifiedItems] = useState([]);
    const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [itemsMap, setItemsMap] = useState({});
    const [modsMap, setModsMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Initial data loading
    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true);
            await fetchUnidentifiedItems();
            setLoading(false);
        };

        loadInitialData();
    }, []);

    // Once we have unidentified items, fetch their associated items and mods
    useEffect(() => {
        if (unidentifiedItems && unidentifiedItems.length > 0) {
            const itemIds = unidentifiedItems
                .filter(item => item.itemid)
                .map(item => item.itemid)
                .filter((id, index, self) => self.indexOf(id) === index); // Get unique IDs

            const modIds = unidentifiedItems
                .filter(item => item.modids && Array.isArray(item.modids) && item.modids.length > 0)
                .flatMap(item => item.modids)
                .filter((id, index, self) => self.indexOf(id) === index); // Get unique IDs

            if (itemIds.length > 0) {
                fetchItemsByIds(itemIds);
            }

            // No specific mods: fetch them all
            fetchMods(modIds.length > 0 ? modIds : undefined);
        }
    }, [unidentifiedItems]);

    const fetchUnidentifiedItems = async () => {
        try {
            const response = await lootService.getUnidentifiedItems();
            if (response.data && Array.isArray(response.data.items)) {
                setUnidentifiedItems(response.data.items);
            } else {
                setUnidentifiedItems([]);
                setError('Invalid data structure received from server');
            }
        } catch (err) {
            setUnidentifiedItems([]);
            setError(getErrorMessage(err, 'Failed to fetch unidentified items'));
        }
    };

    const fetchItemsByIds = async (itemIds) => {
        try {
            const response = await lootService.getItemsByIds(itemIds);
            const items = Array.isArray(response.data?.items) ? response.data.items : [];
            const newItemsMap = {};
            items.forEach(item => {
                newItemsMap[item.id] = item;
            });
            setItemsMap(newItemsMap);
        } catch (err) {
            setError(getErrorMessage(err, 'Failed to load the linked items'));
        }
    };

    // Mods for the given ids, or every mod when no ids are given
    const fetchMods = async (modIds) => {
        const load = async (ids) => {
            const response = ids ? await lootService.getModsByIds(ids) : await lootService.getMods();
            const modsArray = Array.isArray(response.data) ? response.data :
                (Array.isArray(response.data?.mods) ? response.data.mods : []);
            const newModsMap = {};
            modsArray.forEach(mod => {
                newModsMap[mod.id] = mod;
            });
            setModsMap(newModsMap);
        };

        try {
            await load(modIds);
        } catch (err) {
            if (modIds) {
                // The id lookup failed: try the full list once
                await fetchMods();
                return;
            }
            setError(getErrorMessage(err, 'Failed to load the mods'));
        }
    };

    const handleUpdateSubmit = async (updatedData) => {
        try {
            // If spellcraft_dc isn't set but we have the item info, calculate it
            if ((!updatedData.spellcraft_dc || updatedData.spellcraft_dc === '') && updatedData.itemid) {
                const spellcraftDC = calculateSpellcraftDC(
                    {itemid: updatedData.itemid, modids: updatedData.modids}, 
                    itemsMap, 
                    modsMap
                );
                if (spellcraftDC) {
                    updatedData.spellcraft_dc = spellcraftDC;
                }
            }

            // Use utility function for updating items
            await updateItemAsDM(
                selectedItem.id,
                updatedData,
                (successMessage) => {
                    setSuccess(successMessage);
                    setUpdateDialogOpen(false);
                    // Refresh the list
                    fetchUnidentifiedItems();
                },
                (errorMessage) => {
                    setError(errorMessage);
                }
            );
        } catch (err) {
            setError(getErrorMessage(err, 'Failed to update item'));
        }
    };

    const handleIdentify = async (item) => {
        // Use utility function for identifying items
        await identifyItem(
            item,
            itemsMap,
            (successMessage) => {
                setSuccess(successMessage);
                fetchUnidentifiedItems(); // Refresh the list
                notifyLootCountsChanged(); // Update the sidebar badge.
            },
            (errorMessage) => {
                setError(errorMessage);
            }
        );
    };

    // Function to get the real item name using utility function
    const getRealItemName = (item) => {
        return formatItemNameWithMods(item, itemsMap, modsMap);
    };

    // Function to calculate Spellcraft DC if not set
    const getSpellcraftDC = (item) => {
        // If DC is already set, return it
        if (item.spellcraft_dc) {
            return item.spellcraft_dc;
        }

        // Use the utility function with modsMap
        const calculatedDC = calculateSpellcraftDC(item, itemsMap, modsMap);
        return calculatedDC || 'Not set';
    };

    return (
        <>
            <Typography variant="h6" gutterBottom>Unidentified Items</Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
                Manage items that have been marked as unidentified. Link them to the actual items they represent and set
                spellcraft DCs.
            </Typography>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {success && <Alert severity="success" sx={{mb: 2}}>{success}</Alert>}
            {loading ? (
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "center",
                        p: 3
                    }}>
                    <CircularProgress/>
                </Box>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Session Date</TableCell>
                                <TableCell>Quantity</TableCell>
                                <TableCell>Current Name</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Real Item</TableCell>
                                <TableCell>Spellcraft DC</TableCell>
                                <TableCell>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {Array.isArray(unidentifiedItems) ? unidentifiedItems.map((item) => (
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
                                    <TableCell>{item.type}</TableCell>
                                    <TableCell>
                                        {getRealItemName(item)}
                                    </TableCell>
                                    <TableCell>{getSpellcraftDC(item)}</TableCell>
                                    <TableCell>
                                        <Tooltip title="Mark as identified using linked item">
                      <span> {/* Wrapper to make tooltip work with disabled button */}
                          <Button
                              variant="outlined"
                              size="small"
                              color="secondary"
                              onClick={(e) => {
                                  e.stopPropagation(); // Prevent row click
                                  handleIdentify(item);
                              }}
                              disabled={!item.itemid}
                          >
                          Identify
                        </Button>
                      </span>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            )) : null}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
            <ItemManagementDialog
                open={updateDialogOpen}
                onClose={() => setUpdateDialogOpen(false)}
                item={selectedItem}
                onSave={handleUpdateSubmit}
                title="Update Unidentified Item"
            />
        </>
    );
};

export default UnidentifiedItemsManagement;