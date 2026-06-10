// frontend/src/utils/campaignTheme.ts
// Per-campaign theme factory (multi-campaign Phase 4b).
//
// A campaign's 'theme' setting may override { mode, primary, secondary }.
// The factory merges those overrides INTO the app's base theme options
// (exported from src/theme.jsx) so all of the base design tokens —
// typography, shape, component customizations — are preserved rather than
// forked. The base theme hardcodes its default dark palette into a handful
// of component styleOverrides (some with !important), so when an override
// is active the factory drops exactly those entries and lets MUI derive the
// colors from the new palette instead.
import { createTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import { themeOptions } from '../theme';

export interface CampaignThemeOverride {
  mode?: 'dark' | 'light';
  primary?: string;
  secondary?: string;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const isValidHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR_RE.test(value);

/**
 * Defensive parse of a raw campaign 'theme' setting value. Returns a clean
 * override containing only the valid keys, or null when nothing usable is
 * present (missing setting, wrong shape, bad mode, malformed colors).
 */
export const parseCampaignThemeOverride = (raw: unknown): CampaignThemeOverride | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const override: CampaignThemeOverride = {};

  if (candidate.mode === 'dark' || candidate.mode === 'light') {
    override.mode = candidate.mode;
  }
  if (isValidHexColor(candidate.primary)) {
    override.primary = candidate.primary;
  }
  if (isValidHexColor(candidate.secondary)) {
    override.secondary = candidate.secondary;
  }

  return Object.keys(override).length > 0 ? override : null;
};

// Base component overrides that hardcode dark-surface colors (white text,
// #1e1e1e paper, rgba(255,255,255,…) borders). In light mode they would
// produce white-on-white, so they are dropped and MUI's palette-driven light
// defaults apply. Structural overrides (CssBaseline layout, Paper radius,
// Tabs, Dialogs, …) are kept in both modes.
const DARK_ONLY_COMPONENT_KEYS = [
  'MuiDrawer',
  'MuiIconButton',
  'MuiSelect',
  'MuiTableCell',
  'MuiTableRow',
  'MuiTextField',
  'MuiAlert',
  'MuiChip',
  'MuiListItemButton',
  'MuiListItemIcon',
  'MuiDivider',
] as const;

// Strip a hardcoded `color` from a typography variant (subtitle2/body2 bake
// in rgba-white text that is unreadable in light mode) while keeping sizes.
const withoutColor = (variant: unknown): Record<string, unknown> | unknown => {
  if (!variant || typeof variant !== 'object') return variant;
  const { color: _color, ...rest } = variant as Record<string, unknown>;
  return rest;
};

/**
 * Build a full MUI theme from the base theme options plus a campaign
 * override. An empty override yields a theme equivalent to the base.
 */
export const buildCampaignTheme = (override: CampaignThemeOverride): Theme => {
  // theme.jsx is plain JS, so treat the options loosely here.
  const base = themeOptions as Record<string, any>;
  const mode: 'dark' | 'light' = override.mode ?? base.palette?.mode ?? 'dark';
  const paletteChanged = Boolean(override.primary || override.secondary);

  const palette: Record<string, any> = { ...base.palette, mode };
  if (mode === 'light') {
    // The base palette hardcodes dark surfaces, text, and action tints —
    // drop them so createTheme computes proper light-mode defaults.
    delete palette.background;
    delete palette.divider;
    delete palette.text;
    delete palette.action;
  }
  if (override.primary) {
    // Replace the whole color object (not just .main) so light/dark/
    // contrastText are recomputed from the new color.
    palette.primary = { main: override.primary };
  }
  if (override.secondary) {
    palette.secondary = { main: override.secondary };
  }

  const components: Record<string, any> = { ...base.components };

  if (paletteChanged || mode === 'light') {
    // The base MuiButton variant overrides bake the default primary/secondary
    // colors (and white text) in with !important, which would defeat any
    // palette change. Keep the structural root/contained styles and drop the
    // color-specific variants so MUI derives them from the palette.
    const baseButton = base.components?.MuiButton ?? {};
    const {
      containedPrimary: _cp,
      containedSecondary: _cs,
      outlinedPrimary: _op,
      outlinedSecondary: _os,
      outlined: _o,
      text: _t,
      ...keptButtonStyles
    } = baseButton.styleOverrides ?? {};
    components.MuiButton = { ...baseButton, styleOverrides: keptButtonStyles };
  }

  if (override.primary) {
    // These hardcode the base primary color (#5c8db8) directly.
    delete components.MuiAvatar;
    delete components.MuiTextField;
  }

  if (mode === 'light') {
    for (const key of DARK_ONLY_COMPONENT_KEYS) {
      delete components[key];
    }
  }

  let typography = base.typography;
  if (mode === 'light' && typography) {
    typography = {
      ...typography,
      subtitle2: withoutColor(typography.subtitle2),
      body2: withoutColor(typography.body2),
    };
  }

  return createTheme({ ...base, palette, components, typography });
};
