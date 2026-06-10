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

const makeContext = (settings: Record<string, unknown> = {}) => ({
  campaigns: [
    { id: 1, name: 'Rise of the Runelords', slug: 'rotrl', role: 'DM' as const },
  ],
  currentCampaign: { id: 1, name: 'Rise of the Runelords', slug: 'rotrl' },
  campaignRole: 'DM' as const,
  isSuperadmin: false,
  campaignSettings: {
    discord_channel_id: '',
    campaign_role_id: '',
    discord_integration_enabled: '0',
    auto_appraisal_enabled: '1',
    campaign_timezone: 'America/New_York',
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

// ----- Default fixture data ---------------------------------------------------
const buildSettingsList = (overrides: Partial<Record<string, string>> = {}) => {
  const base: Record<string, string> = {
    registration_mode: 'closed',
    theme: 'dark',
    default_browser_quantity: '1',
    default_quantity_enabled: '0',
    auto_appraisal_enabled: '1',
    auto_split_stacks_enabled: '0',
    ...overrides,
  };
  return Object.entries(base).map(([name, value]) => ({ name, value }));
};

// Only the (global) bot token is still served by /settings/discord; the
// channel/role/enabled values are per-campaign and come from the context.
const defaultDiscordResponse = {
  data: {
    discord_bot_token: '',
  },
};

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
  settings?: Array<{ name: string; value: string }>;
  discord?: any;
  openai?: any;
  timezoneOptions?: any;
} = {}) => {
  const settings = opts.settings ?? buildSettingsList();
  const discord = opts.discord ?? defaultDiscordResponse;
  const openai = opts.openai ?? defaultOpenAiResponse;
  const timezoneOptions = opts.timezoneOptions ?? defaultTimezoneOptionsResponse;

  return vi.fn().mockImplementation((url: string) => {
    if (url === '/user/settings') return Promise.resolve({ data: settings });
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
  // 2. Registration mode dropdown
  // -----------------------------------------------------------------------
  it('shows the current registration mode from the registration_mode setting', async () => {
    (api.get as any).mockImplementation(
      makeGetMock({ settings: buildSettingsList({ registration_mode: 'invite-only' }) }),
    );

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /Registration/i })).toBeInTheDocument();
    });

    expect(
      screen.getByRole('combobox', { name: /Registration/i })
    ).toHaveTextContent(/Invite only/i);
  });

  it('PUTs registration_mode when a new mode is selected and shows success', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /Registration/i })).toBeInTheDocument();
    });

    // Default fixture mode is 'closed'; switch to 'invite-only'
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Registration/i }));
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText(/Invite only/i));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
        name: 'registration_mode',
        value: 'invite-only',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Registration mode set to Invite only/i)).toBeInTheDocument();
    });
  });

  it('derives the mode from legacy settings when registration_mode is missing', async () => {
    // Legacy: registrations open + invite required -> invite-only
    const legacySettings = [
      { name: 'registrations_open', value: '1' },
      { name: 'invite_required', value: '1' },
      { name: 'theme', value: 'dark' },
    ];
    (api.get as any).mockImplementation(makeGetMock({ settings: legacySettings }));

    renderSystemSettings();

    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: /Registration/i })
      ).toHaveTextContent(/Invite only/i);
    });
  });

  it('reverts the mode and shows the backend message when the update fails', async () => {
    (api.put as any).mockRejectedValueOnce({
      response: { data: { message: 'Not allowed' } },
    });

    // Silence the expected console.error from the component
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /Registration/i })).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Registration/i }));
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText(/^Open/i));

    await waitFor(() => {
      expect(screen.getByText('Not allowed')).toBeInTheDocument();
    });

    // Mode reverted to the previous value ('closed' from the default fixture)
    expect(
      screen.getByRole('combobox', { name: /Registration/i })
    ).toHaveTextContent(/Closed/i);

    errSpy.mockRestore();
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
        discord: { data: { discord_bot_token: 'secrettoken' } },
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
    (api.get as any).mockImplementation(
      makeGetMock({ discord: { data: { discord_bot_token: 'secrettoken' } } }),
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
  it('saves general settings: globals via /user/update-setting, auto-appraisal via the per-campaign endpoint', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save General Settings/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Save General Settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/General settings updated successfully/i)).toBeInTheDocument();
    });

    const globalPuts = (api.put as any).mock.calls
      .filter(([url]: any[]) => url === '/user/update-setting')
      .map(([, body]: any[]) => body);
    const campaignPuts = (api.put as any).mock.calls
      .filter(([url]: any[]) => url === '/campaigns/current/settings')
      .map(([, body]: any[]) => body);

    // theme=dark (default), default_quantity_enabled=0, auto_split_stacks_enabled=0 stay global
    expect(globalPuts).toEqual(
      expect.arrayContaining([
        { name: 'theme', value: 'dark' },
        { name: 'default_quantity_enabled', value: '0' },
        { name: 'auto_split_stacks_enabled', value: '0' },
      ]),
    );
    // auto_appraisal_enabled (from the campaign context default '1') is per-campaign
    expect(campaignPuts).toEqual([{ name: 'auto_appraisal_enabled', value: '1' }]);
    expect(globalPuts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'auto_appraisal_enabled' }),
      ]),
    );

    // default_browser_quantity should NOT be PUT because default_quantity_enabled is false
    expect(globalPuts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'default_browser_quantity' }),
      ]),
    );

    // Context refreshed after the per-campaign write
    expect(refreshMock).toHaveBeenCalled();
  });

  it('reads auto-appraisal from the campaign settings map', async () => {
    campaignContextValue = makeContext({ auto_appraisal_enabled: '0' });

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Auto-Appraisal/i)).not.toBeChecked();
    });
  });

  it('PUTs default_browser_quantity when enabled and > 0', async () => {
    (api.get as any).mockImplementation(
      makeGetMock({
        settings: buildSettingsList({
          default_quantity_enabled: '1',
          default_browser_quantity: '5',
        }),
      }),
    );

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save General Settings/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Save General Settings/i }));

    await waitFor(() => {
      const putCalls = (api.put as any).mock.calls.map(([, body]: any[]) => body);
      expect(putCalls).toEqual(
        expect.arrayContaining([
          { name: 'default_browser_quantity', value: '5' },
        ]),
      );
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
  // 8. Backup database
  // -----------------------------------------------------------------------
  it('POSTs to /admin/backup-database and triggers a download', async () => {
    // Stub URL.createObjectURL for jsdom (it doesn't implement it)
    const createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });

    // Spy on createElement so we can inspect/control the anchor element
    const realCreateElement = document.createElement.bind(document);
    const linkClick = vi.fn();
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const el = realCreateElement(tag);
        if (tag === 'a') {
          (el as any).click = linkClick;
        }
        return el;
      });

    (api.post as any).mockImplementation((url: string) => {
      if (url === '/admin/backup-database') {
        return Promise.resolve(new ArrayBuffer(8));
      }
      return Promise.resolve({ data: {} });
    });

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Backup Database/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Backup Database/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/admin/backup-database',
        { excludeTables: ['min_caster_levels', 'min_costs', 'mod', 'spells', 'item'] },
        { responseType: 'blob' },
      );
    });

    await waitFor(() => {
      expect(linkClick).toHaveBeenCalled();
      expect(createObjectURL).toHaveBeenCalled();
      expect(screen.getByText(/Database backup created successfully/i)).toBeInTheDocument();
    });

    createElementSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // 9. Restore database
  // -----------------------------------------------------------------------
  it('disables Restore button until a file is selected, then POSTs FormData on confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Restore$/i })).toBeInTheDocument();
    });

    // Initially disabled with no file
    const restoreBtn = screen.getByRole('button', { name: /^Restore$/i });
    expect(restoreBtn).toBeDisabled();

    // Find the file input (hidden, inside the "Select Backup File" label)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const file = new File(['-- backup --'], 'backup.sql', { type: 'application/sql' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Selected file: backup.sql/i)).toBeInTheDocument();
    });

    // Now enabled
    await waitFor(() => expect(restoreBtn).not.toBeDisabled());

    (api.post as any).mockResolvedValueOnce({ data: { success: true } });

    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(api.post).toHaveBeenCalled();
    });

    // Verify the call was to /admin/restore-database with a FormData body
    const restoreCall = (api.post as any).mock.calls.find(
      ([url]: any[]) => url === '/admin/restore-database',
    );
    expect(restoreCall).toBeDefined();
    expect(restoreCall[1]).toBeInstanceOf(FormData);
    expect((restoreCall[1] as FormData).get('backupFile')).toBeInstanceOf(File);

    confirmSpy.mockRestore();
  });

  it('does not call the API when the user cancels the restore confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Restore$/i })).toBeInTheDocument();
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['-- backup --'], 'backup.sql', { type: 'application/sql' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/Selected file: backup.sql/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^Restore$/i }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());

    const restoreCall = (api.post as any).mock.calls.find(
      ([url]: any[]) => url === '/admin/restore-database',
    );
    expect(restoreCall).toBeUndefined();

    confirmSpy.mockRestore();
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
  it('shows an error alert when /user/settings rejects', async () => {
    // Make the settings call (and friends) fail; Promise.all rejects on first error
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/user/settings') {
        return Promise.reject(new Error('boom'));
      }
      // Provide benign defaults for the others so the assertion focuses on the error
      if (url === '/settings/discord') return Promise.resolve(defaultDiscordResponse);
      if (url === '/settings/openai-key') return Promise.resolve(defaultOpenAiResponse);
      if (url === '/settings/timezone-options') return Promise.resolve(defaultTimezoneOptionsResponse);
      return Promise.resolve({ data: {} });
    });

    // Silence the expected console.error from the component
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByText(/Error loading settings data/i)).toBeInTheDocument();
    });

    errSpy.mockRestore();
  });
});
