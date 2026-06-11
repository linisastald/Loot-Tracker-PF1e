import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { SnackbarProvider } from 'notistack';

// Mock the api utility (3 levels up from layout/__tests__/)
vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the campaign context so we control selector inputs directly
const switchCampaignMock = vi.fn();
const refreshMock = vi.fn();

const defaultCampaignContext = {
  campaigns: [
    { id: 1, name: 'Rise of the Runelords', slug: 'rotrl', world: 'Golarion', is_active: true, role: 'DM' as const },
    { id: 2, name: 'Skulls & Shackles', slug: 'sns', world: 'Golarion', is_active: true, role: 'Player' as const },
  ],
  currentCampaign: { id: 1, name: 'Rise of the Runelords', slug: 'rotrl' },
  campaignRole: 'DM' as const,
  isSuperadmin: false,
  campaignSettings: {},
  loading: false,
  switchCampaign: switchCampaignMock,
  refresh: refreshMock,
};

let campaignContextValue = { ...defaultCampaignContext };

vi.mock('../../../contexts/CampaignContext', () => ({
  useCampaign: () => campaignContextValue,
}));

import api from '../../../utils/api';
import CampaignSelector from '../CampaignSelector';

const renderSelector = () =>
  render(
    <SnackbarProvider maxSnack={3}>
      <CampaignSelector />
    </SnackbarProvider>
  );

const openMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: /select campaign/i }));
};

describe('CampaignSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignContextValue = { ...defaultCampaignContext };
  });

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  describe('rendering', () => {
    it('shows the current campaign name on the app bar button', () => {
      renderSelector();
      expect(screen.getByRole('button', { name: /select campaign/i })).toHaveTextContent(
        'Rise of the Runelords'
      );
    });

    it('falls back to a generic label when no campaign is resolved', () => {
      campaignContextValue = { ...defaultCampaignContext, currentCampaign: null };
      renderSelector();
      expect(screen.getByRole('button', { name: /select campaign/i })).toHaveTextContent('Campaign');
    });

    it('lists all campaigns in the menu with the current one selected', () => {
      renderSelector();
      openMenu();

      const menu = screen.getByRole('menu');
      const items = within(menu).getAllByRole('menuitem');
      // 2 campaigns + "Join a campaign…" (no create for non-superadmin)
      expect(items).toHaveLength(3);
      expect(within(menu).getByText('Rise of the Runelords')).toBeInTheDocument();
      expect(within(menu).getByText('Skulls & Shackles')).toBeInTheDocument();
      expect(within(menu).getByText('Join a campaign…')).toBeInTheDocument();
    });

    it('hides "Create campaign…" for non-superadmins', () => {
      renderSelector();
      openMenu();
      expect(screen.queryByText('Create campaign…')).not.toBeInTheDocument();
    });

    it('shows "Create campaign…" for superadmins', () => {
      campaignContextValue = { ...defaultCampaignContext, isSuperadmin: true };
      renderSelector();
      openMenu();
      expect(screen.getByText('Create campaign…')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Switching
  // ---------------------------------------------------------------------------
  describe('switching campaigns', () => {
    it('calls switchCampaign when another campaign is clicked', () => {
      renderSelector();
      openMenu();
      fireEvent.click(screen.getByText('Skulls & Shackles'));
      expect(switchCampaignMock).toHaveBeenCalledWith(2);
    });

    it('does NOT call switchCampaign when the current campaign is clicked', () => {
      renderSelector();
      openMenu();
      fireEvent.click(within(screen.getByRole('menu')).getByText('Rise of the Runelords'));
      expect(switchCampaignMock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Join dialog
  // ---------------------------------------------------------------------------
  describe('join dialog', () => {
    const openJoinDialog = () => {
      openMenu();
      fireEvent.click(screen.getByText('Join a campaign…'));
    };

    it('redeems a valid invite code, shows a snackbar, and switches campaign', async () => {
      (api.post as any).mockResolvedValue({
        success: true,
        data: { campaign: { id: 5, name: 'Curse of the Crimson Throne', slug: 'cotct' }, role: 'Player' },
      });

      renderSelector();
      openJoinDialog();

      fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'abcd1234' } });
      fireEvent.click(screen.getByRole('button', { name: 'Join' }));

      await waitFor(() => {
        // Input is uppercased client-side before submit
        expect(api.post).toHaveBeenCalledWith('/invites/redeem', { code: 'ABCD1234' });
      });
      await waitFor(() => {
        expect(screen.getByText('Joined campaign "Curse of the Crimson Throne"')).toBeInTheDocument();
      });
      expect(switchCampaignMock).toHaveBeenCalledWith(5);
    });

    it('rejects codes that are not 6-8 alphanumeric characters client-side', async () => {
      renderSelector();
      openJoinDialog();

      fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'AB!' } });
      fireEvent.click(screen.getByRole('button', { name: 'Join' }));

      expect(await screen.findByText('Invite codes are 6-8 letters and numbers')).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('surfaces the backend envelope message on error', async () => {
      (api.post as any).mockRejectedValue({
        response: { status: 400, data: { success: false, message: 'You are already a member of this campaign' } },
      });

      renderSelector();
      openJoinDialog();

      fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'ABCD1234' } });
      fireEvent.click(screen.getByRole('button', { name: 'Join' }));

      expect(
        await screen.findByText('You are already a member of this campaign')
      ).toBeInTheDocument();
      expect(switchCampaignMock).not.toHaveBeenCalled();
    });

    it('shows a generic message when the error has no envelope', async () => {
      (api.post as any).mockRejectedValue(new Error('network down'));

      renderSelector();
      openJoinDialog();

      fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'ABCD1234' } });
      fireEvent.click(screen.getByRole('button', { name: 'Join' }));

      expect(await screen.findByText('Failed to redeem invite code')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Create dialog (superadmin)
  // ---------------------------------------------------------------------------
  describe('create dialog', () => {
    const openCreateDialog = () => {
      openMenu();
      fireEvent.click(screen.getByText('Create campaign…'));
    };

    beforeEach(() => {
      campaignContextValue = { ...defaultCampaignContext, isSuperadmin: true };
    });

    it('creates a campaign, shows a snackbar, and switches to it', async () => {
      (api.post as any).mockResolvedValue({
        success: true,
        data: { id: 9, name: 'Kingmaker', slug: 'kingmaker', world: 'Golarion', is_active: true },
      });

      renderSelector();
      openCreateDialog();

      fireEvent.change(screen.getByLabelText(/campaign name/i), { target: { value: 'Kingmaker' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/campaigns', { name: 'Kingmaker', world: 'Golarion' });
      });
      await waitFor(() => {
        expect(screen.getByText('Campaign "Kingmaker" created')).toBeInTheDocument();
      });
      expect(switchCampaignMock).toHaveBeenCalledWith(9);
    });

    it('surfaces backend envelope errors (e.g. duplicate slug)', async () => {
      (api.post as any).mockRejectedValue({
        response: { status: 409, data: { success: false, message: 'A campaign with this slug already exists' } },
      });

      renderSelector();
      openCreateDialog();

      fireEvent.change(screen.getByLabelText(/campaign name/i), { target: { value: 'Kingmaker' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(
        await screen.findByText('A campaign with this slug already exists')
      ).toBeInTheDocument();
      expect(switchCampaignMock).not.toHaveBeenCalled();
    });

    it('disables the Create button while the name is empty', () => {
      renderSelector();
      openCreateDialog();
      expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    });
  });
});
