// frontend/src/components/common/dialogs/ItemManagementDialog.js
import React, {useEffect, useState} from 'react';
import {
  Alert,
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
import lootService from '../../../services/lootService';

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
    // The catalog row for the currently linked itemid (separate from the
    // user's loot list). Used to drive the Autocomplete `value` prop and to
    // recompute the spellcraft DC when itemid or modids change.
    const [linkedCatalogItem, setLinkedCatalogItem] = useState(null);
    const [error, setError] = useState(null);

    // Initialize the form when the dialog opens or item changes
    useEffect(() => {
        setUpdatedItem(item || {});
        if (open && item) {
            fetchMods();
            fetchItems();
        }
    }, [open, item]);

    // Load the linked catalog item when the dialog opens or the itemid changes.
    // Drives both the Autocomplete display (`value` + `inputValue`) AND the
    // spellcraft DC recomputation effect below.
    useEffect(() => {
        if (!open) {
            setItemInputValue('');
            setItemOptions([]);
            setLinkedCatalogItem(null);
            return;
        }
        if (!updatedItem?.itemid) {
            // No item linked — clear display state but keep options for searching.
            setItemInputValue('');
            setLinkedCatalogItem(null);
            return;
        }
        let cancelled = false;
        const loadLinked = async () => {
            try {
                const response = await lootService.getItemsByIds([updatedItem.itemid]);
                const fetched = response?.data?.items?.[0] || null;
                if (cancelled) return;
                if (fetched) {
                    setLinkedCatalogItem(fetched);
                    setItemInputValue(fetched.name);
                    // Make sure the linked item is in the Autocomplete options so
                    // the controlled `value` prop can find it.
                    setItemOptions(prev => {
                        if (prev.some(o => o.id === fetched.id)) return prev;
                        return [fetched, ...prev];
                    });
                }
            } catch (err) {
                if (!cancelled) {
                    console.error('Error loading linked item details:', err);
                }
            }
        };
        loadLinked();
        return () => {
            cancelled = true;
        };
    }, [open, updatedItem?.itemid]);

    // Recompute the spellcraft DC whenever the linked catalog item or the
    // selected mods change. Mirrors `calculateSpellcraftDC` in utils/utils.ts:
    // weapons/armor with mods use the highest mod caster level; everything
    // else uses the base item's caster level. DC = 15 + min(CL, 20).
    useEffect(() => {
        if (!open || !linkedCatalogItem) return;
        const isWeaponOrArmor =
            linkedCatalogItem.type === 'weapon' || linkedCatalogItem.type === 'armor';
        const selectedModIds = Array.isArray(updatedItem?.modids) ? updatedItem.modids : [];
        let effectiveCasterLevel = linkedCatalogItem.casterlevel || 1;
        if (isWeaponOrArmor && selectedModIds.length > 0 && mods.length > 0) {
            const modCasterLevels = selectedModIds
                .map(id => mods.find(m => m.id === id))
                .filter(m => m && m.casterlevel != null)
                .map(m => m.casterlevel);
            if (modCasterLevels.length > 0) {
                effectiveCasterLevel = Math.max(...modCasterLevels);
            }
        }
        const newDC = 15 + Math.min(effectiveCasterLevel, 20);
        setUpdatedItem(prev =>
            prev?.spellcraft_dc === newDC ? prev : { ...prev, spellcraft_dc: newDC }
        );
    }, [open, linkedCatalogItem, updatedItem?.modids, mods]);

    const fetchItems = async () => {
        try {
            const response = await lootService.getAllLoot();
            // API returns { summary: [], individual: [], count: number }
            const allItems = [...(response.data.summary || []), ...(response.data.individual || [])];
            setItems(allItems);
        } catch (error) {
            console.error('Error fetching all items:', error);
        }
    };

    const fetchMods = async () => {
    try {
        const response = await lootService.getMods();

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
            const response = await lootService.suggestItems({query: searchText});
            // API returns { suggestions: [...], count: number }
            const allItems = response.data.suggestions || [];
            setItemOptions(allItems);
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
            if (['unidentified', 'masterwork', 'cursed', 'type', 'size', 'status', 'whohas'].includes(field)) {
                return {...prevItem, [field]: value === '' ? null : value};
            }
            return {...prevItem, [field]: value};
        });
    };

    const [calculatingValue, setCalculatingValue] = useState(false);

    // Auto-recompute the Value from the linked base item + selected mods (plus
    // masterwork/size/charges) via the backend calculator whenever any of those
    // price-affecting inputs change. Only runs for items linked to a catalog
    // base item — custom items (no itemid) keep their hand-entered value, since
    // there is no base item to calculate from. A value typed by hand for a
    // linked item persists until the item/mods/etc. change or the dialog is
    // reopened.
    useEffect(() => {
        if (!open || !linkedCatalogItem) return;
        let cancelled = false;
        const recompute = async () => {
            setCalculatingValue(true);
            try {
                const modids = Array.isArray(updatedItem?.modids) ? updatedItem.modids : [];
                const response = await lootService.calculateValue({
                    itemId: linkedCatalogItem.id,
                    itemType: linkedCatalogItem.type || null,
                    itemSubtype: linkedCatalogItem.subtype || null,
                    itemValue: linkedCatalogItem.value,
                    isMasterwork: !!updatedItem?.masterwork,
                    mods: modids.map(id => ({ id })),
                    charges: updatedItem?.charges ? parseInt(updatedItem.charges, 10) : null,
                    size: updatedItem?.size || null,
                    weight: linkedCatalogItem.weight ?? null,
                });
                if (cancelled) return;
                const calculated = response?.data?.value;
                if (calculated !== undefined && calculated !== null) {
                    setUpdatedItem(prev =>
                        prev?.value === calculated ? prev : { ...prev, value: calculated }
                    );
                }
            } catch (err) {
                if (!cancelled) {
                    console.error('Error auto-calculating item value:', err);
                }
            } finally {
                if (!cancelled) setCalculatingValue(false);
            }
        };
        recompute();
        return () => {
            cancelled = true;
        };
    }, [
        open,
        linkedCatalogItem,
        updatedItem?.modids,
        updatedItem?.masterwork,
        updatedItem?.size,
        updatedItem?.charges,
    ]);

    const handleSave = () => {
        try {
            const preparedData = {
                session_date: updatedItem.session_date || null,
                quantity: updatedItem.quantity !== '' ? parseInt(updatedItem.quantity, 10) : null,
                name: updatedItem.name || null,
                unidentified: updatedItem.unidentified === '' ? null : updatedItem.unidentified,
                masterwork: updatedItem.masterwork === '' ? null : updatedItem.masterwork,
                cursed: updatedItem.cursed === '' ? null : updatedItem.cursed,
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
                {error && (
                    <Alert severity="error" sx={{ mt: 1, mb: 1 }} onClose={() => setError(null)}>
                        {error}
                    </Alert>
                )}
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
                    <InputLabel>Cursed</InputLabel>
                    <Select
                        value={updatedItem.cursed === null ? '' : updatedItem.cursed}
                        onChange={(e) => handleItemUpdateChange('cursed', e.target.value === '' ? null : e.target.value)}
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
                    // Controlled selection: pull the option matching the linked
                    // itemid from the options list. Without this, MUI keeps the
                    // input visually empty even though `inputValue` is set.
                    value={
                        itemOptions.find(o => o?.id === updatedItem.itemid) ||
                        linkedCatalogItem ||
                        null
                    }
                    isOptionEqualToValue={(option, value) =>
                        option?.id === value?.id
                    }
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
                            setItemInputValue(newValue.name || '');
                            // Cache the catalog item for the DC recompute effect
                            // so it doesn't have to wait for a round-trip.
                            setLinkedCatalogItem(newValue);
                        } else {
                            handleItemUpdateChange('itemid', null);
                            setItemInputValue('');
                            setLinkedCatalogItem(null);
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
                    value={updatedItem.value ?? ''}
                    onChange={(e) => handleItemUpdateChange('value', e.target.value)}
                    margin="normal"
                    helperText={
                        calculatingValue
                            ? 'Calculating value…'
                            : (updatedItem.itemid ? 'Auto-calculated from the linked item and mods' : ' ')
                    }
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