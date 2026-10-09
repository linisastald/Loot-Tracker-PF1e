// Ship Dialog Component - Complete Pathfinder Ship Sheet Implementation
import { useEffect, useState } from 'react';
import {
  Alert, Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Grid, Autocomplete, Box, Typography, Divider,
  Switch, FormControlLabel, Select, MenuItem,
  FormControl, InputLabel, Chip, Card
} from '@mui/material';
import { SHIP_IMPROVEMENTS, SHIP_WEAPON_TYPES } from '../../data/shipData';
import ImprovementEffects from './ships/ImprovementEffects';
import { SHIP_STATUSES } from './ships/shipUtils';

const SectionHeader = ({ title }) => (
  <Grid size={12}>
    <Typography variant="h6" color="primary">{title}</Typography>
    <Divider sx={{ mb: 2 }} />
  </Grid>
);

/**
 * Whole-number input. The text being typed is kept locally, so clearing the box to
 * retype a value does not snap it back to a default; a valid number is reported as
 * it is typed, and an empty / out-of-range entry is repaired when the field loses focus.
 */
const IntegerInput = ({ label, value, onValueChange, min, max, fallback, size }) => {
  const [draft, setDraft] = useState(String(value ?? ''));

  // Follow outside changes (e.g. a ship type filling the stats)
  useEffect(() => {
    setDraft((current) => (parseInt(current, 10) === value ? current : String(value ?? '')));
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value;
    setDraft(raw);
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) onValueChange(parsed);
  };

  const handleBlur = () => {
    let parsed = parseInt(draft, 10);
    if (Number.isNaN(parsed)) parsed = fallback;
    if (min !== undefined) parsed = Math.max(min, parsed);
    if (max !== undefined) parsed = Math.min(max, parsed);
    setDraft(String(parsed));
    if (parsed !== value) onValueChange(parsed);
  };

  return (
    <TextField
      fullWidth
      label={label}
      type="number"
      size={size}
      slotProps={{ htmlInput: { min, max } }}
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};

const NumberField = (props) => (
  <Grid size={{ xs: 6, md: 3 }}>
    <IntegerInput {...props} />
  </Grid>
);

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
  error = '',
  fullScreen = false
}) => {
  const setField = (field, value) => setEditingShip({ ...editingShip, [field]: value });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth fullScreen={fullScreen}>
      <DialogTitle>
        {selectedShip ? 'Edit Ship' : 'Create New Ship'}
      </DialogTitle>
      <DialogContent sx={{ maxHeight: fullScreen ? 'none' : '80vh', overflow: 'auto' }}>
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
        <Grid container spacing={3} sx={{ mt: 1 }}>

          <SectionHeader title="Basic Information" />

          <Grid size={{xs: 12, md: 6}}>
            <TextField
              fullWidth
              label="Ship Name"
              value={editingShip.name}
              onChange={(e) => setField('name', e.target.value)}
              required
            />
          </Grid>
          {/* Ship Type and Location */}
          <Grid size={12}>
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
                    <Typography variant="caption" sx={{
                      color: "text.secondary"
                    }}>
                      {option.size} • {option.cost} gp
                    </Typography>
                  </Box>
                </Box>
              )}
              loading={loadingShipTypes}
            />
          </Grid>

          <Grid size={{xs: 12, md: 6}}>
            <TextField
              fullWidth
              label="Location"
              value={editingShip.location}
              onChange={(e) => setField('location', e.target.value)}
            />
          </Grid>

          <Grid size={{xs: 12, md: 6}}>
            <FormControl fullWidth>
              <InputLabel id="ship-status-label">Ship Status</InputLabel>
              <Select
                labelId="ship-status-label"
                value={editingShip.status || 'Active'}
                label="Ship Status"
                onChange={(e) => setField('status', e.target.value)}
              >
                {SHIP_STATUSES.map((status) => (
                  <MenuItem key={status} value={status}>{status}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{xs: 12, md: 6}}>
            <FormControlLabel
              control={
                <Switch
                  checked={editingShip.is_squibbing}
                  onChange={(e) => setField('is_squibbing', e.target.checked)}
                />
              }
              label="Squibbing"
            />
          </Grid>

          <SectionHeader title="Captain, Flag and Notes" />

          <Grid size={{xs: 12, md: 6}}>
            <TextField
              fullWidth
              label="Captain"
              value={editingShip.captain_name ?? ''}
              onChange={(e) => setField('captain_name', e.target.value)}
              slotProps={{ htmlInput: { maxLength: 255 } }}
            />
          </Grid>

          <Grid size={12}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Flag"
              helperText="Describe the ship's flag"
              value={editingShip.flag_description ?? ''}
              onChange={(e) => setField('flag_description', e.target.value)}
              slotProps={{ htmlInput: { maxLength: 10000 } }}
            />
          </Grid>

          <Grid size={12}>
            <TextField
              fullWidth
              multiline
              minRows={3}
              label="Ship Notes"
              value={editingShip.ship_notes ?? ''}
              onChange={(e) => setField('ship_notes', e.target.value)}
              slotProps={{ htmlInput: { maxLength: 10000 } }}
            />
          </Grid>

          <SectionHeader title="Combat Statistics" />

          <NumberField
            label="Max HP"
            min={1}
            fallback={100}
            value={editingShip.max_hp}
            onValueChange={(maxHp) => setField('max_hp', maxHp)}
          />
          <NumberField
            label="Current HP"
            min={0}
            max={editingShip.max_hp}
            fallback={0}
            value={editingShip.current_hp}
            onValueChange={(hp) => setField('current_hp', hp)}
          />
          <NumberField
            label="Base AC"
            min={0}
            max={50}
            fallback={10}
            value={editingShip.base_ac}
            onValueChange={(ac) => setField('base_ac', ac)}
          />
          <NumberField
            label="Touch AC"
            min={0}
            max={50}
            fallback={10}
            value={editingShip.touch_ac}
            onValueChange={(ac) => setField('touch_ac', ac)}
          />

          <SectionHeader title="Weapon Types" />

          <Grid size={{xs: 12, md: 6}}>
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
                setField('weapon_types', newWeaponTypes);
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
            <Grid size={12}>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>Weapon Quantities</Typography>
              <Grid container spacing={2}>
                {editingShip.weapon_types.map((weaponType, index) => (
                  <Grid size={{xs: 12, sm: 6, md: 4}} key={weaponType.type}>
                    <Card variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        {weaponType.type}
                      </Typography>
                      <IntegerInput
                        label="Quantity"
                        size="small"
                        min={1}
                        max={20}
                        fallback={1}
                        value={weaponType.quantity}
                        onValueChange={(quantity) => setField('weapon_types', editingShip.weapon_types.map(
                          (wt, i) => (i === index ? { ...wt, quantity } : wt)
                        ))}
                      />
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          )}

          <SectionHeader title="Ship Improvements" />

          <Grid size={{xs: 12, md: 6}}>
            <Autocomplete
              multiple
              options={Object.keys(SHIP_IMPROVEMENTS)}
              value={editingShip.improvements || []}
              onChange={(event, newValue) => setField('improvements', newValue)}
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
            <Grid size={12}>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>Improvement Details</Typography>
              {editingShip.improvements.map((improvementName) => {
                const improvement = SHIP_IMPROVEMENTS[improvementName];
                if (!improvement) return null;

                return (
                  <Card key={improvementName} variant="outlined" sx={{ mb: 2, p: 2 }}>
                    <Typography variant="h6" color="primary" sx={{ mb: 1 }}>
                      {improvement.name}
                    </Typography>
                    <ImprovementEffects improvement={improvement} />
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
