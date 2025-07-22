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

// Standard Skull & Shackles Ship Improvements with descriptions and effects
const SHIP_IMPROVEMENTS = {
  'Additional Crew Quarters': {
    name: 'Additional Crew Quarters',
    description: 'More space for sailors to sleep and eat. Ship may support 10% more passengers, but cargo capacity is reduced by 10%.',
    effects: {
      max_passengers: '+10%',
      cargo_capacity: '-10%'
    }
  },
  'Armored Plating': {
    name: 'Armored Plating',
    description: 'Metal plates attached to the ship. Hull hit points increased by 15% and hardness increased by 4. Cargo capacity reduced by 15%, -1 penalty on sailing checks, waterborne speed reduced by 20%.',
    effects: {
      max_hp: '+15%',
      hardness: '+4',
      cargo_capacity: '-15%',
      sailing_check_bonus: '-1',
      waterborne_speed: '-20%'
    }
  },
  'Concealed Weapon Port': {
    name: 'Concealed Weapon Port',
    description: 'Belowdecks reconstruction to house Large direct-fire siege engines. Each port reduces cargo capacity by 5 tons and requires DC 15 Perception to detect.',
    effects: {
      cargo_capacity: '-5 tons per port',
      hidden_weapons: true
    }
  },
  'Extended Keel': {
    name: 'Extended Keel',
    description: 'Longer than usual keel makes ship more stable. Ship 10% longer, +1 bonus on sailing checks. Must be installed during construction.',
    effects: {
      sailing_check_bonus: '+1',
      ship_length: '+10%'
    }
  },
  'Figurehead': {
    name: 'Figurehead',
    description: 'Fanciful carvings on the bowsprit. Purely cosmetic with no game effect.',
    effects: {}
  },
  'Glass Bottom': {
    name: 'Glass Bottom',
    description: 'Wide windows in ship bottom for ocean viewing. Makes bottom only as strong as glass (hardness 1, hp 3).',
    effects: {
      bottom_hardness: 1,
      bottom_hp: 3
    }
  },
  'Hold Optimization': {
    name: 'Hold Optimization',
    description: 'Efficient remodeling of ship layout provides more storage room. Cargo capacity increased by 10%.',
    effects: {
      cargo_capacity: '+10%'
    }
  },
  'Improved Rudder': {
    name: 'Improved Rudder',
    description: 'Wide rudder makes ship more nimble, granting +1 bonus on all sailing checks.',
    effects: {
      sailing_check_bonus: '+1'
    }
  },
  'Magically Treated Control Device': {
    name: 'Magically Treated Control Device',
    description: 'Ship\'s steering wheel or tiller is magically treated, doubling its hit points and hardness.',
    effects: {
      control_device_hp: 'x2',
      control_device_hardness: 'x2'
    }
  },
  'Magically Treated Hull': {
    name: 'Magically Treated Hull',
    description: 'Ship\'s hull is magically treated, doubling the ship\'s hit points and hardness.',
    effects: {
      max_hp: 'x2',
      hardness: 'x2'
    }
  },
  'Magically Treated Oars': {
    name: 'Magically Treated Oars',
    description: 'Ship\'s oars are magically treated, doubling their hit points and hardness.',
    effects: {
      oar_hp: 'x2',
      oar_hardness: 'x2'
    }
  },
  'Magically Treated Sails': {
    name: 'Magically Treated Sails',
    description: 'Ship\'s sails are magically treated, doubling their hit points and hardness.',
    effects: {
      sail_hp: 'x2',
      sail_hardness: 'x2'
    }
  },
  'Movable Deck': {
    name: 'Movable Deck',
    description: 'Deck features can be rearranged to disguise ship as different vessel. Hidden mechanisms require DC 20 Perception to detect.',
    effects: {
      disguise_capability: true
    }
  },
  'Narrow Hull': {
    name: 'Narrow Hull',
    description: 'Slender hull design for slipping through smaller spaces. Ship beam decreased by 20%, cargo capacity reduced by 10%, +2 bonus on sailing checks. Must be installed during construction.',
    effects: {
      sailing_check_bonus: '+2',
      cargo_capacity: '-10%',
      ship_beam: '-20%'
    }
  },
  'Ram': {
    name: 'Ram',
    description: 'Bronze or iron-sheathed ram mounted on bow. Deals additional 2d8 ramming damage and ignores damage for first square of solid objects.',
    effects: {
      ramming_damage: '+2d8',
      ramming_special: 'Ignores first square damage'
    }
  },
  'Rapid-Deploy Sails': {
    name: 'Rapid-Deploy Sails',
    description: 'Improved rigging allows sails to be raised and lowered much faster than normal.',
    effects: {
      sail_deployment: 'Faster'
    }
  },
  'Silk Sails': {
    name: 'Silk Sails',
    description: 'High-quality silk sails provide better performance and durability than standard canvas sails.',
    effects: {
      sail_quality: 'Superior'
    }
  },
  'Smuggling Compartments': {
    name: 'Smuggling Compartments',
    description: 'Hidden cargo areas between bulkheads. Doesn\'t change cargo capacity. Holds 1 plunder per 2 compartments. DC 20 Perception to locate.',
    effects: {
      hidden_storage: '1 plunder per 2 compartments'
    }
  },
  'Sturdy Hull': {
    name: 'Sturdy Hull',
    description: 'Additional supports and wood layers make hull thicker and more resilient. Hull hardness increased by 2, cargo capacity reduced by 10%.',
    effects: {
      hardness: '+2',
      cargo_capacity: '-10%'
    }
  },
  'Wooden Plating': {
    name: 'Wooden Plating',
    description: 'Additional wooden planks nailed to hull for protection. Hull hit points increased by 5%, hardness increased by 2, cargo capacity reduced by 10%, waterborne speed reduced by 10%.',
    effects: {
      max_hp: '+5%',
      hardness: '+2',
      cargo_capacity: '-10%',
      waterborne_speed: '-10%'
    }
  }
};

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
