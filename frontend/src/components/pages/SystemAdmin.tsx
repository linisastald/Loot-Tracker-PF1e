// frontend/src/components/pages/SystemAdmin.tsx
// Superadmin-only system administration page (multi-campaign Phase 5a).
// Hosts the account-level tools that used to live in the (now campaign-
// scoped) DM User Management page — all-users listing, manual password
// reset links, account deletion — plus the global registration mode and a
// list of every campaign on the instance. The backend enforces superadmin
// on all of these endpoints; the gate here is purely UX.
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import {
  AdminPanelSettings as AdminIcon,
  Groups as CampaignsIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaign } from '../../contexts/CampaignContext';

export interface SystemUser {
  id: number;
  username: string;
  email: string | null;
  role: string;
  is_superadmin?: boolean;
  /** The all-users endpoint exposes the signup date as `joined` */
  joined?: string | null;
  created_at?: string | null;
}

const REGISTRATION_MODES = [
  { value: 'open', label: 'Open', description: 'Anyone may register' },
  { value: 'invite-only', label: 'Invite only', description: 'Registration requires an invite code' },
  { value: 'closed', label: 'Closed', description: 'No new registrations' },
];

const formatDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
};

const SystemAdmin: React.FC = () => {
  const { user } = useAuth();
  const { campaigns, isSuperadmin, loading: campaignLoading } = useCampaign();
  const { enqueueSnackbar } = useSnackbar();

  // --- Users section state ---------------------------------------------
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');

  // Manual reset link
  const [resetTarget, setResetTarget] = useState<SystemUser | null>(null);
  const [generatingReset, setGeneratingReset] = useState(false);
  const [generatedResetLink, setGeneratedResetLink] = useState('');

  // Delete account (type-the-username confirmation)
  const [deleteTarget, setDeleteTarget] = useState<SystemUser | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // --- Global settings section state ------------------------------------
  const [registrationMode, setRegistrationMode] = useState('closed');
  const [savingRegistrationMode, setSavingRegistrationMode] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  const fetchUsers = useCallback(async (): Promise<void> => {
    try {
      const response: any = await api.get('/user/all');
      const list = response?.data;
      setUsers(Array.isArray(list) ? list : []);
      setUsersError('');
    } catch (err: any) {
      setUsersError(err.response?.data?.message || 'Error loading users. Please try again.');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async (): Promise<void> => {
    try {
      const response: any = await api.get('/user/settings');
      const settings: Array<{ name: string; value: string }> = Array.isArray(response?.data)
        ? response.data
        : [];
      const modeSetting = settings.find((s) => s.name === 'registration_mode');
      if (modeSetting && REGISTRATION_MODES.some((m) => m.value === modeSetting.value)) {
        setRegistrationMode(modeSetting.value);
      } else {
        // Legacy fallback: derive from registrations_open + invite_required
        const legacyOpen = settings.find((s) => s.name === 'registrations_open');
        const legacyInvite = settings.find((s) => s.name === 'invite_required');
        const isOpen = legacyOpen?.value === '1' || (legacyOpen?.value as unknown) === 1;
        const isInvite = legacyInvite?.value === '1' || (legacyInvite?.value as unknown) === 1;
        setRegistrationMode(!isOpen ? 'closed' : isInvite ? 'invite-only' : 'open');
      }
      setSettingsError('');
    } catch (err: any) {
      setSettingsError(err.response?.data?.message || 'Error loading global settings.');
    }
  }, []);

  useEffect(() => {
    if (isSuperadmin) {
      fetchUsers();
      fetchSettings();
    }
  }, [isSuperadmin, fetchUsers, fetchSettings]);

  // --- Handlers ----------------------------------------------------------
  const handleGenerateResetLink = async (target: SystemUser): Promise<void> => {
    setResetTarget(target);
    setGeneratingReset(true);
    setGeneratedResetLink('');
    try {
      const response: any = await api.post('/user/generate-manual-reset-link', {
        username: target.username,
      });
      const url = response?.data?.resetUrl;
      if (url) {
        setGeneratedResetLink(url);
      } else {
        setResetTarget(null);
        enqueueSnackbar('No reset link returned by the server', { variant: 'error' });
      }
    } catch (err: any) {
      setResetTarget(null);
      enqueueSnackbar(
        err.response?.data?.message || err.response?.data?.error || 'Error generating reset link',
        { variant: 'error' }
      );
    } finally {
      setGeneratingReset(false);
    }
  };

  const handleCopyResetLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(generatedResetLink);
      enqueueSnackbar('Reset link copied to clipboard', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to copy reset link', { variant: 'error' });
    }
  };

  const closeResetDialog = (): void => {
    setResetTarget(null);
    setGeneratedResetLink('');
  };

  const openDeleteDialog = (target: SystemUser): void => {
    setDeleteTarget(target);
    setDeleteConfirmText('');
    setDeleteError('');
  };

  const closeDeleteDialog = (): void => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteConfirmText('');
    setDeleteError('');
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deleteTarget || deleteConfirmText !== deleteTarget.username) return;
    setDeleting(true);
    try {
      await api.put('/user/delete-user', { userId: deleteTarget.id });
      enqueueSnackbar(`Account "${deleteTarget.username}" deleted`, { variant: 'success' });
      setDeleteTarget(null);
      setDeleteConfirmText('');
      await fetchUsers();
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || 'Error deleting account');
    } finally {
      setDeleting(false);
    }
  };

  const handleRegistrationModeChange = async (event: SelectChangeEvent): Promise<void> => {
    const newMode = event.target.value;
    const previousMode = registrationMode;
    setSavingRegistrationMode(true);
    setRegistrationMode(newMode);
    try {
      await api.put('/user/update-setting', { name: 'registration_mode', value: newMode });
      const modeLabel = REGISTRATION_MODES.find((m) => m.value === newMode)?.label || newMode;
      enqueueSnackbar(`Registration mode set to ${modeLabel}`, { variant: 'success' });
      setSettingsError('');
    } catch (err: any) {
      setRegistrationMode(previousMode);
      enqueueSnackbar(err.response?.data?.message || 'Error updating registration mode', {
        variant: 'error',
      });
    } finally {
      setSavingRegistrationMode(false);
    }
  };

  // --- Gate --------------------------------------------------------------
  if (campaignLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="300px">
        <CircularProgress />
      </Box>
    );
  }

  if (!isSuperadmin) {
    return (
      <Container maxWidth="md">
        <Alert severity="error" sx={{ mt: 4 }}>
          Access denied — this page is only available to the system administrator.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} component="main">
      <Typography variant="h6" gutterBottom>
        System Administration
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Instance-wide administration: every account, global registration policy, and all campaigns.
      </Typography>

      <Grid container spacing={3} sx={{ mt: 0 }}>
        {/* ----------------------------- Users ----------------------------- */}
        <Grid size={12}>
          <Card variant="outlined">
            <CardHeader title="Users" avatar={<AdminIcon />} subheader="All accounts on this instance" />
            <CardContent>
              {usersError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {usersError}
                </Alert>
              )}
              {usersLoading ? (
                <Box display="flex" justifyContent="center" py={3}>
                  <CircularProgress size={28} />
                </Box>
              ) : (
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Username</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Role</TableCell>
                        <TableCell>Superadmin</TableCell>
                        <TableCell>Created</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {users.map((account) => (
                        <TableRow key={account.id}>
                          <TableCell>{account.username}</TableCell>
                          <TableCell>{account.email || '—'}</TableCell>
                          <TableCell>{account.role}</TableCell>
                          <TableCell>
                            {account.is_superadmin ? (
                              <Chip label="Superadmin" color="primary" size="small" />
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>{formatDate(account.created_at ?? account.joined)}</TableCell>
                          <TableCell align="right">
                            <Box display="flex" gap={1} justifyContent="flex-end">
                              <Button
                                size="small"
                                variant="outlined"
                                color="info"
                                disabled={generatingReset}
                                onClick={() => handleGenerateResetLink(account)}
                              >
                                Generate password reset link
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="secondary"
                                disabled={account.id === user?.id}
                                onClick={() => openDeleteDialog(account)}
                              >
                                Delete account
                              </Button>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                      {users.length === 0 && !usersError && (
                        <TableRow>
                          <TableCell colSpan={6}>
                            <Typography variant="body2" color="text.secondary">
                              No users found.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ------------------------- Global settings ------------------------ */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardHeader title="Global Settings" avatar={<SettingsIcon />} />
            <CardContent>
              {settingsError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {settingsError}
                </Alert>
              )}
              <FormControl fullWidth>
                <InputLabel id="registration-mode-label">Registration</InputLabel>
                <Select
                  labelId="registration-mode-label"
                  id="registration-mode-select"
                  value={registrationMode}
                  label="Registration"
                  onChange={handleRegistrationModeChange}
                  disabled={savingRegistrationMode}
                >
                  {REGISTRATION_MODES.map((mode) => (
                    <MenuItem key={mode.value} value={mode.value}>
                      {mode.label} ({mode.description.toLowerCase()})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box mt={2}>
                <Typography variant="body2" color="text.secondary">
                  {REGISTRATION_MODES.find((m) => m.value === registrationMode)?.description}.
                  Registration mode applies to the whole instance; invite codes are created
                  per-campaign in the DM User Management tab.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* --------------------------- Campaigns ---------------------------- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardHeader title="Campaigns" avatar={<CampaignsIcon />} subheader="All campaigns on this instance" />
            <CardContent>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Slug</TableCell>
                      <TableCell>World</TableCell>
                      <TableCell>Active</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {campaigns.map((campaign) => (
                      <TableRow key={campaign.id}>
                        <TableCell>{campaign.name}</TableCell>
                        <TableCell>{campaign.slug}</TableCell>
                        <TableCell>{campaign.world || '—'}</TableCell>
                        <TableCell>
                          <Chip
                            label={campaign.is_active === false ? 'Inactive' : 'Active'}
                            color={campaign.is_active === false ? 'default' : 'success'}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {campaigns.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Typography variant="body2" color="text.secondary">
                            No campaigns found.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Reset link dialog (loading + result) */}
      <Dialog open={resetTarget !== null} onClose={generatingReset ? undefined : closeResetDialog} maxWidth="md">
        <DialogTitle>
          {generatingReset ? 'Generating reset link…' : 'Password Reset Link Generated'}
        </DialogTitle>
        <DialogContent>
          {generatingReset ? (
            <Box display="flex" justifyContent="center" py={2}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <>
              <Typography sx={{ mb: 2 }}>
                {`Copy this link and provide it to ${resetTarget?.username ?? 'the user'}:`}
              </Typography>
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'background.default',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  mb: 2,
                }}
              >
                {generatedResetLink}
              </Box>
              <Typography variant="body2" color="text.secondary">
                This link will expire in 1 hour.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCopyResetLink}
            color="primary"
            variant="outlined"
            disabled={generatingReset || !generatedResetLink}
          >
            Copy Link
          </Button>
          <Button onClick={closeResetDialog} color="secondary" variant="outlined" disabled={generatingReset}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete account dialog (type the username to confirm) */}
      <Dialog open={deleteTarget !== null} onClose={closeDeleteDialog}>
        <DialogTitle>Delete account</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget
              ? `This permanently deletes the account "${deleteTarget.username}" from the entire instance, including all of their campaign memberships. This cannot be undone.`
              : ''}
          </DialogContentText>
          <TextField
            label={`Type ${deleteTarget?.username ?? 'the username'} to confirm`}
            fullWidth
            margin="normal"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            autoComplete="off"
          />
          {deleteError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog} color="secondary" variant="outlined" disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="outlined"
            disabled={deleting || !deleteTarget || deleteConfirmText !== deleteTarget.username}
          >
            {deleting ? <CircularProgress size={20} /> : 'Delete account'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SystemAdmin;
