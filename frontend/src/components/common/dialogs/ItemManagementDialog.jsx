// frontend/src/components/common/dialogs/ItemManagementDialog.jsx
import React, {useEffect, useRef, useState} from 'react';
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
import lootService from '../../../services/lootService';
import {spellcraftDCFor} from '../../../utils/utils';
import {ITEM_SIZES, ITEM_TYPES, LOOT_STATUSES} from '../../../utils/itemOptions';

// Wait this long after the last keystroke before asking for item suggestions.
const ITEM_SEARCH_DEBOUNCE_MS = 250;

// Fields where an empty Select value means "not set" and is stored as null.
const NULLABLE_FIELDS = ['unidentified', 'masterwork', 'cursed', 'type', 'size', 'status', 'whohas'];

// Yes / No / None select for a nullable boolean field.
const TriStateSelect = ({label, field, item, onChange}) => (
    <FormControl fullWidth margin="normal">
        <InputLabel id={`${field}-label`}>{label}</InputLabel>
        <Select
            labelId={`${field}-label`}
            label={label}
            value={item[field] === null || item[field] === undefined ? '' : item[field]}
            onChange={(e) => onChange(field, e.target.value)}
        >
            <MenuItem value="">None</MenuItem>
            <MenuItem value={true}>Yes</MenuItem>
            <MenuItem value={false}>No</MenuItem>
        </Select>
    </FormControl>
);

// Select over a list of string options (plus "None").
const OptionSelect = ({label, field, item, onChange, options}) => (
    <FormControl fullWidth margin="normal">
        <InputLabel id={`${field}-label`}>{label}</InputLabel>
        <Select
            labelId={`${field}-label`}
            label={label}
            value={item[field] || ''}
            onChange={(e) => onChange(field, e.target.value)}
        >
            <MenuItem value="">None</MenuItem>
            {options.map(({value, label: optionLabel}) => (
                <MenuItem key={value} value={value}>{optionLabel}</MenuItem>
            ))}
        </Select>
    </FormControl>
);

const asOptions = (values) => values.map((value) => ({value, label: value}));

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
    const [mods, setMods] = useState([]);
    // The catalog row for the currently linked itemid (separate from the
    // user's loot list). Used to drive the Autocomplete `value` prop and to
    // recompute the spellcraft DC when itemid or modids change.
    const [linkedCatalogItem, setLinkedCatalogItem] = useState(null);
    const [error, setError] = useState(null);
    const searchTimer = useRef(null);
    const searchRequestId = useRef(0);

    // Initialize the form when the dialog opens or item changes
    useEffect(() => {
        setUpdatedItem(item || {});
        if (open && item) {
            fetchMods();
        }
    }, [open, item]);

    // Drop a pending suggestion lookup when the dialog goes away.
    useEffect(() => () => clearTimeout(searchTimer.current), []);

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
    // selected mods change, with the same rule the unidentified-items list uses
    // (spellcraftDCFor in utils/utils.ts). A DC the DM already saved is kept as
    // long as the item and mods are still the ones the dialog was opened with,
    // so simply opening the dialog and editing notes cannot overwrite it.
    useEffect(() => {
        if (!open || !linkedCatalogItem) return;
        const selectedModIds = Array.isArray(updatedItem?.modids) ? updatedItem.modids : [];
        const identityKey = (itemId, modIds) => `${itemId}|${[...(modIds || [])].sort((a, b) => a - b).join(',')}`;
        const unchanged = identityKey(linkedCatalogItem.id, selectedModIds) === identityKey(item?.itemid, item?.modids);
        const storedDC = item?.spellcraft_dc;
        const newDC = unchanged && storedDC
            ? storedDC
            : spellcraftDCFor(linkedCatalogItem, selectedModIds, Object.fromEntries(mods.map(m => [m.id, m])));
        setUpdatedItem(prev =>
            prev?.spellcraft_dc === newDC ? prev : { ...prev, spellcraft_dc: newDC }
        );
    }, [open, item, linkedCatalogItem, updatedItem?.modids, mods]);

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

    // Debounced suggestion lookup. Only the newest request may update the
    // options, so a slow earlier response cannot overwrite a later one.
    const handleItemSearch = (searchText) => {
        clearTimeout(searchTimer.current);
        if (!searchText || searchText.length < 2) {
            searchRequestId.current += 1;
            setItemsLoading(false);
            setItemOptions([]);
            return;
        }

        searchTimer.current = setTimeout(async () => {
            const requestId = ++searchRequestId.current;
            setItemsLoading(true);
            try {
                const response = await lootService.suggestItems({query: searchText});
                if (requestId !== searchRequestId.current) return;
                // API returns { suggestions: [...], count: number }
                setItemOptions(response.data.suggestions || []);
            } catch (error) {
                console.error('Error fetching items:', error);
            } finally {
                if (requestId === searchRequestId.current) setItemsLoading(false);
            }
        }, ITEM_SEARCH_DEBOUNCE_MS);
    };

    const handleItemUpdateChange = (field, value) => {
        setUpdatedItem(prevItem => ({
            ...prevItem,
            [field]: value === '' && NULLABLE_FIELDS.includes(field) ? null : value
        }));
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
                unidentified: updatedItem.unidentified,
                masterwork: updatedItem.masterwork,
                cursed: updatedItem.cursed,
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
                    slotProps={{ inputLabel: {
                        shrink: true,
                    } }}
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
                <TriStateSelect label="Unidentified" field="unidentified" item={updatedItem} onChange={handleItemUpdateChange}/>
                <TriStateSelect label="Masterwork" field="masterwork" item={updatedItem} onChange={handleItemUpdateChange}/>
                <TriStateSelect label="Cursed" field="cursed" item={updatedItem} onChange={handleItemUpdateChange}/>
                <OptionSelect label="Type" field="type" item={updatedItem} onChange={handleItemUpdateChange} options={ITEM_TYPES}/>
                <OptionSelect label="Size" field="size" item={updatedItem} onChange={handleItemUpdateChange} options={asOptions(ITEM_SIZES)}/>
                <OptionSelect label="Status" field="status" item={updatedItem} onChange={handleItemUpdateChange} options={asOptions(LOOT_STATUSES)}/>
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
                    onInputChange={(_, newInputValue, reason) => {
                        setItemInputValue(newInputValue);
                        // 'reset' is MUI syncing the text to the selected item, not typing
                        if (reason !== 'reset') handleItemSearch(newInputValue);
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
