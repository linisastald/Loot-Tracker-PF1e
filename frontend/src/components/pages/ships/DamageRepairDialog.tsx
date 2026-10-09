import React from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography
} from '@mui/material';
import { Ship, getHullStatus } from './shipUtils';

export type DamageRepairType = 'damage' | 'repair';

interface DamageRepairDialogProps {
  open: boolean;
  ship: Ship | null;
  type: DamageRepairType;
  amount: number;
  onAmountChange: (amount: number) => void;
  onClose: () => void;
  onConfirm: () => void;
  fullScreen?: boolean;
}

/** Apply damage to, or repair, one ship; previews the resulting HP. */
const DamageRepairDialog: React.FC<DamageRepairDialogProps> = ({
  open, ship, type, amount, onAmountChange, onClose, onConfirm, fullScreen = false
}) => {
  const isDamage = type === 'damage';
  const curHp = ship?.current_hp ?? 0;
  const maxHp = ship?.max_hp ?? 100;
  const maxAmount = isDamage ? curHp : maxHp - curHp;
  const newHp = isDamage ? Math.max(0, curHp - amount) : Math.min(maxHp, curHp + amount);
  const label = isDamage ? 'Damage' : 'Repair';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      <DialogTitle>
        {isDamage ? 'Apply Damage' : 'Repair Ship'} - {ship?.name}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" gutterBottom sx={{ color: 'text.secondary' }}>
            Current HP: {curHp} / {maxHp}
          </Typography>
          <Typography variant="body2" gutterBottom sx={{ color: 'text.secondary' }}>
            Status: {ship ? getHullStatus(ship).label : 'Unknown'}
          </Typography>

          <TextField
            fullWidth
            label={`${label} Amount`}
            type="number"
            slotProps={{ htmlInput: { min: 1, max: maxAmount } }}
            value={amount}
            onChange={(e) => onAmountChange(parseInt(e.target.value, 10) || 0)}
            helperText={`Maximum ${label.toLowerCase()}: ${maxAmount}`}
            sx={{ mt: 2 }}
          />

          {amount > 0 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="subtitle2">Preview:</Typography>
              <Typography variant="body2">New HP: {newHp} / {maxHp}</Typography>
              {isDamage && curHp - amount <= 0 && (
                <Typography variant="body2" color="error">
                  This will sink the ship!
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color={isDamage ? 'warning' : 'success'}
          disabled={amount <= 0}
        >
          {isDamage ? 'Apply Damage' : 'Repair Ship'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DamageRepairDialog;
