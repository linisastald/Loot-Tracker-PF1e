// Ship Dialog Component - Complete Pathfinder Ship Sheet Implementation
import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Grid, Autocomplete, Box, Typography, Divider,
  Switch, FormControlLabel, IconButton, Select, MenuItem,
  FormControl, InputLabel, Chip, Card
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon
} from '@mui/icons-material';

// Standard Pathfinder 1e Ship Weapons
const SHIP_WEAPON_TYPES = [
  'Light Ballista',
  'Heavy Ballista',
  'Dragon Ballista',
  'Gate Breaker Ballista',
  'Light Catapult',
  'Standard Catapult',
  'Heavy Catapult',
  'Light Bombard',
  'Standard Bombard',
  'Heavy Bombard',
  'Cannon',
  'Ship\'s Cannon',
  'Carronade',
  'Corvus',
  'Ram',
  'Manticore\'s Tail',
  'Firedrake',
  'Firewyrm',
  'Springal Arrow',
  'Springal Rocket'
];

// Standard Skull & Shackles Ship Improvements
const SHIP_IMPROVEMENTS = [
  'Reinforced Hull',
  'Armored Plating',
  'Improved Rigging',
  'Rapid-Deploy Sails',
  'Ram',
  'Narrow Hull',
  'Wooden Plating',
  'Sturdy Hull',
  'Magically Treated Hull',
  'Magically Treated Sails',
  'Magically Treated Oars',
  'Magically Treated Control Device',
  'Concealed Weapon Port',
  'Improved Rudder',
  'Improved Steering',
  'Smuggling Compartments',
  'Additional Crew Quarters',
  'Superior Rigging',
  'Silk Sails',
  'Advanced Steering',
  'Enhanced Hull',
  'Masterwork Rigging'
];

const ShipDialog = ({
  open,
  onClose,
  selectedShip,
  editingShip,
  setEditingShip,
  shipTypes,
  loadingShipTypes,
  onShipTypeChange,
  onSave,
  onAddWeaponType,
  onRemoveWeaponType,
  onUpdateWeaponType,
  onAddImprovement,
  onRemoveImprovement
}) => {

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        {selectedShip ? 'Edit Ship' : 'Create New Ship'}
      </DialogTitle>
      <DialogContent sx={{ maxHeight: '80vh', overflow: 'auto' }}>
        <Grid container spacing={3} sx={{ mt: 1 }}>
          
          {/* Basic Information */}
          <Grid item xs={12}>
            <Typography variant="h6" color="primary">Basic Information</Typography>
            <Divider sx={{ mb: 2 }} />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Ship Name"
              value={editingShip.name}
              onChange={(e) => setEditingShip({ ...editingShip, name: e.target.value })}
              required
            />
          </Grid>
          

          
          <Grid item xs={12}>
            <Autocomplete
              options={shipTypes}
              value={shipTypes.find(type => type.key === editingShip.ship_type) || null}
              onChange={(event, newValue) => onShipTypeChange(newValue)}
              getOptionLabel={(option) => option.name}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Ship Type (Auto-fills stats)"
                  helperText="Select a ship type to auto-fill combat stats and specifications"
                />
              )}
              renderOption={(props, option) => (
                <Box component="li" {...props}>
                  <Box>
                    <Typography variant="body1">{option.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.size} • {option.cost} gp
                    </Typography>
                  </Box>
                </Box>
              )}
              loading={loadingShipTypes}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Location"
              value={editingShip.location}
              onChange={(e) => setEditingShip({ ...editingShip, location: e.target.value })}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={editingShip.is_squibbing}
                  onChange={(e) => setEditingShip({ ...editingShip, is_squibbing: e.target.checked })}
                />
              }
              label="Squibbing"
            />
          </Grid>

          {/* Combat Statistics */}
          <Grid item xs={12}>
            <Typography variant="h6" color="primary">Combat Statistics</Typography>
            <Divider sx={{ mb: 2 }} />
          </Grid>
          
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth
              label="Max HP"
              type="number"
              inputProps={{ min: 1 }}
              value={editingShip.max_hp}
              onChange={(e) => {
                const maxHp = parseInt(e.target.value) || 100;
                setEditingShip({ 
                  ...editingShip, 
                  max_hp: maxHp,
                  current_hp: Math.min(editingShip.current_hp, maxHp)
                });
              }}
            />
          </Grid>
          
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth
              label="Current HP"
              type="number"
              inputProps={{ min: 0, max: editingShip.max_hp }}
              value={editingShip.current_hp}
              onChange={(e) => setEditingShip({ ...editingShip, current_hp: parseInt(e.target.value) || 0 })}
            />
          </Grid>
          
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth
              label="Base AC"
              type="number"
              inputProps={{ min: 0, max: 50 }}
              value={editingShip.base_ac}
              onChange={(e) => setEditingShip({ ...editingShip, base_ac: parseInt(e.target.value) || 10 })}
            />
          </Grid>
          
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth
              label="Touch AC"
              type="number"
              inputProps={{ min: 0, max: 50 }}
              value={editingShip.touch_ac}
              onChange={(e) => setEditingShip({ ...editingShip, touch_ac: parseInt(e.target.value) || 10 })}
            />
          </Grid>

          {/* Weapon Types */}
          <Grid item xs={12}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" color="primary">Weapon Types</Typography>
              <Button
                startIcon={<AddIcon />}
                onClick={onAddWeaponType}
                size="small"
              >
                Add Weapon Type
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
          </Grid>
          
          {editingShip.weapon_types && editingShip.weapon_types.map((weaponType, index) => (
            <Grid item xs={12} md={6} key={index}>
              <Card variant="outlined" sx={{ p: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="subtitle1">Weapon Type {index + 1}</Typography>
                  <IconButton onClick={() => onRemoveWeaponType(index)} color="error" size="small">
                    <DeleteIcon />
                  </IconButton>
                </Box>
                
                <Grid container spacing={2}>
                  <Grid item xs={8}>
                    <FormControl fullWidth>
                      <InputLabel>Weapon Type</InputLabel>
                      <Select
                        value={weaponType.type}
                        onChange={(e) => onUpdateWeaponType(index, 'type', e.target.value)}
                      >
                        {SHIP_WEAPON_TYPES.map(type => (
                          <MenuItem key={type} value={type}>{type}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  
                  <Grid item xs={4}>
                    <TextField
                      fullWidth
                      label="Quantity"
                      type="number"
                      inputProps={{ min: 1, max: 20 }}
                      value={weaponType.quantity}
                      onChange={(e) => onUpdateWeaponType(index, 'quantity', parseInt(e.target.value) || 1)}
                    />
                  </Grid>
                </Grid>
              </Card>
            </Grid>
          ))}



          {/* Ship Improvements */}
          <Grid item xs={12}>
            <Typography variant="h6" color="primary">Ship Improvements</Typography>
            <Divider sx={{ mb: 2 }} />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Autocomplete
              multiple
              options={SHIP_IMPROVEMENTS}
              value={editingShip.improvements || []}
              onChange={(event, newValue) => {
                setEditingShip({ ...editingShip, improvements: newValue });
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Ship Improvements"
                  placeholder="Select improvements..."
                  helperText="Select from standard Skull & Shackles improvements"
                />
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={option}
                    {...getTagProps({ index })}
                    key={option}
                  />
                ))
              }
            />
          </Grid>
          
        </Grid>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} variant="contained">
          {selectedShip ? 'Update Ship' : 'Create Ship'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShipDialog;
