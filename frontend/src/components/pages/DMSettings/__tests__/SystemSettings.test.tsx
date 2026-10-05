import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import React from 'react';

// Mock the api utility (note depth: this test lives one level deeper than UserSettings.test.tsx)
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Control the campaign context directly (Phase 4c: discord channel/role/enabled,
// campaign timezone, and auto-appraisal are per-campaign settings)
const refreshMock = vi.fn().mockResolvedValue(undefined);
let campaignContextValue: any;

const makeContext = (settings: Record<string, unknown> = {}, isSuperadmin = false) => ({
  campaigns: [
    { id: 1, name: 'Rise of the Runelords', slug: 'rotrl', role: 'DM' as const },
  ],
  currentCampaign: { id: 1, name: 'Rise of the Runelords', slug: 'rotrl' },
  campaignRole: 'DM' as const,
  isSuperadmin,
  campaignSettings: {
    discord_channel_id: '',
    campaign_role_id: '',
    discord_integration_enabled: '0',
    auto_appraisal_enabled: '1',
    campaign_timezone: 'America/New_York',
    default_quantity_enabled: '0',
    default_browser_quantity: '1',
    auto_split_stacks_enabled: '0',
    ...settings,
  },
  loading: false,
  switchCampaign: vi.fn(),
  refresh: refreshMock,
});

vi.mock('../../../../contexts/CampaignContext', () => ({
  useCampaign: () => campaignContextValue,
}));

// Mock the useCampaignTimezone hook so we don't pull the timezone util's caching logic
vi.mock('../../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({
    timezone: 'America/New_York',
    loading: false,
    error: null,
  }),
}));

// Mock timezoneUtils to keep date formatting deterministic
vi.mock('../../../../utils/timezoneUtils', () => ({
  formatInCampaignTimezone: (date: string | Date) => `formatted:${date}`,
  fetchCampaignTimezone: vi.fn().mockResolvedValue('America/New_York'),
}));

// CampaignThemeSettings needs CampaignContext (tested on its own); stub it out
vi.mock('../CampaignThemeSettings', () => ({
  default: () => <div data-testid="campaign-theme-settings" />,
}));

import api from '../../../../utils/api';
import SystemSettings from '../SystemSettings';

// /settings/discord only reports whether the (global) bot token is set; the
// channel/role/enabled values are per-campaign and come from the context.
// The token itself is never returned by the server.
const defaultDiscordResponse = {
  data: {
    discord_bot_token_set: false,
  },
};
const SAVED_TOKEN_RESPONSE = { data: { discord_bot_token_set: true } };

const defaultOpenAiResponse = {
  data: { hasKey: false },
};

const defaultTimezoneOptionsResponse = {
  data: {
    options: [
      { value: 'America/New_York', label: 'Eastern (New York)' },
      { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
      { value: 'Europe/London', label: 'London' },
    ],
  },
};

// Build a get-mock that responds to all startup endpoints, with optional overrides
const makeGetMock = (opts: {
  discord?: any;
  openai?: any;
  timezoneOptions?: any;
} = {}) => {
  const discord = opts.discord ?? defaultDiscordResponse;
  const openai = opts.openai ?? defaultOpenAiResponse;
  const timezoneOptions = opts.timezoneOptions ?? defaultTimezoneOptionsResponse;

  return vi.fn().mockImplementation((url: string) => {
    if (url === '/settings/discord') return Promise.resolve(discord);
    if (url === '/settings/openai-key') return Promise.resolve(openai);
    if (url === '/settings/timezone-options') return Promise.resolve(timezoneOptions);
    return Promise.resolve({ data: {} });
  });
};

const renderSystemSettings = () =>
  render(
    <BrowserRouter>
      <SnackbarProvider maxSnack={3}>
        <SystemSettings />
      </SnackbarProvider>
    </BrowserRouter>,
  );

// Ensure ResizeObserver is a real constructor (MUI Select calls `new ResizeObserver(...)`
// and then `observer.observe(...)`; the global vi.fn() in setupTests can lose its return
// value through `new`, leaving observer without an `.observe` method).
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as any).ResizeObserver = MockResizeObserver;

describe('SystemSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ResizeObserver = MockResizeObserver;
    campaignContextValue = makeContext();
    (api.get as any).mockImplementation(makeGetMock());
    (api.put as any).mockResolvedValue({ data: { success: true } });
    (api.post as any).mockResolvedValue({ data: { success: true } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Loading spinner
  // -----------------------------------------------------------------------
  it('shows a loading spinner while initial fetch is in flight', async () => {
    // Use a get mock that never resolves so the loading state remains
    (api.get as any).mockImplementation(() => new Promise(() => {}));

    renderSystemSettings();

    expect(screen.getByText(/Loading settings/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 2. Moved/removed controls (Phase 5a)
  // -----------------------------------------------------------------------
  it('no longer renders the registration mode dropdown (moved to System Admin)', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByText(/System Settings/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Registration Settings/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Registration/i })).not.toBeInTheDocument();
  });

  it('no longer renders the dead global Interface Theme toggle', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByText(/System Settings/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Interface Theme/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Dark Mode/i)).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 5. Discord settings save - only changed fields PUT (per-campaign endpoint)
  // -----------------------------------------------------------------------
  it('reads the per-campaign Discord values from the campaign context', async () => {
    campaignContextValue = makeContext({
      discord_channel_id: 'chan-from-context',
      campaign_role_id: 'role-from-context',
      discord_integration_enabled: '1',
    });

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Channel ID/i)).toHaveValue('chan-from-context');
    });
    expect(screen.getByLabelText(/Campaign Role ID/i)).toHaveValue('role-from-context');
    expect(screen.getByLabelText(/Enable Discord Integration/i)).toBeChecked();
  });

  it('shows the campaign name on the Discord card to make the scope unmistakable', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/Channel, role, and enable flag apply only to "Rise of the Runelords"/i)
      ).toBeInTheDocument();
    });
  });

  it('only PUTs Discord fields whose values changed, to the per-campaign endpoint, and refreshes', async () => {
    campaignContextValue = makeContext({
      discord_channel_id: 'chan-old',
      campaign_role_id: 'role-old',
      discord_integration_enabled: '0',
    });
    (api.get as any).mockImplementation(
      makeGetMock({
        discord: SAVED_TOKEN_RESPONSE,
        openai: { data: { hasKey: true } },
      }),
    );

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Channel ID/i)).toHaveValue('chan-old');
    });

    // Change ONLY the channel ID
    const channelInput = screen.getByLabelText(/Channel ID/i) as HTMLInputElement;
    fireEvent.change(channelInput, { target: { value: 'chan-new' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Discord Settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/Discord settings updated successfully/i)).toBeInTheDocument();
    });

    // Exactly one PUT — for discord_channel_id — and it hits the campaign endpoint
    const putCalls = (api.put as any).mock.calls;
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0][0]).toBe('/campaigns/current/settings');
    expect(putCalls[0][1]).toEqual({
      name: 'discord_channel_id',
      value: 'chan-new',
    });

    // The campaign context is refreshed so other consumers see the new value
    expect(refreshMock).toHaveBeenCalled();
  });

  it('PUTs the enabled flag as "1" to the per-campaign endpoint when toggled on', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Enable Discord Integration/i)).toBeInTheDocument();
    });

    const enabledSwitch = screen.getByLabelText(/Enable Discord Integration/i) as HTMLInputElement;
    fireEvent.click(enabledSwitch);

    fireEvent.click(screen.getByRole('button', { name: /Save Discord Settings/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/campaigns/current/settings', {
        name: 'discord_integration_enabled',
        value: '1',
      });
    });
  });

  it('never sends the (global) bot token to the per-campaign endpoint', async () => {
    campaignContextValue = makeContext({}, true);
    (api.get as any).mockImplementation(
      makeGetMock({ discord: SAVED_TOKEN_RESPONSE }),
    );

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Bot Token/i)).toBeInTheDocument();
    });

    // Change a per-campaign field so the save actually writes something
    fireEvent.change(screen.getByLabelText(/Channel ID/i), { target: { value: 'chan-z' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Discord Settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/Discord settings updated successfully/i)).toBeInTheDocument();
    });

    const campaignPuts = (api.put as any).mock.calls.filter(
      ([url]: any[]) => url === '/campaigns/current/settings',
    );
    expect(
      campaignPuts.filter(([, body]: any[]) => body?.name === 'discord_bot_token'),
    ).toHaveLength(0);
    // And the token itself was not re-sent anywhere (unchanged/masked)
    const tokenPuts = (api.put as any).mock.calls.filter(
      ([, body]: any[]) => body?.name === 'discord_bot_token',
    );
    expect(tokenPuts).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 5b. Bot token: placeholder mode, typed token saved, field reset (Phase 5b)
  // -----------------------------------------------------------------------
  it('keeps the bot token field empty with a placeholder when a token exists server-side', async () => {
    campaignContextValue = makeContext({}, true);
    (api.get as any).mockImplementation(
      makeGetMock({ discord: SAVED_TOKEN_RESPONSE }),
    );

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Bot Token/i)).toBeInTheDocument();
    });

    const tokenInput = screen.getByLabelText(/Bot Token/i) as HTMLInputElement;
    // The saved token is never echoed back into the field
    expect(tokenInput).toHaveValue('');
    expect(tokenInput).toHaveAttribute('placeholder', 'Token saved — type to replace');
  });

  it('saves a typed bot token via the global endpoint and resets the field to placeholder mode', async () => {
    campaignContextValue = makeContext({}, true);
    (api.get as any).mockImplementation(
      makeGetMock({ discord: SAVED_TOKEN_RESPONSE }),
    );

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Bot Token/i)).toBeInTheDocument();
    });

    const tokenInput = screen.getByLabelText(/Bot Token/i) as HTMLInputElement;
    fireEvent.change(tokenInput, { target: { value: 'brand-new-token' } });
    // The user's raw input is preserved (no masking effect clobbers it)
    expect(tokenInput).toHaveValue('brand-new-token');

    fireEvent.click(screen.getByRole('button', { name: /Save Discord Settings/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
        name: 'discord_bot_token',
        value: 'brand-new-token',
      });
    });

    // After a successful save the field returns to placeholder mode
    await waitFor(() => {
      expect(tokenInput).toHaveValue('');
    });
    expect(tokenInput).toHaveAttribute('placeholder', 'Token saved — type to replace');
  });

  it('does not send a token write when the bot token field is left untouched', async () => {
    campaignContextValue = makeContext({}, true);
    (api.get as any).mockImplementation(
      makeGetMock({ discord: SAVED_TOKEN_RESPONSE }),
    );

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Bot Token/i)).toBeInTheDocument();
    });

    // Save without touching the token field at all
    fireEvent.click(screen.getByRole('button', { name: /Save Discord Settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/Discord settings updated successfully/i)).toBeInTheDocument();
    });

    const tokenPuts = (api.put as any).mock.calls.filter(
      ([, body]: any[]) => body?.name === 'discord_bot_token',
    );
    expect(tokenPuts).toHaveLength(0);
  });

  it('shows the plain placeholder when no token exists server-side yet', async () => {
    campaignContextValue = makeContext({}, true);
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Bot Token/i)).toBeInTheDocument();
    });

    const tokenInput = screen.getByLabelText(/Bot Token/i) as HTMLInputElement;
    expect(tokenInput).toHaveValue('');
    expect(tokenInput).toHaveAttribute('placeholder', 'Enter Discord Bot Token');
  });

  it('surfaces the backend envelope message when a Discord save fails', async () => {
    (api.put as any).mockRejectedValue({
      response: { status: 400, data: { success: false, message: 'Unknown setting name' } },
    });

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Channel ID/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Channel ID/i), { target: { value: 'chan-x' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Discord Settings/i }));

    expect(await screen.findByText('Unknown setting name')).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 6. General settings save
  // -----------------------------------------------------------------------
  it('saves general settings entirely through the per-campaign endpoint, never the global one', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save General Settings/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Save General Settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/General settings updated successfully/i)).toBeInTheDocument();
    });

    const globalPuts = (api.put as any).mock.calls.filter(([url]: any[]) => url === '/user/update-setting');
    expect(globalPuts).toHaveLength(0);

    const campaignPuts = (api.put as any).mock.calls
      .filter(([url]: any[]) => url === '/campaigns/current/settings')
      .map(([, body]: any[]) => body);
    expect(campaignPuts).toEqual(
      expect.arrayContaining([
        { name: 'default_quantity_enabled', value: '0' },
        { name: 'auto_split_stacks_enabled', value: '0' },
        { name: 'auto_appraisal_enabled', value: '1' },
      ]),
    );
    // default_browser_quantity should NOT be PUT because default_quantity_enabled is false
    expect(campaignPuts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'default_browser_quantity' })]),
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it('never fetches the global settings listing (secrets) and works for a plain campaign DM', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save General Settings/i })).toBeInTheDocument();
    });

    const getUrls = (api.get as any).mock.calls.map(([url]: any[]) => url);
    expect(getUrls).not.toContain('/user/settings');
    // A non-superadmin DM does not see (or fetch) the global secrets
    expect(getUrls).not.toContain('/settings/discord');
    expect(getUrls).not.toContain('/settings/openai-key');
    expect(screen.queryByLabelText(/Bot Token/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/OpenAI API Key/i)).not.toBeInTheDocument();
    // The per-campaign Discord fields remain available to the DM
    expect(screen.getByLabelText(/Channel ID/i)).toBeInTheDocument();
  });

  it('reads the item-entry defaults from the campaign settings map', async () => {
    campaignContextValue = makeContext({
      default_quantity_enabled: '1',
      default_browser_quantity: '7',
      auto_split_stacks_enabled: '1',
    });

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Enable Default Quantity/i)).toBeChecked();
    });
    expect(screen.getByRole('spinbutton', { name: /Default Quantity/i })).toHaveValue(7);
    expect(screen.getByLabelText(/Auto-Split Stacks/i)).toBeChecked();
  });

  it('reads auto-appraisal from the campaign settings map', async () => {
    campaignContextValue = makeContext({ auto_appraisal_enabled: '0' });

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Auto-Appraisal/i)).not.toBeChecked();
    });
  });

  it('PUTs default_browser_quantity to the per-campaign endpoint when enabled and > 0', async () => {
    campaignContextValue = makeContext({
      default_quantity_enabled: '1',
      default_browser_quantity: '5',
    });

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save General Settings/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Save General Settings/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/campaigns/current/settings', {
        name: 'default_browser_quantity',
        value: '5',
      });
    });
  });

  // -----------------------------------------------------------------------
  // 7. Timezone save
  // -----------------------------------------------------------------------
  it('disables the timezone Save button when selection equals current timezone', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Timezone/i })).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /Save Timezone/i });
    expect(saveBtn).toBeDisabled();
  });

  it('reads the current timezone from the campaign settings map and titles the card with the campaign name', async () => {
    campaignContextValue = makeContext({ campaign_timezone: 'Europe/London' });

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByText(/Campaign Timezone — Rise of the Runelords/i)).toBeInTheDocument();
    });
    // Current timezone box (and the select) show the option label for the context value
    expect(screen.getAllByText('London').length).toBeGreaterThan(0);
  });

  it('PUTs the campaign timezone to the per-campaign endpoint, refreshes, and shows success', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /Timezone/i })).toBeInTheDocument();
    });

    // Open the MUI Select
    const select = screen.getByRole('combobox', { name: /Timezone/i });
    fireEvent.mouseDown(select);

    // Pick a different option from the popup listbox
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText('London'));

    const saveBtn = screen.getByRole('button', { name: /Save Timezone/i });
    await waitFor(() => expect(saveBtn).not.toBeDisabled());

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/campaigns/current/settings', {
        name: 'campaign_timezone',
        value: 'Europe/London',
      });
      expect(screen.getByText(/Campaign timezone updated successfully/i)).toBeInTheDocument();
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 8. OpenAI key: superadmin-only, write-only
  // -----------------------------------------------------------------------
  it('shows the OpenAI key as an empty write-only input with a saved placeholder', async () => {
    campaignContextValue = makeContext({}, true);
    (api.get as any).mockImplementation(makeGetMock({ openai: { data: { hasKey: true } } }));

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/OpenAI API Key/i)).toBeInTheDocument();
    });
    const input = screen.getByLabelText(/OpenAI API Key/i) as HTMLInputElement;
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', 'Key saved — type to replace');
  });

  it('does not write the OpenAI key when the field is left empty, and writes it when typed', async () => {
    campaignContextValue = makeContext({}, true);
    (api.get as any).mockImplementation(makeGetMock({ openai: { data: { hasKey: true } } }));

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/OpenAI API Key/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Save Discord Settings/i }));
    await waitFor(() => {
      expect(screen.getByText(/Discord settings updated successfully/i)).toBeInTheDocument();
    });
    expect(
      (api.put as any).mock.calls.filter(([, body]: any[]) => body?.name === 'openai_key'),
    ).toHaveLength(0);

    const input = screen.getByLabelText(/OpenAI API Key/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-new-key' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Discord Settings/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
        name: 'openai_key',
        value: 'sk-new-key',
      });
    });
    await waitFor(() => expect(input).toHaveValue(''));
  });

  // -----------------------------------------------------------------------
  // 9. Database backup / restore card was removed (endpoints never existed)
  // -----------------------------------------------------------------------
  it('does not render the Database Backup & Restore card', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByText(/System Settings/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Database Backup/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Backup Database/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Restore$/i })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 10. Test data generation - hostname-gated
  // -----------------------------------------------------------------------
  it('does not show the Test Data Generation card when not on the test host', async () => {
    // The default jsdom hostname is 'localhost', not 'test.kempsonandko.com',
    // so the card should be hidden. (Stubbing window.location.hostname in jsdom
    // is brittle, so we only assert the default-host behavior here.)
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByText(/System Settings/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Test Data Generation/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generate Test Data/i })).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 11. Error case
  // -----------------------------------------------------------------------
  it('shows an error alert when the initial fetch rejects', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/settings/timezone-options') {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve({ data: {} });
    });

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByText(/Error loading settings data/i)).toBeInTheDocument();
    });

    errSpy.mockRestore();
  });
});
