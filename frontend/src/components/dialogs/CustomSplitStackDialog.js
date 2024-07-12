// CustomSplitStackDialog.js
import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';

const CustomSplitStackDialog = ({ open, onClose, splitQuantities, onSplitChange, onAddSplit, onSplitSubmit }) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Split Stack</DialogTitle>
      <DialogContent>
        {splitQuantities && splitQuantities.map((quantity, index) => (
          <TextField
            key={index}
            label={`Quantity ${index + 1}`}
            type="number"
            value={quantity}
            onChange={(e) => onSplitChange(index, e.target.value)}
            fullWidth
            margin="normal"
          />
        ))}
        <Button onClick={onAddSplit}>Add Split</Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSplitSubmit}>Split</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomSplitStackDialog;
