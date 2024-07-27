import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Typography,
  Collapse,
  Box,
  ListItemIcon,
} from '@mui/material';
import {
  ExpandLess,
  ExpandMore,
  AddBox,
  ViewList,
  AttachMoney,
  Settings,
  SupervisorAccount,
  Inventory,
  DateRange,
} from '@mui/icons-material';
import './Sidebar.css';

const Sidebar = () => {
  const [openLootViews, setOpenLootViews] = useState(false);
  const [openGold, setOpenGold] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const [openDMSettings, setOpenDMSettings] = useState(false);
  const [isDM, setIsDM] = useState(false);
  const location = useLocation();

  console.log('Environment Variables:', process.env);

  // Get the group name from the environment variable, or use default
  const groupName = process.env.REACT_APP_GROUP_NAME || 'General';
  const menuTitle = `${groupName} Loot Menu`;

  console.log('Group Name:', groupName);
  console.log('Menu Title:', menuTitle);

  const handleToggle = (setter) => () => setter(prev => !prev);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setIsDM(payload.role === 'DM');
    }
  }, []);

  const isActiveRoute = (route) => location.pathname === route ? 'active' : '';

  const MenuItem = ({ to, primary, icon, onClick, open, children }) => (
    <>
      <ListItemButton
        component={to ? Link : 'div'}
        to={to}
        onClick={onClick}
        className={to ? isActiveRoute(to) : ''}
        sx={{ pl: children ? 2 : 3 }}
      >
        <ListItemIcon>{icon}</ListItemIcon>
        <ListItemText primary={primary} />
        {children && (open ? <ExpandLess /> : <ExpandMore />)}
      </ListItemButton>
      {children && (
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {children}
          </List>
        </Collapse>
      )}
    </>
  );

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: 240,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: { width: 240, boxSizing: 'border-box' },
      }}
    >
      <Typography variant="h6" align="center" sx={{ my: 2 }}>
        {menuTitle}
      </Typography>
      <List>
        <MenuItem to="/loot-entry" primary="Loot Entry" icon={<AddBox />} />
        <MenuItem
          primary="Loot Views"
          icon={<ViewList />}
          onClick={handleToggle(setOpenLootViews)}
          open={openLootViews}
        >
          <MenuItem to="/unprocessed-loot" primary="Unprocessed Loot" />
          <MenuItem to="/kept-party" primary="Kept - Party" />
          <MenuItem to="/kept-character" primary="Kept - Character" />
          <MenuItem to="/sold-loot" primary="Sold Loot" />
          <MenuItem to="/given-away-or-trashed" primary="Given Away or Trashed" />
        </MenuItem>
        <MenuItem
          primary="Gold"
          icon={<AttachMoney />}
          onClick={handleToggle(setOpenGold)}
          open={openGold}
        >
          <MenuItem to="/gold-transactions" primary="Gold Transactions" />
        </MenuItem>
        <MenuItem
          primary="Settings"
          icon={<Settings />}
          onClick={handleToggle(setOpenSettings)}
          open={openSettings}
        >
          <MenuItem to="/user-settings" primary="User Settings" />
        </MenuItem>
        {isDM && (
          <MenuItem
            primary="DM Settings"
            icon={<SupervisorAccount />}
            onClick={handleToggle(setOpenDMSettings)}
            open={openDMSettings}
          >
            <MenuItem to="/character-user-management" primary="Character and User Management" />
            <MenuItem to="/item-management" primary="Item Management" icon={<Inventory />} />
            <MenuItem to="/golarion-calendar" primary="Golarion Calendar" icon={<DateRange />} />
          </MenuItem>
        )}
      </List>
      <Box sx={{ position: 'absolute', bottom: 0, width: '100%', textAlign: 'center', py: 1 }}>
        <Typography variant="caption">v0.1.0</Typography>
      </Box>
    </Drawer>
  );
};

export default Sidebar;