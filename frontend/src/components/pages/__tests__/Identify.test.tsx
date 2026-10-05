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

// Mock CustomLootTable to avoid deep dependency tree
vi.mock('../../common/CustomLootTable', () => ({
  default: (props: any) => (
    <div data-testid="custom-loot-table">CustomLootTable Mock</div>
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
});
