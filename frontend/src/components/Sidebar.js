// Sidebar.js

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
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import './Sidebar.css'; // Ensure this import is correct

const Sidebar = () => {
  const [openLootViews, setOpenLootViews] = useState(false);
  const [openGold, setOpenGold] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const [openDMSettings, setOpenDMSettings] = useState(false);
  const [isDM, setIsDM] = useState(false);
  const location = useLocation();

  const handleToggleLootViews = () => {
    setOpenLootViews(!openLootViews);
  };

  const handleToggleGold = () => {
    setOpenGold(!openGold);
  };

  const handleToggleSettings = () => {
    setOpenSettings(!openSettings);
  };

  const handleToggleDMSettings = () => {
    setOpenDMSettings(!openDMSettings);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Decode the token to get the user role
      const payload = JSON.parse(atob(token.split('.')[1]));
      setIsDM(payload.role === 'DM');
    }
  }, []);

  const isActiveRoute = (route) => {
    return location.pathname === route ? 'active' : '';
  };

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
        Menu
      </Typography>
      <List>
        <ListItem button component={Link} to="/loot-entry" className={isActiveRoute('/loot-entry')}>
          <ListItemText primary="Loot Entry" />
        </ListItem>
        <ListItem button onClick={handleToggleLootViews}>
          <ListItemText primary="Loot Views" />
          {openLootViews ? <ExpandLess /> : <ExpandMore />}
        </ListItem>
        <Collapse in={openLootViews} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItem button component={Link} to="/unprocessed-loot" className={isActiveRoute('/unprocessed-loot')} sx={{ pl: 4 }}>
              <ListItemText primary="Unprocessed Loot" />
            </ListItem>
            <ListItem button component={Link} to="/kept-party" className={isActiveRoute('/kept-party')} sx={{ pl: 4 }}>
              <ListItemText primary="Kept - Party" />
            </ListItem>
            <ListItem button component={Link} to="/kept-character" className={isActiveRoute('/kept-character')} sx={{ pl: 4 }}>
              <ListItemText primary="Kept - Character" />
            </ListItem>
            <ListItem button component={Link} to="/sold-loot" className={isActiveRoute('/sold-loot')} sx={{ pl: 4 }}>
              <ListItemText primary="Sold Loot" />
            </ListItem>
            <ListItem button component={Link} to="/given-away-or-trashed" className={isActiveRoute('/given-away-or-trashed')} sx={{ pl: 4 }}>
              <ListItemText primary="Given Away or Trashed" />
            </ListItem>
          </List>
        </Collapse>
        <ListItem button onClick={handleToggleGold}>
          <ListItemText primary="Gold" />
          {openGold ? <ExpandLess /> : <ExpandMore />}
        </ListItem>
        <Collapse in={openGold} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItem button component={Link} to="/gold-transactions" className={isActiveRoute('/gold-transactions')} sx={{ pl: 4 }}>
              <ListItemText primary="Gold Transactions" />
            </ListItem>
          </List>
        </Collapse>
        <ListItem button onClick={handleToggleSettings}>
          <ListItemText primary="Settings" />
          {openSettings ? <ExpandLess /> : <ExpandMore />}
        </ListItem>
        <Collapse in={openSettings} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItem button component={Link} to="/user-settings" className={isActiveRoute('/user-settings')} sx={{ pl: 4 }}>
              <ListItemText primary="User Settings" />
            </ListItem>
          </List>
        </Collapse>
        {isDM && (
          <div>
            <ListItem button onClick={handleToggleDMSettings}>
              <ListItemText primary="DM Settings" />
              {openDMSettings ? <ExpandLess /> : <ExpandMore />}
            </ListItem>
            <Collapse in={openDMSettings} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                <ListItem button component={Link} to="/character-user-management" className={isActiveRoute('/character-user-management')} sx={{ pl: 4 }}>
                  <ListItemText primary="Character and User Management" />
                </ListItem>
                <ListItem button component={Link} to="/item-management" className={isActiveRoute('/item-management')} sx={{ pl: 4 }}>
                  <ListItemText primary="Item Management" />
                </ListItem>
                <ListItem button component={Link} to="/golarion-calendar" className={isActiveRoute('/golarion-calendar')} sx={{ pl: 4 }}>
                  <ListItemText primary="Golarion Calendar" />
                </ListItem>
              </List>
            </Collapse>
          </div>
        )}
      </List>
    </Drawer>
  );
};

export default Sidebar;
