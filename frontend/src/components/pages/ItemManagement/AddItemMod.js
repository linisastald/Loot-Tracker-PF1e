// frontend/src/components/pages/ItemManagement/AddItemMod.js
import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';
import {
  Typography,
  TextField,
  Button,
  Box,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  Tabs,
  Tab,
  Alert,
  Divider
} from '@mui/material';

const AddItemMod = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [mods, setMods] = useState([]);
  const [modsLoading, setModsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Item form state
  const [itemForm, setItemForm] = useState({
    id: '',
    name: '',
    type: '',
    subtype: '',
    value: '',
    weight: '',
    casterlevel: ''
  });

  // Mod form state
  const [modForm, setModForm] = useState({
    id: '',
    name: '',
    plus: '',
    type: '',
    valuecalc: '',
    target: '',
    subtarget: ''
  });

  // Item and mod lookup state
  const [itemLookup, setItemLookup] = useState('');
  const [modLookup, setModLookup] = useState('');
  const [itemOptions, setItemOptions] = useState([]);
  const [modOptions, setModOptions] = useState([]);

  useEffect(() => {
    fetchItems();
    fetchMods();
  }, []);

  const fetchItems = async () => {
    try {
      setItemsLoading(true);
      const response = await api.get('/loot/items');
      setItems(response.data);
      setItemsLoading(false);
    } catch (error) {
      console.error('Error fetching items:', error);
      setError('Failed to load items');
      setItemsLoading(false);
    }
  };

  const fetchMods = async () => {
    try {
      setModsLoading(true);
      const response = await api.get('/loot/mods');

        if (response.data && Array.isArray(response.data.mods)) {
        setMods(response.data.mods);
      } else if (Array.isArray(response.data)) {
        setMods(response.data);
      } else {
        console.error('Unexpected mods response format:', response.data);
        setMods([]);
      }

        setModsLoading(false);
    } catch (error) {
      console.error('Error fetching mods:', error);
      setError('Failed to load mods');
      setModsLoading(false);
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
      console.error('Error searching items:', error);
    } finally {
      setItemsLoading(false);
    }
  };

  const handleModSearch = async (searchText) => {
    if (!searchText || searchText.length < 2) {
      setModOptions([]);
      return;
    }

    setModsLoading(true);
    try {
      // Filter mods locally since there's no dedicated mod search endpoint
        const filteredMods = mods.filter(mod =>
            mod.name.toLowerCase().includes(searchText.toLowerCase())
      );
      setModOptions(filteredMods);
    } catch (error) {
      console.error('Error searching mods:', error);
    } finally {
      setModsLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleItemFormChange = (e) => {
    const { name, value } = e.target;
    setItemForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleModFormChange = (e) => {
    const { name, value } = e.target;
    setModForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const resetItemForm = () => {
    setItemForm({
      id: '',
      name: '',
      type: '',
      subtype: '',
      value: '',
      weight: '',
      casterlevel: ''
    });
    setItemLookup('');
  };

  const resetModForm = () => {
    setModForm({
      id: '',
      name: '',
      plus: '',
      type: '',
      valuecalc: '',
      target: '',
      subtarget: ''
    });
    setModLookup('');
  };

  const validateItemForm = () => {
    // Required fields for item: name, type, value
    if (!itemForm.name.trim()) return 'Item name is required';
    if (!itemForm.type.trim()) return 'Item type is required';
    if (!itemForm.value && itemForm.value !== 0) return 'Item value is required';

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

      let response;
      if (itemForm.id) {
        // Update existing item
        response = await api.put(`/admin/items/${itemForm.id}`, itemData);
        setSuccess(`Item "${itemForm.name}" updated successfully!`);
      } else {
        // Create new item
        response = await api.post('/admin/items', itemData);
        setSuccess(`Item "${itemForm.name}" created successfully!`);
      }

      // Reset form
      resetItemForm();

        // Refresh items list
      fetchItems();
    } catch (error) {
      console.error('Error saving item:', error);
      setError(error.response?.data?.message || 'Failed to save item');
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
        plus: modForm.plus || null
      };

      let response;
      if (modForm.id) {
        // Update existing mod
        response = await api.put(`/admin/mods/${modForm.id}`, modData);
        setSuccess(`Mod "${modForm.name}" updated successfully!`);
      } else {
        // Create new mod
        response = await api.post('/admin/mods', modData);
        setSuccess(`Mod "${modForm.name}" created successfully!`);
      }

      // Reset form
      resetModForm();

        // Refresh mods list
      fetchMods();
    } catch (error) {
      console.error('Error saving mod:', error);
      setError(error.response?.data?.message || 'Failed to save mod');
    }
  };

  const handleItemSelect = (event, value) => {
    if (value) {
      setItemForm({
          id: value.id || '',
          name: value.name || '',
        type: value.type || '',
        subtype: value.subtype || '',
          value: value.value !== null && value.value !== undefined ? value.value.toString() : '',
          weight: value.weight !== null && value.weight !== undefined ? value.weight.toString() : '',
          casterlevel: value.casterlevel !== null && value.casterlevel !== undefined ? value.casterlevel.toString() : ''
      });
    } else {
      resetItemForm();
    }
  };

  const handleModSelect = (event, value) => {
    if (value) {
      setModForm({
          id: value.id || '',
          name: value.name || '',
        plus: value.plus || '',
        type: value.type || '',
        valuecalc: value.valuecalc || '',
        target: value.target || '',
        subtarget: value.subtarget || ''
      });
    } else {
      resetModForm();
    }
  };

  return (
    <>
      <Typography variant="h6" gutterBottom>Add or Edit Items & Mods</Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Tabs value={activeTab} onChange={handleTabChange} aria-label="item and mod tabs">
          <Tab label="Items" />
          <Tab label="Mods" />
        </Tabs>

        <Box sx={{ py: 2 }}>
          {activeTab === 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {itemForm.id ? 'Edit Item' : 'Add New Item'}
              </Typography>

                <Box mb={2}>
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

                <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="ID (non-editable)"
                    value={itemForm.id}
                    disabled
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} md={8}>
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
                <Grid item xs={12} md={6}>
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
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Subtype"
                    name="subtype"
                    value={itemForm.subtype}
                    onChange={handleItemFormChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
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
                <Grid item xs={12} md={4}>
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
                <Grid item xs={12} md={4}>
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
                <Grid item xs={12}>
                  <Box display="flex" justifyContent="space-between" mt={2}>
                    <Button
                      variant="outlined"
                      color="secondary"
                      onClick={resetItemForm}
                    >
                      Clear Form
                    </Button>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleSubmitItem}
                    >
                      {itemForm.id ? 'Update Item' : 'Add Item'}
                    </Button>
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

                <Box mb={2}>
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

                <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="ID (non-editable)"
                    value={modForm.id}
                    disabled
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} md={8}>
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
                <Grid item xs={12} md={6}>
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
                      <MenuItem value="Enhancement">Enhancement</MenuItem>
                      <MenuItem value="Special">Special</MenuItem>
                      <MenuItem value="Property">Property</MenuItem>
                      <MenuItem value="Other">Other</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Plus"
                    name="plus"
                    value={modForm.plus}
                    onChange={handleModFormChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
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
                <Grid item xs={12} md={4}>
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
                      <MenuItem value="magic">Magic</MenuItem>
                      <MenuItem value="gear">Gear</MenuItem>
                      <MenuItem value="other">Other</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Subtarget"
                    name="subtarget"
                    value={modForm.subtarget}
                    onChange={handleModFormChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12}>
                  <Box display="flex" justifyContent="space-between" mt={2}>
                    <Button
                      variant="outlined"
                      color="secondary"
                      onClick={resetModForm}
                    >
                      Clear Form
                    </Button>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleSubmitMod}
                    >
                      {modForm.id ? 'Update Mod' : 'Add Mod'}
                    </Button>
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