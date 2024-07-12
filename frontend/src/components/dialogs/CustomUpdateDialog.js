// /frontend/src/components/dialogs/CustomUpdateDialog.js
import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Grid, TextField, FormControl, InputLabel, Select, MenuItem } from '@mui/material';

const CustomUpdateDialog = ({ open, onClose, onSubmit, entry, onChange }) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Update Entry</DialogTitle>
    <DialogContent>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Quantity"
            type="number"
            name="quantity"
            value={entry.quantity || ''}
            onChange={onChange}
            fullWidth
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Item Name"
            name="name"
            value={entry.name || ''}
            onChange={onChange}
            fullWidth
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Magical?</InputLabel>
            <Select
              name="unidentified"
              value={entry.unidentified === null ? '' : entry.unidentified}
              onChange={onChange}
            >
              <MenuItem value={null}>Not Magical</MenuItem>
              <MenuItem value={false}>Identified</MenuItem>
              <MenuItem value={true}>Unidentified</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Masterwork</InputLabel>
            <Select
              name="masterwork"
              value={entry.masterwork === null ? '' : entry.masterwork}
              onChange={onChange}
            >
              <MenuItem value={true}>Yes</MenuItem>
              <MenuItem value={false}>No</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
            <Select
              name="type"
              value={entry.type || ''}
              onChange={onChange}
            >
              <MenuItem value="Weapon">Weapon</MenuItem>
              <MenuItem value="Armor">Armor</MenuItem>
              <MenuItem value="Magic">Magic</MenuItem>
              <MenuItem value="Gear">Gear</MenuItem>
              <MenuItem value="Trade Good">Trade Good</MenuItem>
              <MenuItem value="Other">Other</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Size</InputLabel>
            <Select
              name="size"
              value={entry.size || ''}
              onChange={onChange}
            >
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
        <Grid item xs={12}>
          <TextField
            label="Notes"
            name="notes"
            value={entry.notes || ''}
            onChange={onChange}
            fullWidth
          />
        </Grid>
      </Grid>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button onClick={onSubmit}>Update</Button>
    </DialogActions>
  </Dialog>
);

export default CustomUpdateDialog;
