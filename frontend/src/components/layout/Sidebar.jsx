import React, {useEffect, useState} from 'react';
import {Link, useLocation} from 'react-router-dom';
import {
  Avatar,
  Badge,
  Box,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
  Button,
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
  Sailing as SailingIcon,
  DirectionsBoat as ShipIcon,
  People as CrewIcon,
  Home as OutpostIcon,
} from '@mui/icons-material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import AssignmentIcon from '@mui/icons-material/Assignment';
import api from '../../utils/api';
import lootService from '../../services/lootService';
import versionService from '../../services/versionService';

const Sidebar = ({ isCollapsed, setIsCollapsed, onLogout }) => {
  const [openBeta, setOpenBeta] = useState(false);
  const [openSessionTools, setOpenSessionTools] = useState(false);
  const [openDMSettings, setOpenDMSettings] = useState(false);
  const [openFleetManagement, setOpenFleetManagement] = useState(false);
  const [isDM, setIsDM] = useState(false);
  const [unprocessedLootCount, setUnprocessedLootCount] = useState(0);
  const [unidentifiedLootCount, setUnidentifiedLootCount] = useState(0);
  const [groupName, setGroupName] = useState('Loot Tracker');
  const [username, setUsername] = useState('');
  const [activeCharacter, setActiveCharacter] = useState(null);
  const [infamyEnabled, setInfamyEnabled] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [versionInfo, setVersionInfo] = useState({ fullVersion: '0.7.1', version: '0.7.1', buildNumber: 0 });
  const location = useLocation();

  const handleToggle = (setter) => () => setter(prev => !prev);

  useEffect(() => {
    let isMounted = true;
    
    // Get user role and name from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const userData = JSON.parse(userStr);
        if (isMounted) {
          setIsDM(userData.role === 'DM');
          setUsername(userData.username || '');
        }
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
    
    const fetchData = async () => {
      try {
        const [lootCountRes, unidentifiedCountRes, groupNameRes, activeCharRes, infamyRes, versionRes] = await Promise.all([
          lootService.getUnprocessedCount(),
          lootService.getUnidentifiedCount(),
          api.get('/settings/campaign-name'),
          api.get('/auth/status'),
          api.get('/settings/infamy-system'),
          versionService.getVersion()
        ]);
        
        if (isMounted) {
          setUnprocessedLootCount(lootCountRes.data.count);
          setUnidentifiedLootCount(unidentifiedCountRes.data.count);
          setGroupName(groupNameRes.data.value);
          if (activeCharRes.data?.user?.activeCharacter) {
            setActiveCharacter(activeCharRes.data.user.activeCharacter);
          }
          if (infamyRes.data?.value) {
            setInfamyEnabled(infamyRes.data.value === '1');
          }
          if (versionRes.data) {
            setVersionInfo(versionRes.data);
          }
        }
      } catch (error) {
        console.error('Error fetching sidebar data:', error);
      }
    };
    
    fetchData();
    
    return () => {
      isMounted = false;
    };
  }, []);




  const isActiveRoute = (route) => {
    return location.pathname === route;
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleLogoutClick = () => {
    setLogoutDialogOpen(true);
  };
  
  const handleLogoutConfirm = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (onLogout) onLogout();
    setLogoutDialogOpen(false);
  };
  
  const handleLogoutCancel = () => {
    setLogoutDialogOpen(false);
  };

  const MenuItem = ({ to, primary, icon, onClick, open, children, badge, isCategory }) => {
    const active = to ? isActiveRoute(to) : false;
    const ComponentToUse = to ? Link : 'div';
    
    const handleKeyDown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (onClick) {
          onClick();
        }
      }
    };

    return (
      <React.Fragment>
        <ListItemButton
          component={ComponentToUse}
          to={to}
          onClick={onClick}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role={to ? "link" : "button"}
          aria-current={active ? "page" : undefined}
          aria-expanded={children ? open : undefined}
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
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: '2px',
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
      </React.Fragment>
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
        <IconButton 
          onClick={toggleSidebar} 
          color="primary"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <MenuIcon /> : <ChevronLeft />}
        </IconButton>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto', px: 1, py: 2 }}>
        <List component="nav" disablePadding role="navigation" aria-label="Main navigation">
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

          {infamyEnabled && (
            <MenuItem
              to="/infamy"
              primary="Infamy"
              icon={<SailingIcon/>}
              isCategory
            />
          )}

          {infamyEnabled && (
            <MenuItem
              primary="Fleet Management"
              icon={<ShipIcon/>}
              onClick={handleToggle(setOpenFleetManagement)}
              open={openFleetManagement}
              isCategory
            >
              <MenuItem to="/ships" primary="Ships" icon={<ShipIcon />} />
              <MenuItem to="/crew" primary="Crew" icon={<CrewIcon />} />
              <MenuItem to="/outposts" primary="Outposts" icon={<OutpostIcon />} />
            </MenuItem>
          )}

          <MenuItem
            primary="Session Tools"
            icon={<AutoStoriesIcon/>}
            onClick={handleToggle(setOpenSessionTools)}
            open={openSessionTools}
            badge={isCollapsed && unidentifiedLootCount > 0 ? unidentifiedLootCount : null}
            isCategory
          >
            <MenuItem to="/golarion-calendar" primary="Calendar" icon={<DateRange />} />
            <MenuItem to="/tasks" primary="Tasks" icon={<AssignmentIcon />} />
            <MenuItem to="/consumables" primary="Consumables" icon={<Inventory />} />
            <MenuItem 
              to="/identify" 
              primary="Identify" 
              icon={<PsychologyAlt />} 
              badge={unidentifiedLootCount > 0 ? unidentifiedLootCount : null}
            />
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

      {/* Version Display */}
      {!isCollapsed && (
        <Box sx={{ 
          px: 2, 
          py: 1, 
          display: 'flex', 
          justifyContent: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}>
          <Typography 
            variant="caption" 
            color="text.secondary"
            sx={{ 
              fontSize: '0.75rem',
              fontWeight: 500,
            }}
          >
            v{versionInfo.fullVersion}
          </Typography>
        </Box>
      )}

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
            onClick={handleLogoutClick}
            color="inherit"
            size="small"
            aria-label="Logout"
            sx={{ 
              alignSelf: isCollapsed ? 'center' : 'flex-end',
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'primary.main',
                outlineOffset: '2px',
              },
            }}
          >
            <Logout />
          </IconButton>
        </Tooltip>
      </Box>
      
      {/* Logout Confirmation Dialog */}
      <Dialog
        open={logoutDialogOpen}
        onClose={handleLogoutCancel}
        aria-labelledby="logout-dialog-title"
        aria-describedby="logout-dialog-description"
      >
        <DialogTitle id="logout-dialog-title">
          Confirm Logout
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="logout-dialog-description">
            Are you sure you want to logout? You will need to login again to access the application.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleLogoutCancel} color="primary">
            Cancel
          </Button>
          <Button onClick={handleLogoutConfirm} color="primary" variant="contained">
            Logout
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
};

export default Sidebar;