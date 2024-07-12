// CustomUpdateDialog.js
import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Grid, FormControl, InputLabel, Select, MenuItem } from '@mui/material';

const CustomUpdateDialog = ({ open, onClose, updatedEntry, onUpdateChange, onUpdateSubmit }) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Update Entry</DialogTitle>
      <DialogContent>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Quantity"
              type="number"
              name="quantity"
              value={updatedEntry.quantity || ''}
              onChange={onUpdateChange}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Item Name"
              name="name"
              value={updatedEntry.name || ''}
              onChange={onUpdateChange}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Magical?</InputLabel>
              <Select
                name="unidentified"
                value={updatedEntry.unidentified === null ? '' : updatedEntry.unidentified}
                onChange={onUpdateChange}
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
                value={updatedEntry.masterwork === null ? '' : updatedEntry.masterwork}
                onChange={onUpdateChange}
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
                value={updatedEntry.type || ''}
                onChange={onUpdateChange}
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
                value={updatedEntry.size || ''}
                onChange={onUpdateChange}
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
