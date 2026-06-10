import { describe, it, expect } from 'vitest';
import {
  buildCampaignTheme,
  isValidHexColor,
  parseCampaignThemeOverride,
} from '../campaignTheme';
import { themeOptions } from '../../theme';

const basePalette = (themeOptions as Record<string, any>).palette;

describe('isValidHexColor', () => {
  it('accepts #rrggbb', () => {
    expect(isValidHexColor('#5c8db8')).toBe(true);
    expect(isValidHexColor('#ABCDEF')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isValidHexColor('red')).toBe(false);
    expect(isValidHexColor('#fff')).toBe(false);
    expect(isValidHexColor('#12345g')).toBe(false);
    expect(isValidHexColor('5c8db8')).toBe(false);
    expect(isValidHexColor(123)).toBe(false);
    expect(isValidHexColor(null)).toBe(false);
  });
});

describe('parseCampaignThemeOverride', () => {
  it('returns null for non-objects', () => {
    expect(parseCampaignThemeOverride(undefined)).toBeNull();
    expect(parseCampaignThemeOverride(null)).toBeNull();
    expect(parseCampaignThemeOverride('dark')).toBeNull();
    expect(parseCampaignThemeOverride(7)).toBeNull();
    expect(parseCampaignThemeOverride(['#ff0000'])).toBeNull();
  });

  it('returns null when no key is valid', () => {
    expect(parseCampaignThemeOverride({})).toBeNull();
    expect(parseCampaignThemeOverride({ mode: 'blue', primary: 'red' })).toBeNull();
    expect(parseCampaignThemeOverride({ unrelated: true })).toBeNull();
  });

  it('keeps only valid keys', () => {
    expect(
      parseCampaignThemeOverride({ mode: 'light', primary: 'red', secondary: '#abcdef' })
    ).toEqual({ mode: 'light', secondary: '#abcdef' });
  });

  it('passes a fully valid override through', () => {
    expect(
      parseCampaignThemeOverride({ mode: 'dark', primary: '#112233', secondary: '#445566' })
    ).toEqual({ mode: 'dark', primary: '#112233', secondary: '#445566' });
  });
});

describe('buildCampaignTheme', () => {
  it('reproduces the base palette for an empty override', () => {
    const theme = buildCampaignTheme({});
    expect(theme.palette.mode).toBe('dark');
    expect(theme.palette.primary.main).toBe(basePalette.primary.main);
    expect(theme.palette.secondary.main).toBe(basePalette.secondary.main);
    expect(theme.palette.background.default).toBe('#121212');
    // Base component customizations preserved
    expect(theme.shape.borderRadius).toBe(8);
    expect((theme.components as any).MuiButton.styleOverrides.containedPrimary).toBeDefined();
  });

  it('recomputes light/dark/contrastText from an overridden primary', () => {
    const theme = buildCampaignTheme({ primary: '#ff0000' });
    expect(theme.palette.primary.main).toBe('#ff0000');
    // createTheme augments a bare { main } with computed shades
    expect(theme.palette.primary.light).toBeDefined();
    expect(theme.palette.primary.dark).toBeDefined();
    expect(theme.palette.primary.contrastText).toBeDefined();
    // The rest of the base palette stays
    expect(theme.palette.secondary.main).toBe(basePalette.secondary.main);
    expect(theme.palette.mode).toBe('dark');
  });

  it('drops the base button variants that hardcode palette colors when a color is overridden', () => {
    const theme = buildCampaignTheme({ primary: '#ff0000' });
    const buttonOverrides = (theme.components as any).MuiButton.styleOverrides;
    // The !important #5c8db8 variants would defeat the new palette
    expect(buttonOverrides.containedPrimary).toBeUndefined();
    expect(buttonOverrides.containedSecondary).toBeUndefined();
    expect(buttonOverrides.outlinedPrimary).toBeUndefined();
    // Structural styles are kept
    expect(buttonOverrides.root).toBeDefined();
    // And the avatar/textfield overrides that hardcode the old primary are gone
    expect((theme.components as any).MuiAvatar).toBeUndefined();
    expect((theme.components as any).MuiTextField).toBeUndefined();
  });

  it('switches to sane light-mode surfaces when mode is light', () => {
    const theme = buildCampaignTheme({ mode: 'light' });
    expect(theme.palette.mode).toBe('light');
    // Dark surfaces dropped so MUI computes light defaults
    expect(theme.palette.background.default).not.toBe('#121212');
    expect(theme.palette.text.primary).not.toBe('#ffffff');
    // Dark-hardcoded component overrides removed
    expect((theme.components as any).MuiDrawer).toBeUndefined();
    expect((theme.components as any).MuiTableCell).toBeUndefined();
    expect((theme.components as any).MuiAlert).toBeUndefined();
    // Structural overrides kept
    expect((theme.components as any).MuiPaper).toBeDefined();
    expect((theme.components as any).MuiTabs).toBeDefined();
    // White-text typography colors stripped, sizes kept
    expect((theme.typography as any).body2.color).toBeUndefined();
    expect((theme.typography as any).body2.fontSize).toBe('0.85rem');
  });

  it('does not mutate the shared base theme options', () => {
    const before = JSON.stringify({
      palette: basePalette,
      buttonKeys: Object.keys((themeOptions as any).components.MuiButton.styleOverrides),
    });
    buildCampaignTheme({ mode: 'light', primary: '#ff0000', secondary: '#00ff00' });
    const after = JSON.stringify({
      palette: basePalette,
      buttonKeys: Object.keys((themeOptions as any).components.MuiButton.styleOverrides),
    });
    expect(after).toBe(before);
  });
});
