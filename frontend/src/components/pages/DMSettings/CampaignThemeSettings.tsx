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
import { getErrorMessage } from '../../../utils/apiErrors';
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

type ColorKey = 'primary' | 'secondary' | 'background_default' | 'background_paper';

// One entry per editable colour: the override key, its label and the base theme value
const COLOR_FIELDS: Array<{ key: ColorKey; label: string; base: string }> = [
  { key: 'primary', label: 'Primary color', base: BASE_PRIMARY },
  { key: 'secondary', label: 'Secondary color', base: BASE_SECONDARY },
  { key: 'background_default', label: 'Page background', base: BASE_BACKGROUND_DEFAULT },
  { key: 'background_paper', label: 'Surface background (cards, tables)', base: BASE_BACKGROUND_PAPER },
];

const EMPTY_COLORS: Record<ColorKey, string> = {
  primary: '',
  secondary: '',
  background_default: '',
  background_paper: '',
};

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
  const [colors, setColors] = useState<Record<ColorKey, string>>(EMPTY_COLORS);
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
    setColors({ ...EMPTY_COLORS, ...stored });
  }, [campaignSettings]);

  const anyInvalid = COLOR_FIELDS.some(({ key }) => colors[key] !== '' && !isValidHexColor(colors[key]));

  // Only the keys the DM actually set go into the saved value.
  const draftOverride = useMemo(() => {
    const draft: CampaignThemeOverride = {};
    if (mode !== 'default') draft.mode = mode;
    for (const { key } of COLOR_FIELDS) {
      if (isValidHexColor(colors[key])) draft[key] = colors[key];
    }
    return draft;
  }, [mode, colors]);

  // Live preview: render the swatch row inside the would-be theme.
  const previewTheme = useMemo(() => buildCampaignTheme(draftOverride), [draftOverride]);

  const saveThemeSetting = async (value: CampaignThemeOverride | null): Promise<boolean> => {
    try {
      await api.put('/campaigns/current/settings', { name: 'theme', value });
      await refresh();
      return true;
    } catch (err: unknown) {
      enqueueSnackbar(getErrorMessage(err, 'Failed to update campaign theme'), { variant: 'error' });
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
      setColors(EMPTY_COLORS);
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

        {COLOR_FIELDS.map(({ key, label, base }) => (
          <ColorField
            key={key}
            label={label}
            value={colors[key]}
            baseValue={base}
            onChange={(value) => setColors((prev) => ({ ...prev, [key]: value }))}
          />
        ))}

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
