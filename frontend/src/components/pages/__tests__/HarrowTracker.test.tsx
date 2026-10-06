import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// --- Mocks -----------------------------------------------------------------
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockEnqueue = vi.fn();

vi.mock('../../../utils/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: mockEnqueue }),
}));

let mockIsDM = false;
vi.mock('../../../contexts/CampaignContext', () => ({
  useCampaign: () => ({ isDM: mockIsDM, isSuperadmin: false }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, username: 'valeros' } }),
}));

import HarrowTracker from '../HarrowTracker';

const STATE = {
  currentChapter: 2,
  enabled: true,
  balances: [
    { character_id: 1, name: 'Valeros', user_id: 7, balance: 3, choosing: { card_name: 'Locksmith', is_chosen_boon: true } },
    { character_id: 2, name: 'Merisiel', user_id: 8, balance: 0, choosing: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsDM = false;
  mockGet.mockImplementation((url: string) => {
    if (url === '/harrow') return Promise.resolve({ data: STATE });
    return Promise.resolve({ data: { ledger: [] } });
  });
  mockPost.mockResolvedValue({ data: {} });
});

const renderLoaded = async () => {
  render(<HarrowTracker />);
  await waitFor(() => expect(screen.getByText('Valeros')).toBeInTheDocument());
};

describe('HarrowTracker', () => {
  it('renders the current chapter header and roster', async () => {
    render(<HarrowTracker />);

    await waitFor(() => expect(screen.getByText('Seven Days to the Grave')).toBeInTheDocument());
    expect(screen.getByText('Valeros')).toBeInTheDocument();
    expect(screen.getByText('Merisiel')).toBeInTheDocument();
    // Choosing card shown
    expect(screen.getByText('Locksmith')).toBeInTheDocument();
    // Chapter ability chip (Constitution / CON)
    expect(screen.getByText(/Ability: Constitution \(CON\)/)).toBeInTheDocument();
  });

  it('hides the DM-only award control for players', async () => {
    await renderLoaded();
    expect(screen.queryByRole('button', { name: /Award from reading/i })).not.toBeInTheDocument();
  });

  it('shows the DM-only award control for DMs', async () => {
    mockIsDM = true;
    await renderLoaded();
    expect(screen.getByRole('button', { name: /Award from reading/i })).toBeInTheDocument();
  });

  it('warns when the system is disabled', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/harrow') return Promise.resolve({ data: { ...STATE, enabled: false } });
      return Promise.resolve({ data: { ledger: [] } });
    });
    render(<HarrowTracker />);
    await waitFor(() =>
      expect(screen.getByText(/Harrow Point Tracker is currently disabled/i)).toBeInTheDocument()
    );
  });

  describe('player actions', () => {
    it('lets a player spend points on their own character', async () => {
      const user = userEvent.setup();
      await renderLoaded();

      await user.click(screen.getByRole('button', { name: 'Spend points for Valeros' }));
      const dialog = await screen.findByRole('dialog');
      const input = within(dialog).getByLabelText('Points to spend');
      await user.clear(input);
      await user.type(input, '2');
      await user.click(within(dialog).getByRole('button', { name: 'Spend' }));

      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(mockPost).toHaveBeenCalledWith('/harrow/spend', {
        characterId: 1,
        points: 2,
        reason: undefined,
      });
      expect(mockEnqueue).toHaveBeenCalledWith('Spent points for Valeros', { variant: 'success' });
      // The roster is refreshed after the save
      await waitFor(() => expect(mockGet.mock.calls.filter((c) => c[0] === '/harrow')).toHaveLength(2));
    });

    it('does not let a player spend on someone else or with no points', async () => {
      await renderLoaded();
      expect(screen.getByRole('button', { name: 'Spend points for Merisiel' })).toBeDisabled();
    });

    it('surfaces the server error in a snackbar and leaves the dialog open', async () => {
      mockPost.mockRejectedValueOnce({
        response: { data: { message: 'Not enough Harrow Points: Valeros has 3 this chapter, tried to spend 3' } },
      });
      const user = userEvent.setup();
      await renderLoaded();

      await user.click(screen.getByRole('button', { name: 'Spend points for Valeros' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Spend' }));

      await waitFor(() =>
        expect(mockEnqueue).toHaveBeenCalledWith(
          'Not enough Harrow Points: Valeros has 3 this chapter, tried to spend 3',
          { variant: 'error' }
        )
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('records the Choosing card for the player\'s own character', async () => {
      const user = userEvent.setup();
      await renderLoaded();

      await user.click(screen.getByRole('button', { name: 'Choosing card for Valeros' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(mockPost).toHaveBeenCalledWith('/harrow/choosing', {
        characterId: 1,
        cardName: 'Locksmith',
        isChosenBoon: true,
      });
    });

    it('loads a character\'s ledger into the history drawer', async () => {
      mockGet.mockImplementation((url: string) => {
        if (url === '/harrow') return Promise.resolve({ data: STATE });
        return Promise.resolve({
          data: {
            ledger: [
              { id: 1, chapter: 2, delta: 3, reason: 'Chapter 2 harrowing', entry_type: 'award', created_at: '2026-01-01T00:00:00Z', created_by_name: 'dm' },
            ],
          },
        });
      });
      const user = userEvent.setup();
      await renderLoaded();

      await user.click(screen.getByRole('button', { name: 'History for Valeros' }));

      expect(await screen.findByText('Chapter 2 harrowing')).toBeInTheDocument();
      expect(mockGet).toHaveBeenCalledWith('/harrow/1/ledger');
    });
  });

  describe('DM actions', () => {
    it('awards one point to a character', async () => {
      mockIsDM = true;
      const user = userEvent.setup();
      await renderLoaded();

      await user.click(screen.getByRole('button', { name: 'Award 1 point to Merisiel' }));

      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(mockPost).toHaveBeenCalledWith('/harrow/award', { characterId: 2, points: 1 });
    });

    it('keeps the roster on screen while it refreshes after an award', async () => {
      mockIsDM = true;
      const user = userEvent.setup();
      await renderLoaded();

      // The refetch never resolves: the page must not fall back to the spinner
      mockGet.mockImplementation(() => new Promise(() => {}));
      await user.click(screen.getByRole('button', { name: 'Award 1 point to Valeros' }));

      await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
      expect(screen.getByText('Valeros')).toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('submits the award helper with suit matches and Choosing hits', async () => {
      mockIsDM = true;
      const user = userEvent.setup();
      await renderLoaded();

      await user.click(screen.getByRole('button', { name: /Award from reading/i }));
      const dialog = await screen.findByRole('dialog');
      const matches = within(dialog).getByLabelText(/spread cards match Shields/);
      await user.clear(matches);
      await user.type(matches, '3');
      await user.click(within(dialog).getByRole('checkbox', { name: /Merisiel/ }));
      // Preview: 3 matches + 1 (+1 for the ticked Choosing hit)
      expect(within(dialog).getByText('+4')).toBeInTheDocument();
      expect(within(dialog).getByText('+5')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Award all' }));

      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(mockPost).toHaveBeenCalledWith('/harrow/award-batch', {
        suitMatchCount: 3,
        awards: [
          { characterId: 1, choosingHit: false },
          { characterId: 2, choosingHit: true },
        ],
      });
    });

    it('requires a reason before applying an adjustment', async () => {
      mockIsDM = true;
      const user = userEvent.setup();
      await renderLoaded();

      await user.click(screen.getByRole('button', { name: 'Adjust points for Valeros' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeDisabled();

      await user.clear(within(dialog).getByLabelText(/Delta/));
      await user.type(within(dialog).getByLabelText(/Delta/), '-2');
      await user.type(within(dialog).getByLabelText(/Reason/), 'Typo fix');
      await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(mockPost).toHaveBeenCalledWith('/harrow/adjust', {
        characterId: 1,
        delta: -2,
        reason: 'Typo fix',
      });
    });

    it('advances the chapter', async () => {
      mockIsDM = true;
      const user = userEvent.setup();
      await renderLoaded();

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: /3\./ }));
      await user.click(screen.getByRole('button', { name: 'Advance' }));

      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(mockPost).toHaveBeenCalledWith('/harrow/chapter', { chapter: 3 });
    });
  });
});
