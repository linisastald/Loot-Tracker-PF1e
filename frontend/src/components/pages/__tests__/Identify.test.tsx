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
vi.mock('../../../contexts/CampaignContext', () => ({
  useIsDM: () => mockIsDM,
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

const renderIdentify = (authOverrides = {}) => {
  const defaultAuth = {
    user: { id: 1, username: 'testplayer', role: 'player', activeCharacterId: 10 },
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

  it('shows Take 10 checkbox for non-DM users', () => {
    renderIdentify({ isDM: false });

    expect(screen.getByLabelText(/Take 10/i)).toBeInTheDocument();
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
    });

    it('a player sends rolls and no dmIdentify', async () => {
      localStorage.setItem('spellcraftBonus', '5');
      renderIdentify();
      const btn = await screen.findByRole('button', { name: /Identify All/i });
      await waitFor(() => expect(btn).not.toBeDisabled());
      fireEvent.click(btn);

      await waitFor(() => expect(lootService.identifyItems).toHaveBeenCalled());
      const payload = (lootService.identifyItems as any).mock.calls[0][0];
      expect(payload.dmIdentify).toBeUndefined();
      expect(payload.characterId).toBe(10);
      expect(payload.spellcraftRolls).toHaveLength(1);
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

    it('sends only the selected items with Take 10 plus the spellcraft bonus', async () => {
      localStorage.setItem('spellcraftBonus', '7');
      renderIdentify();
      fireEvent.click(screen.getByLabelText(/Take 10/i));

      await selectAndIdentify('Unknown Wand');

      await waitFor(() => expect(lootService.identifyItems).toHaveBeenCalled());
      expect((lootService.identifyItems as any).mock.calls[0][0]).toEqual({
        items: [8],
        characterId: 10,
        spellcraftRolls: [17],
      });
    });

    it('rolls a d20 plus the bonus per item when not taking 10', async () => {
      localStorage.setItem('spellcraftBonus', '4');
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 = 11
      renderIdentify();

      await selectAndIdentify('Unknown Ring', 'Unknown Wand');

      await waitFor(() => expect(lootService.identifyItems).toHaveBeenCalled());
      const payload = (lootService.identifyItems as any).mock.calls[0][0];
      expect(payload.items).toEqual([7, 8]);
      expect(payload.spellcraftRolls).toEqual([15, 15]);
      vi.restoreAllMocks();
    });

    it('requires an active character for a player', async () => {
      renderIdentify({ user: { id: 1, username: 'p', role: 'player' } });

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
            { id: 7, oldName: 'Unknown Ring', newName: 'Ring of Protection +1', spellcraftRoll: 30, cursedDetected: true },
          ],
          failed: [{ id: 8, name: 'Unknown Wand', spellcraftRoll: 5 }],
        },
      });
      renderIdentify();

      await selectAndIdentify('Unknown Ring', 'Unknown Wand');

      expect(await screen.findByText('Ring of Protection +1')).toBeInTheDocument();
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
