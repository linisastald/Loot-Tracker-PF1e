import React, {Suspense, useState, useEffect} from 'react';
import Sidebar from './Sidebar';
import CampaignSelector from './CampaignSelector';
import NoSessionTodayBanner from './NoSessionTodayBanner';
import NoCampaignNotice from './NoCampaignNotice';
import {AppBar, Box, CircularProgress, IconButton, Toolbar, Typography} from '@mui/material';
import {Outlet, useLocation} from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import { useConfig } from '../../contexts/ConfigContext';
import { useCampaign } from '../../contexts/CampaignContext';
import { APP_BAR_HEIGHT, drawerWidthFor } from './layoutConstants';
import { getPageTitle } from './pageTitles';

interface MainLayoutProps {
  onLogout: () => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({ onLogout }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { config } = useConfig();
  const { hasNoCampaign, currentCampaign } = useCampaign();
  // Unknown pages and the browser tab fall back to the active campaign's name
  const appName = currentCampaign?.name || config.groupName;
  const drawerWidth = drawerWidthFor(isCollapsed);

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  const pageTitle = getPageTitle(location.pathname) ?? appName;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
      <Sidebar
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onLogout={onLogout}
      />

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
          width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <AppBar
          position="fixed"
          color="default"
          elevation={0}
          sx={{
            width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
            ml: { md: `${drawerWidth}px` },
            backgroundColor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
            zIndex: (theme) => theme.zIndex.drawer - 1,
          }}
        >
          <Toolbar sx={{ minHeight: APP_BAR_HEIGHT }}>
            <IconButton
              color="inherit"
              aria-label="Open navigation menu"
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ mr: 2, display: { md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap component="div">
              {pageTitle}
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <CampaignSelector />
          </Toolbar>
        </AppBar>

        <Box
          component="div"
          sx={{
            flexGrow: 1,
            p: { xs: 1, md: 3 },
            mt: { xs: `${APP_BAR_HEIGHT.xs}px`, md: `${APP_BAR_HEIGHT.md}px` },
            overflow: 'auto',
          }}
        >
          {/* Multi-campaign: gentle "wrong campaign?" hint, above page content */}
          {hasNoCampaign ? (
            // Not a member of any campaign: every campaign page would 403, so show
            // the redeem-an-invite state instead of an error loop
            <NoCampaignNotice onLogout={onLogout} />
          ) : (
            <>
              <NoSessionTodayBanner />
              <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress size={32} /></Box>}>
                <Outlet />
              </Suspense>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default MainLayout;