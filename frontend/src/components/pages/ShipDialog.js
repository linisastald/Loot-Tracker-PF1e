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
  onAddWeapon,
  onRemoveWeapon,
  onUpdateWeapon,
  onAddOfficer,
  onRemoveOfficer,
  onUpdateOfficer,
  onAddImprovement,
  onRemoveImprovement
}) => {

  const weaponTypes = ['direct-fire', 'indirect-fire'];
  const mountPositions = ['port', 'starboard', 'fore', 'aft', 'deck'];
  const officerPositions = [
    'Captain', 'First Mate', 'Bosun', 'Cook', 'Gunner',
    'Master Gunner', 'Pilot', 'Surgeon', 'Quartermaster'
  ];

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
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Captain Name"
              value={editingShip.captain_name}
              onChange={(e) => setEditingShip({ ...editingShip, captain_name: e.target.value })}
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

          {/* Weapons */}
          <Grid item xs={12}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" color="primary">Weapons</Typography>
              <Button
                startIcon={<AddIcon />}
                onClick={onAddWeapon}
                disabled={editingShip.weapons.length >= 4}
                size="small"
              >
                Add Weapon ({editingShip.weapons.length}/4)
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
          </Grid>
          
          {editingShip.weapons.map((weapon, index) => (
            <Grid item xs={12} key={index}>
              <Card variant="outlined" sx={{ p: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="subtitle1">Weapon {index + 1}</Typography>
                  <IconButton onClick={() => onRemoveWeapon(index)} color="error" size="small">
                    <DeleteIcon />
                  </IconButton>
                </Box>
                
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Weapon Name"
                      value={weapon.name}
                      onChange={(e) => onUpdateWeapon(index, 'name', e.target.value)}
                      placeholder="Light Ballista"
                    />
                  </Grid>
                  
                  <Grid item xs={6} md={3}>
                    <FormControl fullWidth>
                      <InputLabel>Type</InputLabel>
                      <Select
                        value={weapon.type}
                        onChange={(e) => onUpdateWeapon(index, 'type', e.target.value)}
                      >
                        {weaponTypes.map(type => (
                          <MenuItem key={type} value={type}>{type}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  
                  <Grid item xs={6} md={3}>
                    <TextField
                      fullWidth
                      label="Damage"
                      value={weapon.damage}
                      onChange={(e) => onUpdateWeapon(index, 'damage', e.target.value)}
                      placeholder="3d8"
                    />
                  </Grid>
                </Grid>
              </Card>
            </Grid>
          ))}

          {/* Officers */}
          <Grid item xs={12}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" color="primary">Officers</Typography>
              <Button
                startIcon={<AddIcon />}
                onClick={onAddOfficer}
                size="small"
              >
                Add Officer
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
          </Grid>
          
          {editingShip.officers.map((officer, index) => (
            <Grid item xs={12} md={6} key={index}>
              <Card variant="outlined" sx={{ p: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="subtitle2">Officer {index + 1}</Typography>
                  <IconButton onClick={() => onRemoveOfficer(index)} color="error" size="small">
                    <DeleteIcon />
                  </IconButton>
                </Box>
                
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <FormControl fullWidth>
                      <InputLabel>Position</InputLabel>
                      <Select
                        value={officer.position}
                        onChange={(e) => onUpdateOfficer(index, 'position', e.target.value)}
                      >
                        {officerPositions.map(position => (
                          <MenuItem key={position} value={position}>{position}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="Name"
                      value={officer.name}
                      onChange={(e) => onUpdateOfficer(index, 'name', e.target.value)}
                    />
                  </Grid>
                </Grid>
              </Card>
            </Grid>
          ))}

          {/* Ship Improvements */}
          <Grid item xs={12}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" color="primary">Ship Improvements</Typography>
              <Button
                startIcon={<AddIcon />}
                onClick={onAddImprovement}
                size="small"
              >
                Add Improvement
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
          </Grid>
          
          <Grid item xs={12}>
            <Box display="flex" flexWrap="wrap" gap={1}>
              {editingShip.improvements.map((improvement, index) => (
                <Chip
                  key={index}
                  label={improvement}
                  onDelete={() => onRemoveImprovement(index)}
                  color="primary"
                  variant="outlined"
                />
              ))}
              {editingShip.improvements.length === 0 && (
                <Typography color="text.secondary">No improvements added</Typography>
              )}
            </Box>
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
