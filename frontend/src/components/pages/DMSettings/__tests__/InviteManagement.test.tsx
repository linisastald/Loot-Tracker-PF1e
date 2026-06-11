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
import InviteManagement from '../InviteManagement';

// ---------------------------------------------------------------------------
// Fixtures — new /invites API contract: data: { invites: [...] }
// ---------------------------------------------------------------------------

const mockInvites = [
  {
    id: 10,
    code: 'ABCD1234',
    created_by_username: 'gandalf',
    created_at: '2026-06-01T12:00:00Z',
    expires_at: '2026-06-30T12:00:00Z',
  },
  {
    id: 11,
    code: 'NEVER999',
    created_by_username: 'gandalf',
    created_at: '2026-06-02T12:00:00Z',
    expires_at: null,
  },
];

const setupGetMock = (invites: any[] = mockInvites) => {
  (api.get as any).mockImplementation((url: string) => {
    if (url === '/invites') {
      return Promise.resolve({ data: { invites } });
    }
    return Promise.resolve({ data: {} });
  });
};

const renderInviteManagement = () =>
  render(
    <SnackbarProvider maxSnack={3}>
      <InviteManagement />
    </SnackbarProvider>
  );

describe('InviteManagement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupGetMock();
  });

  // -------------------------------------------------------------------------
  // Initial load
  // -------------------------------------------------------------------------
  describe('Initial load', () => {
    it('fetches invites from GET /invites on mount and lists them', async () => {
      renderInviteManagement();

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/invites');
      });

      expect(await screen.findByText('ABCD1234')).toBeInTheDocument();
      expect(screen.getByText('NEVER999')).toBeInTheDocument();
      expect(screen.getAllByText('gandalf').length).toBe(2);
    });

    it('shows "Never" for invites with a null expiry', async () => {
      renderInviteManagement();

      await screen.findByText('NEVER999');
      expect(screen.getByText('Never')).toBeInTheDocument();
    });

    it('shows an empty-state row when there are no active invites', async () => {
      setupGetMock([]);

      renderInviteManagement();

      expect(
        await screen.findByText('No active invite codes found')
      ).toBeInTheDocument();
    });

    it('shows the backend error message in a snackbar when loading fails', async () => {
      (api.get as any).mockRejectedValue({
        response: { data: { message: 'Invites unavailable' } },
      });

      renderInviteManagement();

      expect(await screen.findByText('Invites unavailable')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Quick invite
  // -------------------------------------------------------------------------
  describe('Quick invite', () => {
    it('POSTs /invites/quick, shows the new code prominently and refreshes the list', async () => {
      (api.post as any).mockResolvedValueOnce({
        message: 'Quick invite created (expires in 4 hours)',
        data: { code: 'QUICK001', expires_at: '2026-06-10T16:00:00Z' },
      });

      renderInviteManagement();
      await screen.findByText('ABCD1234');

      const newInvites = [
        ...mockInvites,
        {
          id: 12,
          code: 'QUICK001',
          created_by_username: 'gandalf',
          created_at: '2026-06-10T12:00:00Z',
          expires_at: '2026-06-10T16:00:00Z',
        },
      ];
      setupGetMock(newInvites);

      fireEvent.click(screen.getByRole('button', { name: /quick invite/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/invites/quick');
      });

      // New code shown prominently in the generated-code box
      await waitFor(() => {
        expect(screen.getByTestId('generated-invite-code')).toHaveTextContent('QUICK001');
      });

      // Backend message surfaced in a snackbar
      expect(
        screen.getByText('Quick invite created (expires in 4 hours)')
      ).toBeInTheDocument();

      // List refreshed (code also appears in the table)
      await waitFor(() => {
        expect(screen.getAllByText('QUICK001').length).toBeGreaterThanOrEqual(2);
      });
    });

    it('shows the backend error message when quick invite fails', async () => {
      (api.post as any).mockRejectedValueOnce({
        response: { data: { message: 'Too many active invites' } },
      });

      renderInviteManagement();
      await screen.findByText('ABCD1234');

      fireEvent.click(screen.getByRole('button', { name: /quick invite/i }));

      expect(await screen.findByText('Too many active invites')).toBeInTheDocument();
    });

    it('copies the generated code to the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText },
        writable: true,
        configurable: true,
      });

      (api.post as any).mockResolvedValueOnce({
        message: 'Quick invite created',
        data: { code: 'QUICK002', expires_at: '2026-06-10T16:00:00Z' },
      });

      renderInviteManagement();
      await screen.findByText('ABCD1234');

      fireEvent.click(screen.getByRole('button', { name: /quick invite/i }));

      await waitFor(() => {
        expect(screen.getByTestId('generated-invite-code')).toHaveTextContent('QUICK002');
      });

      fireEvent.click(screen.getByRole('button', { name: /copy new invite code/i }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('QUICK002');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Custom invite
  // -------------------------------------------------------------------------
  describe('Custom invite', () => {
    const openCustomDialog = async () => {
      renderInviteManagement();
      await screen.findByText('ABCD1234');
      fireEvent.click(screen.getByRole('button', { name: /custom invite/i }));
      return await screen.findByRole('dialog');
    };

    it('POSTs /invites/custom with the entered expiry hours', async () => {
      (api.post as any).mockResolvedValueOnce({
        message: 'Custom invite created',
        data: { code: 'CUSTOM01', expires_at: '2026-06-12T12:00:00Z' },
      });

      const dialog = await openCustomDialog();

      const hoursInput = within(dialog).getByLabelText(/expires in \(hours\)/i);
      fireEvent.change(hoursInput, { target: { value: '48' } });

      fireEvent.click(within(dialog).getByRole('button', { name: /generate invite/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/invites/custom', {
          expiresInHours: 48,
        });
      });

      expect(await screen.findByText('Custom invite created')).toBeInTheDocument();
    });

    it('POSTs expiresInHours: null when "Never expires" is checked', async () => {
      (api.post as any).mockResolvedValueOnce({
        message: 'Custom invite created',
        data: { code: 'CUSTOM02', expires_at: null },
      });

      const dialog = await openCustomDialog();

      fireEvent.click(within(dialog).getByLabelText(/never expires/i));
      fireEvent.click(within(dialog).getByRole('button', { name: /generate invite/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/invites/custom', {
          expiresInHours: null,
        });
      });
    });

    it('disables Generate when hours are outside 1-720', async () => {
      const dialog = await openCustomDialog();

      const hoursInput = within(dialog).getByLabelText(/expires in \(hours\)/i);
      const generateBtn = within(dialog).getByRole('button', { name: /generate invite/i });

      fireEvent.change(hoursInput, { target: { value: '0' } });
      expect(generateBtn).toBeDisabled();

      fireEvent.change(hoursInput, { target: { value: '800' } });
      expect(generateBtn).toBeDisabled();

      fireEvent.change(hoursInput, { target: { value: '720' } });
      expect(generateBtn).not.toBeDisabled();

      expect(api.post).not.toHaveBeenCalled();
    });

    it('shows the backend error message when custom invite fails', async () => {
      (api.post as any).mockRejectedValueOnce({
        response: { data: { message: 'expiresInHours must be between 1 and 720' } },
      });

      const dialog = await openCustomDialog();
      fireEvent.click(within(dialog).getByRole('button', { name: /generate invite/i }));

      expect(
        await screen.findByText('expiresInHours must be between 1 and 720')
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Deactivate
  // -------------------------------------------------------------------------
  describe('Deactivate invite', () => {
    it('opens a confirmation and POSTs /invites/deactivate with the inviteId', async () => {
      (api.post as any).mockResolvedValueOnce({
        message: 'Invite deactivated successfully',
        data: null,
      });

      renderInviteManagement();
      await screen.findByText('ABCD1234');

      const deactivateButtons = screen.getAllByRole('button', { name: /deactivate invite/i });
      fireEvent.click(deactivateButtons[0]);

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('ABCD1234')).toBeInTheDocument();

      // List refetch after deactivation drops the invite
      setupGetMock(mockInvites.filter(i => i.id !== 10));

      fireEvent.click(within(dialog).getByRole('button', { name: /^deactivate$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/invites/deactivate', { inviteId: 10 });
      });

      expect(
        await screen.findByText('Invite deactivated successfully')
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('ABCD1234')).not.toBeInTheDocument();
      });
    });

    it('shows the backend error message when deactivation fails', async () => {
      (api.post as any).mockRejectedValueOnce({
        response: { data: { message: 'Invite not found' } },
      });

      renderInviteManagement();
      await screen.findByText('ABCD1234');

      fireEvent.click(screen.getAllByRole('button', { name: /deactivate invite/i })[0]);

      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: /^deactivate$/i }));

      expect(await screen.findByText('Invite not found')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Copy from table
  // -------------------------------------------------------------------------
  describe('Copy invite code', () => {
    it('calls navigator.clipboard.writeText with the invite code', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText },
        writable: true,
        configurable: true,
      });

      renderInviteManagement();
      await screen.findByText('ABCD1234');

      const copyButtons = screen.getAllByRole('button', { name: /copy code/i });
      fireEvent.click(copyButtons[0]);

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('ABCD1234');
      });
    });
  });
});
