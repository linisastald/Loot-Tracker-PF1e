import React, {useEffect, useState} from 'react';
import {
    Autocomplete,
    Box,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Switch,
    TextField,
    Typography,
    Button,
} from '@mui/material';
import {Delete as DeleteIcon} from '@mui/icons-material';
import {fetchItemNames} from '../../utils/lootEntryUtils';
import api from '../../utils/api';

const EntryForm = ({entry, index, onRemove, onChange}) => {
    const [localEntry, setLocalEntry] = useState(entry.data);
    const [itemSuggestions, setItemSuggestions] = useState([]);
    const [hasOpenAiKey, setHasOpenAiKey] = useState(false);
    const [showMagicDialog, setShowMagicDialog] = useState(false);

    useEffect(() => {
        setLocalEntry(entry.data);
    }, [entry.data]);

    useEffect(() => {
        const loadItemOptions = async () => {
            const items = await fetchItemNames();
            setItemSuggestions(items);
        };

        const checkOpenAiKey = async () => {
            try {
                const response = await api.get('/settings/openai-key');
                setHasOpenAiKey(response.data?.hasKey || false);
            } catch (error) {
                console.error('Error checking OpenAI key:', error);
                setHasOpenAiKey(false);
            }
        };

        loadItemOptions();
        checkOpenAiKey();
    }, []);

    const handleChange = (field, value) => {
        // If changing unidentified to true, disable Smart Item Detection
        const updatedEntry = {...localEntry, [field]: value};
        if (field === 'unidentified' && value === true) {
            updatedEntry.parseItem = false;
            // Also clear itemId if unidentified is checked
            updatedEntry.itemId = null;
        }
        
        // If trying to enable parseItem but no OpenAI key, prevent it
        if (field === 'parseItem' && value === true && !hasOpenAiKey) {
            return; // Don't allow enabling if no OpenAI key
        }

        // If changing type to 'magic' and not already unidentified, show dialog
        if (field === 'type' && value === 'magic' && !localEntry.unidentified) {
            setShowMagicDialog(true);
            return; // Don't update yet, wait for user choice
        }

        setLocalEntry(prev => ({...prev, [field]: value}));
        onChange(index, {[field]: value});
    };

    const handleMagicDialogChoice = (useUnidentified) => {
        setShowMagicDialog(false);
        
        if (useUnidentified) {
            // Set as unidentified instead of magic type
            const updates = { unidentified: true, parseItem: false, itemId: null };
            setLocalEntry(prev => ({...prev, ...updates}));
            onChange(index, updates);
        } else {
            // Proceed with magic type
            setLocalEntry(prev => ({...prev, type: 'magic'}));
            onChange(index, {type: 'magic'});
        }
    };

    const handleItemSelect = (event, newValue) => {
        if (!newValue) {
            // If clearing the field
            handleChange('name', '');
            handleChange('itemId', null);
            handleChange('type', '');
            handleChange('value', null);
            return;
        }

        if (typeof newValue === 'string') {
            // Just update the name if a string is provided
            handleChange('name', newValue);
        } else {
            // Full item object from autocomplete
            // Don't set itemId if unidentified is checked
            if (localEntry.unidentified) {
                handleChange('name', newValue.name);
                handleChange('type', newValue.type || '');
                // Explicitly don't set itemId or value for unidentified items
            } else {
                handleChange('name', newValue.name);
                handleChange('itemId', newValue.id);
                handleChange('type', newValue.type || '');
                handleChange('value', newValue.value);
            }
        }
    };

    const renderItemForm = () => (
        <Grid container spacing={2}>
            {/* First Line: Session Date, Quantity (same size as Type/Size), Item Name (remaining) */}
            <Grid size={{xs: 12, sm: 1.5}}>
                <TextField
                    label="Session Date"
                    type="date"
                    fullWidth
                    InputLabelProps={{shrink: true}}
                    value={localEntry.sessionDate ? (typeof localEntry.sessionDate === 'string' ? localEntry.sessionDate.split('T')[0] : new Date(localEntry.sessionDate).toISOString().split('T')[0]) : new Date().toISOString().split('T')[0]}
                    onChange={(e) => handleChange('sessionDate', e.target.value)}
                />
            </Grid>
            <Grid size={{xs: 12, sm: 1.5}}>
                <TextField
                    label="Quantity"
                    type="number"
                    fullWidth
                    value={localEntry.quantity}
                    onChange={(e) => handleChange('quantity', e.target.value)}
                />
            </Grid>
            <Grid size={{xs: 12, sm: 9}}>
                <Autocomplete
                    freeSolo
                    options={itemSuggestions}
                    value={localEntry.name || ''}
                    inputValue={localEntry.name || ''}
                    onInputChange={async (event, newInputValue) => {
                        handleChange('name', newInputValue);
                        // Fetch items when typing
                        if (newInputValue.length >= 2) {
                            const fetchedItems = await fetchItemNames(newInputValue);
                            setItemSuggestions(fetchedItems);
                        }
                    }}
                    onChange={(event, newValue) => {
                        if (newValue) {
                            const selectedItem = typeof newValue === 'string'
                                ? itemSuggestions.find(item => item.name.toLowerCase() === newValue.toLowerCase())
                                : newValue;

                            if (selectedItem) {
                                handleChange('name', selectedItem.name);
                                handleChange('itemId', selectedItem.id);
                                handleChange('type', selectedItem.type || '');
                                handleChange('value', selectedItem.value || null);
                            } else {
                                handleChange('name', typeof newValue === 'string' ? newValue : '');
                                handleChange('itemId', null);
                                handleChange('type', '');
                                handleChange('value', null);
                            }
                        } else {
                            handleChange('name', '');
                            handleChange('itemId', null);
                            handleChange('type', '');
                            handleChange('value', null);
                        }
                    }}
                    filterOptions={(options, {inputValue}) =>
                        options.filter(option =>
                            option.name.toLowerCase().includes(inputValue.toLowerCase())
                        )
                    }
                    getOptionLabel={(option) =>
                        typeof option === 'string'
                            ? option
                            : option.name || ''
                    }
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Item Name"
                            fullWidth
                        />
                    )}
                />
            </Grid>
            {/* Second Line: Type (reduced), Size (reduced), Wand Charges, Checkboxes, Smart Detection */}
            <Grid size={{xs: 12, sm: 1.5}}>
                <FormControl fullWidth>
                    <InputLabel>Type</InputLabel>
                    <Select
                        value={localEntry.type || ''}
                        onChange={(e) => handleChange('type', e.target.value)}
                        disabled={localEntry.itemId !== null && localEntry.itemId !== undefined}
                        label="Type"
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
            </Grid>
            <Grid size={{xs: 12, sm: 1.5}}>
                <FormControl fullWidth>
                    <InputLabel>Size</InputLabel>
                    <Select
                        value={localEntry.size || ''}
                        onChange={(e) => handleChange('size', e.target.value)}
                        label="Size"
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
            </Grid>
            
            {/* Wand Charges (if applicable) */}
            {localEntry.name && localEntry.name.toLowerCase().startsWith('wand of ') && (
                <Grid size={{xs: 12, sm: 2}}>
                    <TextField
                        label="Charges"
                        type="number"
                        fullWidth
                        value={localEntry.charges || ''}
                        onChange={(e) => handleChange('charges', e.target.value)}
                    />
                </Grid>
            )}
            
            <Grid size={{xs: 6, sm: 1.5}}>
                <Paper variant="outlined" sx={{ p: 1, display: 'flex', alignItems: 'center', height: '56px' }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={localEntry.unidentified || false}
                                onChange={(e) => handleChange('unidentified', e.target.checked)}
                            />
                        }
                        label="Unidentified"
                        sx={{ m: 0 }}
                    />
                </Paper>
            </Grid>
            <Grid size={{xs: 6, sm: 1.5}}>
                <Paper variant="outlined" sx={{ p: 1, display: 'flex', alignItems: 'center', height: '56px' }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={localEntry.masterwork || false}
                                onChange={(e) => handleChange('masterwork', e.target.checked)}
                            />
                        }
                        label="Masterwork"
                        sx={{ m: 0 }}
                    />
                </Paper>
            </Grid>
            <Grid size={{xs: 12, sm: 3}}>
                <Paper variant="outlined" sx={{ p: 1, display: 'inline-flex', alignItems: 'center', height: '56px' }}>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={localEntry.parseItem || false}
                                onChange={(e) => handleChange('parseItem', e.target.checked)}
                                disabled={localEntry.unidentified || !hasOpenAiKey}
                            />
                        }
                        label="Smart Item Detection"
                        sx={{ m: 0 }}
                    />
                    {(localEntry.unidentified || !hasOpenAiKey) && (
                        <Typography variant="caption" color="error" sx={{ ml: 1 }}>
                            {localEntry.unidentified 
                                ? 'Not available for unidentified items'
                                : 'OpenAI key required in System Settings'
                            }
                        </Typography>
                    )}
                </Paper>
            </Grid>
            
            {/* Third Line: Notes (full width) */}
            <Grid size={12}>
                <TextField
                    label="Notes"
                    fullWidth
                    multiline
                    rows={2}
                    value={localEntry.notes || ''}
                    onChange={(e) => handleChange('notes', e.target.value)}
                />
            </Grid>
        </Grid>
    );

    const renderGoldForm = () => (
        <Grid container spacing={2}>
            {/* First Line: Session Date, Platinum, Gold, Silver, Copper */}
            <Grid size={{xs: 12, sm: 1.5}}>
                <TextField
                    label="Session Date"
                    type="date"
                    fullWidth
                    InputLabelProps={{shrink: true}}
                    value={localEntry.sessionDate ? (typeof localEntry.sessionDate === 'string' ? localEntry.sessionDate.split('T')[0] : new Date(localEntry.sessionDate).toISOString().split('T')[0]) : new Date().toISOString().split('T')[0]}
                    onChange={(e) => handleChange('sessionDate', e.target.value)}
                />
            </Grid>
            <Grid size={{xs: 12, sm: 2.625}}>
                <TextField
                    label="Platinum"
                    type="number"
                    fullWidth
                    inputProps={{min: 0}}
                    value={localEntry.platinum || ''}
                    onChange={(e) => {
                        const value = Math.max(0, parseInt(e.target.value) || 0);
                        handleChange('platinum', value);
                    }}
                />
            </Grid>
            <Grid size={{xs: 12, sm: 2.625}}>
                <TextField
                    label="Gold"
                    type="number"
                    fullWidth
                    inputProps={{min: 0}}
                    value={localEntry.gold || ''}
                    onChange={(e) => {
                        const value = Math.max(0, parseInt(e.target.value) || 0);
                        handleChange('gold', value);
                    }}
                />
            </Grid>
            <Grid size={{xs: 12, sm: 2.625}}>
                <TextField
                    label="Silver"
                    type="number"
                    fullWidth
                    inputProps={{min: 0}}
                    value={localEntry.silver || ''}
                    onChange={(e) => {
                        const value = Math.max(0, parseInt(e.target.value) || 0);
                        handleChange('silver', value);
                    }}
                />
            </Grid>
            <Grid size={{xs: 12, sm: 2.625}}>
                <TextField
                    label="Copper"
                    type="number"
                    fullWidth
                    inputProps={{min: 0}}
                    value={localEntry.copper || ''}
                    onChange={(e) => {
                        const value = Math.max(0, parseInt(e.target.value) || 0);
                        handleChange('copper', value);
                    }}
                />
            </Grid>
            
            {/* Second Line: Transaction Type (1/3), Notes (2/3) */}
            <Grid size={{xs: 12, sm: 4}}>
                <FormControl fullWidth>
                    <InputLabel>Transaction Type</InputLabel>
                    <Select
                        value={localEntry.transactionType || ''}
                        onChange={(e) => handleChange('transactionType', e.target.value)}
                        label="Transaction Type"
                    >
                        <MenuItem value="Deposit">Deposit</MenuItem>
                        <MenuItem value="Withdrawal">Withdrawal</MenuItem>
                        <MenuItem value="Party Loot Purchase">Party Loot Purchase</MenuItem>
                        <MenuItem value="Party Payback">Party Payback</MenuItem>
                        <MenuItem value="Other">Other</MenuItem>
                    </Select>
                </FormControl>
            </Grid>
            <Grid size={{xs: 12, sm: 8}}>
                <TextField
                    label="Notes"
                    fullWidth
                    multiline
                    rows={2}
                    value={localEntry.notes || ''}
                    onChange={(e) => handleChange('notes', e.target.value)}
                />
            </Grid>
        </Grid>
    );

    return (
        <Paper sx={{p: 2, mb: 2, position: 'relative'}}>
            <IconButton
                aria-label="delete"
                onClick={onRemove}
                sx={{position: 'absolute', top: 8, right: 8}}
            >
                <DeleteIcon/>
            </IconButton>

            {entry.type === 'item' ? renderItemForm() : renderGoldForm()}

            {entry.error && (
                <Box sx={{mt: 2}}>
                    <Typography color="error">{entry.error}</Typography>
                </Box>
            )}

            {/* Magic Type Dialog */}
            <Dialog open={showMagicDialog} onClose={() => setShowMagicDialog(false)}>
                <DialogTitle>Magic Item Detection</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        You selected "Magic" as the item type. For items that haven't been identified yet, 
                        consider using the "Unidentified" checkbox instead. This helps track which items 
                        still need identification rolls.
                    </DialogContentText>
                    <DialogContentText sx={{ mt: 2, fontWeight: 'bold' }}>
                        What would you like to do?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => handleMagicDialogChoice(true)} color="primary" variant="outlined">
                        Mark as Unidentified
                    </Button>
                    <Button onClick={() => handleMagicDialogChoice(false)} color="primary" variant="contained">
                        Keep as Magic Type
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};

export default EntryForm;