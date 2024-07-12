// /frontend/src/components/dialogs/CustomSplitStackDialog.js
import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, TextField } from '@mui/material';

const CustomSplitStackDialog = ({ open, onClose, onSubmit, quantities, onChange, onAddSplit }) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Split Stack</DialogTitle>
    <DialogContent>
      <DialogContentText>
        Enter the quantities for each new stack:
      </DialogContentText>
      {quantities.map((quantity, index) => (
        <TextField
          key={index}
          autoFocus
          margin="dense"
          label={`Quantity ${index + 1}`}
          type="number"
          fullWidth
          value={quantity}
          onChange={(e) => onChange(index, e.target.value)}
        />
      ))}
      <Button
        variant="contained"
        color="primary"
        sx={{ mt: 2 }}
        onClick={onAddSplit}
        disabled={quantities.length >= 10} // Assuming maximum splits allowed is 10
      >
        Add Split
      </Button>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button onClick={onSubmit}>Split</Button>
    </DialogActions>
  </Dialog>
);

export default CustomSplitStackDialog;
