// frontend/src/components/layout/AccountMenu.tsx
// Account menu in the app bar: the one obvious way to reach the account-level
// pages (Account & Settings), which belong to the user rather than to the
// campaign that is open. The superadmin's System Admin lives here too, as a
// tab of that page, instead of among the campaign pages in the sidebar.
import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Avatar,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import GroupsIcon from '@mui/icons-material/Groups';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaign } from '../../contexts/CampaignContext';

const AccountMenu: React.FC = () => {
  const { user } = useAuth();
  const { isSuperadmin } = useCampaign();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const username = user?.username || '';
  const open = Boolean(anchorEl);

  const close = () => setAnchorEl(null);

  return (
    <>
      <Tooltip title="Account & settings">
        <IconButton
          onClick={(event) => setAnchorEl(event.currentTarget)}
          size="small"
          sx={{ ml: 1 }}
          aria-label="Account menu"
          aria-controls={open ? 'account-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
        >
          <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: '0.875rem' }}>
            {username.charAt(0).toUpperCase()}
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu
        id="account-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={close}
        onClick={close}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      >
        <MenuItem disabled sx={{ opacity: '1 !important' }}>
          <ListItemText
            primary={<Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{username}</Typography>}
            secondary="Settings for your account, in every campaign"
            slotProps={{ secondary: { variant: 'caption' } }}
          />
        </MenuItem>
        <Divider />
        <MenuItem component={RouterLink} to="/user-settings">
          <ListItemIcon><ManageAccountsIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Account settings" />
        </MenuItem>
        <MenuItem component={RouterLink} to="/user-settings/characters">
          <ListItemIcon><GroupsIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="My characters" />
        </MenuItem>
        {isSuperadmin && (
          <MenuItem component={RouterLink} to="/user-settings/system-admin">
            <ListItemIcon><AdminPanelSettingsIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="System Admin" />
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

export default AccountMenu;
