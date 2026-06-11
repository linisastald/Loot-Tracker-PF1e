// frontend/src/components/pages/DMSettings/UserManagement.tsx
// Multi-campaign Phase 5a: this page is campaign-scoped. It lists the
// CURRENT campaign's members (GET /campaigns/current/members) and lets the
// DM remove a member from the campaign (DELETE /campaigns/current/members/:id)
// — the member's account and their other campaigns are unaffected.
// Account-level administration (password reset links, account deletion)
// moved to the superadmin-only System Admin page.
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import { useCampaign } from '../../../contexts/CampaignContext';
import InviteManagement from './InviteManagement';

export interface CampaignMember {
  user_id: number;
  username: string;
  email: string | null;
  role: 'DM' | 'Player';
  joined_at: string | null;
}

const formatJoined = (value: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
};

const UserManagement: React.FC = () => {
  const { user } = useAuth();
  const { currentCampaign, isSuperadmin } = useCampaign();
  const { enqueueSnackbar } = useSnackbar();

  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [memberToRemove, setMemberToRemove] = useState<CampaignMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

  const campaignName = currentCampaign?.name || 'this campaign';

  const fetchMembers = useCallback(async (): Promise<void> => {
    try {
      // api interceptor returns the response body, so `.data` is the payload
      const response: any = await api.get('/campaigns/current/members');
      const list = response?.data?.members;
      setMembers(Array.isArray(list) ? list : []);
      setLoadError('');
    } catch (err: any) {
      setLoadError(err.response?.data?.message || 'Error loading campaign members. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const openRemoveDialog = (member: CampaignMember): void => {
    setRemoveError('');
    setMemberToRemove(member);
  };

  const closeRemoveDialog = (): void => {
    if (removing) return;
    setMemberToRemove(null);
    setRemoveError('');
  };

  const handleRemoveConfirm = async (): Promise<void> => {
    if (!memberToRemove) return;
    setRemoving(true);
    try {
      await api.delete(`/campaigns/current/members/${memberToRemove.user_id}`);
      enqueueSnackbar(`${memberToRemove.username} removed from ${campaignName}`, {
        variant: 'success',
      });
      setMemberToRemove(null);
      setRemoveError('');
      await fetchMembers();
    } catch (err: any) {
      setRemoveError(err.response?.data?.message || 'Error removing member from campaign');
    } finally {
      setRemoving(false);
    }
  };

  // Self-removal is blocked (and hidden); removing a DM requires superadmin.
  const canRemove = (member: CampaignMember): boolean => {
    if (user?.id === member.user_id) return false;
    if (member.role === 'DM' && !isSuperadmin) return false;
    return true;
  };

  return (
    <div>
      <Typography variant="h6" gutterBottom>
        Campaign Members
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {`Members of "${campaignName}". Removing a member only affects this campaign — their account and other campaigns are unaffected.`}
      </Typography>

      {loadError && (
        <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
          {loadError}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" py={4}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ mt: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Username</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Joined</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {members.map((member) => {
                const isSelf = user?.id === member.user_id;
                return (
                  <TableRow key={member.user_id}>
                    <TableCell>{member.username}</TableCell>
                    <TableCell>{member.email || '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={member.role}
                        color={member.role === 'DM' ? 'primary' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{formatJoined(member.joined_at)}</TableCell>
                    <TableCell align="right">
                      {isSelf ? (
                        <Typography variant="caption" color="text.secondary">
                          You
                        </Typography>
                      ) : canRemove(member) ? (
                        <Button
                          size="small"
                          variant="outlined"
                          color="secondary"
                          onClick={() => openRemoveDialog(member)}
                        >
                          Remove from campaign
                        </Button>
                      ) : (
                        <Tooltip title="Only the system administrator can remove a DM">
                          <span>
                            <Button size="small" variant="outlined" color="secondary" disabled>
                              Remove from campaign
                            </Button>
                          </span>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {members.length === 0 && !loadError && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary">
                      No members found.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Invite Management Section */}
      <Box sx={{ mt: 4 }}>
        <InviteManagement />
      </Box>

      {/* Remove member confirmation dialog */}
      <Dialog open={memberToRemove !== null} onClose={closeRemoveDialog}>
        <DialogTitle>Remove from campaign?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {memberToRemove
              ? `Removes ${memberToRemove.username} from ${campaignName} — their account and other campaigns are unaffected.`
              : ''}
          </DialogContentText>
          {removeError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {removeError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRemoveDialog} color="secondary" variant="outlined" disabled={removing}>
            Cancel
          </Button>
          <Button onClick={handleRemoveConfirm} color="primary" variant="outlined" disabled={removing}>
            {removing ? <CircularProgress size={20} /> : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default UserManagement;
