import React, {Suspense, useState, useEffect} from 'react';
import Sidebar from './Sidebar';
import CampaignSelector from './CampaignSelector';
import NoSessionTodayBanner from './NoSessionTodayBanner';
import NoCampaignNotice from './NoCampaignNotice';
import {AppBar, Box, CircularProgress, IconButton, Toolbar, Typography} from '@mui/material';
import {ThemeProvider, useTheme} from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import {Outlet, useLocation} from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import { useConfig } from '../../contexts/ConfigContext';
import { useCampaign } from '../../contexts/CampaignContext';
import baseTheme from '../../theme';
import AccountMenu from './AccountMenu';
import { APP_BAR_HEIGHT, drawerWidthFor } from './layoutConstants';
import { getPageTitle, isCampaignAgnosticPath } from './pageTitles';

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
  // Account & Settings pages belong to the user, not the campaign: they render
  // under the default theme (never the campaign's colours), without the
  // campaign banners, and even for a user who belongs to no campaign.
  const campaignAgnostic = isCampaignAgnosticPath(location.pathname);
  const campaignTheme = useTheme();

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  const pageTitle = getPageTitle(location.pathname) ?? appName;

  return (
    // Always the same element structure (a nested ThemeProvider): on campaign
    // pages it simply re-provides the campaign theme from above.
    <ThemeProvider theme={campaignAgnostic ? baseTheme : campaignTheme}>
    {campaignAgnostic && <CssBaseline />}
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
            <AccountMenu />
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
          {hasNoCampaign && !campaignAgnostic ? (
            // Not a member of any campaign: every campaign page would 403, so show
            // the redeem-an-invite state instead of an error loop (the account
            // pages still work without a campaign)
            <NoCampaignNotice onLogout={onLogout} />
          ) : (
            <>
              {!campaignAgnostic && <NoSessionTodayBanner />}
              <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress size={32} /></Box>}>
                <Outlet />
              </Suspense>
            </>
          )}
        </Box>
      </Box>
    </Box>
    </ThemeProvider>
  );
};

export default MainLayout;