import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
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

// Mock the timezone hook so it does not perform any side-effect API calls
vi.mock('../../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({
    timezone: 'America/New_York',
    loading: false,
    error: null,
  }),
}));

// Mock timezone utility (component imports formatInCampaignTimezone directly)
vi.mock('../../../../utils/timezoneUtils', () => ({
  formatInCampaignTimezone: (date: string) => `formatted:${date}`,
  fetchCampaignTimezone: vi.fn().mockResolvedValue('America/New_York'),
  clearTimezoneCache: vi.fn(),
}));

import api from '../../../../utils/api';
import UserManagement from '../UserManagement';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockUsers = [
  { id: 1, username: 'alice',   role: 'player', email: 'alice@example.com' },
  { id: 2, username: 'bob',     role: 'player', email: 'bob@example.com'   },
  { id: 3, username: 'gandalf', role: 'dm',     email: 'g@example.com'     },
];

const mockInvites = [
  {
    id: 10,
    code: 'ABCD-1234',
    created_by_username: 'gandalf',
    created_at: '2026-04-01T12:00:00Z',
    expires_at: '2026-04-30T12:00:00Z',
  },
  {
    id: 11,
    code: 'NEVER-9999',
    created_by_username: 'gandalf',
    created_at: '2026-04-02T12:00:00Z',
    expires_at: '9999-12-31T00:00:00Z',
  },
];

// Default mock for api.get based on URL
const setupDefaultGetMock = (
  users: any[] = mockUsers,
  invites: any[] = mockInvites,
) => {
  (api.get as any).mockImplementation((url: string) => {
    if (url === '/user/all') return Promise.resolve({ data: users });
    if (url === '/auth/active-invites') return Promise.resolve({ data: invites });
    return Promise.resolve({ data: [] });
  });
};

const renderUserManagement = () => {
  return render(
    <BrowserRouter>
      <UserManagement />
    </BrowserRouter>
  );
};

// Helper to find an input by label text via the label's "for" attribute
const getInputByLabelText = (labelPattern: RegExp): HTMLInputElement => {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find(l => labelPattern.test(l.textContent || ''));
  if (!label) throw new Error(`Could not find label matching ${labelPattern}`);
  const inputId = label.getAttribute('for');
  if (!inputId) throw new Error(`Label has no 'for' attribute`);
  const input = document.getElementById(inputId) as HTMLInputElement;
  if (!input) throw new Error(`Could not find input with id '${inputId}'`);
  return input;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserManagement', () => {
  beforeEach(() => {
    // resetAllMocks clears any queued mockResolvedValueOnce/mockRejectedValueOnce
    // from previous tests so they can't leak into subsequent tests.
    vi.resetAllMocks();
    setupDefaultGetMock();
  });

  // -------------------------------------------------------------------------
  // 1. Lists all users on mount
  // -------------------------------------------------------------------------
  describe('Initial load', () => {
    it('fetches users and active invites on mount', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/user/all');
        expect(api.get).toHaveBeenCalledWith('/auth/active-invites');
      });
    });

    it('renders all users in the user table', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      expect(screen.getByText('bob')).toBeInTheDocument();
      // 'gandalf' appears in both the user table and the invite "Created By"
      // column. Use getAllByText since duplication is expected.
      expect(screen.getAllByText('gandalf').length).toBeGreaterThanOrEqual(1);

      // Ensure email + role columns are populated
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      expect(screen.getByText('bob@example.com')).toBeInTheDocument();
      expect(screen.getByText('dm')).toBeInTheDocument();
    });

    it('renders the active invites with their codes', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('ABCD-1234')).toBeInTheDocument();
        expect(screen.getByText('NEVER-9999')).toBeInTheDocument();
      });
    });

    it('shows "Never" for invites that effectively never expire (year >= 9000)', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('NEVER-9999')).toBeInTheDocument();
      });

      expect(screen.getByText('Never')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 2. User selection via row checkbox
  // -------------------------------------------------------------------------
  describe('User selection', () => {
    it('disables Reset Password and Delete User buttons until a user is selected', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /reset password/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /delete user/i })).toBeDisabled();
    });

    it('enables Reset Password and Delete User after selecting one user', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      // The first user-row checkbox corresponds to "alice"
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      expect(screen.getByRole('button', { name: /reset password/i })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /delete user/i })).not.toBeDisabled();
    });

    it('disables Reset Password (single-target) when more than one user selected', async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      expect(screen.getByRole('button', { name: /reset password/i })).toBeDisabled();
      // Delete remains enabled because it supports bulk deletes
      expect(screen.getByRole('button', { name: /delete user/i })).not.toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Reset password flow
  // -------------------------------------------------------------------------
  describe('Reset password flow', () => {
    const openResetDialogForFirstUser = async () => {
      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]); // select alice

      fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    };

    it('rejects passwords shorter than 8 characters', async () => {
      await openResetDialogForFirstUser();

      const dialog = screen.getByRole('dialog');
      const newPasswordInput = within(dialog).getByLabelText(/new password/i);
      fireEvent.change(newPasswordInput, { target: { value: 'short' } });

      const confirmBtn = within(dialog).getAllByRole('button', { name: /reset password/i })[0];
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Password must be at least 8 characters long')
        ).toBeInTheDocument();
      });
      expect(api.put).not.toHaveBeenCalled();
    });

    it('rejects passwords longer than 64 characters', async () => {
      await openResetDialogForFirstUser();

      const dialog = screen.getByRole('dialog');
      const newPasswordInput = within(dialog).getByLabelText(/new password/i);
      fireEvent.change(newPasswordInput, { target: { value: 'a'.repeat(65) } });

      const confirmBtn = within(dialog).getAllByRole('button', { name: /reset password/i })[0];
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Password cannot exceed 64 characters')
        ).toBeInTheDocument();
      });
      expect(api.put).not.toHaveBeenCalled();
    });

    it('rejects empty password with "Password is required"', async () => {
      await openResetDialogForFirstUser();

      const dialog = screen.getByRole('dialog');
      const confirmBtn = within(dialog).getAllByRole('button', { name: /reset password/i })[0];
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText('Password is required')).toBeInTheDocument();
      });
      expect(api.put).not.toHaveBeenCalled();
    });

    it('calls PUT /user/reset-password with userId+newPassword and shows success', async () => {
      (api.put as any).mockResolvedValueOnce({ data: { success: true } });

      await openResetDialogForFirstUser();

      const dialog = screen.getByRole('dialog');
      const newPasswordInput = within(dialog).getByLabelText(/new password/i);
      fireEvent.change(newPasswordInput, { target: { value: 'goodpassword123' } });

      const confirmBtn = within(dialog).getAllByRole('button', { name: /reset password/i })[0];
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/user/reset-password', {
          userId: 1,
          newPassword: 'goodpassword123',
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Password reset successfully')).toBeInTheDocument();
      });
    });

    it('shows server error message when reset password fails', async () => {
      (api.put as any).mockRejectedValueOnce({
        response: { data: { error: 'User not found' } },
      });

      await openResetDialogForFirstUser();

      const dialog = screen.getByRole('dialog');
      const newPasswordInput = within(dialog).getByLabelText(/new password/i);
      fireEvent.change(newPasswordInput, { target: { value: 'goodpassword123' } });

      const confirmBtn = within(dialog).getAllByRole('button', { name: /reset password/i })[0];
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText('User not found')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Delete user flow
  // -------------------------------------------------------------------------
  describe('Delete user flow', () => {
    it('opens a confirmation dialog and on confirm calls PUT /user/delete-user', async () => {
      (api.put as any).mockResolvedValueOnce({ data: { success: true } });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      // Select alice
      fireEvent.click(screen.getAllByRole('checkbox')[0]);

      // Click the Delete User button to open the dialog
      fireEvent.click(screen.getByRole('button', { name: /delete user/i }));

      // Confirm dialog appears
      await waitFor(() => {
        expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
      });

      // After clicking delete, mock should refresh users; remove alice from refetch
      setupDefaultGetMock(
        mockUsers.filter(u => u.id !== 1),
        mockInvites,
      );

      // Click the confirm Delete button inside the dialog
      const dialog = screen.getByRole('dialog');
      const confirmDeleteBtn = within(dialog).getByRole('button', { name: /^delete$/i });
      fireEvent.click(confirmDeleteBtn);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/user/delete-user', { userId: 1 });
      });

      await waitFor(() => {
        expect(screen.getByText('User(s) deleted successfully')).toBeInTheDocument();
      });

      // Refresh should have been triggered
      await waitFor(() => {
        expect(screen.queryByText('alice')).not.toBeInTheDocument();
      });
    });

    it('shows error alert when delete fails', async () => {
      (api.put as any).mockRejectedValueOnce(new Error('boom'));

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByRole('checkbox')[0]);
      fireEvent.click(screen.getByRole('button', { name: /delete user/i }));

      const dialog = await screen.findByRole('dialog');
      const confirmDeleteBtn = within(dialog).getByRole('button', { name: /^delete$/i });
      fireEvent.click(confirmDeleteBtn);

      await waitFor(() => {
        expect(screen.getByText('Error deleting user(s)')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 5. Custom invite generation
  // -------------------------------------------------------------------------
  describe('Custom invite generation', () => {
    it('opens dialog, generates invite with selected expiration, and refreshes invites list', async () => {
      (api.post as any).mockResolvedValueOnce({
        data: { code: 'NEW-INVITE-1', id: 99 },
      });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /create new invite/i }));

      // Dialog appears with default '1 Day' option already selected
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // After generating, the active invites list should be refetched - prepare a new one
      const newInvites = [
        ...mockInvites,
        {
          id: 99,
          code: 'NEW-INVITE-1',
          created_by_username: 'gandalf',
          created_at: '2026-04-24T12:00:00Z',
          expires_at: '2026-04-25T12:00:00Z',
        },
      ];
      setupDefaultGetMock(mockUsers, newInvites);

      // Click Generate Invite button (inside the open dialog)
      const dialog = screen.getByRole('dialog');
      const generateBtn = within(dialog).getByRole('button', { name: /generate invite/i });
      fireEvent.click(generateBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/auth/generate-custom-invite', {
          expirationPeriod: '1d',
        });
      });

      // Active-invites list refreshed
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/auth/active-invites');
        expect(screen.getByText('NEW-INVITE-1')).toBeInTheDocument();
      });

      expect(
        screen.getByText('Custom invite code generated successfully')
      ).toBeInTheDocument();
    });

    it('shows error when invite generation fails', async () => {
      (api.post as any).mockRejectedValueOnce(new Error('fail'));

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /create new invite/i }));

      const dialog = await screen.findByRole('dialog');
      const generateBtn = within(dialog).getByRole('button', { name: /generate invite/i });
      fireEvent.click(generateBtn);

      await waitFor(() => {
        expect(screen.getByText('Error generating custom invite code')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 6. Active invites list - deactivate
  // -------------------------------------------------------------------------
  describe('Deactivate invite flow', () => {
    it('opens deactivate confirmation and on confirm calls POST /auth/deactivate-invite', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { success: true } });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('ABCD-1234')).toBeInTheDocument();
      });

      // Click the deactivate (red) button on the first invite row
      const deactivateButtons = screen.getAllByRole('button', { name: /deactivate invite/i });
      fireEvent.click(deactivateButtons[0]);

      // Confirmation dialog
      await waitFor(() => {
        expect(screen.getByText('Confirm Deactivation')).toBeInTheDocument();
      });

      // After deactivation, refetch should drop the first invite
      setupDefaultGetMock(mockUsers, mockInvites.filter(i => i.id !== 10));

      const dialog = screen.getByRole('dialog');
      const confirmBtn = within(dialog).getByRole('button', { name: /^deactivate$/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/auth/deactivate-invite', { inviteId: 10 });
      });

      await waitFor(() => {
        expect(screen.getByText('Invite code deactivated successfully')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.queryByText('ABCD-1234')).not.toBeInTheDocument();
      });
    });

    it('shows error when deactivation fails', async () => {
      (api.post as any).mockRejectedValueOnce(new Error('fail'));

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('ABCD-1234')).toBeInTheDocument();
      });

      const deactivateButtons = screen.getAllByRole('button', { name: /deactivate invite/i });
      fireEvent.click(deactivateButtons[0]);

      const dialog = await screen.findByRole('dialog');
      const confirmBtn = within(dialog).getByRole('button', { name: /^deactivate$/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText('Error deactivating invite code')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 7. Copy invite code button
  // -------------------------------------------------------------------------
  describe('Copy invite code', () => {
    it('calls navigator.clipboard.writeText with the invite code', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('ABCD-1234')).toBeInTheDocument();
      });

      const copyButtons = screen.getAllByRole('button', { name: /copy code/i });
      fireEvent.click(copyButtons[0]);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith('ABCD-1234');
      });
    });
  });

  // -------------------------------------------------------------------------
  // 8. Manual reset link generation
  // -------------------------------------------------------------------------
  describe('Manual reset link', () => {
    it('generates a manual reset link and displays the URL', async () => {
      const resetUrl = 'https://example.com/reset/token123';
      (api.post as any).mockResolvedValueOnce({ data: { resetUrl } });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /generate reset link/i }));

      await waitFor(() => {
        expect(
          screen.getByText('Generate Manual Password Reset Link')
        ).toBeInTheDocument();
      });

      // Type a username
      const usernameInput = getInputByLabelText(/^username/i);
      fireEvent.change(usernameInput, { target: { value: 'alice' } });

      // Click the dialog's Generate Link button
      const dialog = screen.getByRole('dialog');
      const generateBtn = within(dialog).getByRole('button', { name: /generate link/i });
      fireEvent.click(generateBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/auth/generate-manual-reset-link', {
          username: 'alice',
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Password Reset Link Generated')).toBeInTheDocument();
        expect(screen.getByText(resetUrl)).toBeInTheDocument();
      });
    });

    it('Copy Link button uses navigator.clipboard.writeText with the generated URL', async () => {
      const resetUrl = 'https://example.com/reset/token-abc';
      (api.post as any).mockResolvedValueOnce({ data: { resetUrl } });

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /generate reset link/i }));

      await waitFor(() => {
        expect(
          screen.getByText('Generate Manual Password Reset Link')
        ).toBeInTheDocument();
      });

      const usernameInput = getInputByLabelText(/^username/i);
      fireEvent.change(usernameInput, { target: { value: 'alice' } });

      const dialog = screen.getByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: /generate link/i }));

      await waitFor(() => {
        expect(screen.getByText(resetUrl)).toBeInTheDocument();
      });

      // Click Copy Link inside the result dialog
      const linkDialog = screen.getByRole('dialog');
      fireEvent.click(within(linkDialog).getByRole('button', { name: /copy link/i }));

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith(resetUrl);
      });
    });

    it('surfaces server error message when the manual reset link API fails', async () => {
      (api.post as any).mockRejectedValueOnce({
        response: { data: { error: 'Username not found' } },
      });

      renderUserManagement();

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /generate reset link/i }));

      await waitFor(() => {
        expect(
          screen.getByText('Generate Manual Password Reset Link')
        ).toBeInTheDocument();
      });

      const usernameInput = getInputByLabelText(/^username/i);
      fireEvent.change(usernameInput, { target: { value: 'ghost' } });

      const dialog = screen.getByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: /generate link/i }));

      await waitFor(() => {
        expect(screen.getByText('Username not found')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 9. Empty / error states
  // -------------------------------------------------------------------------
  describe('Error and empty states', () => {
    it('shows an error alert if loading users fails', async () => {
      (api.get as any).mockImplementation((url: string) => {
        if (url === '/user/all') return Promise.reject(new Error('boom'));
        if (url === '/auth/active-invites') return Promise.resolve({ data: [] });
        return Promise.resolve({ data: [] });
      });

      renderUserManagement();

      await waitFor(() => {
        expect(
          screen.getByText('Error loading users. Please try again.')
        ).toBeInTheDocument();
      });
    });

    it('shows an empty-state row when there are no active invites', async () => {
      setupDefaultGetMock(mockUsers, []);

      renderUserManagement();

      await waitFor(() => {
        expect(
          screen.getByText('No active invite codes found')
        ).toBeInTheDocument();
      });
    });

    it('shows an error alert if loading invites fails', async () => {
      (api.get as any).mockImplementation((url: string) => {
        if (url === '/user/all') return Promise.resolve({ data: mockUsers });
        if (url === '/auth/active-invites') return Promise.reject(new Error('boom'));
        return Promise.resolve({ data: [] });
      });

      renderUserManagement();

      await waitFor(() => {
        expect(
          screen.getByText('Error loading active invites. Please try again.')
        ).toBeInTheDocument();
      });
    });
  });
});
