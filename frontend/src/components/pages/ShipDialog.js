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
import { SHIP_IMPROVEMENTS, SHIP_WEAPON_TYPES } from '../../data/shipData';

const ShipDialog = ({
  open,
  onClose,
  selectedShip,
  editingShip,
  setEditingShip,
  shipTypes,
  loadingShipTypes,
  onShipTypeChange,
  onSave
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
          {/* Ship Type and Location */}
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
            <FormControl fullWidth>
              <InputLabel>Ship Status</InputLabel>
              <Select
                value={editingShip.status || 'Active'}
                label="Ship Status"
                onChange={(e) => setEditingShip({ ...editingShip, status: e.target.value })}
              >
                <MenuItem value="PC Active">PC Active</MenuItem>
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Docked">Docked</MenuItem>
                <MenuItem value="Lost">Lost</MenuItem>
                <MenuItem value="Sunk">Sunk</MenuItem>
              </Select>
            </FormControl>
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
            <Typography variant="h6" color="primary">Weapon Types</Typography>
            <Divider sx={{ mb: 2 }} />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Autocomplete
              multiple
              options={SHIP_WEAPON_TYPES}
              value={editingShip.weapon_types ? editingShip.weapon_types.map(wt => wt.type) : []}
              onChange={(event, newValue) => {
                // Convert back to weapon_types format with quantities
                const newWeaponTypes = newValue.map(weaponType => {
                  const existing = editingShip.weapon_types?.find(wt => wt.type === weaponType);
                  return {
                    type: weaponType,
                    quantity: existing ? existing.quantity : 1
                  };
                });
                setEditingShip({ ...editingShip, weapon_types: newWeaponTypes });
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Ship Weapon Types"
                  placeholder="Select weapon types..."
                  helperText="Select from standard Pathfinder 1e ship weapons"
                />
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => {
                  const weaponType = editingShip.weapon_types?.find(wt => wt.type === option);
                  return (
                    <Chip
                      variant="outlined"
                      label={`${option} (${weaponType?.quantity || 1})`}
                      {...getTagProps({ index })}
                      key={option}
                    />
                  );
                })
              }
            />
          </Grid>
          
          {/* Weapon Quantities */}
          {editingShip.weapon_types && editingShip.weapon_types.length > 0 && (
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>Weapon Quantities</Typography>
              <Grid container spacing={2}>
                {editingShip.weapon_types.map((weaponType, index) => (
                  <Grid item xs={12} sm={6} md={4} key={weaponType.type}>
                    <Card variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        {weaponType.type}
                      </Typography>
                      <TextField
                        fullWidth
                        label="Quantity"
                        type="number"
                        size="small"
                        inputProps={{ min: 1, max: 20 }}
                        value={weaponType.quantity}
                        onChange={(e) => {
                          const newWeaponTypes = [...editingShip.weapon_types];
                          newWeaponTypes[index].quantity = parseInt(e.target.value) || 1;
                          setEditingShip({ ...editingShip, weapon_types: newWeaponTypes });
                        }}
                      />
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          )}



          {/* Ship Improvements */}
          <Grid item xs={12}>
            <Typography variant="h6" color="primary">Ship Improvements</Typography>
            <Divider sx={{ mb: 2 }} />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Autocomplete
              multiple
              options={Object.keys(SHIP_IMPROVEMENTS)}
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
          
          {/* Improvement Details */}
          {editingShip.improvements && editingShip.improvements.length > 0 && (
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>Improvement Details</Typography>
              {editingShip.improvements.map((improvementName, index) => {
                const improvement = SHIP_IMPROVEMENTS[improvementName];
                if (!improvement) return null;
                
                return (
                  <Card key={improvementName} variant="outlined" sx={{ mb: 2, p: 2 }}>
                    <Typography variant="h6" color="primary" sx={{ mb: 1 }}>
                      {improvement.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {improvement.description}
                    </Typography>
                    {Object.keys(improvement.effects).length > 0 && (
                      <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Effects:</Typography>
                        <Box display="flex" flexWrap="wrap" gap={1}>
                          {Object.entries(improvement.effects).map(([effect, value]) => (
                            <Chip
                              key={effect}
                              label={`${effect.replace(/_/g, ' ')}: ${value}`}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Card>
                );
              })}
            </Grid>
          )}
          
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
