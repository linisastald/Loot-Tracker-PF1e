import React, { useState, useEffect } from 'react';
import {
  TextField,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Checkbox,
  Box,
  IconButton,
  Autocomplete,
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { fetchItemNames } from '../../utils/lootEntryUtils';

const EntryForm = ({ entry, index, onRemove, onChange }) => {
  const [localEntry, setLocalEntry] = useState(entry.data);
  const [itemSuggestions, setItemSuggestions] = useState([]);

  useEffect(() => {
    setLocalEntry(entry.data);
  }, [entry.data]);

  useEffect(() => {
    const loadItemOptions = async () => {
      const items = await fetchItemNames();
      setItemSuggestions(items);
    };

    loadItemOptions();
  }, []);

  const handleChange = (field, value) => {
    // If changing unidentified to true, disable Smart Item Detection
    const updatedEntry = { ...localEntry, [field]: value };
    if (field === 'unidentified' && value === true) {
      updatedEntry.parseItem = false;
    }

    setLocalEntry(updatedEntry);
    onChange(index, updatedEntry);
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
      handleChange('name', newValue.name);
      handleChange('itemId', newValue.id);
      handleChange('type', newValue.type || '');
      handleChange('value', newValue.value);
    }
  };

  const renderItemForm = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} md={12}>
        <Typography variant="subtitle1" gutterBottom>
          Item Entry
        </Typography>
      </Grid>
      <Grid item xs={12} md={3}>
        <TextField
          label="Session Date"
          type="date"
          fullWidth
          InputLabelProps={{ shrink: true }}
          value={localEntry.sessionDate ? (typeof localEntry.sessionDate === 'string' ? localEntry.sessionDate.split('T')[0] : new Date(localEntry.sessionDate).toISOString().split('T')[0]) : new Date().toISOString().split('T')[0]}
          onChange={(e) => handleChange('sessionDate', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={3}>
        <TextField
          label="Quantity"
          type="number"
          fullWidth
          value={localEntry.quantity}
          onChange={(e) => handleChange('quantity', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
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
          filterOptions={(options, { inputValue }) =>
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
      <Grid item xs={12} md={3}>
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
      <Grid item xs={12} md={3}>
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
      <Grid item xs={6} md={3}>
        <FormControlLabel
          control={
            <Checkbox
              checked={localEntry.unidentified || false}
              onChange={(e) => handleChange('unidentified', e.target.checked)}
            />
          }
          label="Unidentified"
        />
      </Grid>
      <Grid item xs={6} md={3}>
        <FormControlLabel
          control={
            <Checkbox
              checked={localEntry.masterwork || false}
              onChange={(e) => handleChange('masterwork', e.target.checked)}
            />
          }
          label="Masterwork"
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          label="Notes"
          fullWidth
          multiline
          rows={2}
          value={localEntry.notes || ''}
          onChange={(e) => handleChange('notes', e.target.value)}
        />
      </Grid>
      {localEntry.name && localEntry.name.toLowerCase().startsWith('wand of ') && (
        <Grid item xs={12} md={3}>
          <TextField
            label="Charges"
            type="number"
            fullWidth
            value={localEntry.charges || ''}
            onChange={(e) => handleChange('charges', e.target.value)}
          />
        </Grid>
      )}
      <Grid item xs={12} md={3}>
        <FormControlLabel
          control={
            <Switch
              checked={localEntry.parseItem || false}
              onChange={(e) => handleChange('parseItem', e.target.checked)}
              disabled={localEntry.unidentified}
            />
          }
          label="Smart Item Detection"
        />
        {localEntry.unidentified && localEntry.parseItem && (
          <Typography variant="caption" color="error">
            Smart Item Detection is disabled for unidentified items
          </Typography>
        )}
      </Grid>
    </Grid>
  );

  const renderGoldForm = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} md={12}>
        <Typography variant="subtitle1" gutterBottom>
          Gold Entry
        </Typography>
      </Grid>
      <Grid item xs={12} md={4}>
        <TextField
          label="Session Date"
          type="date"
          fullWidth
          InputLabelProps={{ shrink: true }}
          value={localEntry.sessionDate ? (typeof localEntry.sessionDate === 'string' ? localEntry.sessionDate.split('T')[0] : new Date(localEntry.sessionDate).toISOString().split('T')[0]) : new Date().toISOString().split('T')[0]}
          onChange={(e) => handleChange('sessionDate', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={8}>
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
      <Grid item xs={6} md={3}>
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
      <Grid item xs={6} md={3}>
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
      <Grid item xs={6} md={3}>
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
      <Grid item xs={6} md={3}>
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
      <Grid item xs={12}>
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
    <Paper sx={{ p: 2, mb: 2, position: 'relative' }}>
      <IconButton
        aria-label="delete"
        onClick={onRemove}
        sx={{ position: 'absolute', top: 8, right: 8 }}
      >
        <DeleteIcon />
      </IconButton>

      {entry.type === 'item' ? renderItemForm() : renderGoldForm()}

      {entry.error && (
        <Box sx={{ mt: 2 }}>
          <Typography color="error">{entry.error}</Typography>
        </Box>
      )}
    </Paper>
  );
};

export default EntryForm;