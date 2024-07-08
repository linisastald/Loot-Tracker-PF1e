import React from 'react';
import { Link } from 'react-router-dom';
import { Drawer, List, ListItem, ListItemText, Typography } from '@mui/material';

const Sidebar = () => {
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
        <ListItem button component={Link} to="/loot-entry">
          <ListItemText primary="Loot Entry" />
        </ListItem>
        <ListItem button component={Link} to="/unprocessed-loot">
          <ListItemText primary="Unprocessed Loot" />
        </ListItem>
        <ListItem button component={Link} to="/gold-transactions">
          <ListItemText primary="Gold Transactions" />
        </ListItem>
      </List>
    </Drawer>
  );
};

export default Sidebar;
