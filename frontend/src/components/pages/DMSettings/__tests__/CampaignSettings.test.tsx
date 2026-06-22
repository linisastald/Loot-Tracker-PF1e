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
 * The only remaining ad-hoc GET is the static region option list (APL is
 * per-campaign and comes from the campaign context as of Phase 5b).
 */
const defaultRegions = ['Varisia', 'Andoran', 'Cheliax', 'Taldor'];

const buildGetMock = (overrides: Record<string, any> = {}) => {
  const responses: Record<string, any> = {
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

    it('reads per-campaign values from the campaign context and only fetches the region list', async () => {
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
        expect(api.get).toHaveBeenCalledWith('/weather/regions');
      });

      // No legacy per-campaign settings GETs remain — including the old
      // global APL endpoint (APL is in the campaign settings map now)
      const calls = (api.get as any).mock.calls.map((c: any[]) => c[0]);
      expect(calls).not.toContain('/settings/average-party-level');
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
      expect(screen.queryByRole('button', { name: /update level/i })).not.toBeInTheDocument();

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
        expect(screen.getByRole('button', { name: /update level/i })).toBeInTheDocument();
      });
      expect(
        await screen.findByText(/infamy system enabled successfully/i)
      ).toBeInTheDocument();
    });

    it('turns OFF: PUTs value "0" and hides APL controls', async () => {
      campaignContextValue = makeContext({ infamy_system_enabled: '1' });
      renderCampaignSettings();

      expect(screen.getByRole('button', { name: /update level/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('switch', { name: /enable infamy system/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/campaigns/current/settings', {
          name: 'infamy_system_enabled',
          value: '0',
        });
      });
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /update level/i })).not.toBeInTheDocument();
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
      // APL controls only show when infamy is enabled; APL itself is a
      // per-campaign setting (string in the settings map)
      campaignContextValue = makeContext({
        infamy_system_enabled: '1',
        average_party_level: '5',
      });
    });

    it('reads APL from the campaign settings map, not a settings GET', async () => {
      campaignContextValue = makeContext({
        infamy_system_enabled: '1',
        average_party_level: '7',
      });
      renderCampaignSettings();

      await waitFor(() => {
        expect(getInputByLabel(/^Character Level/).value).toBe('7');
      });

      const calls = (api.get as any).mock.calls.map((c: any[]) => c[0]);
      expect(calls).not.toContain('/settings/average-party-level');
    });

    it('falls back to the default APL when the setting is absent from the map', async () => {
      campaignContextValue = makeContext({ infamy_system_enabled: '1' });
      renderCampaignSettings();

      await waitFor(() => {
        expect(getInputByLabel(/^Character Level/).value).toBe('5');
      });
    });

    it('PUTs the per-campaign endpoint with an integer value, refreshes, and skips the legacy endpoint', async () => {
      renderCampaignSettings();

      await waitFor(() => {
        expect(getInputByLabel(/^Character Level/).value).toBe('5');
      });

      fireEvent.change(getInputByLabel(/^Character Level/), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: /update level/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/campaigns/current/settings', {
          name: 'average_party_level',
          value: 10,
        });
      });
      await waitFor(() => {
        expect(refreshMock).toHaveBeenCalled();
      });
      expect(
        await screen.findByText(/character level updated successfully/i)
      ).toBeInTheDocument();

      // The legacy global endpoint is never used for APL
      const legacyPuts = (api.put as any).mock.calls.filter(
        (c: any[]) => c[0] === '/user/update-setting'
      );
      expect(legacyPuts).toHaveLength(0);
    });

    it('surfaces the backend envelope message when the APL save fails', async () => {
      (api.put as any).mockRejectedValue({
        response: { status: 400, data: { success: false, message: 'Value must be an integer' } },
      });

      renderCampaignSettings();

      fireEvent.change(getInputByLabel(/^Character Level/), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: /update level/i }));

      expect(await screen.findByText('Value must be an integer')).toBeInTheDocument();
      expect(refreshMock).not.toHaveBeenCalled();
    });

    it('rejects values outside 1-30 (no PUT, shows error)', async () => {
      renderCampaignSettings();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update level/i })).toBeInTheDocument();
      });

      fireEvent.change(getInputByLabel(/^Character Level/), { target: { value: '31' } });
      fireEvent.click(screen.getByRole('button', { name: /update level/i }));

      expect(
        await screen.findByText(/character level must be a number between 1 and 30/i)
      ).toBeInTheDocument();

      const aplPuts = (api.put as any).mock.calls.filter(
        (c: any[]) => c[1]?.name === 'average_party_level'
      );
      expect(aplPuts).toHaveLength(0);
    });

    it('displays the correct Infamy Check DC (15 + 2*APL)', async () => {
      renderCampaignSettings();

      // APL = 5 from the campaign settings map -> DC = 15 + 10 = 25
      await waitFor(() => {
        expect(screen.getByText(/current infamy check dc/i)).toBeInTheDocument();
      });
      expect(screen.getByText('25')).toBeInTheDocument();

      fireEvent.change(getInputByLabel(/^Character Level/), { target: { value: '10' } });

      await waitFor(() => {
        expect(screen.getByText('35')).toBeInTheDocument();
      });
    });
  });

  describe('level up', () => {
    it('levels up the party after confirming the dialog', async () => {
      (api.post as any).mockResolvedValue({ data: { character_level: 6, apl: 6, character_count: 4, average_party_level: 6, discordSent: true } });
      renderCampaignSettings();

      // Open the confirmation dialog from the Party Level section
      fireEvent.click(screen.getByRole('button', { name: /^level up$/i }));

      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: /^level up$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/campaigns/current/level-up');
      });
      expect(refreshMock).toHaveBeenCalled();
    });

    it('disables Level Up at the maximum level', () => {
      campaignContextValue = makeContext({ average_party_level: '30' });
      renderCampaignSettings();

      expect(screen.getByRole('button', { name: /^level up$/i })).toBeDisabled();
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
