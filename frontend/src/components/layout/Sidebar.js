import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItemText,
  Typography,
  Collapse,
  ListItemIcon,
  IconButton,
  Box,
  ListItemButton,
  Badge,
  Button,
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
  Construction,
  PsychologyAlt,
  AccountBalanceWallet,
  Groups2,
  Person4,
  Sell,
  Delete,
  AccountBalance
} from '@mui/icons-material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AssignmentLateIcon from '@mui/icons-material/AssignmentLate';
import '../../styles/Sidebar.css';
import api from '../../utils/api';

const Sidebar = () => {
  const [openLootViews, setOpenLootViews] = useState(false);
  const [openGold, setOpenGold] = useState(false);
  const [openBeta, setOpenBeta] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const [openDMSettings, setOpenDMSettings] = useState(false);
  const [openSessionTools, setOpenSessionTools] = useState(false);
  const [isDM, setIsDM] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [unprocessedLootCount, setUnprocessedLootCount] = useState(0);
  const [groupName, setGroupName] = useState('Loot Tracker');
  const location = useLocation();

  const menuTitle = `${groupName} Loot Menu`;

  const handleToggle = (setter) => () => setter(prev => !prev);

useEffect(() => {
    // Get user role from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const userData = JSON.parse(userStr);
        setIsDM(userData.role === 'DM');
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
    fetchUnprocessedLootCount();
    fetchGroupName();
  }, []);

  const fetchUnprocessedLootCount = async () => {
    try {
      const response = await api.get('/loot/unprocessed-count');
      setUnprocessedLootCount(response.data.count);
    } catch (error) {
      console.error('Error fetching unprocessed loot count:', error);
    }
  };

  const fetchGroupName = async () => {
    try {
      const response = await api.get('/settings/campaign-name');
      setGroupName(response.data.value);
    } catch (error) {
      console.error('Error fetching campaign name:', error);
    }
  };

  const isActiveRoute = (route) => {
    return location.pathname === route ? 'active' : '';
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const MenuItem = ({ to, primary, icon, onClick, open, children, badge, isCategory }) => {
    const active = to ? isActiveRoute(to) : false;
    const ComponentToUse = to ? Link : 'div';

    return (
      <>
        <ListItemButton
          component={ComponentToUse}
          to={to}
          onClick={onClick}
          sx={{
            pl: isCategory ? 2 : 4,
            bgcolor: isCategory ? 'rgba(0, 0, 0, 0.04)' : (active ? 'rgba(0, 0, 0, 0.08)' : 'inherit'),
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
          {!isCollapsed && (
            <>
              <Badge badgeContent={badge} color="error" sx={{ flexGrow: 1 }}>
                <ListItemText primary={primary} />
              </Badge>
              {children && (open ? <ExpandLess /> : <ExpandMore />)}
            </>
          )}
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
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Box sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {!isCollapsed && <Typography variant="h6">{menuTitle}</Typography>}
        <IconButton onClick={toggleSidebar}>
          {isCollapsed ? <MenuIcon /> : <ChevronLeft />}
        </IconButton>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        <List>
          <MenuItem to="/loot-entry" primary="Loot Entry" icon={<AddBox />} />
          <MenuItem
            primary="Loot"
            icon={<ViewList />}
            onClick={handleToggle(setOpenLootViews)}
            open={openLootViews}
            isCategory
          >
            <MenuItem
              to="/unprocessed-loot"
              primary="Unprocessed"
              icon={<AssignmentLateIcon />}
              badge={unprocessedLootCount > 0 ? unprocessedLootCount : null}
            />
            <MenuItem to="/kept-party" primary="Party" icon={<Groups2 />} />
            <MenuItem to="/kept-character" primary="Character" icon={<Person4 />} />
            <MenuItem to="/sold-loot" primary="Sold" icon={<Sell />} />
            <MenuItem to="/given-away-or-trashed" primary="Trashed" icon={<Delete />} />
          </MenuItem>
          <MenuItem
            primary="Gold"
            icon={<AttachMoney/>}
            onClick={handleToggle(setOpenGold)}
            open={openGold}
            isCategory
          >
            <MenuItem to="/gold-transactions" primary="Transactions" icon={<AccountBalance />} />
            <MenuItem to="/character-loot-ledger" primary="Loot Ledger" icon={<AccountBalanceWallet />} />
          </MenuItem>
          <MenuItem
            primary="Session Tools"
            icon={<AutoStoriesIcon/>}
            onClick={handleToggle(setOpenSessionTools)}
            open={openSessionTools}
            isCategory
          >
            <MenuItem to="/golarion-calendar" primary="Calendar" icon={<DateRange />} />
            <MenuItem to="/tasks" primary="Tasks" icon={<AssignmentIcon />} />
            <MenuItem to="/consumables" primary="Consumables" icon={<Inventory />} />
          </MenuItem>
          <MenuItem
            primary="Settings"
            icon={<Settings/>}
            onClick={handleToggle(setOpenSettings)}
            open={openSettings}
            isCategory
          >
            <MenuItem to="/user-settings" primary="User Settings"/>
          </MenuItem>
          <MenuItem
            primary="Beta"
            icon={<Construction/>}
            onClick={handleToggle(setOpenBeta)}
            open={openBeta}
            isCategory
          >
            <MenuItem to="/identify" primary="Identify" icon={<PsychologyAlt />} />
          </MenuItem>
          {isDM && (
            <MenuItem
              primary="DM Settings"
              icon={<SupervisorAccount/>}
              onClick={handleToggle(setOpenDMSettings)}
              open={openDMSettings}
              isCategory
            >
              <MenuItem to="/character-user-management" primary="Gen Management" />
              <MenuItem to="/item-management" primary="Item Management" icon={<Inventory />} />
            </MenuItem>
          )}
        </List>
      </Box>

      <Box sx={{
        p: 1,
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Typography variant="caption">v0.5.0</Typography>
        <Button
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              window.location.href = '/login';
            }}
            size="small"
            color="error"
        >
          Logout
        </Button>
      </Box>
    </Drawer>
  );
};

export default Sidebar;