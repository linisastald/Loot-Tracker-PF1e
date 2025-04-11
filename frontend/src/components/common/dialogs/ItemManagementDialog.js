// frontend/src/components/common/dialogs/ItemManagementDialog.js
import React, {useEffect, useState} from 'react';
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField
} from '@mui/material';
import api from '../../../utils/api';

const ItemManagementDialog = ({
                                  open,
                                  onClose,
                                  item,
                                  onSave,
                                  title = "Update Item"
                              }) => {
    const [updatedItem, setUpdatedItem] = useState({});
    const [itemOptions, setItemOptions] = useState([]);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [itemInputValue, setItemInputValue] = useState('');
    const [items, setItems] = useState([]);
    const [mods, setMods] = useState([]);
    const [error, setError] = useState(null);

    // Initialize the form when the dialog opens or item changes
    useEffect(() => {
        setUpdatedItem(item || {});
        if (open && item) {
            fetchMods();
            fetchItems();
        }
    }, [open, item]);

    // Load current item data when dialog opens
    useEffect(() => {
        if (open && updatedItem && updatedItem.itemid) {
            const loadItemDetails = async () => {
                try {
                    // Try to find the item in the already loaded items
                    const existingItem = items.find(i => i.id === updatedItem.itemid);

                    if (existingItem) {
                        // If we already have it, update the input value
                        setItemInputValue(existingItem.name);
                        setItemOptions([existingItem]);
                    } else {
                        // Otherwise fetch it
                        const response = await api.get(`/loot/items?query=${updatedItem.itemid}`);
                        if (response.data && response.data.length > 0) {
                            // Find the exact item
                            const matchingItem = response.data.find(item => item.id === updatedItem.itemid);
                            if (matchingItem) {
                                setItemInputValue(matchingItem.name);
                                setItemOptions([matchingItem]);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error loading item details:', error);
                }
            };

            loadItemDetails();
        } else if (!open) {
            setItemInputValue('');
            setItemOptions([]);
        }
    }, [open, updatedItem, items]);

    const fetchItems = async () => {
        try {
            const response = await api.get(`/loot/items`);
            setItems(response.data);
        } catch (error) {
            console.error('Error fetching all items:', error);
        }
    };

    const fetchMods = async () => {
    try {
        const response = await api.get(`/loot/mods`);

        // Check if response.data is an array or has a mods property that's an array
        const modsArray = Array.isArray(response.data) ? response.data :
                         (response.data && Array.isArray(response.data.mods) ? response.data.mods : []);

        const modsWithDisplayNames = modsArray.map(mod => ({
            ...mod,
            displayName: `${mod.name}${mod.target ? ` (${mod.target}${mod.subtarget ? `: ${mod.subtarget}` : ''})` : ''}`
        }));

        setMods(modsWithDisplayNames);
    } catch (error) {
        console.error('Error fetching mods:', error);
        setMods([]);
    }
};

    const handleItemSearch = async (searchText) => {
        if (!searchText || searchText.length < 2) {
            setItemOptions([]);
            return;
        }

        setItemsLoading(true);
        try {
            const response = await api.get(`/loot/items?query=${searchText}`);
            setItemOptions(response.data);
        } catch (error) {
            console.error('Error fetching items:', error);
        } finally {
            setItemsLoading(false);
        }
    };

    const handleItemUpdateChange = (field, value) => {
        setUpdatedItem(prevItem => {
            if (field === 'modids') {
                return {...prevItem, [field]: value};
            }
            if (['unidentified', 'masterwork', 'type', 'size', 'status', 'whohas'].includes(field)) {
                return {...prevItem, [field]: value === '' ? null : value};
            }
            return {...prevItem, [field]: value};
        });
    };

    const handleSave = () => {
        try {
            const preparedData = {
                session_date: updatedItem.session_date || null,
                quantity: updatedItem.quantity !== '' ? parseInt(updatedItem.quantity, 10) : null,
                name: updatedItem.name || null,
                unidentified: updatedItem.unidentified === '' ? null : updatedItem.unidentified,
                masterwork: updatedItem.masterwork === '' ? null : updatedItem.masterwork,
                type: updatedItem.type || null,
                size: updatedItem.size || null,
                status: updatedItem.status || null,
                itemid: updatedItem.itemid !== '' ? parseInt(updatedItem.itemid, 10) : null,
                modids: updatedItem.modids, // Ensure modids is passed through
                charges: updatedItem.charges !== '' ? parseInt(updatedItem.charges, 10) : null,
                value: updatedItem.value !== '' ? parseFloat(updatedItem.value) : null,
                whohas: updatedItem.whohas !== '' ? parseInt(updatedItem.whohas, 10) : null,
                notes: updatedItem.notes || null,
                spellcraft_dc: updatedItem.spellcraft_dc !== '' ? parseInt(updatedItem.spellcraft_dc, 10) : null,
                dm_notes: updatedItem.dm_notes || null,
            };

            onSave(preparedData);
        } catch (error) {
            console.error('Error preparing data for saving:', error);
            setError('Failed to prepare item data');
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
        >
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                <TextField
                    label="Session Date"
                    type="date"
                    fullWidth
                    value={updatedItem.session_date ? updatedItem.session_date.split('T')[0] : ''}
                    onChange={(e) => handleItemUpdateChange('session_date', e.target.value)}
                    margin="normal"
                    InputLabelProps={{
                        shrink: true,
                    }}
                />
                <TextField
                    label="Quantity"
                    type="number"
                    fullWidth
                    value={updatedItem.quantity || ''}
                    onChange={(e) => handleItemUpdateChange('quantity', e.target.value)}
                    margin="normal"
                />
                <TextField
                    label="Name"
                    fullWidth
                    value={updatedItem.name || ''}
                    onChange={(e) => handleItemUpdateChange('name', e.target.value)}
                    margin="normal"
                />
                <FormControl fullWidth margin="normal">
                    <InputLabel>Unidentified</InputLabel>
                    <Select
                        value={updatedItem.unidentified === null ? '' : updatedItem.unidentified}
                        onChange={(e) => handleItemUpdateChange('unidentified', e.target.value === '' ? null : e.target.value)}
                    >
                        <MenuItem value="">None</MenuItem>
                        <MenuItem value={true}>Yes</MenuItem>
                        <MenuItem value={false}>No</MenuItem>
                    </Select>
                </FormControl>
                <FormControl fullWidth margin="normal">
                    <InputLabel>Masterwork</InputLabel>
                    <Select
                        value={updatedItem.masterwork === null ? '' : updatedItem.masterwork}
                        onChange={(e) => handleItemUpdateChange('masterwork', e.target.value === '' ? null : e.target.value)}
                    >
                        <MenuItem value="">None</MenuItem>
                        <MenuItem value={true}>Yes</MenuItem>
                        <MenuItem value={false}>No</MenuItem>
                    </Select>
                </FormControl>
                <FormControl fullWidth margin="normal">
                    <InputLabel>Type</InputLabel>
                    <Select
                        value={updatedItem.type || ''}
                        onChange={(e) => handleItemUpdateChange('type', e.target.value === '' ? null : e.target.value)}
                    >
                        <MenuItem value="">None</MenuItem>
                        <MenuItem value="weapon">Weapon</MenuItem>
                        <MenuItem value="armor">Armor</MenuItem>
                        <MenuItem value="magic">Magic</MenuItem>
                        <MenuItem value="gear">Gear</MenuItem>
                        <MenuItem value="trade good">Trade Good</MenuItem>
                        <MenuItem value="other">Other</MenuItem>
                    </Select>
                </FormControl>
                <FormControl fullWidth margin="normal">
                    <InputLabel>Size</InputLabel>
                    <Select
                        value={updatedItem.size || ''}
                        onChange={(e) => handleItemUpdateChange('size', e.target.value === '' ? null : e.target.value)}
                    >
                        <MenuItem value="">None</MenuItem>
                        <MenuItem value="Fine">Fine</MenuItem>
                        <MenuItem value="Diminutive">Diminutive</MenuItem>
                        <MenuItem value="Tiny">Tiny</MenuItem>
                        <MenuItem value="Small">Small</MenuItem>
                        <MenuItem value="Medium">Medium</MenuItem>
                        <MenuItem value="Large">Large</MenuItem>
                        <MenuItem value="Huge">Huge</MenuItem>
                        <MenuItem value="Gargantuan">Gargantuan</MenuItem>
                        <MenuItem value="Colossal">Colossal</MenuItem>
                    </Select>
                </FormControl>
                <FormControl fullWidth margin="normal">
                    <InputLabel>Status</InputLabel>
                    <Select
                        value={updatedItem.status || ''}
                        onChange={(e) => handleItemUpdateChange('status', e.target.value === '' ? null : e.target.value)}
                    >
                        <MenuItem value="">None</MenuItem>
                        <MenuItem value="Pending Sale">Pending Sale</MenuItem>
                        <MenuItem value="Kept Self">Kept Self</MenuItem>
                        <MenuItem value="Kept Party">Kept Party</MenuItem>
                        <MenuItem value="Trashed">Trashed</MenuItem>
                        <MenuItem value="Sold">Sold</MenuItem>
                    </Select>
                </FormControl>
                <Autocomplete
                    disablePortal
                    options={itemOptions}
                    getOptionLabel={(option) => {
                        // Handle various possible option formats
                        if (typeof option === 'string') return option;
                        return option?.name || '';
                    }}
                    inputValue={itemInputValue}
                    onInputChange={(_, newInputValue) => {
                        setItemInputValue(newInputValue);
                        handleItemSearch(newInputValue);
                    }}
                    onChange={(_, newValue) => {
                        if (newValue && typeof newValue === 'object') {
                            handleItemUpdateChange('itemid', newValue.id);
                        } else {
                            handleItemUpdateChange('itemid', null);
                        }
                    }}
                    loading={itemsLoading}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Item"
                            fullWidth
                            margin="normal"
                            helperText={updatedItem.itemid ? `Selected item ID: ${updatedItem.itemid}` : 'No item selected'}
                        />
                    )}
                    noOptionsText="Type to search items"
                    filterOptions={(x) => x} // Disable built-in filtering
                />
                <Autocomplete
                    multiple
                    options={mods}
                    getOptionLabel={(option) => option.displayName}
                    value={updatedItem.modids ? mods.filter(mod => updatedItem.modids.includes(mod.id)) : []}
                    onChange={(_, newValue) => handleItemUpdateChange('modids', newValue.map(v => v.id))}
                    renderInput={(params) => <TextField {...params} label="Mods" fullWidth margin="normal"/>}
                />
                <TextField
                    label="Charges"
                    type="number"
                    fullWidth
                    value={updatedItem.charges || ''}
                    onChange={(e) => handleItemUpdateChange('charges', e.target.value)}
                    margin="normal"
                />
                <TextField
                    label="Value"
                    type="number"
                    fullWidth
                    value={updatedItem.value || ''}
                    onChange={(e) => handleItemUpdateChange('value', e.target.value)}
                    margin="normal"
                />
                <TextField
                    label="Notes"
                    fullWidth
                    value={updatedItem.notes || ''}
                    onChange={(e) => handleItemUpdateChange('notes', e.target.value)}
                    margin="normal"
                    multiline
                    rows={2}
                />
                <TextField
                    label="Spellcraft DC"
                    type="number"
                    fullWidth
                    value={updatedItem.spellcraft_dc || ''}
                    onChange={(e) => handleItemUpdateChange('spellcraft_dc', e.target.value)}
                    margin="normal"
                />
                <TextField
                    label="DM Notes"
                    fullWidth
                    value={updatedItem.dm_notes || ''}
                    onChange={(e) => handleItemUpdateChange('dm_notes', e.target.value)}
                    margin="normal"
                    multiline
                    rows={2}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={handleSave} color="primary" variant="outlined">
                    Save
                </Button>
                <Button onClick={onClose} color="secondary" variant="outlined">
                    Cancel
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ItemManagementDialog;