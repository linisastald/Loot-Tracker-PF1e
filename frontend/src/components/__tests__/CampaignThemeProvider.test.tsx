import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ThemeProvider, useTheme } from '@mui/material/styles';

// Control the campaign context directly
let campaignSettings: Record<string, unknown> = {};
vi.mock('../../contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaigns: [],
    currentCampaign: { id: 1, name: 'Test Campaign', slug: 'test' },
    campaignRole: 'DM',
    isSuperadmin: false,
    campaignSettings,
    loading: false,
    switchCampaign: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import baseTheme from '../../theme';
import CampaignThemeProvider from '../CampaignThemeProvider';

// Base palette values from src/theme.jsx
const BASE_PRIMARY = '#5c8db8';
const BASE_SECONDARY = '#c77a9e';

// Probe that prints the effective palette into the DOM
const ThemeProbe: React.FC = () => {
  const theme = useTheme();
  return (
    <div data-testid="probe">
      {`${theme.palette.mode}|${theme.palette.primary.main}|${theme.palette.secondary.main}`}
    </div>
  );
};

// Mimic the app: base ThemeProvider outside, campaign provider nested inside
const renderWithThemes = () =>
  render(
    <ThemeProvider theme={baseTheme}>
      <CampaignThemeProvider>
        <ThemeProbe />
      </CampaignThemeProvider>
    </ThemeProvider>
  );

const probeText = () => screen.getByTestId('probe').textContent;

describe('CampaignThemeProvider', () => {
  beforeEach(() => {
    campaignSettings = {};
  });

  it('renders children under the base theme when there is no override', () => {
    renderWithThemes();
    expect(probeText()).toBe(`dark|${BASE_PRIMARY}|${BASE_SECONDARY}`);
  });

  it('applies a primary color override while keeping the rest of the base palette', () => {
    campaignSettings = { theme: { primary: '#ff0000' } };
    renderWithThemes();
    expect(probeText()).toBe(`dark|#ff0000|${BASE_SECONDARY}`);
  });

  it('applies a secondary color override', () => {
    campaignSettings = { theme: { secondary: '#00ff00' } };
    renderWithThemes();
    expect(probeText()).toBe(`dark|${BASE_PRIMARY}|#00ff00`);
  });

  it('applies a light mode override', () => {
    campaignSettings = { theme: { mode: 'light' } };
    renderWithThemes();
    expect(probeText()).toBe(`light|${BASE_PRIMARY}|${BASE_SECONDARY}`);
  });

  it('applies a combined override (mode + both colors)', () => {
    campaignSettings = { theme: { mode: 'light', primary: '#112233', secondary: '#445566' } };
    renderWithThemes();
    expect(probeText()).toBe('light|#112233|#445566');
  });

  it.each([
    ['a non-object value', 'purple'],
    ['a number', 42],
    ['an array', ['#ff0000']],
    ['null', null],
  ])('ignores %s and keeps the base theme', (_label, badValue) => {
    campaignSettings = { theme: badValue };
    renderWithThemes();
    expect(probeText()).toBe(`dark|${BASE_PRIMARY}|${BASE_SECONDARY}`);
  });

  it('drops invalid keys inside an otherwise valid override', () => {
    // 'red' is not #rrggbb and 'blue' is not a valid mode — only the valid
    // secondary should apply.
    campaignSettings = { theme: { primary: 'red', mode: 'blue', secondary: '#abcdef' } };
    renderWithThemes();
    expect(probeText()).toBe(`dark|${BASE_PRIMARY}|#abcdef`);
  });

  it('keeps the base theme when every key in the override is invalid', () => {
    campaignSettings = { theme: { primary: 'red', mode: 'blue' } };
    renderWithThemes();
    expect(probeText()).toBe(`dark|${BASE_PRIMARY}|${BASE_SECONDARY}`);
  });
});
