import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import React from 'react';

// Mock the api utility
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Control the campaign context directly (Phase 4c: per-campaign settings are
// read from useCampaign().campaignSettings, not fetched ad hoc)
const refreshMock = vi.fn().mockResolvedValue(undefined);
let campaignContextValue: any;

const makeContext = (settings: Record<string, unknown> = {}) => ({
  campaigns: [
    { id: 1, name: 'Rise of the Runelords', slug: 'rotrl', role: 'DM' as const },
  ],
  currentCampaign: { id: 1, name: 'Rise of the Runelords', slug: 'rotrl' },
  campaignRole: 'DM' as const,
  isSuperadmin: false,
  campaignSettings: { region: 'Varisia', infamy_system_enabled: '0', ...settings },
  loading: false,
  switchCampaign: vi.fn(),
  refresh: refreshMock,
});

vi.mock('../../../../contexts/CampaignContext', () => ({
  useCampaign: () => campaignContextValue,
}));

import api from '../../../../utils/api';
import CampaignSettings from '../CampaignSettings';

// MUI Select needs a working ResizeObserver constructor
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as any).ResizeObserver = MockResizeObserver;

/**
 * The api response interceptor returns the body envelope (response.data).
 * The remaining ad-hoc GETs are the (global) average party level and the
 * static region option list.
 */
const defaultRegions = ['Varisia', 'Andoran', 'Cheliax', 'Taldor'];

const buildGetMock = (overrides: Record<string, any> = {}) => {
  const responses: Record<string, any> = {
    '/settings/average-party-level': { data: { value: '5' } },
    '/weather/regions': { data: defaultRegions },
    ...overrides,
  };

  return (url: string) => {
    if (url in responses) {
      return Promise.resolve(responses[url]);
    }
    return Promise.resolve({ data: null });
  };
};

const renderCampaignSettings = () => {
  return render(
    <BrowserRouter>
      <SnackbarProvider maxSnack={3}>
        <CampaignSettings />
      </SnackbarProvider>
    </BrowserRouter>
  );
};

/**
 * Helper to find an input by its associated label text.
 * MUI labels have a `for` attribute pointing to the input id.
 */
const getInputByLabel = (labelPattern: RegExp): HTMLInputElement => {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find((l) => labelPattern.test(l.textContent || ''));
  if (!label) throw new Error(`Could not find label matching ${labelPattern}`);
  const inputId = label.getAttribute('for');
  if (!inputId) throw new Error(`Label has no 'for' attribute`);
  const input = document.getElementById(inputId) as HTMLInputElement;
  if (!input) throw new Error(`Could not find input with id '${inputId}'`);
  return input;
};

describe('CampaignSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignContextValue = makeContext();
    (api.get as any).mockImplementation(buildGetMock());
    (api.put as any).mockResolvedValue({ data: { success: true } });
    (api.post as any).mockResolvedValue({ data: { success: true } });
    (api.patch as any).mockResolvedValue({ data: { success: true } });
  });

  describe('on mount', () => {
    it('shows the campaign name in the section header', () => {
      renderCampaignSettings();
      expect(
        screen.getByText('Campaign Settings — Rise of the Runelords')
      ).toBeInTheDocument();
      expect(
        screen.getByText(/apply only to the current campaign/i)
      ).toBeInTheDocument();
    });

    it('reads per-campaign values from the campaign context and only fetches APL + regions', async () => {
      campaignContextValue = makeContext({ region: 'Cheliax', infamy_system_enabled: '1' });
      renderCampaignSettings();

      // Campaign name comes from currentCampaign, not a settings GET
      expect(getInputByLabel(/^Campaign Name/).value).toBe('Rise of the Runelords');

      // Region select reflects campaignSettings.region (renders once the
      // region option list has loaded)
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toHaveTextContent('Cheliax');
      });

      // Infamy toggle reflects campaignSettings.infamy_system_enabled === '1'
      expect(
        screen.getByRole('switch', { name: /enable infamy system/i })
      ).toBeChecked();

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/settings/average-party-level');
      });
      expect(api.get).toHaveBeenCalledWith('/weather/regions');

      // No legacy per-campaign settings GETs remain
      const calls = (api.get as any).mock.calls.map((c: any[]) => c[0]);
      expect(calls).not.toContain('/settings/campaign-name');
      expect(calls).not.toContain('/settings/region');
      expect(calls).not.toContain('/settings/infamy-system');
    });
  });

  describe('Campaign Name update (rename)', () => {
    it('PATCHes /campaigns/current, refreshes the context, and shows a success snackbar', async () => {
      renderCampaignSettings();

      const input = getInputByLabel(/^Campaign Name/);
      fireEvent.change(input, { target: { value: 'My New Campaign' } });

      fireEvent.click(screen.getByRole('button', { name: /update campaign name/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith('/campaigns/current', {
          name: 'My New Campaign',
        });
      });
      await waitFor(() => {
        expect(refreshMock).toHaveBeenCalled();
      });
      expect(
        await screen.findByText(/campaign name updated successfully/i)
      ).toBeInTheDocument();
      // The rename does NOT go through the legacy settings endpoint
      expect(api.put).not.toHaveBeenCalled();
    });

    it('shows an error when name is empty and does not call the API', async () => {
      renderCampaignSettings();

      fireEvent.change(getInputByLabel(/^Campaign Name/), { target: { value: '   ' } });
      fireEvent.click(screen.getByRole('button', { name: /update campaign name/i }));

      expect(
        await screen.findByText(/campaign name cannot be empty/i)
      ).toBeInTheDocument();
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('surfaces the backend envelope message when the rename fails', async () => {
      (api.patch as any).mockRejectedValue({
        response: { status: 403, data: { success: false, message: 'DM role required' } },
      });

      renderCampaignSettings();

      fireEvent.change(getInputByLabel(/^Campaign Name/), { target: { value: 'New Name' } });
      fireEvent.click(screen.getByRole('button', { name: /update campaign name/i }));

      expect(await screen.findByText('DM role required')).toBeInTheDocument();
      expect(refreshMock).not.toHaveBeenCalled();
    });
  });

  describe('Region update', () => {
    it('PUTs the per-campaign setting, initializes weather, and refreshes', async () => {
      renderCampaignSettings();

      // Wait for the region options to populate
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/weather/regions');
      });

      const select = await screen.findByRole('combobox');
      fireEvent.mouseDown(select);

      const listbox = await screen.findByRole('listbox');
      fireEvent.click(within(listbox).getByText('Andoran'));

      fireEvent.click(screen.getByRole('button', { name: /update region/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/campaigns/current/settings', {
          name: 'region',
          value: 'Andoran',
        });
      });
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/weather/initialize/Andoran');
      });
      await waitFor(() => {
        expect(refreshMock).toHaveBeenCalled();
      });
      expect(
        await screen.findByText(/region updated successfully and weather initialized/i)
      ).toBeInTheDocument();
    });
  });

  describe('Infamy system toggle', () => {
    it('turns ON: PUTs value "1" to the campaign endpoint, refreshes, reveals APL controls', async () => {
      renderCampaignSettings();

      // APL controls hidden initially (infamy_system_enabled === '0')
      expect(screen.queryByRole('button', { name: /update apl/i })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('switch', { name: /enable infamy system/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/campaigns/current/settings', {
          name: 'infamy_system_enabled',
          value: '1',
        });
      });
      await waitFor(() => {
        expect(refreshMock).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update apl/i })).toBeInTheDocument();
      });
      expect(
        await screen.findByText(/infamy system enabled successfully/i)
      ).toBeInTheDocument();
    });

    it('turns OFF: PUTs value "0" and hides APL controls', async () => {
      campaignContextValue = makeContext({ infamy_system_enabled: '1' });
      renderCampaignSettings();

      expect(screen.getByRole('button', { name: /update apl/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('switch', { name: /enable infamy system/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/campaigns/current/settings', {
          name: 'infamy_system_enabled',
          value: '0',
        });
      });
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /update apl/i })).not.toBeInTheDocument();
      });
      expect(
        await screen.findByText(/infamy system disabled successfully/i)
      ).toBeInTheDocument();
    });

    it('reverts the toggle and surfaces the envelope message when the PUT fails', async () => {
      (api.put as any).mockRejectedValue({
        response: { status: 400, data: { success: false, message: 'Unknown setting' } },
      });

      renderCampaignSettings();

      const toggle = screen.getByRole('switch', { name: /enable infamy system/i });
      fireEvent.click(toggle);

      expect(await screen.findByText('Unknown setting')).toBeInTheDocument();
      // Optimistic flip rolled back
      await waitFor(() => {
        expect(toggle).not.toBeChecked();
      });
      expect(refreshMock).not.toHaveBeenCalled();
    });
  });

  describe('Average Party Level (APL)', () => {
    beforeEach(() => {
      // APL controls only show when infamy is enabled
      campaignContextValue = makeContext({ infamy_system_enabled: '1' });
    });

    it('still PUTs through the legacy endpoint (APL is not campaign-scoped yet)', async () => {
      renderCampaignSettings();

      await waitFor(() => {
        expect(getInputByLabel(/^Average Party Level/).value).toBe('5');
      });

      fireEvent.change(getInputByLabel(/^Average Party Level/), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: /update apl/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
          name: 'average_party_level',
          value: '10',
        });
      });
      expect(
        await screen.findByText(/average party level updated successfully/i)
      ).toBeInTheDocument();
    });

    it('rejects values outside 1-20 (no PUT, shows error)', async () => {
      renderCampaignSettings();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update apl/i })).toBeInTheDocument();
      });

      fireEvent.change(getInputByLabel(/^Average Party Level/), { target: { value: '21' } });
      fireEvent.click(screen.getByRole('button', { name: /update apl/i }));

      expect(
        await screen.findByText(/average party level must be a number between 1 and 20/i)
      ).toBeInTheDocument();

      const aplPuts = (api.put as any).mock.calls.filter(
        (c: any[]) => c[0] === '/user/update-setting' && c[1]?.name === 'average_party_level'
      );
      expect(aplPuts).toHaveLength(0);
    });

    it('displays the correct Infamy Check DC (15 + 2*APL)', async () => {
      renderCampaignSettings();

      // APL = 5 from initial fetch -> DC = 15 + 10 = 25
      await waitFor(() => {
        expect(screen.getByText(/current infamy check dc/i)).toBeInTheDocument();
      });
      expect(screen.getByText('25')).toBeInTheDocument();

      fireEvent.change(getInputByLabel(/^Average Party Level/), { target: { value: '10' } });

      await waitFor(() => {
        expect(screen.getByText('35')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('shows an error snackbar when the initial fetch fails', async () => {
      (api.get as any).mockRejectedValue(new Error('Boom'));

      renderCampaignSettings();

      expect(await screen.findByText(/error loading settings/i)).toBeInTheDocument();
    });
  });
});
