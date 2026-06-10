// frontend/src/components/pages/DMSettings/InviteManagement.tsx
import React, {useCallback, useEffect, useState} from 'react';
import api from '../../../utils/api';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BoltIcon from '@mui/icons-material/Bolt';
import DeleteIcon from '@mui/icons-material/Delete';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import {useSnackbar} from 'notistack';
import {ApiResponse} from '@/types';
import {useCampaignTimezone} from '../../../hooks/useCampaignTimezone';
import {formatInCampaignTimezone} from '../../../utils/timezoneUtils';

export interface Invite {
    id: number;
    code: string;
    created_at: string;
    expires_at: string | null;
    created_by_username: string | null;
}

interface InvitesListData {
    invites: Invite[];
}

interface GeneratedInviteData {
    code: string;
    expires_at: string | null;
}

const MIN_EXPIRY_HOURS = 1;
const MAX_EXPIRY_HOURS = 720;

const InviteManagement: React.FC = () => {
    const {enqueueSnackbar} = useSnackbar();
    const {timezone} = useCampaignTimezone();

    const [invites, setInvites] = useState<Invite[]>([]);
    const [isLoadingInvites, setIsLoadingInvites] = useState(false);
    const [isGeneratingQuick, setIsGeneratingQuick] = useState(false);
    const [isGeneratingCustom, setIsGeneratingCustom] = useState(false);
    const [lastGeneratedInvite, setLastGeneratedInvite] = useState<GeneratedInviteData | null>(null);

    // Custom invite dialog state
    const [customDialogOpen, setCustomDialogOpen] = useState(false);
    const [expiresInHours, setExpiresInHours] = useState('24');
    const [neverExpires, setNeverExpires] = useState(false);

    // Deactivate confirmation state
    const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
    const [inviteToDeactivate, setInviteToDeactivate] = useState<Invite | null>(null);
    const [isDeactivating, setIsDeactivating] = useState(false);

    const getErrorMessage = (err: unknown, fallback: string): string => {
        const axiosLike = err as { response?: { data?: { message?: string; error?: string } } };
        return axiosLike?.response?.data?.message || axiosLike?.response?.data?.error || fallback;
    };

    const fetchInvites = useCallback(async () => {
        try {
            setIsLoadingInvites(true);
            const response = await api.get('/invites');
            const data = response.data as InvitesListData;
            setInvites(Array.isArray(data?.invites) ? data.invites : []);
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error loading active invites'), {variant: 'error'});
        } finally {
            setIsLoadingInvites(false);
        }
    }, [enqueueSnackbar]);

    useEffect(() => {
        fetchInvites();
    }, [fetchInvites]);

    const handleQuickInvite = async () => {
        try {
            setIsGeneratingQuick(true);
            // The api response interceptor returns the body, so this is the envelope
            const response = await api.post('/invites/quick') as unknown as ApiResponse<GeneratedInviteData>;
            setLastGeneratedInvite(response.data);
            enqueueSnackbar(response.message || 'Quick invite created', {variant: 'success'});
            fetchInvites();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error generating quick invite'), {variant: 'error'});
        } finally {
            setIsGeneratingQuick(false);
        }
    };

    const customHoursValid = (): boolean => {
        if (neverExpires) return true;
        const hours = Number(expiresInHours);
        return Number.isInteger(hours) && hours >= MIN_EXPIRY_HOURS && hours <= MAX_EXPIRY_HOURS;
    };

    const handleCustomInvite = async () => {
        if (!customHoursValid()) return;

        try {
            setIsGeneratingCustom(true);
            const response = await api.post('/invites/custom', {
                expiresInHours: neverExpires ? null : Number(expiresInHours)
            }) as unknown as ApiResponse<GeneratedInviteData>;
            setLastGeneratedInvite(response.data);
            enqueueSnackbar(response.message || 'Custom invite created', {variant: 'success'});
            setCustomDialogOpen(false);
            fetchInvites();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error generating custom invite'), {variant: 'error'});
        } finally {
            setIsGeneratingCustom(false);
        }
    };

    const handleDeactivateInvite = async () => {
        if (!inviteToDeactivate) return;

        try {
            setIsDeactivating(true);
            const response = await api.post('/invites/deactivate', {
                inviteId: inviteToDeactivate.id
            }) as unknown as ApiResponse<null>;
            enqueueSnackbar(response.message || 'Invite deactivated', {variant: 'success'});
            setDeactivateDialogOpen(false);
            setInviteToDeactivate(null);
            fetchInvites();
        } catch (err) {
            enqueueSnackbar(getErrorMessage(err, 'Error deactivating invite'), {variant: 'error'});
        } finally {
            setIsDeactivating(false);
        }
    };

    const handleCopyInviteCode = (code: string) => {
        // navigator.clipboard is undefined outside secure contexts (plain http)
        if (!navigator.clipboard?.writeText) {
            enqueueSnackbar('Clipboard unavailable — copy the code manually', {variant: 'warning'});
            return;
        }
        navigator.clipboard.writeText(code).then(() => {
            enqueueSnackbar('Invite code copied to clipboard', {variant: 'success'});
        }).catch(() => {
            enqueueSnackbar('Failed to copy invite code', {variant: 'error'});
        });
    };

    const formatDate = (dateString: string | null): string => {
        if (!dateString) return 'Never';

        const date = new Date(dateString);

        // Legacy "never" sentinel (year 9999)
        if (date.getFullYear() >= 9000) {
            return 'Never';
        }

        return timezone ? formatInCampaignTimezone(dateString, timezone, 'PPpp z') : date.toLocaleString();
    };

    return (
        <Box>
            <Typography variant="h6" gutterBottom>Invite Management</Typography>
            <Typography variant="body2" color="textSecondary" gutterBottom>
                Invites are single-use and grant the new user Player membership in this campaign.
            </Typography>

            <Box sx={{display: 'flex', justifyContent: 'flex-end', gap: 2, mb: 2}}>
                <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<BoltIcon/>}
                    onClick={handleQuickInvite}
                    disabled={isGeneratingQuick}
                >
                    {isGeneratingQuick ? <CircularProgress size={24}/> : 'Quick Invite'}
                </Button>
                <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<AddIcon/>}
                    onClick={() => setCustomDialogOpen(true)}
                >
                    Custom Invite
                </Button>
            </Box>

            {lastGeneratedInvite && (
                <Box sx={{
                    mb: 2,
                    p: 2,
                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                    borderRadius: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <Box>
                        <Typography variant="subtitle2">New invite code:</Typography>
                        <Typography
                            variant="h6"
                            fontWeight="bold"
                            fontFamily="monospace"
                            data-testid="generated-invite-code"
                        >
                            {lastGeneratedInvite.code}
                        </Typography>
                        <Typography variant="caption" display="block">
                            Expires: {formatDate(lastGeneratedInvite.expires_at)}
                        </Typography>
                    </Box>
                    <Tooltip title="Copy code">
                        <IconButton
                            onClick={() => handleCopyInviteCode(lastGeneratedInvite.code)}
                            size="small"
                            aria-label="Copy new invite code"
                        >
                            <FileCopyIcon/>
                        </IconButton>
                    </Tooltip>
                </Box>
            )}

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Code</TableCell>
                            <TableCell>Created By</TableCell>
                            <TableCell>Created At</TableCell>
                            <TableCell>Expires At</TableCell>
                            <TableCell>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {isLoadingInvites ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center">
                                    <CircularProgress size={24}/>
                                </TableCell>
                            </TableRow>
                        ) : invites.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center">
                                    No active invite codes found
                                </TableCell>
                            </TableRow>
                        ) : (
                            invites.map((invite) => (
                                <TableRow key={invite.id}>
                                    <TableCell>
                                        <Box sx={{display: 'flex', alignItems: 'center'}}>
                                            <Typography fontFamily="monospace" fontWeight="bold">
                                                {invite.code}
                                            </Typography>
                                            <Tooltip title="Copy code">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleCopyInviteCode(invite.code)}
                                                    sx={{ml: 1}}
                                                >
                                                    <FileCopyIcon fontSize="small"/>
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </TableCell>
                                    <TableCell>{invite.created_by_username || 'Unknown'}</TableCell>
                                    <TableCell>{formatDate(invite.created_at)}</TableCell>
                                    <TableCell>{formatDate(invite.expires_at)}</TableCell>
                                    <TableCell>
                                        <Tooltip title="Deactivate invite">
                                            <IconButton
                                                color="error"
                                                onClick={() => {
                                                    setInviteToDeactivate(invite);
                                                    setDeactivateDialogOpen(true);
                                                }}
                                            >
                                                <DeleteIcon/>
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Custom Invite Dialog */}
            <Dialog open={customDialogOpen} onClose={() => setCustomDialogOpen(false)}>
                <DialogTitle>Create Custom Invite</DialogTitle>
                <DialogContent>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={neverExpires}
                                onChange={(e) => setNeverExpires(e.target.checked)}
                            />
                        }
                        label="Never expires"
                        sx={{mt: 1}}
                    />
                    {!neverExpires && (
                        <TextField
                            label="Expires in (hours)"
                            type="number"
                            fullWidth
                            margin="normal"
                            value={expiresInHours}
                            onChange={(e) => setExpiresInHours(e.target.value)}
                            inputProps={{min: MIN_EXPIRY_HOURS, max: MAX_EXPIRY_HOURS}}
                            error={!customHoursValid()}
                            helperText={`Between ${MIN_EXPIRY_HOURS} and ${MAX_EXPIRY_HOURS} hours (30 days)`}
                        />
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCustomDialogOpen(false)} color="secondary" variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCustomInvite}
                        color="primary"
                        variant="outlined"
                        disabled={isGeneratingCustom || !customHoursValid()}
                    >
                        {isGeneratingCustom ? <CircularProgress size={24}/> : 'Generate Invite'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Deactivate Invite Confirmation Dialog */}
            <Dialog open={deactivateDialogOpen} onClose={() => setDeactivateDialogOpen(false)}>
                <DialogTitle>Confirm Deactivation</DialogTitle>
                <DialogContent>
                    <Typography component="div">
                        Are you sure you want to deactivate invite code:
                        <Box component="span" sx={{display: 'block', fontWeight: 'bold', fontFamily: 'monospace', my: 1}}>
                            {inviteToDeactivate?.code}
                        </Box>
                        This action cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeactivateDialogOpen(false)} color="secondary" variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDeactivateInvite}
                        color="error"
                        variant="outlined"
                        disabled={isDeactivating}
                    >
                        {isDeactivating ? <CircularProgress size={24}/> : 'Deactivate'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default InviteManagement;
