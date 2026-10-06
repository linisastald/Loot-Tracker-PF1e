import React, { useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useCampaign } from '../../contexts/CampaignContext';

interface RoleRouteProps {
  /** 'dm' admits the current campaign's DM and the superadmin; 'superadmin' only the superadmin. */
  require: 'dm' | 'superadmin';
  children: React.ReactElement;
}

/**
 * Route-level guard for pages that are DM-only (or superadmin-only) in the
 * sidebar. This is a convenience so players who type the URL land somewhere
 * sensible; the server enforces the role on every endpoint these pages use.
 */
const RoleRoute: React.FC<RoleRouteProps> = ({ require, children }) => {
  const { isDM, isSuperadmin, loading } = useCampaign();

  // The role is not known until the campaign context has loaded once. Later
  // refreshes (e.g. after saving campaign settings) keep the last known role,
  // so a mounted page is not torn down while it reloads.
  const loadedOnce = useRef(false);
  if (!loading) loadedOnce.current = true;
  if (loading && !loadedOnce.current) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
        <CircularProgress size={32} aria-label="Loading" />
      </Box>
    );
  }

  const allowed = require === 'superadmin' ? isSuperadmin : isDM;
  return allowed ? children : <Navigate to="/" replace />;
};

export default RoleRoute;
