import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';

const CustomSplitStackDialog = ({ open, handleClose, splitQuantities, handleSplitChange, handleAddSplit, handleSplitSubmit }) => {
  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogTitle>Split Stack</DialogTitle>
      <DialogContent>
        {splitQuantities && splitQuantities.map((quantity, index) => (
          <TextField
            key={index}
            label={`Quantity ${index + 1}`}
            type="number"
            value={quantity}
            onChange={(e) => handleSplitChange(index, e.target.value)}
            fullWidth
            margin="normal"
          />
        ))}
        <Button onClick={handleAddSplit}>Add Split</Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSplitSubmit}>Split</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomSplitStackDialog;
