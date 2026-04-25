import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock the api utility
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../../utils/api';
import CampaignSettings from '../CampaignSettings';

/**
 * The api response interceptor returns the body envelope (response.data).
 * The component then accesses `.data.value` on each settings response,
 * so each mocked GET resolves to `{ data: { value: '...' } }`.
 *
 * For `/weather/regions`, the body envelope shape is `{ data: [...] }`,
 * because the component reads `regionsResponse.data` (an array) directly
 * and assigns it to `availableRegions`.
 */
const defaultRegions = ['Varisia', 'Andoran', 'Cheliax', 'Taldor'];

const buildGetMock = (overrides: Record<string, any> = {}) => {
  const responses: Record<string, any> = {
    '/settings/campaign-name': { data: { value: 'Test Campaign' } },
    '/settings/region': { data: { value: 'Varisia' } },
    '/settings/infamy-system': { data: { value: '0' } },
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
      <CampaignSettings />
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
    (api.get as any).mockImplementation(buildGetMock());
    (api.put as any).mockResolvedValue({ data: { success: true } });
    (api.post as any).mockResolvedValue({ data: { success: true } });
  });

  describe('on mount', () => {
    it('calls all required GET endpoints exactly once and populates the form', async () => {
      renderCampaignSettings();

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/settings/campaign-name');
      });
      expect(api.get).toHaveBeenCalledWith('/settings/region');
      expect(api.get).toHaveBeenCalledWith('/settings/infamy-system');
      expect(api.get).toHaveBeenCalledWith('/settings/average-party-level');
      expect(api.get).toHaveBeenCalledWith('/weather/regions');

      // Each of the five endpoints called exactly once
      const calls = (api.get as any).mock.calls.map((c: any[]) => c[0]);
      const expectedEndpoints = [
        '/settings/campaign-name',
        '/settings/region',
        '/settings/infamy-system',
        '/settings/average-party-level',
        '/weather/regions',
      ];
      for (const ep of expectedEndpoints) {
        expect(calls.filter((u: string) => u === ep)).toHaveLength(1);
      }

      // Campaign Name populated from response
      await waitFor(() => {
        expect(getInputByLabel(/^Campaign Name/).value).toBe('Test Campaign');
      });
    });
  });

  describe('Campaign Name update', () => {
    it('PUTs the new value and shows a success alert', async () => {
      renderCampaignSettings();

      await waitFor(() => {
        expect(getInputByLabel(/^Campaign Name/).value).toBe('Test Campaign');
      });

      const input = getInputByLabel(/^Campaign Name/);
      fireEvent.change(input, { target: { value: 'My New Campaign' } });

      const updateBtn = screen.getByRole('button', { name: /update campaign name/i });
      fireEvent.click(updateBtn);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
          name: 'campaign_name',
          value: 'My New Campaign',
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/campaign name updated successfully/i)).toBeInTheDocument();
      });
    });

    it('shows an error alert when name is empty', async () => {
      renderCampaignSettings();

      await waitFor(() => {
        expect(getInputByLabel(/^Campaign Name/).value).toBe('Test Campaign');
      });

      const input = getInputByLabel(/^Campaign Name/);
      fireEvent.change(input, { target: { value: '   ' } });

      fireEvent.click(screen.getByRole('button', { name: /update campaign name/i }));

      await waitFor(() => {
        expect(screen.getByText(/campaign name cannot be empty/i)).toBeInTheDocument();
      });
      expect(api.put).not.toHaveBeenCalled();
    });
  });

  describe('Region update', () => {
    it('PUTs the new region and POSTs to /weather/initialize/<region>', async () => {
      renderCampaignSettings();

      // Wait for regions to populate
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/weather/regions');
      });

      // Open the MUI Select. The combobox lacks an accessible name in this
      // MUI v7 setup, so we query by role only — there is only one combobox.
      const select = await screen.findByRole('combobox');
      fireEvent.mouseDown(select);

      // Choose Andoran from the listbox
      const listbox = await screen.findByRole('listbox');
      fireEvent.click(within(listbox).getByText('Andoran'));

      fireEvent.click(screen.getByRole('button', { name: /update region/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
          name: 'region',
          value: 'Andoran',
        });
      });

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/weather/initialize/Andoran');
      });

      await waitFor(() => {
        expect(
          screen.getByText(/region updated successfully and weather initialized/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Infamy system toggle', () => {
    it('turns ON: PUTs value "1" and reveals APL controls', async () => {
      renderCampaignSettings();

      // Wait for initial load — switch starts unchecked since infamy_system is '0'
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/settings/infamy-system');
      });

      // APL controls hidden initially
      expect(screen.queryByRole('button', { name: /update apl/i })).not.toBeInTheDocument();

      const toggle = screen.getByRole('switch', { name: /enable infamy system/i });
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
          name: 'infamy_system_enabled',
          value: '1',
        });
      });

      // APL controls now visible
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update apl/i })).toBeInTheDocument();
      });
      expect(screen.getByText(/infamy system enabled successfully/i)).toBeInTheDocument();
    });

    it('turns OFF: PUTs value "0" and hides APL controls', async () => {
      // Start with infamy already enabled
      (api.get as any).mockImplementation(
        buildGetMock({
          '/settings/infamy-system': { data: { value: '1' } },
        })
      );

      renderCampaignSettings();

      // APL controls visible because infamy starts on
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update apl/i })).toBeInTheDocument();
      });

      const toggle = screen.getByRole('switch', { name: /enable infamy system/i });
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
          name: 'infamy_system_enabled',
          value: '0',
        });
      });

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /update apl/i })).not.toBeInTheDocument();
      });
      expect(screen.getByText(/infamy system disabled successfully/i)).toBeInTheDocument();
    });
  });

  describe('Average Party Level (APL)', () => {
    beforeEach(() => {
      // APL controls only show when infamy is enabled
      (api.get as any).mockImplementation(
        buildGetMock({
          '/settings/infamy-system': { data: { value: '1' } },
          '/settings/average-party-level': { data: { value: '5' } },
        })
      );
    });

    it('accepts the lower bound (1) and PUTs the new value', async () => {
      renderCampaignSettings();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update apl/i })).toBeInTheDocument();
      });

      const aplInput = getInputByLabel(/^Average Party Level/);
      fireEvent.change(aplInput, { target: { value: '1' } });

      fireEvent.click(screen.getByRole('button', { name: /update apl/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
          name: 'average_party_level',
          value: '1',
        });
      });
      expect(screen.getByText(/average party level updated successfully/i)).toBeInTheDocument();
    });

    it('accepts the upper bound (20) and PUTs the new value', async () => {
      renderCampaignSettings();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update apl/i })).toBeInTheDocument();
      });

      const aplInput = getInputByLabel(/^Average Party Level/);
      fireEvent.change(aplInput, { target: { value: '20' } });

      fireEvent.click(screen.getByRole('button', { name: /update apl/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
          name: 'average_party_level',
          value: '20',
        });
      });
    });

    it('rejects values below 1 (no PUT, shows error)', async () => {
      renderCampaignSettings();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update apl/i })).toBeInTheDocument();
      });

      const aplInput = getInputByLabel(/^Average Party Level/);
      fireEvent.change(aplInput, { target: { value: '0' } });

      fireEvent.click(screen.getByRole('button', { name: /update apl/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/average party level must be a number between 1 and 20/i)
        ).toBeInTheDocument();
      });

      // No /user/update-setting PUT for the APL value
      const aplPuts = (api.put as any).mock.calls.filter(
        (c: any[]) => c[0] === '/user/update-setting' && c[1]?.name === 'average_party_level'
      );
      expect(aplPuts).toHaveLength(0);
    });

    it('rejects values above 20 (no PUT, shows error)', async () => {
      renderCampaignSettings();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update apl/i })).toBeInTheDocument();
      });

      const aplInput = getInputByLabel(/^Average Party Level/);
      fireEvent.change(aplInput, { target: { value: '21' } });

      fireEvent.click(screen.getByRole('button', { name: /update apl/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/average party level must be a number between 1 and 20/i)
        ).toBeInTheDocument();
      });

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

      // Change APL to 10 -> DC = 35
      const aplInput = getInputByLabel(/^Average Party Level/);
      fireEvent.change(aplInput, { target: { value: '10' } });

      await waitFor(() => {
        expect(screen.getByText('35')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('shows error alert when a PUT fails (campaign name)', async () => {
      (api.put as any).mockRejectedValueOnce(new Error('Network error'));

      renderCampaignSettings();

      await waitFor(() => {
        expect(getInputByLabel(/^Campaign Name/).value).toBe('Test Campaign');
      });

      fireEvent.change(getInputByLabel(/^Campaign Name/), {
        target: { value: 'New Name' },
      });

      fireEvent.click(screen.getByRole('button', { name: /update campaign name/i }));

      await waitFor(() => {
        expect(screen.getByText(/error updating campaign name/i)).toBeInTheDocument();
      });
    });

    it('shows error alert when initial fetch fails', async () => {
      (api.get as any).mockRejectedValue(new Error('Boom'));

      renderCampaignSettings();

      await waitFor(() => {
        expect(
          screen.getByText(/error loading settings/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('rapid toggling', () => {
    it('does not spam GETs on the mount cycle when toggle is flipped multiple times', async () => {
      renderCampaignSettings();

      // Wait for initial settings fetches
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/settings/infamy-system');
      });

      const initialGetCount = (api.get as any).mock.calls.length;

      const toggle = screen.getByRole('switch', { name: /enable infamy system/i });
      fireEvent.click(toggle); // on
      fireEvent.click(toggle); // off
      fireEvent.click(toggle); // on

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledTimes(3);
      });

      // No additional GET calls were triggered by the toggle flips
      expect((api.get as any).mock.calls.length).toBe(initialGetCount);
    });
  });
});
