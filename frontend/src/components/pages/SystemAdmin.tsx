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
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaign } from '../../contexts/CampaignContext';
import CampaignAdministration from './SystemAdmin/CampaignAdministration';
import PasswordField from '../common/PasswordField';

interface SystemUser {
  id: number;
  username: string;
  email: string | null;
  role: string;
  is_superadmin?: boolean;
  /** The all-users endpoint exposes the signup date as `joined` */
  joined?: string | null;
}

const REGISTRATION_MODES = [
  { value: 'open', label: 'Open', description: 'Anyone may register' },
  { value: 'invite-only', label: 'Invite only', description: 'Registration requires an invite code' },
  { value: 'closed', label: 'Closed', description: 'No new registrations' },
];

// What the server treats a missing registration_mode as
const DEFAULT_REGISTRATION_MODE = 'invite-only';

const formatDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
};

interface GlobalSettingRow {
  name: string;
  value: string | null;
  secret?: boolean;
  is_set?: boolean;
}

const SystemAdmin: React.FC = () => {
  const { user } = useAuth();
  const { campaigns, isSuperadmin, loading: campaignLoading, refresh: refreshCampaigns } = useCampaign();
  const { enqueueSnackbar } = useSnackbar();

  // --- Users section state ---------------------------------------------
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');

  // Manual reset link
  const [resetTarget, setResetTarget] = useState<SystemUser | null>(null);
  const [generatingReset, setGeneratingReset] = useState(false);
  const [generatedResetLink, setGeneratedResetLink] = useState('');
  const [resetLinkExpiresAt, setResetLinkExpiresAt] = useState('');

  // Delete account (type-the-username confirmation)
  const [deleteTarget, setDeleteTarget] = useState<SystemUser | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // --- Global settings section state ------------------------------------
  const [registrationMode, setRegistrationMode] = useState(DEFAULT_REGISTRATION_MODE);
  const [savingRegistrationMode, setSavingRegistrationMode] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [frontendUrl, setFrontendUrl] = useState('');
  const [savedFrontendUrl, setSavedFrontendUrl] = useState('');
  const [savingFrontendUrl, setSavingFrontendUrl] = useState(false);
  // Secrets are write-only: the server reports only whether one is stored
  const [botTokenSet, setBotTokenSet] = useState(false);
  const [openAiKeySet, setOpenAiKeySet] = useState(false);
  const [botTokenInput, setBotTokenInput] = useState('');
  const [openAiKeyInput, setOpenAiKeyInput] = useState('');
  const [savingSecret, setSavingSecret] = useState<string | null>(null);

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
      const settings: GlobalSettingRow[] = Array.isArray(response?.data)
        ? response.data
        : [];
      const modeSetting = settings.find((s) => s.name === 'registration_mode');
      setRegistrationMode(
        modeSetting && REGISTRATION_MODES.some((m) => m.value === modeSetting.value)
          ? modeSetting.value
          : DEFAULT_REGISTRATION_MODE
      );
      const urlSetting = settings.find((s) => s.name === 'frontend_url');
      setFrontendUrl(urlSetting?.value || '');
      setSavedFrontendUrl(urlSetting?.value || '');
      setBotTokenSet(!!settings.find((s) => s.name === 'discord_bot_token')?.is_set);
      setOpenAiKeySet(!!settings.find((s) => s.name === 'openai_key')?.is_set);
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
    setResetLinkExpiresAt('');
    try {
      const response: any = await api.post('/user/generate-manual-reset-link', {
        username: target.username,
      });
      const url = response?.data?.resetUrl;
      if (url) {
        setGeneratedResetLink(url);
        setResetLinkExpiresAt(response?.data?.expiresAt || '');
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

  const handleSaveFrontendUrl = async (): Promise<void> => {
    const value = frontendUrl.trim();
    setSavingFrontendUrl(true);
    try {
      await api.put('/user/update-setting', { name: 'frontend_url', value });
      setFrontendUrl(value);
      setSavedFrontendUrl(value);
      enqueueSnackbar(value ? 'Frontend URL saved' : 'Frontend URL cleared', { variant: 'success' });
    } catch (err: unknown) {
      enqueueSnackbar(getErrorMessage(err, 'Error saving frontend URL'), { variant: 'error' });
    } finally {
      setSavingFrontendUrl(false);
    }
  };

  const handleSaveSecret = async (name: 'discord_bot_token' | 'openai_key'): Promise<void> => {
    const value = (name === 'discord_bot_token' ? botTokenInput : openAiKeyInput).trim();
    if (!value) return;
    setSavingSecret(name);
    try {
      await api.put('/user/update-setting', { name, value });
      if (name === 'discord_bot_token') {
        setBotTokenSet(true);
        setBotTokenInput('');
        enqueueSnackbar('Discord bot token saved', { variant: 'success' });
      } else {
        setOpenAiKeySet(true);
        setOpenAiKeyInput('');
        enqueueSnackbar('OpenAI key saved', { variant: 'success' });
      }
    } catch (err: unknown) {
      enqueueSnackbar(getErrorMessage(err, 'Error saving setting'), { variant: 'error' });
    } finally {
      setSavingSecret(null);
    }
  };

  // --- Gate --------------------------------------------------------------
  if (campaignLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "300px"
        }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isSuperadmin) {
    return (
      <Box sx={{ maxWidth: 'md' }}>
        <Alert severity="error" sx={{ mt: 4 }}>
          Access denied — this page is only available to the system administrator.
        </Alert>
      </Box>
    );
  }

  // Rendered as the System Admin tab of Account & Settings (campaign-agnostic)
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        System Administration
      </Typography>
      <Typography variant="body2" gutterBottom sx={{
        color: "text.secondary"
      }}>
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
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    py: 3
                  }}>
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
                          <TableCell>{formatDate(account.joined)}</TableCell>
                          <TableCell align="right">
                            <Box
                              sx={{
                                display: "flex",
                                gap: 1,
                                justifyContent: "flex-end"
                              }}>
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
                            <Typography variant="body2" sx={{
                              color: "text.secondary"
                            }}>
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
              <Box sx={{
                mt: 2
              }}>
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>
                  {REGISTRATION_MODES.find((m) => m.value === registrationMode)?.description}.
                  Registration mode applies to the whole instance; invite codes are created
                  per-campaign in the DM User Management tab.
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 1, mt: 3, alignItems: 'flex-start' }}>
                <TextField
                  label="Frontend URL"
                  fullWidth
                  size="small"
                  type="url"
                  name="instance-frontend-url"
                  autoComplete="off"
                  value={frontendUrl}
                  onChange={(e) => setFrontendUrl(e.target.value)}
                  placeholder="https://loot.example.com"
                  helperText="Base address used in password-reset emails and Discord links. Leave empty to use the server default."
                />
                <Button
                  variant="outlined"
                  size="small"
                  sx={{ mt: 0.5, whiteSpace: 'nowrap' }}
                  disabled={savingFrontendUrl || frontendUrl.trim() === savedFrontendUrl}
                  onClick={handleSaveFrontendUrl}
                >
                  Save URL
                </Button>
              </Box>

              <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'flex-start' }}>
                <PasswordField
                  label="Discord bot token"
                  fullWidth
                  size="small"
                  value={botTokenInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBotTokenInput(e.target.value)}
                  name="instance-discord-bot-token"
                  autoComplete="new-password"
                  helperText={botTokenSet ? 'A token is stored. Enter a new one to replace it.' : 'No token stored. Session announcements need one.'}
                />
                <Button
                  variant="outlined"
                  size="small"
                  sx={{ mt: 0.5, whiteSpace: 'nowrap' }}
                  disabled={savingSecret !== null || !botTokenInput.trim()}
                  onClick={() => handleSaveSecret('discord_bot_token')}
                >
                  Save token
                </Button>
              </Box>

              <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'flex-start' }}>
                <PasswordField
                  label="OpenAI API key"
                  fullWidth
                  size="small"
                  value={openAiKeyInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpenAiKeyInput(e.target.value)}
                  name="instance-openai-key"
                  autoComplete="new-password"
                  helperText={openAiKeySet ? 'A key is stored. Enter a new one to replace it.' : 'No key stored. Item description parsing needs one.'}
                />
                <Button
                  variant="outlined"
                  size="small"
                  sx={{ mt: 0.5, whiteSpace: 'nowrap' }}
                  disabled={savingSecret !== null || !openAiKeyInput.trim()}
                  onClick={() => handleSaveSecret('openai_key')}
                >
                  Save key
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* --------------------------- Campaigns ---------------------------- */}
        <Grid size={12}>
          <CampaignAdministration
            campaigns={campaigns}
            users={users}
            currentUserId={user?.id}
            onCampaignsChanged={refreshCampaigns}
          />
        </Grid>
      </Grid>
      {/* Reset link dialog (loading + result) */}
      <Dialog open={resetTarget !== null} onClose={generatingReset ? undefined : closeResetDialog} maxWidth="md">
        <DialogTitle>
          {generatingReset ? 'Generating reset link…' : 'Password Reset Link Generated'}
        </DialogTitle>
        <DialogContent>
          {generatingReset ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                py: 2
              }}>
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
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                {resetLinkExpiresAt && !Number.isNaN(new Date(resetLinkExpiresAt).getTime())
                  ? `This link expires on ${new Date(resetLinkExpiresAt).toLocaleString()}.`
                  : 'This link expires soon and can be used once.'}
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
              ? `This deactivates the account "${deleteTarget.username}" on the entire instance: they can no longer sign in. Their username and email stay reserved and their campaign data is kept. This cannot be undone from this page.`
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
    </Box>
  );
};

export default SystemAdmin;
