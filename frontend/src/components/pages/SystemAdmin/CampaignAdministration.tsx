// frontend/src/components/pages/SystemAdmin/CampaignAdministration.tsx
// Superadmin campaign administration: every campaign on the instance with
// create, rename / world edit, deactivate / reactivate, and a members dialog
// that assigns a DM or player from the user list, changes roles, and removes
// members. All endpoints are superadmin-only on the server
// (PUT /campaigns/:id, /campaigns/:id/members ...).
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
  IconButton,
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
  Tooltip,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Groups as CampaignsIcon,
  People as MembersIcon,
  PauseCircle as DeactivateIcon,
  PlayCircle as ReactivateIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../../utils/api';
import { getErrorMessage } from '../../../utils/apiErrors';

export interface AdminCampaign {
  id: number;
  name: string;
  slug: string;
  world?: string;
  is_active?: boolean;
}

export interface AdminUser {
  id: number;
  username: string;
  role: string;
}

interface CampaignMember {
  user_id: number;
  username: string;
  email?: string | null;
  role: 'DM' | 'Player';
  joined_at?: string;
}

type MemberRole = 'DM' | 'Player';
const MEMBER_ROLES: MemberRole[] = ['DM', 'Player'];

interface Props {
  campaigns: AdminCampaign[];
  users: AdminUser[];
  /** Called after any campaign change so the campaign context reloads the list */
  onCampaignsChanged: () => Promise<void> | void;
}

interface CampaignForm {
  name: string;
  world: string;
}

const EMPTY_FORM: CampaignForm = { name: '', world: 'Golarion' };

const CampaignAdministration: React.FC<Props> = ({ campaigns, users, onCampaignsChanged }) => {
  const { enqueueSnackbar } = useSnackbar();

  // Create / edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCampaign | null>(null);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Deactivate / reactivate confirmation
  const [activeTarget, setActiveTarget] = useState<AdminCampaign | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);

  // Members dialog
  const [membersTarget, setMembersTarget] = useState<AdminCampaign | null>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState<MemberRole>('Player');
  const [memberBusy, setMemberBusy] = useState(false);

  const activeCount = campaigns.filter((c) => c.is_active !== false).length;

  // --- Create / edit --------------------------------------------------------
  const openCreate = (): void => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (campaign: AdminCampaign): void => {
    setEditing(campaign);
    setForm({ name: campaign.name, world: campaign.world || 'Golarion' });
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = (): void => {
    if (saving) return;
    setFormOpen(false);
  };

  const handleSaveForm = async (): Promise<void> => {
    const name = form.name.trim();
    const world = form.world.trim();
    if (!name) {
      setFormError('Campaign name is required');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await api.put(`/campaigns/${editing.id}`, { name, world: world || 'Golarion' });
        enqueueSnackbar(`Campaign "${name}" updated`, { variant: 'success' });
      } else {
        await api.post('/campaigns', { name, world: world || undefined });
        enqueueSnackbar(`Campaign "${name}" created`, { variant: 'success' });
      }
      setFormOpen(false);
      await onCampaignsChanged();
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, editing ? 'Error updating campaign' : 'Error creating campaign'));
    } finally {
      setSaving(false);
    }
  };

  // --- Deactivate / reactivate ---------------------------------------------
  const handleToggleActive = async (): Promise<void> => {
    if (!activeTarget) return;
    const makeActive = activeTarget.is_active === false;
    setTogglingActive(true);
    try {
      await api.put(`/campaigns/${activeTarget.id}`, { is_active: makeActive });
      enqueueSnackbar(`Campaign "${activeTarget.name}" ${makeActive ? 'reactivated' : 'deactivated'}`, { variant: 'success' });
      setActiveTarget(null);
      await onCampaignsChanged();
    } catch (err: unknown) {
      enqueueSnackbar(getErrorMessage(err, 'Error updating campaign'), { variant: 'error' });
    } finally {
      setTogglingActive(false);
    }
  };

  // --- Members -------------------------------------------------------------
  const loadMembers = useCallback(async (campaign: AdminCampaign): Promise<void> => {
    setMembersLoading(true);
    setMembersError('');
    try {
      const response: any = await api.get(`/campaigns/${campaign.id}/members`);
      const list = response?.data?.members;
      setMembers(Array.isArray(list) ? list : []);
    } catch (err: unknown) {
      setMembersError(getErrorMessage(err, 'Error loading members'));
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (membersTarget) {
      setAddUserId('');
      setAddRole('Player');
      loadMembers(membersTarget);
    }
  }, [membersTarget, loadMembers]);

  const closeMembers = (): void => {
    if (memberBusy) return;
    setMembersTarget(null);
    setMembers([]);
  };

  const runMemberAction = async (action: () => Promise<void>, successMessage: string): Promise<void> => {
    if (!membersTarget) return;
    setMemberBusy(true);
    setMembersError('');
    try {
      await action();
      enqueueSnackbar(successMessage, { variant: 'success' });
      await loadMembers(membersTarget);
    } catch (err: unknown) {
      setMembersError(getErrorMessage(err, 'Error updating members'));
    } finally {
      setMemberBusy(false);
    }
  };

  const handleAddMember = (): Promise<void> => {
    const user = users.find((u) => String(u.id) === addUserId);
    if (!user || !membersTarget) return Promise.resolve();
    return runMemberAction(
      async () => {
        await api.post(`/campaigns/${membersTarget.id}/members`, { userId: user.id, role: addRole });
        setAddUserId('');
      },
      `${user.username} added as ${addRole}`
    );
  };

  const handleRoleChange = (member: CampaignMember, role: MemberRole): Promise<void> =>
    runMemberAction(
      async () => {
        await api.put(`/campaigns/${membersTarget!.id}/members/${member.user_id}`, { role });
      },
      `${member.username} is now ${role}`
    );

  const handleRemoveMember = (member: CampaignMember): Promise<void> =>
    runMemberAction(
      async () => {
        await api.delete(`/campaigns/${membersTarget!.id}/members/${member.user_id}`);
      },
      `${member.username} removed from the campaign`
    );

  const memberIds = new Set(members.map((m) => m.user_id));
  const addableUsers = users.filter((u) => u.role !== 'deleted' && !memberIds.has(u.id));

  return (
    <Card variant="outlined">
      <CardHeader
        title="Campaigns"
        avatar={<CampaignsIcon />}
        subheader="All campaigns on this instance"
        action={
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New campaign
          </Button>
        }
      />
      <CardContent>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Slug</TableCell>
                <TableCell>World</TableCell>
                <TableCell>Active</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.map((campaign) => {
                const inactive = campaign.is_active === false;
                const lastActive = !inactive && activeCount <= 1;
                return (
                  <TableRow key={campaign.id}>
                    <TableCell>{campaign.name}</TableCell>
                    <TableCell>{campaign.slug}</TableCell>
                    <TableCell>{campaign.world || '—'}</TableCell>
                    <TableCell>
                      <Chip label={inactive ? 'Inactive' : 'Active'} color={inactive ? 'default' : 'success'} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title="Members and DM">
                          <IconButton size="small" aria-label={`Members of ${campaign.name}`} onClick={() => setMembersTarget(campaign)}>
                            <MembersIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit name and world">
                          <IconButton size="small" aria-label={`Edit ${campaign.name}`} onClick={() => openEdit(campaign)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={inactive ? 'Reactivate' : lastActive ? 'The last active campaign cannot be deactivated' : 'Deactivate (hides it from its members; data is kept)'}>
                          <span>
                            <IconButton
                              size="small"
                              aria-label={`${inactive ? 'Reactivate' : 'Deactivate'} ${campaign.name}`}
                              disabled={lastActive}
                              onClick={() => setActiveTarget(campaign)}
                            >
                              {inactive ? <ReactivateIcon fontSize="small" /> : <DeactivateIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
              {campaigns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      No campaigns found.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>

      {/* Create / edit campaign */}
      <Dialog open={formOpen} onClose={closeForm} fullWidth maxWidth="xs">
        <DialogTitle>{editing ? `Edit ${editing.name}` : 'New campaign'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Campaign name"
            fullWidth
            margin="normal"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
            required
          />
          <TextField
            label="World"
            fullWidth
            margin="normal"
            value={form.world}
            onChange={(e) => setForm({ ...form, world: e.target.value })}
            helperText={editing ? 'The slug stays as it is.' : 'The slug is derived from the name.'}
          />
          {editing === null && (
            <DialogContentText sx={{ mt: 1 }}>
              You are added to the new campaign as its DM. Assign another DM from the members dialog afterwards if someone else runs it.
            </DialogContentText>
          )}
          {formError && <Alert severity="error" sx={{ mt: 1 }}>{formError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeForm} color="secondary" variant="outlined" disabled={saving}>Cancel</Button>
          <Button onClick={handleSaveForm} variant="contained" disabled={saving || !form.name.trim()}>
            {saving ? <CircularProgress size={20} /> : editing ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deactivate / reactivate */}
      <Dialog open={activeTarget !== null} onClose={togglingActive ? undefined : () => setActiveTarget(null)}>
        <DialogTitle>{activeTarget?.is_active === false ? 'Reactivate campaign' : 'Deactivate campaign'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {activeTarget?.is_active === false
              ? `"${activeTarget?.name}" becomes selectable again for its members.`
              : `"${activeTarget?.name}" is hidden from its members: they can no longer select it and anyone currently in it is moved to another campaign at their next request. Nothing is deleted, and you can reactivate it here at any time.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActiveTarget(null)} color="secondary" variant="outlined" disabled={togglingActive}>Cancel</Button>
          <Button
            onClick={handleToggleActive}
            color={activeTarget?.is_active === false ? 'primary' : 'error'}
            variant="contained"
            disabled={togglingActive}
          >
            {togglingActive ? <CircularProgress size={20} /> : activeTarget?.is_active === false ? 'Reactivate' : 'Deactivate'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Members */}
      <Dialog open={membersTarget !== null} onClose={closeMembers} fullWidth maxWidth="sm">
        <DialogTitle>{membersTarget ? `Members of ${membersTarget.name}` : 'Members'}</DialogTitle>
        <DialogContent>
          {membersError && <Alert severity="error" sx={{ mb: 2 }}>{membersError}</Alert>}
          {membersLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell align="right">Remove</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.user_id}>
                      <TableCell>{member.username}</TableCell>
                      <TableCell>
                        <Select
                          size="small"
                          value={member.role}
                          inputProps={{ 'aria-label': `Role of ${member.username}` }}
                          disabled={memberBusy}
                          onChange={(e: SelectChangeEvent) => handleRoleChange(member, e.target.value as MemberRole)}
                        >
                          {MEMBER_ROLES.map((role) => (
                            <MenuItem key={role} value={role}>{role}</MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" color="secondary" disabled={memberBusy} onClick={() => handleRemoveMember(member)}>
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {members.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>No members yet.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Box sx={{ display: 'flex', gap: 1, mt: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 180, flexGrow: 1 }}>
              <InputLabel id="add-member-user-label">Add user</InputLabel>
              <Select
                labelId="add-member-user-label"
                label="Add user"
                value={addUserId}
                disabled={memberBusy || addableUsers.length === 0}
                onChange={(e: SelectChangeEvent) => setAddUserId(e.target.value)}
              >
                {addableUsers.map((u) => (
                  <MenuItem key={u.id} value={String(u.id)}>{u.username}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel id="add-member-role-label">As</InputLabel>
              <Select
                labelId="add-member-role-label"
                label="As"
                value={addRole}
                disabled={memberBusy}
                onChange={(e: SelectChangeEvent) => setAddRole(e.target.value as MemberRole)}
              >
                {MEMBER_ROLES.map((role) => (
                  <MenuItem key={role} value={role}>{role}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="contained" size="small" disabled={memberBusy || !addUserId} onClick={handleAddMember}>
              Add
            </Button>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
            A campaign always keeps at least one DM. Removing a member keeps their account and their characters.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeMembers} variant="outlined" disabled={memberBusy}>Close</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default CampaignAdministration;
