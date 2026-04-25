import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock the api utility (note depth: this test lives one level deeper than UserSettings.test.tsx)
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
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

import api from '../../../../utils/api';
import SystemSettings from '../SystemSettings';

// ----- Default fixture data ---------------------------------------------------
const buildSettingsList = (overrides: Partial<Record<string, string>> = {}) => {
  const base: Record<string, string> = {
    registrations_open: '0',
    invite_required: '0',
    theme: 'dark',
    default_browser_quantity: '1',
    default_quantity_enabled: '0',
    auto_appraisal_enabled: '1',
    auto_split_stacks_enabled: '0',
    ...overrides,
  };
  return Object.entries(base).map(([name, value]) => ({ name, value }));
};

const defaultDiscordResponse = {
  data: {
    discord_bot_token: '',
    discord_channel_id: '',
    campaign_role_id: '',
    discord_integration_enabled: '0',
  },
};

const defaultOpenAiResponse = {
  data: { hasKey: false },
};

const defaultTimezoneResponse = {
  data: { timezone: 'America/New_York' },
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

// Build a get-mock that responds to all five startup endpoints, with optional overrides
const makeGetMock = (opts: {
  settings?: Array<{ name: string; value: string }>;
  discord?: any;
  openai?: any;
  timezone?: any;
  timezoneOptions?: any;
} = {}) => {
  const settings = opts.settings ?? buildSettingsList();
  const discord = opts.discord ?? defaultDiscordResponse;
  const openai = opts.openai ?? defaultOpenAiResponse;
  const timezone = opts.timezone ?? defaultTimezoneResponse;
  const timezoneOptions = opts.timezoneOptions ?? defaultTimezoneOptionsResponse;

  return vi.fn().mockImplementation((url: string) => {
    if (url === '/user/settings') return Promise.resolve({ data: settings });
    if (url === '/settings/discord') return Promise.resolve(discord);
    if (url === '/settings/openai-key') return Promise.resolve(openai);
    if (url === '/settings/campaign-timezone') return Promise.resolve(timezone);
    if (url === '/settings/timezone-options') return Promise.resolve(timezoneOptions);
    return Promise.resolve({ data: {} });
  });
};

const renderSystemSettings = () =>
  render(
    <BrowserRouter>
      <SystemSettings />
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
  // 2. Registration toggle
  // -----------------------------------------------------------------------
  it('toggles registration open and PUTs the correct setting', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByText(/Registration Status: Closed/i)).toBeInTheDocument();
    });

    const button = screen.getByRole('button', { name: /Open Registration/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
        name: 'registrations_open',
        value: 1,
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Registration opened successfully/i)).toBeInTheDocument();
      expect(screen.getByText(/Registration Status: Open/i)).toBeInTheDocument();
    });
  });

  it('toggles registration closed when currently open', async () => {
    (api.get as any).mockImplementation(
      makeGetMock({ settings: buildSettingsList({ registrations_open: '1' }) }),
    );

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByText(/Registration Status: Open/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Close Registration/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
        name: 'registrations_open',
        value: 0,
      });
    });
  });

  // -----------------------------------------------------------------------
  // 3. Invite-required toggle
  // -----------------------------------------------------------------------
  it('toggles invite required and PUTs the correct setting', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByText(/Invite Required: No/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Require Invitation Code/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
        name: 'invite_required',
        value: 1,
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Invite requirement enabled successfully/i)).toBeInTheDocument();
      expect(screen.getByText(/Invite Required: Yes/i)).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Quick Invite generation (only visible when invite_required is on)
  // -----------------------------------------------------------------------
  it('does not show the Quick Invite generator when invites are not required', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByText(/Invite Required: No/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /Generate Quick Invite/i })).not.toBeInTheDocument();
  });

  it('generates a quick invite code and exposes a working copy button', async () => {
    (api.get as any).mockImplementation(
      makeGetMock({ settings: buildSettingsList({ invite_required: '1' }) }),
    );

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    (api.post as any).mockImplementation((url: string) => {
      if (url === '/auth/generate-quick-invite') {
        return Promise.resolve({
          data: { code: 'ABC123', expires_at: '2026-04-25T00:00:00Z' },
        });
      }
      return Promise.resolve({ data: {} });
    });

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByText(/Invite Required: Yes/i)).toBeInTheDocument();
    });

    const generateBtn = screen.getByRole('button', { name: /Generate Quick Invite/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/generate-quick-invite');
      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: /Copy code/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('ABC123');
    });
  });

  // -----------------------------------------------------------------------
  // 5. Discord settings save - only changed fields PUT
  // -----------------------------------------------------------------------
  it('only PUTs Discord fields whose values changed', async () => {
    (api.get as any).mockImplementation(
      makeGetMock({
        discord: {
          data: {
            discord_bot_token: 'secrettoken',
            discord_channel_id: 'chan-old',
            campaign_role_id: 'role-old',
            discord_integration_enabled: '0',
          },
        },
        openai: { data: { hasKey: true } },
      }),
    );

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Channel ID/i)).toBeInTheDocument();
    });

    // Change ONLY the channel ID
    const channelInput = screen.getByLabelText(/Channel ID/i) as HTMLInputElement;
    fireEvent.change(channelInput, { target: { value: 'chan-new' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Discord Settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/Discord settings updated successfully/i)).toBeInTheDocument();
    });

    // Filter PUTs to those that targeted /user/update-setting
    const putCalls = (api.put as any).mock.calls.filter(
      ([url]: any[]) => url === '/user/update-setting',
    );

    // Only one PUT — for discord_channel_id
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0][1]).toEqual({
      name: 'discord_channel_id',
      value: 'chan-new',
    });
  });

  it('PUTs the enabled flag as "1" when toggled on', async () => {
    (api.get as any).mockImplementation(
      makeGetMock({
        discord: {
          data: {
            discord_bot_token: '',
            discord_channel_id: '',
            campaign_role_id: '',
            discord_integration_enabled: '0',
          },
        },
      }),
    );

    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/Enable Discord Integration/i)).toBeInTheDocument();
    });

    const enabledSwitch = screen.getByLabelText(/Enable Discord Integration/i) as HTMLInputElement;
    fireEvent.click(enabledSwitch);

    fireEvent.click(screen.getByRole('button', { name: /Save Discord Settings/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
        name: 'discord_integration_enabled',
        value: '1',
      });
    });
  });

  // -----------------------------------------------------------------------
  // 6. General settings save
  // -----------------------------------------------------------------------
  it('saves all general settings (theme, auto-appraisal, auto-split, default qty disabled)', async () => {
    renderSystemSettings();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save General Settings/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Save General Settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/General settings updated successfully/i)).toBeInTheDocument();
    });

    const putCalls = (api.put as any).mock.calls.map(([, body]: any[]) => body);

    // theme=dark (default), default_quantity_enabled=0, auto_appraisal_enabled=1, auto_split_stacks_enabled=0
    expect(putCalls).toEqual(
      expect.arrayContaining([
        { name: 'theme', value: 'dark' },
        { name: 'default_quantity_enabled', value: '0' },
        { name: 'auto_appraisal_enabled', value: '1' },
        { name: 'auto_split_stacks_enabled', value: '0' },
      ]),
    );

    // default_browser_quantity should NOT be PUT because default_quantity_enabled is false
    expect(putCalls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'default_browser_quantity' }),
      ]),
    );
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

  it('POSTs the campaign timezone when changed and shows a success message', async () => {
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
      expect(api.post).toHaveBeenCalledWith('/settings/campaign-timezone', {
        timezone: 'Europe/London',
      });
      expect(screen.getByText(/Campaign timezone updated successfully/i)).toBeInTheDocument();
    });
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
      if (url === '/settings/campaign-timezone') return Promise.resolve(defaultTimezoneResponse);
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
