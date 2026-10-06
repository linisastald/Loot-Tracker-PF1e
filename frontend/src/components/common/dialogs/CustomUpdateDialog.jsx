import React from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField
} from '@mui/material';
import { ITEM_SIZES, ITEM_TYPES } from '../../../utils/itemOptions';

// MUI selects cannot hold null, so 'Not Magical' (unidentified = null) uses a sentinel
const NOT_MAGICAL = 'none';

// lockUnidentified: a non-DM editing an item that is still unidentified. The server
// rejects un-ticking it there (identifying goes through Identify or a DM).
const CustomUpdateDialog = ({open, onClose, updatedEntry = {}, onUpdateChange, onUpdateSubmit, error = '', lockUnidentified = false}) => {
    const handleUnidentifiedChange = (event) => {
        const {value} = event.target;
        onUpdateChange({target: {name: 'unidentified', value: value === NOT_MAGICAL ? null : value}});
    };

    // Loot Entry stores lowercase types; rows saved by the old dialog may hold 'Trade Good'
    const typeValue = (updatedEntry.type || '').toLowerCase();

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>Update Entry</DialogTitle>
            <DialogContent>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}
                <Grid container spacing={2}>
                    <Grid size={{xs: 12, sm: 6}}>
                        <TextField
                            label="Quantity"
                            type="number"
                            name="quantity"
                            value={updatedEntry.quantity || ''}
                            onChange={onUpdateChange}
                            fullWidth
                        />
                    </Grid>
                    <Grid size={{xs: 12, sm: 6}}>
                        <TextField
                            label="Item Name"
                            name="name"
                            value={updatedEntry.name || ''}
                            onChange={onUpdateChange}
                            fullWidth
                        />
                    </Grid>
                    <Grid size={{xs: 12, sm: 6}}>
                        <FormControl fullWidth disabled={lockUnidentified}>
                            <InputLabel id="update-magical-label">Magical?</InputLabel>
                            <Select
                                labelId="update-magical-label"
                                label="Magical?"
                                name="unidentified"
                                value={updatedEntry.unidentified ?? NOT_MAGICAL}
                                onChange={handleUnidentifiedChange}
                            >
                                <MenuItem value={NOT_MAGICAL}>Not Magical</MenuItem>
                                <MenuItem value={false}>Identified</MenuItem>
                                <MenuItem value={true}>Unidentified</MenuItem>
                            </Select>
                            {lockUnidentified && (
                                <FormHelperText>Use Identify to identify this item.</FormHelperText>
                            )}
                        </FormControl>
                    </Grid>
                    <Grid size={{xs: 12, sm: 6}}>
                        <FormControl fullWidth>
                            <InputLabel id="update-masterwork-label">Masterwork</InputLabel>
                            <Select
                                labelId="update-masterwork-label"
                                label="Masterwork"
                                name="masterwork"
                                value={updatedEntry.masterwork ?? ''}
                                onChange={onUpdateChange}
                            >
                                <MenuItem value={true}>Yes</MenuItem>
                                <MenuItem value={false}>No</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid size={{xs: 12, sm: 6}}>
                        <FormControl fullWidth>
                            <InputLabel id="update-type-label">Type</InputLabel>
                            <Select
                                labelId="update-type-label"
                                label="Type"
                                name="type"
                                value={typeValue}
                                onChange={onUpdateChange}
                            >
                                {ITEM_TYPES.map(({value, label}) => (
                                    <MenuItem key={value} value={value}>{label}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid size={{xs: 12, sm: 6}}>
                        <FormControl fullWidth>
                            <InputLabel id="update-size-label">Size</InputLabel>
                            <Select
                                labelId="update-size-label"
                                label="Size"
                                name="size"
                                value={updatedEntry.size || ''}
                                onChange={onUpdateChange}
                            >
                                {ITEM_SIZES.map((size) => (
                                    <MenuItem key={size} value={size}>{size}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid size={12}>
                        <TextField
                            label="Notes"
                            name="notes"
                            value={updatedEntry.notes || ''}
                            onChange={onUpdateChange}
                            fullWidth
                        />
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={onUpdateSubmit}>Update</Button>
            </DialogActions>
        </Dialog>
    );
};

export default CustomUpdateDialog;
