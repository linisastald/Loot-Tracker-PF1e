// frontend/src/components/pages/ItemManagement/AddItemMod.jsx
// Phase 5a: the item/mod catalog is shared by every campaign, so writes are
// superadmin-only (the backend 403s otherwise). The save buttons are disabled
// for plain DMs; search/read stays available to them.
import React, {useEffect, useState} from 'react';
import api from '../../../utils/api';
import {getErrorMessage} from '../../../utils/apiErrors';
import lootService from '../../../services/lootService';
import {useCampaign} from '../../../contexts/CampaignContext';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';

const SUPERADMIN_ONLY_TOOLTIP = 'Shared catalog — system administrator only';

const EMPTY_ITEM = {id: '', name: '', type: '', subtype: '', value: '', weight: '', casterlevel: ''};
const EMPTY_MOD = {id: '', name: '', plus: '', type: '', valuecalc: '', target: '', subtarget: '', casterlevel: ''};

// Subtargets per mod target. Each value appears once per list, so a stored
// 'light' is unambiguous: weapons and armor each get their own list.
const SUBTARGET_OPTIONS = {
    weapon: [
        ['one handed', 'One Handed Weapon'],
        ['two handed', 'Two Handed Weapon'],
        ['ammunition', 'Ammunition'],
        ['light', 'Light Weapon']
    ],
    armor: [
        ['light', 'Light Armor'],
        ['medium', 'Medium Armor'],
        ['heavy', 'Heavy Armor'],
        ['shield', 'Shield']
    ]
};

// Build form state from a record: every field of the empty form, taking the
// record's value when present (null/undefined become '').
const pickForm = (empty, value) => Object.fromEntries(
    Object.keys(empty).map(key => [key, value[key] ?? ''])
);

const isNegative = (text) => text !== '' && Number(text) < 0;

const AddItemMod = () => {
    const {isSuperadmin} = useCampaign();
    const [activeTab, setActiveTab] = useState(0);
    const [mods, setMods] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Item form state
    const [itemForm, setItemForm] = useState(EMPTY_ITEM);
    const [modForm, setModForm] = useState(EMPTY_MOD);

    // Item and mod lookup state
    const [itemLookup, setItemLookup] = useState('');
    const [modLookup, setModLookup] = useState('');
    const [itemOptions, setItemOptions] = useState([]);
    const [modOptions, setModOptions] = useState([]);

    useEffect(() => {
        fetchMods();
    }, []);

    const fetchMods = async () => {
        try {
            const response = await lootService.getMods();

            if (response.data && Array.isArray(response.data.mods)) {
                setMods(response.data.mods);
            } else if (Array.isArray(response.data)) {
                setMods(response.data);
            } else {
                setMods([]);
            }
        } catch (error) {
            setError('Failed to load mods');
        }
    };

    const handleItemSearch = async (searchText) => {
        if (!searchText || searchText.length < 2) {
            setItemOptions([]);
            return;
        }

        try {
            const response = await lootService.suggestItems({query: searchText});
            // API returns { suggestions: [...], count: number }
            setItemOptions(response.data.suggestions || []);
        } catch (error) {
            // A failed suggestion lookup leaves the previous options in place
        }
    };

    // Filter mods locally since there's no dedicated mod search endpoint
    const handleModSearch = (searchText) => {
        if (!searchText || searchText.length < 2) {
            setModOptions([]);
            return;
        }
        const needle = searchText.toLowerCase();
        setModOptions(mods.filter(mod => mod.name.toLowerCase().includes(needle)));
    };

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    const handleItemFormChange = (e) => {
        const {name, value} = e.target;
        setItemForm(prev => ({...prev, [name]: value}));
    };

    // Changing the target clears a subtarget that does not belong to it
    const handleModFormChange = (e) => {
        const {name, value} = e.target;
        setModForm(prev => ({
            ...prev,
            [name]: value,
            ...(name === 'target' && !(SUBTARGET_OPTIONS[value] || []).some(([v]) => v === prev.subtarget)
                ? {subtarget: ''} : {})
        }));
    };

    const resetItemForm = () => {
        setItemForm(EMPTY_ITEM);
        setItemLookup('');
    };

    const resetModForm = () => {
        setModForm(EMPTY_MOD);
        setModLookup('');
    };

    const validateItemForm = () => {
        // Required fields for item: name, type, value
        if (!itemForm.name.trim()) return 'Item name is required';
        if (!itemForm.type.trim()) return 'Item type is required';
        if (!itemForm.value && itemForm.value !== 0) return 'Item value is required';
        if (isNegative(String(itemForm.value))) return 'Item value cannot be negative';
        if (isNegative(String(itemForm.weight))) return 'Item weight cannot be negative';

        return null; // No validation errors
    };

    const validateModForm = () => {
        // Required fields for mod: name, type, target
        if (!modForm.name.trim()) return 'Mod name is required';
        if (!modForm.type.trim()) return 'Mod type is required';
        if (!modForm.target.trim()) return 'Target is required';

        return null; // No validation errors
    };

    const handleSubmitItem = async () => {
        try {
            setError('');
            setSuccess('');

            // Validate form
            const validationError = validateItemForm();
            if (validationError) {
                setError(validationError);
                return;
            }

            // Prepare data
            const itemData = {
                ...itemForm,
                value: parseFloat(itemForm.value),
                weight: itemForm.weight ? parseFloat(itemForm.weight) : null,
                casterlevel: itemForm.casterlevel ? parseInt(itemForm.casterlevel, 10) : null
            };

            if (itemForm.id) {
                // Update existing item
                await api.put(`/admin/items/${itemForm.id}`, itemData);
                setSuccess(`Item "${itemForm.name}" updated successfully!`);
            } else {
                // Create new item
                await api.post('/admin/items', itemData);
                setSuccess(`Item "${itemForm.name}" created successfully!`);
            }

            // Reset form
            resetItemForm();
        } catch (error) {
            setError(getErrorMessage(error, 'Failed to save item'));
        }
    };

    const handleSubmitMod = async () => {
        try {
            setError('');
            setSuccess('');

            // Validate form
            const validationError = validateModForm();
            if (validationError) {
                setError(validationError);
                return;
            }

            // Prepare data
            const modData = {
                ...modForm,
                plus: modForm.plus || null,
                casterlevel: modForm.casterlevel ? parseInt(modForm.casterlevel, 10) : null
            };

            if (modForm.id) {
                // Update existing mod
                await api.put(`/admin/mods/${modForm.id}`, modData);
                setSuccess(`Mod "${modForm.name}" updated successfully!`);
            } else {
                // Create new mod
                await api.post('/admin/mods', modData);
                setSuccess(`Mod "${modForm.name}" created successfully!`);
            }

            // Reset form
            resetModForm();

            // Refresh mods list
            fetchMods();
        } catch (error) {
            setError(getErrorMessage(error, 'Failed to save mod'));
        }
    };

    const handleItemSelect = async (event, value) => {
        if (!value) {
            resetItemForm();
            return;
        }

        try {
            // The suggest endpoint only returns id/name/type/subtype/value. Load the
            // full catalog row first, otherwise weight and casterlevel stay blank and
            // an update would overwrite both columns with null (F-1334).
            let fullItem = value;
            if (value.id !== undefined && value.id !== null) {
                const response = await lootService.getItemsByIds([value.id]);
                const rows = response?.data?.items || [];
                const row = rows.find(item => item.id === value.id);
                if (!row) {
                    throw new Error('Item not found');
                }
                fullItem = {...value, ...row};
            }
            setItemForm(pickForm(EMPTY_ITEM, fullItem));
        } catch (error) {
            resetItemForm();
            setError('Failed to load item details; the item was not loaded for editing.');
        }
    };

    const handleModSelect = (event, value) => {
        if (!value) {
            resetModForm();
            return;
        }
        setModForm(pickForm(EMPTY_MOD, value));
    };

    // Options for the current target; a stored value that is not on the list
    // (legacy data) is kept so the Select can still display it.
    const subtargetOptions = [...(SUBTARGET_OPTIONS[modForm.target] || [])];
    if (modForm.subtarget && !subtargetOptions.some(([value]) => value === modForm.subtarget)) {
        subtargetOptions.push([modForm.subtarget, modForm.subtarget]);
    }

    return (
        <>
            <Typography variant="h6" gutterBottom>Add or Edit Items & Mods</Typography>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {success && <Alert severity="success" sx={{mb: 2}}>{success}</Alert>}
            <Paper sx={{p: 2, mb: 2}}>
                <Tabs value={activeTab} onChange={handleTabChange} aria-label="item and mod tabs">
                    <Tab label="Items"/>
                    <Tab label="Mods"/>
                </Tabs>

                <Box sx={{py: 2}}>
                    {activeTab === 0 && (
                        <Box>
                            <Typography variant="h6" gutterBottom>
                                {itemForm.id ? 'Edit Item' : 'Add New Item'}
                            </Typography>

                            <Box sx={{
                                mb: 2
                            }}>
                                <Autocomplete
                                    options={itemOptions}
                                    getOptionLabel={(option) => option.name || ''}
                                    inputValue={itemLookup}
                                    onInputChange={(event, newInputValue) => {
                                        setItemLookup(newInputValue);
                                        handleItemSearch(newInputValue);
                                    }}
                                    onChange={handleItemSelect}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Search for an item to edit"
                                            fullWidth
                                            margin="normal"
                                            variant="outlined"
                                        />
                                    )}
                                />
                            </Box>

                            <Divider sx={{my: 2}}/>

                            <Grid container spacing={2}>
                                <Grid size={{xs: 12, md: 4}}>
                                    <TextField
                                        label="ID (non-editable)"
                                        value={itemForm.id}
                                        disabled
                                        fullWidth
                                        margin="normal"
                                    />
                                </Grid>
                                <Grid size={{xs: 12, md: 8}}>
                                    <TextField
                                        required
                                        label="Item Name"
                                        name="name"
                                        value={itemForm.name}
                                        onChange={handleItemFormChange}
                                        fullWidth
                                        margin="normal"
                                    />
                                </Grid>
                                <Grid size={{xs: 12, md: 6}}>
                                    <FormControl fullWidth margin="normal" required>
                                        <InputLabel>Type</InputLabel>
                                        <Select
                                            name="type"
                                            value={itemForm.type}
                                            onChange={handleItemFormChange}
                                            label="Type"
                                        >
                                            <MenuItem value="">Select Type</MenuItem>
                                            <MenuItem value="weapon">Weapon</MenuItem>
                                            <MenuItem value="armor">Armor</MenuItem>
                                            <MenuItem value="magic">Magic</MenuItem>
                                            <MenuItem value="gear">Gear</MenuItem>
                                            <MenuItem value="trade good">Trade Good</MenuItem>
                                            <MenuItem value="other">Other</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid size={{xs: 12, md: 6}}>
                                    <TextField
                                        label="Subtype"
                                        name="subtype"
                                        value={itemForm.subtype}
                                        onChange={handleItemFormChange}
                                        fullWidth
                                        margin="normal"
                                    />
                                </Grid>
                                <Grid size={{xs: 12, md: 4}}>
                                    <TextField
                                        required
                                        label="Value"
                                        name="value"
                                        type="number"
                                        value={itemForm.value}
                                        onChange={handleItemFormChange}
                                        fullWidth
                                        margin="normal"
                                    />
                                </Grid>
                                <Grid size={{xs: 12, md: 4}}>
                                    <TextField
                                        label="Weight"
                                        name="weight"
                                        type="number"
                                        value={itemForm.weight}
                                        onChange={handleItemFormChange}
                                        fullWidth
                                        margin="normal"
                                    />
                                </Grid>
                                <Grid size={{xs: 12, md: 4}}>
                                    <TextField
                                        label="Caster Level"
                                        name="casterlevel"
                                        type="number"
                                        value={itemForm.casterlevel}
                                        onChange={handleItemFormChange}
                                        fullWidth
                                        margin="normal"
                                    />
                                </Grid>
                                <Grid size={12}>
                                    <Box
                                        sx={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            mt: 2
                                        }}>
                                        <Button
                                            variant="outlined"
                                            color="secondary"
                                            onClick={resetItemForm}
                                        >
                                            Clear Form
                                        </Button>
                                        <Tooltip title={isSuperadmin ? '' : SUPERADMIN_ONLY_TOOLTIP}>
                                            <span>
                                                <Button
                                                    variant="contained"
                                                    color="primary"
                                                    onClick={handleSubmitItem}
                                                    disabled={!isSuperadmin}
                                                >
                                                    {itemForm.id ? 'Update Item' : 'Add Item'}
                                                </Button>
                                            </span>
                                        </Tooltip>
                                    </Box>
                                </Grid>
                            </Grid>
                        </Box>
                    )}

                    {activeTab === 1 && (
                        <Box>
                            <Typography variant="h6" gutterBottom>
                                {modForm.id ? 'Edit Mod' : 'Add New Mod'}
                            </Typography>

                            <Box sx={{
                                mb: 2
                            }}>
                                <Autocomplete
                                    options={modOptions}
                                    getOptionLabel={(option) => option.name || ''}
                                    inputValue={modLookup}
                                    onInputChange={(event, newInputValue) => {
                                        setModLookup(newInputValue);
                                        handleModSearch(newInputValue);
                                    }}
                                    onChange={handleModSelect}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Search for a mod to edit"
                                            fullWidth
                                            margin="normal"
                                            variant="outlined"
                                        />
                                    )}
                                />
                            </Box>

                            <Divider sx={{my: 2}}/>

                            <Grid container spacing={2}>
                                <Grid size={{xs: 12, md: 4}}>
                                    <TextField
                                        label="ID (non-editable)"
                                        value={modForm.id}
                                        disabled
                                        fullWidth
                                        margin="normal"
                                    />
                                </Grid>
                                <Grid size={{xs: 12, md: 8}}>
                                    <TextField
                                        required
                                        label="Mod Name"
                                        name="name"
                                        value={modForm.name}
                                        onChange={handleModFormChange}
                                        fullWidth
                                        margin="normal"
                                    />
                                </Grid>
                                <Grid size={{xs: 12, md: 6}}>
                                    <FormControl fullWidth margin="normal" required>
                                        <InputLabel>Type</InputLabel>
                                        <Select
                                            name="type"
                                            value={modForm.type}
                                            onChange={handleModFormChange}
                                            label="Type"
                                        >
                                            <MenuItem value="">Select Type</MenuItem>
                                            <MenuItem value="Material">Material</MenuItem>
                                            <MenuItem value="Power">Enhancement</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid size={{xs: 12, md: 6}}>
                                    <TextField
                                        label="Plus"
                                        name="plus"
                                        value={modForm.plus}
                                        onChange={handleModFormChange}
                                        fullWidth
                                        margin="normal"
                                    />
                                </Grid>
                                <Grid size={{xs: 12, md: 4}}>
                                    <TextField
                                        label="Value Calculation"
                                        name="valuecalc"
                                        value={modForm.valuecalc}
                                        onChange={handleModFormChange}
                                        fullWidth
                                        margin="normal"
                                        placeholder="e.g. +10, *1.5"
                                    />
                                </Grid>
                                <Grid size={{xs: 12, md: 4}}>
                                    <FormControl fullWidth margin="normal" required>
                                        <InputLabel>Target</InputLabel>
                                        <Select
                                            name="target"
                                            value={modForm.target}
                                            onChange={handleModFormChange}
                                            label="Target"
                                        >
                                            <MenuItem value="">Select Target</MenuItem>
                                            <MenuItem value="weapon">Weapon</MenuItem>
                                            <MenuItem value="armor">Armor</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid size={{xs: 12, md: 4}}>
                                    <FormControl fullWidth margin="normal">
                                        <InputLabel>Subtarget</InputLabel>
                                        <Select
                                            name="subtarget"
                                            value={modForm.subtarget}
                                            onChange={handleModFormChange}
                                            label="Subtarget"
                                        >
                                            <MenuItem value="">Select Subtarget</MenuItem>
                                            {subtargetOptions.map(([value, label]) => (
                                                <MenuItem key={value} value={value}>{label}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid size={12}>
                                    <Box
                                        sx={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            mt: 2
                                        }}>
                                        <Button
                                            variant="outlined"
                                            color="secondary"
                                            onClick={resetModForm}
                                        >
                                            Clear Form
                                        </Button>
                                        <Tooltip title={isSuperadmin ? '' : SUPERADMIN_ONLY_TOOLTIP}>
                                            <span>
                                                <Button
                                                    variant="contained"
                                                    color="primary"
                                                    onClick={handleSubmitMod}
                                                    disabled={!isSuperadmin}
                                                >
                                                    {modForm.id ? 'Update Mod' : 'Add Mod'}
                                                </Button>
                                            </span>
                                        </Tooltip>
                                    </Box>
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </Box>
            </Paper>
        </>
    );
};

export default AddItemMod;