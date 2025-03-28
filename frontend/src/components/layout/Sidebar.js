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
  Divider,
  Tooltip,
  Avatar,
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
  AccountBalance,
  Logout,
} from '@mui/icons-material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AssignmentLateIcon from '@mui/icons-material/AssignmentLate';
import api from '../../utils/api';

const Sidebar = ({ isCollapsed, setIsCollapsed, onLogout }) => {
  const [openLootViews, setOpenLootViews] = useState(false);
  const [openGold, setOpenGold] = useState(false);
  const [openBeta, setOpenBeta] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const [openDMSettings, setOpenDMSettings] = useState(false);
  const [openSessionTools, setOpenSessionTools] = useState(false);
  const [isDM, setIsDM] = useState(false);
  const [unprocessedLootCount, setUnprocessedLootCount] = useState(0);
  const [groupName, setGroupName] = useState('Loot Tracker');
  const [username, setUsername] = useState('');
  const location = useLocation();

  const handleToggle = (setter) => () => setter(prev => !prev);

  useEffect(() => {
    // Get user role and name from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const userData = JSON.parse(userStr);
        setIsDM(userData.role === 'DM');
        setUsername(userData.username || '');
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
    return location.pathname === route;
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (onLogout) onLogout();
    window.location.href = '/login';
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
            py: 1.5,
            mb: 0.5,
            borderRadius: isCollapsed ? 0 : '0 20px 20px 0',
            mr: 1,
            bgcolor: active ? 'rgba(144, 202, 249, 0.16)' : 'transparent',
            '&:hover': {
              bgcolor: active ? 'rgba(144, 202, 249, 0.2)' : 'rgba(255, 255, 255, 0.08)',
            },
            '& .MuiListItemIcon-root': {
              color: active ? 'primary.main' : 'text.secondary',
              minWidth: isCollapsed ? 'auto' : 40,
            },
            '& .MuiListItemText-primary': {
              color: active ? 'primary.main' : 'text.primary',
              fontWeight: active ? 600 : 400,
              fontSize: '0.875rem',
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
        width: isCollapsed ? 64 : 240,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: isCollapsed ? 64 : 240,
          boxSizing: 'border-box',
          transition: 'width 0.2s',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          overflow: 'hidden',
        },
      }}
    >
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
          minHeight: 64
        }}
      >
        {!isCollapsed && (
          <Typography variant="h6" color="primary" noWrap sx={{ fontWeight: 600 }}>
            {groupName}
          </Typography>
        )}
        <IconButton onClick={toggleSidebar} color="primary">
          {isCollapsed ? <MenuIcon /> : <ChevronLeft />}
        </IconButton>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto', px: 1, py: 2 }}>
        <List component="nav" disablePadding>
          <MenuItem to="/loot-entry" primary="Loot Entry" icon={<AddBox />} isCategory />

          <MenuItem
              to="/loot-management"
              primary="Loot Management"
              icon={<ViewList/>}
              badge={unprocessedLootCount > 0 ? unprocessedLootCount : null}
              isCategory
          />

          <MenuItem
            to="/gold-transactions"
            primary="Gold"
            icon={<AttachMoney/>}
            isCategory
          />

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
            <MenuItem to="/identify" primary="Identify" icon={<PsychologyAlt />} />
          </MenuItem>

          <MenuItem
            primary="Settings"
            icon={<Settings/>}
            onClick={handleToggle(setOpenSettings)}
            open={openSettings}
            isCategory
          >
            <MenuItem to="/user-settings" primary="User Settings" icon={<Person4 />} />
          </MenuItem>

          <MenuItem
            primary="Beta"
            icon={<Construction/>}
            onClick={handleToggle(setOpenBeta)}
            open={openBeta}
            isCategory
          >
          </MenuItem>

          {isDM && (
            <MenuItem
              primary="DM Settings"
              icon={<SupervisorAccount/>}
              onClick={handleToggle(setOpenDMSettings)}
              open={openDMSettings}
              isCategory
            >
              <MenuItem to="/character-user-management" primary="Gen Management" icon={<Groups2 />} />
              <MenuItem to="/item-management" primary="Item Management" icon={<Inventory />} />
            </MenuItem>
          )}
        </List>
      </Box>

      <Divider />

      <Box sx={{
        p: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'space-between',
      }}>
        {!isCollapsed && (
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Avatar
              sx={{
                width: 32,
                height: 32,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                fontSize: '0.875rem',
                mr: 1
              }}
            >
              {username.charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="body2" noWrap>
              {username}
            </Typography>
          </Box>
        )}

        <Tooltip title="Logout">
          <IconButton onClick={handleLogout} color="inherit" size="small">
            <Logout />
          </IconButton>
        </Tooltip>
      </Box>
    </Drawer>
  );
};

export default Sidebar;