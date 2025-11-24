// frontend/src/components/pages/ItemManagement/UnidentifiedItemsManagement.js
import React, {useEffect, useState} from 'react';
import api from '../../../utils/api';
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

            if (modIds.length > 0) {
                fetchModsByIds(modIds);
            } else {
                // If no specific mods, fetch all mods as fallback
                fetchAllMods();
            }
        }
    }, [unidentifiedItems]);

    const fetchUnidentifiedItems = async () => {
        try {
            const response = await lootService.getUnidentifiedItems();
            console.log('Unidentified items:', response.data);
            if (response.data && Array.isArray(response.data.items)) {
                setUnidentifiedItems(response.data.items);
            } else {
                console.error('Unexpected data structure:', response.data);
                setUnidentifiedItems([]);
                setError('Invalid data structure received from server');
            }
        } catch (error) {
            console.error('Error fetching unidentified items:', error);
            setUnidentifiedItems([]);
            setError('Failed to fetch unidentified items');
        }
    };

    // New function to fetch items by IDs using the new endpoint
    const fetchItemsByIds = async (itemIds) => {
        console.log('fetchItemsByIds called with:', itemIds);
        try {
            // Use the new endpoint
            const response = await lootService.getItemsByIds(itemIds);
            console.log('fetchItemsByIds response:', response);

            // Create a map for easier lookups
            const newItemsMap = {};

            // Check if the data is in the expected format
            if (response.data && response.data.items && Array.isArray(response.data.items)) {
                console.log('Using response.data.items format');
                response.data.items.forEach(item => {
                    console.log('Adding item to map:', item.id, item);
                    newItemsMap[item.id] = item;
                });
            } else if (Array.isArray(response.data)) {
                console.log('Using direct array format');
                response.data.forEach(item => {
                    console.log('Adding item to map:', item.id, item);
                    newItemsMap[item.id] = item;
                });
            } else {
                console.error('Unexpected response format:', response.data);
            }

            console.log('Final itemsMap:', newItemsMap);
            setItemsMap(newItemsMap);
        } catch (error) {
            console.error('Error fetching items by IDs:', error);
            // Fallback to the old method if the new endpoint fails
            fetchItemsIndividually(itemIds);
        }
    };

    // Fetch items by IDs using the proper endpoint
    const fetchItemsIndividually = async (itemIds) => {
        try {
            const response = await lootService.getItemsByIds(itemIds);
            const items = response.data.items || [];
            
            const newItemsMap = {};
            items.forEach(item => {
                newItemsMap[item.id] = item;
            });

            setItemsMap(newItemsMap);
        } catch (error) {
            console.error('Error fetching items by IDs:', error);
        }
    };

    // New function to fetch mods by IDs using the new endpoint
    const fetchModsByIds = async (modIds) => {
        try {
            // Use the new endpoint
            const response = await lootService.getModsByIds(modIds);

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
            console.error('Error fetching mods by IDs:', error);
            // Fallback to fetching all mods
            fetchAllMods();
        }
    };

    const fetchAllMods = async () => {
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
            console.error('Error fetching all mods:', error);
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
        } catch (error) {
            console.error('Error updating item', error);
            setError('Failed to update item');
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
            <Typography variant="body1" paragraph>
                Manage items that have been marked as unidentified. Link them to the actual items they represent and set
                spellcraft DCs.
            </Typography>

            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {success && <Alert severity="success" sx={{mb: 2}}>{success}</Alert>}

            {loading ? (
                <Box display="flex" justifyContent="center" p={3}>
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