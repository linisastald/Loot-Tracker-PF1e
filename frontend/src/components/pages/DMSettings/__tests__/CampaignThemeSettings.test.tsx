import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { SnackbarProvider } from 'notistack';

// Mock the api utility (4 levels up from DMSettings/__tests__/)
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Control the campaign context directly
const refreshMock = vi.fn().mockResolvedValue(undefined);
let campaignContextValue: any;

const makeContext = (settings: Record<string, unknown> = {}) => ({
  campaigns: [
    { id: 1, name: 'Rise of the Runelords', slug: 'rotrl', role: 'DM' as const },
  ],
  currentCampaign: { id: 1, name: 'Rise of the Runelords', slug: 'rotrl' },
  campaignRole: 'DM' as const,
  isSuperadmin: false,
  campaignSettings: settings,
  loading: false,
  switchCampaign: vi.fn(),
  refresh: refreshMock,
});

vi.mock('../../../../contexts/CampaignContext', () => ({
  useCampaign: () => campaignContextValue,
}));

import api from '../../../../utils/api';
import CampaignThemeSettings from '../CampaignThemeSettings';

// MUI Select needs a working ResizeObserver constructor
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as any).ResizeObserver = MockResizeObserver;

const renderCard = () =>
  render(
    <SnackbarProvider maxSnack={3}>
      <CampaignThemeSettings />
    </SnackbarProvider>
  );

const selectMode = (label: RegExp) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /mode/i }));
  fireEvent.click(within(screen.getByRole('listbox')).getByText(label));
};

describe('CampaignThemeSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignContextValue = makeContext();
    (api.put as any).mockResolvedValue({ success: true, data: {} });
  });

  describe('rendering', () => {
    it('labels the card with the campaign name', () => {
      renderCard();
      expect(screen.getByText('Campaign Theme')).toBeInTheDocument();
      expect(screen.getByText('Applies only to "Rise of the Runelords"')).toBeInTheDocument();
    });

    it('shows the base theme values as placeholders when no override is set', () => {
      renderCard();
      expect(screen.getByLabelText('Primary color')).toHaveValue('');
      expect(screen.getByLabelText('Primary color')).toHaveAttribute('placeholder', '#5c8db8');
      expect(screen.getByLabelText('Secondary color')).toHaveAttribute('placeholder', '#c77a9e');
      expect(screen.getByRole('combobox', { name: /mode/i })).toHaveTextContent('Default (Dark)');
    });

    it('pre-fills the controls from a stored override', () => {
      campaignContextValue = makeContext({
        theme: { mode: 'light', primary: '#aabbcc' },
      });
      renderCard();
      expect(screen.getByLabelText('Primary color')).toHaveValue('#aabbcc');
      expect(screen.getByLabelText('Secondary color')).toHaveValue('');
      expect(screen.getByRole('combobox', { name: /mode/i })).toHaveTextContent('Light');
    });

    it('renders the live preview swatch row', () => {
      renderCard();
      expect(screen.getByText('Preview')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument();
    });
  });

  describe('saving', () => {
    it('PUTs only the keys the DM actually set, refreshes, and shows a snackbar', async () => {
      renderCard();

      selectMode(/^Light$/);
      fireEvent.change(screen.getByLabelText('Primary color'), {
        target: { value: '#112233' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save Theme' }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/campaigns/current/settings', {
          name: 'theme',
          value: { mode: 'light', primary: '#112233' },
        });
      });
      await waitFor(() => {
        expect(refreshMock).toHaveBeenCalled();
      });
      expect(await screen.findByText('Campaign theme saved')).toBeInTheDocument();
    });

    it('PUTs value null when the DM saved with everything back at default', async () => {
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Save Theme' }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/campaigns/current/settings', {
          name: 'theme',
          value: null,
        });
      });
    });

    it('blocks saving while a color is not valid #rrggbb hex', () => {
      renderCard();
      fireEvent.change(screen.getByLabelText('Primary color'), {
        target: { value: 'red' },
      });
      expect(screen.getByText('Use #rrggbb hex format')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save Theme' })).toBeDisabled();
      expect(api.put).not.toHaveBeenCalled();
    });

    it('surfaces the backend envelope message on error', async () => {
      (api.put as any).mockRejectedValue({
        response: { status: 400, data: { success: false, message: 'theme.primary must be #rrggbb' } },
      });

      renderCard();
      fireEvent.change(screen.getByLabelText('Primary color'), {
        target: { value: '#112233' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save Theme' }));

      expect(await screen.findByText('theme.primary must be #rrggbb')).toBeInTheDocument();
      expect(refreshMock).not.toHaveBeenCalled();
    });

    it('shows a generic message when the error has no envelope', async () => {
      (api.put as any).mockRejectedValue(new Error('network down'));

      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Save Theme' }));

      expect(await screen.findByText('Failed to update campaign theme')).toBeInTheDocument();
    });
  });

  describe('reset', () => {
    it('PUTs value null, clears the form, refreshes, and shows a snackbar', async () => {
      campaignContextValue = makeContext({
        theme: { mode: 'light', primary: '#aabbcc' },
      });
      renderCard();
      expect(screen.getByLabelText('Primary color')).toHaveValue('#aabbcc');

      fireEvent.click(screen.getByRole('button', { name: 'Reset to Default' }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/campaigns/current/settings', {
          name: 'theme',
          value: null,
        });
      });
      await waitFor(() => {
        expect(refreshMock).toHaveBeenCalled();
      });
      expect(await screen.findByText('Campaign theme reset to default')).toBeInTheDocument();
      expect(screen.getByLabelText('Primary color')).toHaveValue('');
    });

    it('surfaces errors on reset too', async () => {
      (api.put as any).mockRejectedValue({
        response: { status: 403, data: { success: false, message: 'DM role required' } },
      });

      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Reset to Default' }));

      expect(await screen.findByText('DM role required')).toBeInTheDocument();
    });
  });
});
