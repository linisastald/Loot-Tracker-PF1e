import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemText,
  Typography,
  Collapse,
  ListItemIcon,
  IconButton,
  Box,
  ListItemButton,
} from '@mui/material';
import {
  ExpandLess,
  ExpandMore,
  Menu as MenuIcon,
  ChevronLeft,
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();

  const groupName = window.env?.REACT_APP_GROUP_NAME || 'Loot Tracker';
  const menuTitle = `${groupName} Loot Menu`;

  const handleToggle = (setter) => () => setter(prev => !prev);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setIsDM(payload.role === 'DM');
    }
  }, []);

  const isActiveRoute = (route) => {
    return location.pathname === route ? 'active' : '';
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const MenuItem = ({ to, primary, icon, onClick, open, children }) => {
    const active = to ? isActiveRoute(to) : false;
    return (
      <>
        <ListItemButton
          component={to ? Link : 'div'}
          to={to}
          onClick={onClick}
          sx={{
            pl: children ? 2 : 3,
            bgcolor: active ? 'rgba(0, 0, 0, 0.08)' : 'inherit',
            '&:hover': {
              bgcolor: active ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.04)',
            },
            '& .MuiListItemIcon-root': {
              color: active ? '#1976d2' : 'inherit',
              minWidth: isCollapsed ? 'auto' : 56,
            },
            '& .MuiListItemText-primary': {
              color: active ? '#1976d2' : 'inherit',
              fontWeight: active ? 'bold' : 'normal',
            },
          }}
        >
          <ListItemIcon>{icon}</ListItemIcon>
          {!isCollapsed && <ListItemText primary={primary} />}
          {!isCollapsed && children && (open ? <ExpandLess /> : <ExpandMore />)}
        </ListItemButton>
        {children && !isCollapsed && (
          <Collapse in={open} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {children}
            </List>
          </Collapse>
        )}
      </>
    );
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: isCollapsed ? 60 : 240,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: isCollapsed ? 60 : 240,
          boxSizing: 'border-box',
          transition: 'width 0.2s',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1 }}>
        {!isCollapsed && <Typography variant="h6">{menuTitle}</Typography>}

      </Box>
      <IconButton onClick={toggleSidebar}>
          {isCollapsed ? <MenuIcon /> : <ChevronLeft />}
        </IconButton>
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
        <Typography variant="caption">v0.1.1</Typography>
      </Box>
    </Drawer>
  );
};

export default Sidebar;