// frontend/src/components/pages/DMSettings/CampaignThemeSettings.tsx
// DM-facing editor for the per-campaign theme override (multi-campaign
// Phase 4b). Saves PUT /campaigns/current/settings { name: 'theme', value }
// with only the keys the DM actually set; value null clears the override.
// After save/reset it calls refresh() from CampaignContext so the new theme
// applies live via CampaignThemeProvider — no page reload.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { Palette as PaletteIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../../utils/api';
import { useCampaign } from '../../../contexts/CampaignContext';
import { themeOptions } from '../../../theme';
import {
  buildCampaignTheme,
  isValidHexColor,
  parseCampaignThemeOverride,
} from '../../../utils/campaignTheme';
import type { CampaignThemeOverride } from '../../../utils/campaignTheme';

// 'default' = no mode override stored (follows the base theme).
type ModeChoice = 'default' | 'dark' | 'light';

// The base theme's current values, shown as the empty-state placeholders.
const basePalette = (themeOptions as Record<string, any>).palette ?? {};
const BASE_MODE: string = basePalette.mode ?? 'dark';
const BASE_PRIMARY: string = basePalette.primary?.main ?? '#5c8db8';
const BASE_SECONDARY: string = basePalette.secondary?.main ?? '#c77a9e';
const BASE_BACKGROUND_DEFAULT: string = basePalette.background?.default ?? '#121212';
const BASE_BACKGROUND_PAPER: string = basePalette.background?.paper ?? '#1e1e1e';

interface ColorFieldProps {
  label: string;
  value: string;
  baseValue: string;
  onChange: (value: string) => void;
}

// Hex text field paired with a native color picker; an empty text value
// means "use the base theme color" (shown as the placeholder).
const ColorField: React.FC<ColorFieldProps> = ({ label, value, baseValue, onChange }) => {
  const invalid = value !== '' && !isValidHexColor(value);
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2 }}>
      <TextField
        label={label}
        size="small"
        fullWidth
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder={baseValue}
        error={invalid}
        helperText={invalid ? 'Use #rrggbb hex format' : `Default: ${baseValue}`}
      />
      <input
        type="color"
        aria-label={`Pick ${label.toLowerCase()}`}
        value={isValidHexColor(value) ? value : baseValue}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 40,
          height: 40,
          padding: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      />
    </Box>
  );
};

const CampaignThemeSettings: React.FC = () => {
  const { currentCampaign, campaignSettings, refresh } = useCampaign();
  const { enqueueSnackbar } = useSnackbar();

  const [mode, setMode] = useState<ModeChoice>('default');
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [backgroundDefault, setBackgroundDefault] = useState('');
  const [backgroundPaper, setBackgroundPaper] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Sync the form with the stored override whenever campaign settings load
  // or change (e.g. after refresh()). Empty fields mean "no override" and
  // surface the base theme values as placeholders.
  useEffect(() => {
    const stored = parseCampaignThemeOverride(
      (campaignSettings as Record<string, unknown>)?.theme
    );
    setMode(stored?.mode ?? 'default');
    setPrimary(stored?.primary ?? '');
    setSecondary(stored?.secondary ?? '');
    setBackgroundDefault(stored?.background_default ?? '');
    setBackgroundPaper(stored?.background_paper ?? '');
  }, [campaignSettings]);

  const primaryInvalid = primary !== '' && !isValidHexColor(primary);
  const secondaryInvalid = secondary !== '' && !isValidHexColor(secondary);
  const backgroundDefaultInvalid = backgroundDefault !== '' && !isValidHexColor(backgroundDefault);
  const backgroundPaperInvalid = backgroundPaper !== '' && !isValidHexColor(backgroundPaper);
  const anyInvalid =
    primaryInvalid || secondaryInvalid || backgroundDefaultInvalid || backgroundPaperInvalid;

  // Only the keys the DM actually set go into the saved value.
  const draftOverride = useMemo(() => {
    const draft: CampaignThemeOverride = {};
    if (mode !== 'default') draft.mode = mode;
    if (isValidHexColor(primary)) draft.primary = primary;
    if (isValidHexColor(secondary)) draft.secondary = secondary;
    if (isValidHexColor(backgroundDefault)) draft.background_default = backgroundDefault;
    if (isValidHexColor(backgroundPaper)) draft.background_paper = backgroundPaper;
    return draft;
  }, [mode, primary, secondary, backgroundDefault, backgroundPaper]);

  // Live preview: render the swatch row inside the would-be theme.
  const previewTheme = useMemo(() => buildCampaignTheme(draftOverride), [draftOverride]);

  const saveThemeSetting = async (value: CampaignThemeOverride | null): Promise<boolean> => {
    try {
      await api.put('/campaigns/current/settings', { name: 'theme', value });
      await refresh();
      return true;
    } catch (err: any) {
      enqueueSnackbar(
        err.response?.data?.message || 'Failed to update campaign theme',
        { variant: 'error' }
      );
      return false;
    }
  };

  const handleSave = async (): Promise<void> => {
    if (anyInvalid) return;
    setSaving(true);
    const value = Object.keys(draftOverride).length > 0 ? draftOverride : null;
    const ok = await saveThemeSetting(value);
    if (ok) {
      enqueueSnackbar('Campaign theme saved', { variant: 'success' });
    }
    setSaving(false);
  };

  const handleReset = async (): Promise<void> => {
    setResetting(true);
    const ok = await saveThemeSetting(null);
    if (ok) {
      setMode('default');
      setPrimary('');
      setSecondary('');
      setBackgroundDefault('');
      setBackgroundPaper('');
      enqueueSnackbar('Campaign theme reset to default', { variant: 'success' });
    }
    setResetting(false);
  };

  const busy = saving || resetting;

  return (
    <Card variant="outlined">
      <CardHeader
        title="Campaign Theme"
        avatar={<PaletteIcon />}
        subheader={
          currentCampaign
            ? `Applies only to "${currentCampaign.name}"`
            : 'Applies only to the current campaign'
        }
      />
      <CardContent>
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel id="campaign-theme-mode-label">Mode</InputLabel>
          <Select
            labelId="campaign-theme-mode-label"
            id="campaign-theme-mode-select"
            label="Mode"
            value={mode}
            onChange={(e: SelectChangeEvent) => setMode(e.target.value as ModeChoice)}
            disabled={busy}
          >
            <MenuItem value="default">{`Default (${BASE_MODE === 'dark' ? 'Dark' : 'Light'})`}</MenuItem>
            <MenuItem value="dark">Dark</MenuItem>
            <MenuItem value="light">Light</MenuItem>
          </Select>
        </FormControl>

        <ColorField
          label="Primary color"
          value={primary}
          baseValue={BASE_PRIMARY}
          onChange={setPrimary}
        />
        <ColorField
          label="Secondary color"
          value={secondary}
          baseValue={BASE_SECONDARY}
          onChange={setSecondary}
        />
        <ColorField
          label="Page background"
          value={backgroundDefault}
          baseValue={BASE_BACKGROUND_DEFAULT}
          onChange={setBackgroundDefault}
        />
        <ColorField
          label="Surface background (cards, tables)"
          value={backgroundPaper}
          baseValue={BASE_BACKGROUND_PAPER}
          onChange={setBackgroundPaper}
        />

        <Typography variant="subtitle2" gutterBottom>
          Preview
        </Typography>
        <ThemeProvider theme={previewTheme}>
          {/* Outer box shows the page background, inner Paper the surface
              background — so background overrides are visible in the preview */}
          <Box
            sx={{
              p: 1.5,
              mb: 2,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.default',
            }}
          >
            <Paper
              sx={{
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Button variant="contained" color="primary" size="small">
                Primary
              </Button>
              <Button variant="contained" color="secondary" size="small">
                Secondary
              </Button>
              <Chip label="Primary chip" color="primary" size="small" />
              <Chip label="Secondary chip" color="secondary" size="small" />
            </Paper>
          </Box>
        </ThemeProvider>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            color="primary"
            fullWidth
            onClick={handleSave}
            disabled={busy || anyInvalid}
          >
            {saving ? <CircularProgress size={24} /> : 'Save Theme'}
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            fullWidth
            onClick={handleReset}
            disabled={busy}
          >
            {resetting ? <CircularProgress size={24} /> : 'Reset to Default'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default CampaignThemeSettings;
