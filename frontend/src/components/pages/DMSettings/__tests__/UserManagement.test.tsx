import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import React from 'react';

// Mock the api utility (4 levels up from DMSettings/__tests__/)
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Invite management has moved to its own component with its own tests —
// stub it out so UserManagement tests stay focused on member administration.
vi.mock('../InviteManagement', () => ({
  default: () => <div data-testid="invite-management-stub" />,
}));

// The logged-in DM is user id 3 ('gandalf')
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3, username: 'gandalf', role: 'DM' }, isDM: true }),
}));

// Control the campaign context directly
let campaignContextValue: any;

const makeContext = (overrides: Record<string, unknown> = {}) => ({
  campaigns: [],
  currentCampaign: { id: 1, name: 'Rise of the Runelords', slug: 'rotrl' },
  campaignRole: 'DM' as const,
  isSuperadmin: false,
  campaignSettings: {},
  loading: false,
  switchCampaign: vi.fn(),
  refresh: vi.fn(),
  ...overrides,
});

vi.mock('../../../../contexts/CampaignContext', () => ({
  useCampaign: () => campaignContextValue,
}));

import api from '../../../../utils/api';
import UserManagement from '../UserManagement';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockMembers = [
  { user_id: 1, username: 'alice', email: 'alice@example.com', role: 'Player', joined_at: '2026-01-15T00:00:00Z' },
  { user_id: 2, username: 'bob', email: 'bob@example.com', role: 'Player', joined_at: '2026-02-20T00:00:00Z' },
  { user_id: 3, username: 'gandalf', email: 'g@example.com', role: 'DM', joined_at: '2026-01-01T00:00:00Z' },
  { user_id: 4, username: 'merlin', email: 'm@example.com', role: 'DM', joined_at: '2026-01-02T00:00:00Z' },
];

// GET /campaigns/current/members → { success, data: { members } } (api
// interceptor returns the body, so `.data` is the data object)
const setupDefaultGetMock = (members: any[] = mockMembers) => {
  (api.get as any).mockImplementation((url: string) => {
    if (url === '/campaigns/current/members') {
      return Promise.resolve({ success: true, data: { members } });
    }
    return Promise.resolve({ success: true, data: {} });
  });
};

const renderUserManagement = () =>
  render(
    <SnackbarProvider maxSnack={3}>
      <UserManagement />
    </SnackbarProvider>
  );

// Find the table row containing a username
const getRow = (username: string): HTMLElement => {
  const cell = screen.getByText(username);
  const row = cell.closest('tr');
  if (!row) throw new Error(`No table row for ${username}`);
  return row as HTMLElement;
};

describe('UserManagement (campaign members)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    campaignContextValue = makeContext();
    setupDefaultGetMock();
  });

  // -------------------------------------------------------------------------
  // 1. Listing
  // -------------------------------------------------------------------------
  describe('Member list', () => {
    it('fetches members from GET /campaigns/current/members on mount', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/campaigns/current/members');
      });
    });

    it('renders username, email, role chip, and joined date for each member', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      expect(screen.getByText('bob')).toBeInTheDocument();
      expect(screen.getByText('gandalf')).toBeInTheDocument();
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      expect(screen.getAllByText('Player').length).toBe(2);
      expect(screen.getAllByText('DM').length).toBe(2);
      // Joined dates render as locale dates (not the placeholder dash)
      const aliceRow = getRow('alice');
      expect(within(aliceRow).queryByText('—')).not.toBeInTheDocument();
    });

    it('shows the campaign-scoped explanation with the campaign name', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(
          screen.getByText(/Members of "Rise of the Runelords"/i)
        ).toBeInTheDocument();
      });
    });

    it('renders the InviteManagement section', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByTestId('invite-management-stub')).toBeInTheDocument();
      });
    });

    it('shows an error alert if loading members fails', async () => {
      (api.get as any).mockRejectedValue({
        response: { data: { message: 'DM role required' } },
      });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('DM role required')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Remove-button visibility
  // -------------------------------------------------------------------------
  describe('Remove action visibility', () => {
    it('shows no remove button for the logged-in user (marked "You")', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('gandalf')).toBeInTheDocument();
      });

      const selfRow = getRow('gandalf');
      expect(within(selfRow).queryByRole('button', { name: /remove from campaign/i })).not.toBeInTheDocument();
      expect(within(selfRow).getByText('You')).toBeInTheDocument();
    });

    it('shows an enabled remove button for Player members', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      const aliceRow = getRow('alice');
      expect(
        within(aliceRow).getByRole('button', { name: /remove from campaign/i })
      ).not.toBeDisabled();
    });

    it('disables the remove button for other DMs when not superadmin', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('merlin')).toBeInTheDocument();
      });

      const merlinRow = getRow('merlin');
      expect(
        within(merlinRow).getByRole('button', { name: /remove from campaign/i })
      ).toBeDisabled();
    });

    it('enables the remove button for other DMs when superadmin', async () => {
      campaignContextValue = makeContext({ isSuperadmin: true });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('merlin')).toBeInTheDocument();
      });

      const merlinRow = getRow('merlin');
      expect(
        within(merlinRow).getByRole('button', { name: /remove from campaign/i })
      ).not.toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Remove flow
  // -------------------------------------------------------------------------
  describe('Remove flow', () => {
    const openRemoveDialogFor = async (username: string) => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText(username)).toBeInTheDocument();
      });

      const row = getRow(username);
      fireEvent.click(within(row).getByRole('button', { name: /remove from campaign/i }));

      return await screen.findByRole('dialog');
    };

    it('shows the account-unaffected confirmation text with member and campaign names', async () => {
      const dialog = await openRemoveDialogFor('alice');

      expect(
        within(dialog).getByText(
          'Removes alice from Rise of the Runelords — their account and other campaigns are unaffected.'
        )
      ).toBeInTheDocument();
    });

    it('DELETEs /campaigns/current/members/:userId on confirm and refreshes the list', async () => {
      (api.delete as any).mockResolvedValueOnce({ success: true, message: 'Member removed' });

      const dialog = await openRemoveDialogFor('alice');

      // After removal, the refetch no longer includes alice
      setupDefaultGetMock(mockMembers.filter((m) => m.user_id !== 1));

      fireEvent.click(within(dialog).getByRole('button', { name: /^remove$/i }));

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/campaigns/current/members/1');
      });

      await waitFor(() => {
        expect(screen.queryByText('alice')).not.toBeInTheDocument();
      });
      // Success snackbar
      expect(
        await screen.findByText('alice removed from Rise of the Runelords')
      ).toBeInTheDocument();
    });

    it('does not call the API when the dialog is cancelled', async () => {
      const dialog = await openRemoveDialogFor('alice');

      fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(api.delete).not.toHaveBeenCalled();
    });

    it('surfaces the backend envelope error message in the dialog', async () => {
      (api.delete as any).mockRejectedValueOnce({
        response: {
          status: 403,
          data: { success: false, message: 'Only the system administrator can remove a DM' },
        },
      });

      const dialog = await openRemoveDialogFor('alice');

      fireEvent.click(within(dialog).getByRole('button', { name: /^remove$/i }));

      expect(
        await screen.findByText('Only the system administrator can remove a DM')
      ).toBeInTheDocument();
      // Dialog stays open so the DM can read the error
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // alice not removed from the list
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    it('shows a generic message when the error has no envelope', async () => {
      (api.delete as any).mockRejectedValueOnce(new Error('network down'));

      const dialog = await openRemoveDialogFor('bob');

      fireEvent.click(within(dialog).getByRole('button', { name: /^remove$/i }));

      expect(
        await screen.findByText('Error removing member from campaign')
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Account-level controls are gone (moved to System Admin)
  // -------------------------------------------------------------------------
  describe('Removed account-level controls', () => {
    it('no longer offers password reset or account deletion', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /reset password/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete user/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /generate reset link/i })).not.toBeInTheDocument();
    });
  });
});
