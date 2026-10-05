import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Body text (wrapped in a Typography). */
  children: React.ReactNode;
  confirmLabel: string;
  confirmColor?: 'primary' | 'error' | 'warning';
  /** Disables both buttons and ignores backdrop / Escape while a request runs. */
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** A small confirm / cancel dialog. */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  children,
  confirmLabel,
  confirmColor = 'primary',
  busy = false,
  onConfirm,
  onClose,
}) => (
  <Dialog open={open} onClose={() => !busy && onClose()}>
    <DialogTitle>{title}</DialogTitle>
    <DialogContent>
      <Typography>{children}</Typography>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button
        onClick={onConfirm}
        color={confirmColor}
        variant="contained"
        disabled={busy}
      >
        {confirmLabel}
      </Button>
    </DialogActions>
  </Dialog>
);

export default ConfirmDialog;
