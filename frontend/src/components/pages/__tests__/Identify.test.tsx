import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

// Mock the AuthContext
const mockUseAuth = vi.fn();
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// DM gating comes from the current campaign, not the account
let mockIsDM = false;
// The active character of the selected campaign (the auth user's is NOT used)
let mockActiveCharacterId: number | null = 10;
vi.mock('../../../contexts/CampaignContext', () => ({
  useIsDM: () => mockIsDM,
  useActiveCharacterId: () => mockActiveCharacterId,
}));

// Mock lootService
vi.mock('../../../services/lootService', () => ({
  default: {
    getUnidentifiedItems: vi.fn().mockResolvedValue({
      data: { items: [], pagination: {} },
    }),
    identifyItems: vi.fn().mockResolvedValue({
      data: { identified: [], failed: [], alreadyAttempted: [] },
    }),
  },
}));

// Mock CustomLootTable to avoid deep dependency tree. The stub renders one
// checkbox per row so tests can select items through handleSelectItem.
vi.mock('../../common/CustomLootTable', () => ({
  default: (props: any) => (
    <div data-testid="custom-loot-table">
      CustomLootTable Mock
      {props.loot.map((row: any) => (
        <label key={row.id}>
          <input
            type="checkbox"
            aria-label={`select ${row.name}`}
            checked={props.selectedItems.includes(row.id)}
            onChange={() => props.handleSelectItem(row.id)}
          />
          {row.name}
        </label>
      ))}
    </div>
  ),
}));

import Identify from '../Identify';
import lootService from '../../../services/lootService';

const renderIdentify = (authOverrides = {}, activeCharacterId: number | null = 10) => {
  mockActiveCharacterId = activeCharacterId;
  const defaultAuth = {
    // activeCharacterId here is deliberately a DIFFERENT campaign's character
    user: { id: 1, username: 'testplayer', role: 'player', activeCharacterId: 99 },
    isAuthenticated: true,
    refreshUser: vi.fn(),
    setUser: vi.fn(),
    ...authOverrides,
  };
  mockIsDM = Boolean((authOverrides as { isDM?: boolean }).isDM);
  mockUseAuth.mockReturnValue(defaultAuth);

  return render(
    <BrowserRouter>
      <Identify />
    </BrowserRouter>
  );
};

describe('Identify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the identification UI with Identify buttons', () => {
    renderIdentify();

    expect(screen.getByRole('button', { name: /^Identify$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Identify All/i })).toBeInTheDocument();
  });

  it('renders the CustomLootTable component', () => {
    renderIdentify();

    expect(screen.getByTestId('custom-loot-table')).toBeInTheDocument();
  });

  it('shows spellcraft input for non-DM users', () => {
    renderIdentify({ isDM: false });

    expect(screen.getByLabelText(/Spellcraft/i)).toBeInTheDocument();
  });

  it('has no Take 10 option: the server rolls the d20 (owner decision 2026-10-06)', () => {
    renderIdentify({ isDM: false });

    expect(screen.queryByLabelText(/Take 10/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/take 10/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Spellcraft bonus/i)).toBeInTheDocument();
  });

  it('hides spellcraft input and Take 10 for DM users', () => {
    renderIdentify({ isDM: true, user: { id: 1, username: 'dm', role: 'DM' } });

    expect(screen.queryByLabelText(/Spellcraft/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Take 10/i)).not.toBeInTheDocument();
  });

  it('disables Identify button when no items are selected', () => {
    renderIdentify();

    const identifyButton = screen.getByRole('button', { name: /^Identify$/i });
    expect(identifyButton).toBeDisabled();
  });

  it('restores spellcraft value from localStorage', () => {
    localStorage.setItem('spellcraftBonus', '15');
    renderIdentify();

    const spellcraftInput = screen.getByLabelText(/Spellcraft/i) as HTMLInputElement;
    expect(spellcraftInput.value).toBe('15');
  });

  describe('identify request payload (F-1294)', () => {
    const unidentified = {
      id: 7, name: 'Unknown Ring', itemid: 3, unidentified: true, quantity: 1, value: 0, notes: '',
    };

    beforeEach(() => {
      (lootService.getUnidentifiedItems as any).mockResolvedValue({
        data: { items: [unidentified], pagination: {} },
      });
    });

    it('a DM sends dmIdentify and no roll (never the old 99 sentinel)', async () => {
      renderIdentify({ isDM: true, user: { id: 1, username: 'dm', role: 'DM' } });
      const btn = await screen.findByRole('button', { name: /Identify All/i });
      await waitFor(() => expect(btn).not.toBeDisabled());
      fireEvent.click(btn);

      await waitFor(() => expect(lootService.identifyItems).toHaveBeenCalled());
      const payload = (lootService.identifyItems as any).mock.calls[0][0];
      expect(payload.dmIdentify).toBe(true);
      expect(payload.characterId).toBeNull();
      expect(payload.spellcraftRolls).toBeUndefined();
      expect(payload.spellcraftBonus).toBeUndefined();
    });

    it('a player sends the bonus, never a roll, and no dmIdentify', async () => {
      localStorage.setItem('spellcraftBonus', '5');
      renderIdentify();
      const btn = await screen.findByRole('button', { name: /Identify All/i });
      await waitFor(() => expect(btn).not.toBeDisabled());
      fireEvent.click(btn);

      await waitFor(() => expect(lootService.identifyItems).toHaveBeenCalled());
      const payload = (lootService.identifyItems as any).mock.calls[0][0];
      expect(payload.dmIdentify).toBeUndefined();
      expect(payload.characterId).toBe(10);
      expect(payload.spellcraftBonus).toBe(5);
      expect(payload).not.toHaveProperty('spellcraftRolls');
    });
  });

  describe('identify action', () => {
    const ring = { id: 7, name: 'Unknown Ring', itemid: 3, unidentified: true, quantity: 1 };
    const wand = { id: 8, name: 'Unknown Wand', itemid: 4, unidentified: true, quantity: 1 };

    beforeEach(() => {
      (lootService.getUnidentifiedItems as any).mockResolvedValue({
        data: { items: [ring, wand], pagination: {} },
      });
      (lootService.identifyItems as any).mockResolvedValue({
        data: { identified: [], failed: [], alreadyAttempted: [] },
      });
    });

    const selectAndIdentify = async (...names: string[]) => {
      for (const name of names) {
        fireEvent.click(await screen.findByLabelText(`select ${name}`));
      }
      fireEvent.click(screen.getByRole('button', { name: /^Identify$/i }));
    };

    it('sends only the selected items and the spellcraft bonus', async () => {
      localStorage.setItem('spellcraftBonus', '7');
      renderIdentify();

      await selectAndIdentify('Unknown Wand');

      await waitFor(() => expect(lootService.identifyItems).toHaveBeenCalled());
      expect((lootService.identifyItems as any).mock.calls[0][0]).toEqual({
        items: [8],
        characterId: 10,
        spellcraftBonus: 7,
      });
    });

    it('never rolls in the browser: the request carries one bonus whatever Math.random says', async () => {
      localStorage.setItem('spellcraftBonus', '4');
      const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
      renderIdentify();

      await selectAndIdentify('Unknown Ring', 'Unknown Wand');

      await waitFor(() => expect(lootService.identifyItems).toHaveBeenCalled());
      const payload = (lootService.identifyItems as any).mock.calls[0][0];
      expect(payload.items).toEqual([7, 8]);
      expect(payload.spellcraftBonus).toBe(4);
      expect(random).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });

    it('treats a blank bonus as 0', async () => {
      renderIdentify();
      await selectAndIdentify('Unknown Ring');
      await waitFor(() => expect(lootService.identifyItems).toHaveBeenCalled());
      expect((lootService.identifyItems as any).mock.calls[0][0].spellcraftBonus).toBe(0);
    });

    it.each(['61', '-11', '2.5'])('refuses a bonus of %s without calling the server', async (bonus) => {
      localStorage.setItem('spellcraftBonus', bonus);
      renderIdentify();

      await selectAndIdentify('Unknown Ring');

      expect(await screen.findByText(/Spellcraft bonus must be a whole number from -10 to 60/i)).toBeInTheDocument();
      expect(lootService.identifyItems).not.toHaveBeenCalled();
    });

    it('requires an active character for a player', async () => {
      renderIdentify({ user: { id: 1, username: 'p', role: 'player', activeCharacterId: 99 } }, null);

      await selectAndIdentify('Unknown Ring');

      expect(await screen.findByText(/Active character required/i)).toBeInTheDocument();
      expect(lootService.identifyItems).not.toHaveBeenCalled();
    });

    it('Identify All sends every listed item', async () => {
      renderIdentify();
      const btn = await screen.findByRole('button', { name: /Identify All/i });
      await waitFor(() => expect(btn).not.toBeDisabled());
      fireEvent.click(btn);

      await waitFor(() => expect(lootService.identifyItems).toHaveBeenCalled());
      expect((lootService.identifyItems as any).mock.calls[0][0].items).toEqual([7, 8]);
    });

    it('lists identified items, the curse flag and the summary message', async () => {
      (lootService.identifyItems as any).mockResolvedValue({
        data: {
          identified: [
            { id: 7, oldName: 'Unknown Ring', newName: 'Ring of Protection +1', spellcraftRoll: 30, roll: 18, bonus: 12, total: 30, requiredDC: 20, cursedDetected: true },
          ],
          failed: [{ id: 8, name: 'Unknown Wand', spellcraftRoll: 5, roll: 2, bonus: 3, total: 5, requiredDC: 20 }],
        },
      });
      renderIdentify();

      await selectAndIdentify('Unknown Ring', 'Unknown Wand');

      expect(await screen.findByText('Ring of Protection +1')).toBeInTheDocument();
      // The page shows the server's roll, bonus, total and the DC
      expect(screen.getByRole('cell', { name: '18' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: '12' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: '30' })).toBeInTheDocument();
      expect(screen.getAllByRole('cell', { name: '20' })).toHaveLength(2);
      expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
      expect(screen.getByText('CURSED DETECTED!')).toBeInTheDocument();
      expect(screen.getByText('Failed (roll too low)')).toBeInTheDocument();
      expect(screen.getByText(/Successfully identified 1 item\(s\)\. Failed to identify 1 item\(s\)\./)).toBeInTheDocument();
    });

    it('shows a server-side item error instead of "roll too low"', async () => {
      (lootService.identifyItems as any).mockResolvedValue({
        data: { identified: [], failed: [{ id: 8, error: 'Item with id 4 not found' }] },
      });
      renderIdentify();

      await selectAndIdentify('Unknown Wand');

      expect(await screen.findByText('Error: Item with id 4 not found')).toBeInTheDocument();
      expect(screen.queryByText('Failed (roll too low)')).not.toBeInTheDocument();
      // Falls back to the name already listed on the page
      expect(screen.getAllByText('Unknown Wand').length).toBeGreaterThan(0);
    });

    it('reports items already attempted today', async () => {
      (lootService.identifyItems as any).mockResolvedValue({
        data: { identified: [], failed: [], alreadyAttempted: [{ id: 7, message: 'x' }] },
      });
      renderIdentify();

      await selectAndIdentify('Unknown Ring');

      expect(await screen.findByText(/already attempted to identify 1 item\(s\) today/i)).toBeInTheDocument();
    });

    it('shows the server message when the request fails and clears the selection', async () => {
      (lootService.identifyItems as any).mockRejectedValue({
        response: { data: { message: 'You can only identify items as your own character' } },
      });
      renderIdentify();

      await selectAndIdentify('Unknown Ring');

      expect(await screen.findByText('You can only identify items as your own character')).toBeInTheDocument();
      expect(screen.getByLabelText('select Unknown Ring')).not.toBeChecked();
    });

    it('uses a generic message when the failure has no response', async () => {
      (lootService.identifyItems as any).mockRejectedValue(new Error('network'));
      renderIdentify();

      await selectAndIdentify('Unknown Ring');

      expect(await screen.findByText('Error identifying items. Please try again.')).toBeInTheDocument();
    });
  });
});
