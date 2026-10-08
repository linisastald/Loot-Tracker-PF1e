import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import React from 'react';

// Mock the api utility (3 levels up from pages/__tests__/)
vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// The logged-in superadmin is user id 1 ('root')
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'root', role: 'DM' }, isDM: true }),
}));

let campaignContextValue: any;

const mockCampaigns = [
  { id: 1, name: 'Rise of the Runelords', slug: 'rotrl', world: 'Golarion', is_active: true },
  { id: 2, name: 'Skulls & Shackles', slug: 'sns', world: 'Golarion', is_active: false },
];

const makeContext = (overrides: Record<string, unknown> = {}) => ({
  campaigns: mockCampaigns,
  currentCampaign: { id: 1, name: 'Rise of the Runelords', slug: 'rotrl' },
  campaignRole: 'DM' as const,
  isSuperadmin: true,
  campaignSettings: {},
  loading: false,
  switchCampaign: vi.fn(),
  refresh: vi.fn(),
  ...overrides,
});

vi.mock('../../../contexts/CampaignContext', () => ({
  useCampaign: () => campaignContextValue,
}));

import api from '../../../utils/api';
import SystemAdmin from '../SystemAdmin';

// MUI Select needs a working ResizeObserver constructor
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as any).ResizeObserver = MockResizeObserver;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockUsers = [
  {
    id: 1,
    username: 'root',
    email: 'root@example.com',
    role: 'DM',
    is_superadmin: true,
    joined: '2025-01-01T00:00:00Z',
  },
  {
    id: 2,
    username: 'alice',
    email: 'alice@example.com',
    role: 'Player',
    is_superadmin: false,
    joined: '2026-01-15T00:00:00Z',
  },
];

const defaultSettings = [{ name: 'registration_mode', value: 'invite-only' }];

const setupDefaultGetMock = (opts: { users?: any[]; settings?: any[] } = {}) => {
  (api.get as any).mockImplementation((url: string) => {
    if (url === '/user/all') {
      return Promise.resolve({ success: true, data: opts.users ?? mockUsers });
    }
    if (url === '/user/settings') {
      return Promise.resolve({ success: true, data: opts.settings ?? defaultSettings });
    }
    return Promise.resolve({ success: true, data: {} });
  });
};

const renderSystemAdmin = () =>
  render(
    <SnackbarProvider maxSnack={3}>
      <SystemAdmin />
    </SnackbarProvider>
  );

const getRow = (username: string): HTMLElement => {
  const cell = screen.getByText(username);
  const row = cell.closest('tr');
  if (!row) throw new Error(`No table row for ${username}`);
  return row as HTMLElement;
};

describe('SystemAdmin', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (global as any).ResizeObserver = MockResizeObserver;
    campaignContextValue = makeContext();
    setupDefaultGetMock();
    (api.put as any).mockResolvedValue({ success: true });
    (api.post as any).mockResolvedValue({ success: true, data: {} });
  });

  // -------------------------------------------------------------------------
  // 1. Superadmin gate
  // -------------------------------------------------------------------------
  describe('Access gate', () => {
    it('renders an access-denied message for non-superadmins and fetches nothing', async () => {
      campaignContextValue = makeContext({ isSuperadmin: false });

      renderSystemAdmin();

      expect(
        screen.getByText(/Access denied — this page is only available to the system administrator/i)
      ).toBeInTheDocument();
      expect(api.get).not.toHaveBeenCalled();
    });

    it('shows a spinner while the campaign context is loading', () => {
      campaignContextValue = makeContext({ loading: true, isSuperadmin: false });

      renderSystemAdmin();

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByText(/Access denied/i)).not.toBeInTheDocument();
    });

    it('renders the page for superadmins', async () => {
      renderSystemAdmin();

      await waitFor(() => {
        expect(screen.getByText('System Administration')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Users section
  // -------------------------------------------------------------------------
  describe('Users section', () => {
    it('lists all users with email, role, superadmin flag, and created date', async () => {
      renderSystemAdmin();

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/user/all');
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      expect(screen.getByText('root')).toBeInTheDocument();
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      const rootRow = getRow('root');
      expect(within(rootRow).getByText('Superadmin')).toBeInTheDocument();
      const aliceRow = getRow('alice');
      expect(within(aliceRow).queryByText('Superadmin')).not.toBeInTheDocument();
    });

    it('generates a manual password reset link and shows it in a copyable dialog', async () => {
      const resetUrl = 'https://example.com/reset/token123';
      (api.post as any).mockResolvedValueOnce({ success: true, data: { resetUrl } });

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      renderSystemAdmin();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      const aliceRow = getRow('alice');
      fireEvent.click(
        within(aliceRow).getByRole('button', { name: /generate password reset link/i })
      );

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/user/generate-manual-reset-link', {
          username: 'alice',
        });
      });

      expect(await screen.findByText(resetUrl)).toBeInTheDocument();

      const dialog = screen.getByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: /copy link/i }));

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith(resetUrl);
      });
    });

    it('shows the expiry the server returned instead of a fixed lifetime (F-1453)', async () => {
      const expiresAt = '2031-03-04T05:06:00.000Z';
      (api.post as any).mockResolvedValueOnce({
        success: true,
        data: { resetUrl: 'https://example.com/reset/abc', expiresAt },
      });

      renderSystemAdmin();
      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });
      fireEvent.click(
        within(getRow('alice')).getByRole('button', { name: /generate password reset link/i })
      );

      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByText('https://example.com/reset/abc');
      expect(within(dialog).queryByText(/expire in 1 hour/i)).not.toBeInTheDocument();
      expect(within(dialog).getByText(/this link expires on/i)).toHaveTextContent(
        new Date(expiresAt).toLocaleString()
      );
    });

    it('describes account deletion as a deactivation, not a permanent removal (F-1454)', async () => {
      renderSystemAdmin();
      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });
      fireEvent.click(within(getRow('alice')).getByRole('button', { name: /delete account/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/deactivates the account "alice"/i)).toBeInTheDocument();
      expect(within(dialog).queryByText(/permanently/i)).not.toBeInTheDocument();
    });

    it('surfaces a snackbar error when reset-link generation fails', async () => {
      (api.post as any).mockRejectedValueOnce({
        response: { data: { message: 'User not found' } },
      });

      renderSystemAdmin();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      fireEvent.click(
        within(getRow('alice')).getByRole('button', { name: /generate password reset link/i })
      );

      expect(await screen.findByText('User not found')).toBeInTheDocument();
    });

    it('requires typing the username before the delete button enables, then PUTs /user/delete-user', async () => {
      renderSystemAdmin();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      fireEvent.click(within(getRow('alice')).getByRole('button', { name: /delete account/i }));

      const dialog = await screen.findByRole('dialog');
      const confirmBtn = within(dialog).getByRole('button', { name: /delete account/i });
      expect(confirmBtn).toBeDisabled();

      // Wrong text keeps it disabled
      const confirmInput = within(dialog).getByLabelText(/type alice to confirm/i);
      fireEvent.change(confirmInput, { target: { value: 'bob' } });
      expect(confirmBtn).toBeDisabled();

      // Exact username enables it
      fireEvent.change(confirmInput, { target: { value: 'alice' } });
      expect(confirmBtn).not.toBeDisabled();

      // After deletion the refetch no longer includes alice
      setupDefaultGetMock({ users: mockUsers.filter((u) => u.id !== 2) });

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/user/delete-user', { userId: 2 });
      });

      await waitFor(() => {
        expect(screen.queryByText('alice')).not.toBeInTheDocument();
      });
    });

    it('disables Delete account for the logged-in superadmin themself', async () => {
      renderSystemAdmin();

      await waitFor(() => {
        expect(screen.getByText('root')).toBeInTheDocument();
      });

      expect(
        within(getRow('root')).getByRole('button', { name: /delete account/i })
      ).toBeDisabled();
    });

    it('surfaces the backend error in the delete dialog', async () => {
      (api.put as any).mockRejectedValueOnce({
        response: { data: { message: 'Cannot delete this account' } },
      });

      renderSystemAdmin();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      fireEvent.click(within(getRow('alice')).getByRole('button', { name: /delete account/i }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/type alice to confirm/i), {
        target: { value: 'alice' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: /delete account/i }));

      expect(await screen.findByText('Cannot delete this account')).toBeInTheDocument();
      // alice still listed
      expect(screen.getByText('alice')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Global settings section (registration mode moved here)
  // -------------------------------------------------------------------------
  describe('Global settings', () => {
    it('shows the current registration mode from /user/settings', async () => {
      renderSystemAdmin();

      await waitFor(() => {
        expect(
          screen.getByRole('combobox', { name: /registration/i })
        ).toHaveTextContent(/Invite only/i);
      });
    });

    it('PUTs registration_mode on change and shows a success snackbar', async () => {
      renderSystemAdmin();

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: /registration/i })).toBeInTheDocument();
      });

      fireEvent.mouseDown(screen.getByRole('combobox', { name: /registration/i }));
      const listbox = await screen.findByRole('listbox');
      fireEvent.click(within(listbox).getByText(/^Open/i));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/user/update-setting', {
          name: 'registration_mode',
          value: 'open',
        });
      });

      expect(await screen.findByText(/Registration mode set to Open/i)).toBeInTheDocument();
    });

    it('reverts the mode and surfaces the error when the update fails', async () => {
      (api.put as any).mockRejectedValueOnce({
        response: { data: { message: 'Not allowed' } },
      });

      renderSystemAdmin();

      await waitFor(() => {
        expect(
          screen.getByRole('combobox', { name: /registration/i })
        ).toHaveTextContent(/Invite only/i);
      });

      fireEvent.mouseDown(screen.getByRole('combobox', { name: /registration/i }));
      const listbox = await screen.findByRole('listbox');
      fireEvent.click(within(listbox).getByText(/Closed/i));

      expect(await screen.findByText('Not allowed')).toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: /registration/i })
      ).toHaveTextContent(/Invite only/i);
    });

    it('shows the server default (invite only) when registration_mode is missing and ignores the legacy settings', async () => {
      setupDefaultGetMock({
        settings: [
          { name: 'registrations_open', value: '0' },
          { name: 'invite_required', value: '0' },
        ],
      });

      renderSystemAdmin();

      await waitFor(() => {
        expect(
          screen.getByRole('combobox', { name: /registration/i })
        ).toHaveTextContent(/Invite only/i);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Campaigns section
  // -------------------------------------------------------------------------
  describe('Instance settings', () => {
    it('shows the stored frontend URL and saves a changed one', async () => {
      setupDefaultGetMock({ settings: [...defaultSettings, { name: 'frontend_url', value: 'https://old.example.com' }] });
      renderSystemAdmin();
      const field = (await screen.findByLabelText(/Frontend URL/)) as HTMLInputElement;
      await waitFor(() => expect(field.value).toBe('https://old.example.com'));
      expect(screen.getByRole('button', { name: 'Save URL' })).toBeDisabled();

      fireEvent.change(field, { target: { value: ' https://new.example.com ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save URL' }));
      await waitFor(() => expect(api.put).toHaveBeenCalledWith('/user/update-setting', { name: 'frontend_url', value: 'https://new.example.com' }));
    });

    it('reports whether the secrets are stored and saves a new one without echoing it', async () => {
      setupDefaultGetMock({ settings: [
        ...defaultSettings,
        { name: 'discord_bot_token', value: null, secret: true, is_set: true },
        { name: 'openai_key', value: null, secret: true, is_set: false },
      ] });
      renderSystemAdmin();
      expect(await screen.findByText(/A token is stored/)).toBeInTheDocument();
      expect(screen.getByText(/No key stored/)).toBeInTheDocument();

      const keyField = screen.getByLabelText(/OpenAI API key/) as HTMLInputElement;
      expect(keyField.type).toBe('password');
      expect(screen.getByRole('button', { name: 'Save key' })).toBeDisabled();
      fireEvent.change(keyField, { target: { value: 'sk-test' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save key' }));

      await waitFor(() => expect(api.put).toHaveBeenCalledWith('/user/update-setting', { name: 'openai_key', value: 'sk-test' }));
      await waitFor(() => expect(keyField.value).toBe(''));
      expect(await screen.findByText(/A key is stored/)).toBeInTheDocument();
    });
  });

  describe('Campaigns section', () => {
    it('offers campaign administration actions', async () => {
      renderSystemAdmin();
      expect(await screen.findByRole('button', { name: 'New campaign' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Members of Rise of the Runelords' })).toBeInTheDocument();
    });

    it('lists every campaign with name, slug, world, and active state', async () => {
      renderSystemAdmin();

      await waitFor(() => {
        expect(screen.getByText('Rise of the Runelords')).toBeInTheDocument();
      });

      expect(screen.getByText('Skulls & Shackles')).toBeInTheDocument();
      expect(screen.getByText('rotrl')).toBeInTheDocument();
      expect(screen.getByText('sns')).toBeInTheDocument();
      expect(screen.getAllByText('Golarion').length).toBe(2);
      expect(within(getRow('Rise of the Runelords')).getByText('Active')).toBeInTheDocument();
      expect(within(getRow('Skulls & Shackles')).getByText('Inactive')).toBeInTheDocument();
    });
  });

  describe("Act as DM switch", () => {
    it("reflects the override and turns it on from the System Admin tab", async () => {
      const setDmOverride = vi.fn();
      campaignContextValue = makeContext({ dmOverride: false, setDmOverride });

      renderSystemAdmin();

      const toggle = await screen.findByLabelText(/act as dm in campaigns where i am a player/i);
      expect(toggle).not.toBeChecked();
      fireEvent.click(toggle);
      expect(setDmOverride).toHaveBeenCalledWith(true);
    });

    it("shows the switch on while the override is active", async () => {
      campaignContextValue = makeContext({ dmOverride: true, setDmOverride: vi.fn() });

      renderSystemAdmin();

      expect(await screen.findByLabelText(/act as dm in campaigns where i am a player/i)).toBeChecked();
    });
  });
});
