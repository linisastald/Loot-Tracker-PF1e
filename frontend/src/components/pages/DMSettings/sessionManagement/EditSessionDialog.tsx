import React, { useEffect, useState } from 'react';
import {
    Alert,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle
} from '@mui/material';
import { useSnackbar } from 'notistack';
import api from '../../../../utils/api';
import { getErrorMessage } from '../../../../utils/apiErrors';
import type { SessionListItem } from '../../../../utils/sessionsApi';
import SessionBasicsFields from './SessionBasicsFields';
import { validateSessionTimes } from './sessionConfig';

interface EditSessionDialogProps {
    /** The session being edited; the dialog is open while this is set. */
    session: SessionListItem | null;
    timezone?: string;
    onClose: () => void;
    onSaved: () => void;
}

const EditSessionDialog: React.FC<EditSessionDialogProps> = ({ session, timezone, onClose, onSaved }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [title, setTitle] = useState('');
    const [startTime, setStartTime] = useState<Date | null>(new Date());
    const [endTime, setEndTime] = useState<Date | null>(new Date());
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!session) return;
        setTitle(session.title || '');
        setStartTime(session.start_time ? new Date(session.start_time) : new Date());
        setEndTime(session.end_time ? new Date(session.end_time) : new Date());
        setDescription(session.description || '');
    }, [session]);

    const handleSave = async () => {
        if (!session) return;

        const validationError = validateSessionTimes(title, startTime, endTime);
        if (validationError) {
            enqueueSnackbar(validationError, { variant: 'error' });
            return;
        }

        try {
            setSaving(true);
            // Backend updates the linked Discord announcement automatically
            await api.put(`/sessions/${session.id}`, {
                title,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                description
            });
            enqueueSnackbar('Session updated successfully', { variant: 'success' });
            onSaved();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Failed to update session'), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={!!session} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Edit Session</DialogTitle>
            <DialogContent>
                {timezone && (
                    <Alert severity="info" sx={{ mt: 1, mb: 2 }}>
                        Times are entered in your browser's local timezone. Sessions display in <strong>{timezone}</strong>.
                    </Alert>
                )}
                <SessionBasicsFields
                    title={title}
                    onTitleChange={setTitle}
                    startTime={startTime}
                    onStartTimeChange={setStartTime}
                    endTime={endTime}
                    onEndTimeChange={setEndTime}
                    description={description}
                    onDescriptionChange={setDescription}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={handleSave}
                    color="primary"
                    variant="contained"
                    disabled={saving}
                    startIcon={saving ? <CircularProgress size={16} /> : undefined}
                >
                    Save Changes
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default EditSessionDialog;
