// frontend/src/components/CampaignThemeProvider.tsx
// Applies a per-campaign theme override (multi-campaign Phase 4b).
//
// Reads the parsed 'theme' setting from CampaignContext. When a valid
// override exists it builds a theme from the base options + override and
// mounts a NESTED ThemeProvider — the inner provider wins over the app-level
// default for everything underneath it. With no (or an invalid) override the
// children render unchanged, so unauthenticated pages (login) and campaigns
// without an override keep the default theme. Because the override comes
// from context state, calling refresh() after the DM saves a new theme
// re-renders with the new palette live — no page reload.
import React, { useMemo } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useCampaign } from '../contexts/CampaignContext';
import baseTheme from '../theme';
import { buildCampaignTheme, parseCampaignThemeOverride } from '../utils/campaignTheme';

interface CampaignThemeProviderProps {
  children: React.ReactNode;
}

const CampaignThemeProvider: React.FC<CampaignThemeProviderProps> = ({ children }) => {
  const { campaignSettings } = useCampaign();

  const override = useMemo(
    () => parseCampaignThemeOverride(campaignSettings?.theme),
    [campaignSettings]
  );
  const theme = useMemo(() => (override ? buildCampaignTheme(override) : null), [override]);

  // ALWAYS render the same element structure: switching between a Fragment
  // and a ThemeProvider when the override appears (e.g. settings arriving a
  // round-trip after mount) would change the root element type and remount
  // the entire app subtree, losing page state and double-fetching. The base
  // theme is a stable module-level object, so the no-override path stays
  // referentially stable.
  return (
    <ThemeProvider theme={theme ?? baseTheme}>
      {/* Re-apply global styles under the inner theme so the document
          background follows a light/dark mode override (identical to the
          app-level CssBaseline when no override is active). */}
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

export default CampaignThemeProvider;
