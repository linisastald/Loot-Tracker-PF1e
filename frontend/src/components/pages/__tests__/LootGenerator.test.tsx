import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import api from '../../../utils/api';
import LootGenerator from '../LootGenerator';

const renderPage = () =>
  render(
    <BrowserRouter>
      <LootGenerator />
    </BrowserRouter>
  );

const PREVIEW = {
  coins: { platinum: 5, gold: 200, silver: 0, copper: 0 },
  coinsGp: 250,
  items: [
    { name: '+1 Longsword', unidentifiedName: 'Masterwork Longsword', type: 'weapon', size: 'Medium', value: 2315, quantity: 1, itemId: 2, modIds: [417], unidentified: true, spellcraftDc: 18, masterwork: false },
    { name: 'Trinket', type: 'gear', size: 'Medium', value: 100, quantity: 2, itemId: 1, modIds: null, unidentified: false, spellcraftDc: null, masterwork: false },
  ],
  totalGp: 2765,
  track: 'medium',
  modifier: 1,
};

describe('LootGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'dm', role: 'DM' }));
    (api.get as any).mockResolvedValue({ data: { track: 'medium', modifier: 1 } });
    (api.post as any).mockImplementation((url: string) => {
      if (url === '/loot-generator/generate') return Promise.resolve({ data: PREVIEW });
      if (url === '/loot-generator/commit') return Promise.resolve({ data: { itemsCreated: 2, coinsPosted: true } });
      if (url === '/loot-generator/settings') return Promise.resolve({ data: { track: 'medium', modifier: 1 } });
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => localStorage.clear());

  it('shows a DM-only warning for non-DMs', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 2, username: 'p', role: 'Player' }));
    renderPage();
    expect(screen.getByText(/available to DMs only/i)).toBeInTheDocument();
  });

  it('renders the encounter form and generate button for a DM', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /Loot Generator/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Treasure/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add enemy/i })).toBeInTheDocument();
  });

  it('generates a preview and shows items and coins', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Generate Treasure/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/loot-generator/generate', expect.any(Object));
      // unidentified item shows its generic name, not the real one
      expect(screen.getByText('Masterwork Longsword')).toBeInTheDocument();
    });
    expect(screen.queryByText('+1 Longsword')).not.toBeInTheDocument();
    expect(screen.getByText('Trinket')).toBeInTheDocument();
    expect(screen.getByText(/Total ≈ 2,765 gp/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send to Pending Loot/i })).toBeInTheDocument();
  });

  it('commits the preview to pending loot', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Generate Treasure/i }));
    await waitFor(() => expect(screen.getByText('Masterwork Longsword')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Send to Pending Loot/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/loot-generator/commit', expect.objectContaining({
        items: expect.any(Array),
        coins: expect.any(Object),
      }));
      expect(screen.getByText(/Committed 2 item stack/i)).toBeInTheDocument();
    });
  });
});
