import React, {useState} from 'react';
import Sidebar from './Sidebar';
import {AppBar, Box, IconButton, Toolbar, Typography} from '@mui/material';
import {Outlet, useLocation, useNavigate} from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';

const MainLayout = ({ onLogout }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Get current page title based on route
  const getPageTitle = () => {
      const path = location.pathname;

      switch (path) {
          case '/loot-entry':
              return 'Loot Entry';
          case '/gold-transactions':
              return 'Gold Transactions';
          case '/user-settings':
              return 'User Settings';
          case '/character-user-management':
              return 'Character & User Management';
          case '/consumables':
              return 'Consumables';
          case '/golarion-calendar':
              return 'Calendar';
          case '/tasks':
              return 'Session Tasks';
          case '/identify':
              return 'Identify Items';
          case '/character-loot-ledger':
              return 'Character Loot Ledger';
          case '/infamy':
              return 'Infamy';
          default:
              if (path.includes('/loot-management')) return 'Loot Management';
              if (path.includes('/item-management')) return 'Item Management';
              if (path.includes('/character-user-management')) return 'Character & User Management';
              return 'Pathfinder Loot Tracker';
      }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} onLogout={onLogout} />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: theme => theme.transitions.create(['margin', 'width'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
          marginLeft: 0,
          width: { xs: '100%', md: `calc(100% - ${isCollapsed ? 64 : 240}px)` },
        }}
      >
        <AppBar
          position="fixed"
          color="default"
          elevation={0}
          sx={{
            width: { md: `calc(100% - ${isCollapsed ? 64 : 240}px)` },
            ml: { md: isCollapsed ? '64px' : '240px' },
            backgroundColor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
            zIndex: (theme) => theme.zIndex.drawer - 1,
          }}
        >
          <Toolbar sx={{ minHeight: { xs: 64 } }}>
            <IconButton
              color="inherit"
              aria-label={isCollapsed ? "Open navigation menu" : "Close navigation menu"}
              edge="start"
              onClick={() => setIsCollapsed(!isCollapsed)}
              sx={{ mr: 2, display: { md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap component="div">
              {getPageTitle()}
            </Typography>
          </Toolbar>
        </AppBar>

        <Box
          component="div"
          sx={{
            flexGrow: 1,
            p: 3,
            mt: '64px',
            overflow: 'auto',
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default MainLayout;