import React, {useEffect, useState} from 'react';
import {Link, useLocation} from 'react-router-dom';
import {
  Avatar,
  Badge,
  Box,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AddBox,
  AttachMoney,
  ChevronLeft,
  DateRange,
  ExpandLess,
  ExpandMore,
  Groups2,
  Inventory,
  Logout,
  Menu as MenuIcon,
  PsychologyAlt,
  SupervisorAccount,
  ViewList,
  EmojiEvents,
} from '@mui/icons-material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import AssignmentIcon from '@mui/icons-material/Assignment';
import api from '../../utils/api';

const Sidebar = ({ isCollapsed, setIsCollapsed, onLogout }) => {
  const [openLootViews, setOpenLootViews] = useState(false);
  const [openGold, setOpenGold] = useState(false);
  const [openBeta, setOpenBeta] = useState(false);
  const [openSessionTools, setOpenSessionTools] = useState(false);
  const [openDMSettings, setOpenDMSettings] = useState(false);
  const [isDM, setIsDM] = useState(false);
  const [unprocessedLootCount, setUnprocessedLootCount] = useState(0);
  const [groupName, setGroupName] = useState('Loot Tracker');
  const [username, setUsername] = useState('');
  const [activeCharacter, setActiveCharacter] = useState(null);
  const [fameSystem, setFameSystem] = useState(null);
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
    fetchActiveCharacter();
    fetchFameSystem();
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

  const fetchActiveCharacter = async () => {
    try {
      const response = await api.get('/auth/status');
      if (response.data && response.data.user && response.data.user.activeCharacter) {
        setActiveCharacter(response.data.user.activeCharacter);
      }
    } catch (error) {
      console.error('Error fetching active character:', error);
    }
  };

  // Add function to fetch fame system setting
  const fetchFameSystem = async () => {
    try {
      const response = await api.get('/settings/fame-system');
      if (response.data && response.data.value && response.data.value !== 'disabled') {
        setFameSystem(response.data.value);
      } else {
        setFameSystem(null);
      }
    } catch (error) {
      console.error('Error fetching fame system setting:', error);
      setFameSystem(null);
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
          <Tooltip title="v0.6.0" arrow placement="right">
            <Typography variant="h6" color="primary" noWrap sx={{ fontWeight: 600 }}>
              {groupName}
            </Typography>
          </Tooltip>
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

          {/* Add Fame/Infamy menu item when enabled */}
          {fameSystem && (
            <MenuItem
              to="/fame"
              primary={fameSystem === 'fame' ? 'Fame' : 'Infamy'}
              icon={<EmojiEvents />}
              isCategory
            />
          )}

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
        alignItems: isCollapsed ? 'center' : 'flex-start',
        justifyContent: isCollapsed ? 'center' : 'space-between',
        flexDirection: isCollapsed ? 'row' : 'column',
      }}>
        {!isCollapsed && (
          <Box
            component={Link}
            to="/user-settings"
            sx={{
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none',
              color: 'inherit',
              mb: 1,
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                borderRadius: 1,
              },
              p: 1,
              width: '100%',
            }}
          >
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
            <Box sx={{ overflow: 'hidden' }}>
              <Typography variant="body2" noWrap>
                {username}
              </Typography>
              {activeCharacter && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {activeCharacter.name}
                </Typography>
              )}
            </Box>
          </Box>
        )}

        <Tooltip title="Logout">
          <IconButton
            onClick={handleLogout}
            color="inherit"
            size="small"
            sx={{ alignSelf: isCollapsed ? 'center' : 'flex-end' }}
          >
            <Logout />
          </IconButton>
        </Tooltip>
      </Box>
    </Drawer>
  );
};

export default Sidebar;