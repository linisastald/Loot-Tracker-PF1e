// src/components/layout/CampaignSelector.tsx
// App-bar campaign selector (multi-campaign Phase 4a). Always visible when
// authenticated — even with a single campaign — so the feature is
// discoverable. Offers switch, join-by-invite-code, and (superadmin only)
// create-campaign flows.
import React, { useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CheckIcon from '@mui/icons-material/Check';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined';
import CasinoIcon from '@mui/icons-material/Casino';
import { useSnackbar } from 'notistack';
import api from '../../utils/api';
import { useCampaign } from '../../contexts/CampaignContext';

const INVITE_CODE_PATTERN = /^[A-Z0-9]{6,8}$/;

interface RedeemInviteResponse {
  campaign: {
    id: number;
    name: string;
    slug: string;
  };
  role: 'Player';
}

interface CreatedCampaign {
  id: number;
  name: string;
  slug: string;
  world?: string | null;
  is_active?: boolean;
}

const CampaignSelector: React.FC = () => {
  const { campaigns, currentCampaign, isSuperadmin, switchCampaign } = useCampaign();
  const { enqueueSnackbar } = useSnackbar();

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  // Join dialog state
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  // Create dialog state (superadmin only)
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newWorld, setNewWorld] = useState('Golarion');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const closeMenu = () => setMenuAnchor(null);

  const handleSelectCampaign = (id: number) => {
    closeMenu();
    if (currentCampaign && id === currentCampaign.id) {
      return; // already active — nothing to do
    }
    switchCampaign(id);
  };

  const openJoinDialog = () => {
    closeMenu();
    setInviteCode('');
    setJoinError('');
    setJoinOpen(true);
  };

  const openCreateDialog = () => {
    closeMenu();
    setNewName('');
    setNewWorld('Golarion');
    setCreateError('');
    setCreateOpen(true);
  };

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!INVITE_CODE_PATTERN.test(code)) {
      setJoinError('Invite codes are 6-8 letters and numbers');
      return;
    }

    setJoining(true);
    setJoinError('');
    try {
      // api interceptor returns the response body, so `.data` is the payload.
      // Validate the payload BEFORE closing the dialog so a malformed response
      // surfaces as an in-dialog error rather than throwing after close.
      const response: any = await api.post('/invites/redeem', { code });
      const data = response?.data as RedeemInviteResponse;
      if (!data?.campaign?.id) {
        throw new Error('Malformed redeem response');
      }
      setJoinOpen(false);
      enqueueSnackbar(`Joined campaign "${data.campaign.name ?? data.campaign.slug ?? 'campaign'}"`, { variant: 'success' });
      switchCampaign(data.campaign.id);
    } catch (err: any) {
      setJoinError(err.response?.data?.message || 'Failed to redeem invite code');
    } finally {
      setJoining(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setCreateError('Campaign name is required');
      return;
    }

    setCreating(true);
    setCreateError('');
    try {
      const body: { name: string; world?: string } = { name };
      const world = newWorld.trim();
      if (world) {
        body.world = world;
      }
      const response: any = await api.post('/campaigns', body);
      const created = response?.data as CreatedCampaign;
      if (!created?.id) {
        throw new Error('Malformed create response');
      }
      setCreateOpen(false);
      enqueueSnackbar(`Campaign "${created.name ?? name}" created`, { variant: 'success' });
      switchCampaign(created.id);
    } catch (err: any) {
      setCreateError(err.response?.data?.message || 'Failed to create campaign');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Button
        color="inherit"
        size="small"
        onClick={(event) => setMenuAnchor(event.currentTarget)}
        startIcon={<CasinoIcon fontSize="small" />}
        endIcon={<ArrowDropDownIcon />}
        aria-label={`Select campaign, current: ${currentCampaign?.name ?? 'none'}`}
        aria-haspopup="menu"
        sx={{
          textTransform: 'none',
          maxWidth: { xs: 160, sm: 280 },
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        {currentCampaign?.name ?? 'Campaign'}
      </Button>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {campaigns.map((campaign) => {
          const isCurrent = campaign.id === currentCampaign?.id;
          return (
            <MenuItem
              key={campaign.id}
              selected={isCurrent}
              onClick={() => handleSelectCampaign(campaign.id)}
            >
              <ListItemIcon sx={{ visibility: isCurrent ? 'visible' : 'hidden' }}>
                <CheckIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={campaign.name} secondary={campaign.world || undefined} />
            </MenuItem>
          );
        })}
        {campaigns.length > 0 && <Divider />}
        <MenuItem onClick={openJoinDialog}>
          <ListItemIcon>
            <GroupAddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Join a campaign…" />
        </MenuItem>
        {isSuperadmin && (
          <MenuItem onClick={openCreateDialog}>
            <ListItemIcon>
              <AddCircleOutlineIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Create campaign…" />
          </MenuItem>
        )}
      </Menu>

      {/* Join-a-campaign dialog */}
      <Dialog open={joinOpen} onClose={() => !joining && setJoinOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Join a Campaign</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Enter the invite code your DM gave you.
          </DialogContentText>
          {joinError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {joinError}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            label="Invite Code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            slotProps={{ htmlInput: { maxLength: 8, style: { textTransform: 'uppercase' } } }}
            placeholder="e.g. ABCD1234"
            disabled={joining}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleJoin();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJoinOpen(false)} disabled={joining}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleJoin}
            disabled={joining || !inviteCode.trim()}
            startIcon={joining ? <CircularProgress size={16} /> : undefined}
          >
            Join
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create-campaign dialog (superadmin only) */}
      <Dialog open={createOpen} onClose={() => !creating && setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create Campaign</DialogTitle>
        <DialogContent>
          {createError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createError}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            required
            label="Campaign Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={creating}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            label="World"
            value={newWorld}
            onChange={(e) => setNewWorld(e.target.value)}
            disabled={creating}
            helperText="Optional — defaults to Golarion"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            startIcon={creating ? <CircularProgress size={16} /> : undefined}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default CampaignSelector;
