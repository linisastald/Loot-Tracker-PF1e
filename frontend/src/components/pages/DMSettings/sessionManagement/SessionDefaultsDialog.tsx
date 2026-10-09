import React, { useEffect, useState } from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Typography
} from '@mui/material';
import SessionTimingFields from './SessionTimingFields';
import { SessionDefaults } from './sessionConfig';

interface SessionDefaultsDialogProps {
    open: boolean;
    defaults: SessionDefaults;
    onClose: () => void;
    /** Called with the edited values only when the user presses Save. */
    onSave: (defaults: SessionDefaults) => void;
}

/** Edits a draft copy of the defaults, so Cancel discards unsaved changes. */
const SessionDefaultsDialog: React.FC<SessionDefaultsDialogProps> = ({ open, defaults, onClose, onSave }) => {
    const [draft, setDraft] = useState<SessionDefaults>(defaults);

    useEffect(() => {
        if (open) {
            setDraft(defaults);
        }
    }, [open, defaults]);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Default Session Settings</DialogTitle>
            <DialogContent>
                <Typography variant="body2" gutterBottom sx={{ color: 'text.secondary', mb: 3 }}>
                    These defaults will pre-fill when creating new sessions
                </Typography>
                <SessionTimingFields values={draft} onChange={setDraft} variant="defaults" />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={() => onSave(draft)} variant="contained" color="primary">
                    Save Defaults
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default SessionDefaultsDialog;
