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
import { getErrorMessage } from '../../utils/apiErrors';
import { INVITE_CODE_FORMAT_MESSAGE, INVITE_CODE_LENGTH, isValidInviteCode } from '../../utils/inviteCode';


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

/** Open / error / busy state shared by the two form dialogs. */
const useSubmitDialog = () => {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const show = () => {
    setError('');
    setOpen(true);
  };
  const close = () => setOpen(false);
  /** Run the submit task with the busy flag; a rejection becomes the dialog error. */
  const run = async (task: () => Promise<void>, fallbackError: string) => {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (err: unknown) {
      setError(getErrorMessage(err, fallbackError));
    } finally {
      setBusy(false);
    }
  };

  return { open, error, setError, busy, show, close, run };
};

interface FormDialogProps {
  title: string;
  open: boolean;
  error: string;
  busy: boolean;
  submitLabel: string;
  submitDisabled: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

const FormDialog: React.FC<FormDialogProps> = ({
  title, open, error, busy, submitLabel, submitDisabled, onSubmit, onClose, children,
}) => (
  <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="xs" fullWidth>
    <DialogTitle>{title}</DialogTitle>
    <DialogContent>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {children}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button
        variant="contained"
        onClick={onSubmit}
        disabled={busy || submitDisabled}
        startIcon={busy ? <CircularProgress size={16} /> : undefined}
      >
        {submitLabel}
      </Button>
    </DialogActions>
  </Dialog>
);

const CampaignSelector: React.FC = () => {
  const { campaigns, currentCampaign, isSuperadmin, switchCampaign } = useCampaign();
  const { enqueueSnackbar } = useSnackbar();

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const joinDialog = useSubmitDialog();
  const [inviteCode, setInviteCode] = useState('');

  // Create dialog (superadmin only)
  const createDialog = useSubmitDialog();
  const [newName, setNewName] = useState('');
  const [newWorld, setNewWorld] = useState('Golarion');

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
    joinDialog.show();
  };

  const openCreateDialog = () => {
    closeMenu();
    setNewName('');
    setNewWorld('Golarion');
    createDialog.show();
  };

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!isValidInviteCode(code)) {
      joinDialog.setError(INVITE_CODE_FORMAT_MESSAGE);
      return;
    }

    await joinDialog.run(async () => {
      // api interceptor returns the response body, so `.data` is the payload.
      // Validate the payload BEFORE closing the dialog so a malformed response
      // surfaces as an in-dialog error rather than throwing after close.
      const response: any = await api.post('/invites/redeem', { code });
      const data = response?.data as RedeemInviteResponse;
      if (!data?.campaign?.id) {
        throw new Error('Malformed redeem response');
      }
      joinDialog.close();
      enqueueSnackbar(`Joined campaign "${data.campaign.name ?? data.campaign.slug ?? 'campaign'}"`, { variant: 'success' });
      switchCampaign(data.campaign.id);
    }, 'Failed to redeem invite code');
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      createDialog.setError('Campaign name is required');
      return;
    }

    await createDialog.run(async () => {
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
      createDialog.close();
      enqueueSnackbar(`Campaign "${created.name ?? name}" created`, { variant: 'success' });
      switchCampaign(created.id);
    }, 'Failed to create campaign');
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
      <FormDialog
        title="Join a Campaign"
        open={joinDialog.open}
        error={joinDialog.error}
        busy={joinDialog.busy}
        submitLabel="Join"
        submitDisabled={!inviteCode.trim()}
        onSubmit={handleJoin}
        onClose={joinDialog.close}
      >
        <DialogContentText sx={{ mb: 2 }}>
          Enter the invite code your DM gave you.
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          label="Invite Code"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          slotProps={{ htmlInput: { maxLength: INVITE_CODE_LENGTH, style: { textTransform: 'uppercase' } } }}
          placeholder="e.g. ABCD1234"
          disabled={joinDialog.busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleJoin();
            }
          }}
        />
      </FormDialog>

      {/* Create-campaign dialog (superadmin only) */}
      <FormDialog
        title="Create Campaign"
        open={createDialog.open}
        error={createDialog.error}
        busy={createDialog.busy}
        submitLabel="Create"
        submitDisabled={!newName.trim()}
        onSubmit={handleCreate}
        onClose={createDialog.close}
      >
        <TextField
          autoFocus
          fullWidth
          required
          label="Campaign Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          disabled={createDialog.busy}
          sx={{ mt: 1, mb: 2 }}
        />
        <TextField
          fullWidth
          label="World"
          value={newWorld}
          onChange={(e) => setNewWorld(e.target.value)}
          disabled={createDialog.busy}
          helperText="Optional — defaults to Golarion"
        />
      </FormDialog>
    </>
  );
};

export default CampaignSelector;
