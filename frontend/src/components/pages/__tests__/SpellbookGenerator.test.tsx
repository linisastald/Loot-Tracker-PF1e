import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../../../utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

let mockIsDM = false;
vi.mock('../../../contexts/CampaignContext', () => ({
  useIsDM: () => mockIsDM,
}));

import api from '../../../utils/api';
import SpellbookGenerator from '../SpellbookGenerator';

const renderPage = () =>
  render(
    <BrowserRouter>
      <SpellbookGenerator />
    </BrowserRouter>
  );

const BOOK = {
  casterClass: 'wizard',
  classLabel: 'Wizard',
  casterLevel: 9,
  maxSpellLevel: 5,
  school: 'Evocation',
  spells: [
    { id: 1, name: 'Fireball', level: 3, school: 'Evocation' },
    { id: 2, name: 'Magic Missile', level: 1, school: 'Evocation' },
  ],
  value: 1000,
  spellCount: 2,
};

describe('SpellbookGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDM = true;
    (api.post as any).mockImplementation((url: string) => {
      if (url === '/loot-generator/spellbook') return Promise.resolve({ data: BOOK });
      if (url === '/loot-generator/commit') return Promise.resolve({ data: { itemsCreated: 1, coinsPosted: false } });
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => { mockIsDM = false; });

  it('shows a DM-only warning for non-DMs', () => {
    mockIsDM = false;
    renderPage();
    expect(screen.getByText(/available to DMs only/i)).toBeInTheDocument();
  });

  it('generates a book and lists its spells grouped by level', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Generate Spellbook/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/loot-generator/spellbook', expect.objectContaining({ casterClass: 'wizard' }));
      expect(screen.getByText('Fireball')).toBeInTheDocument();
    });
    expect(screen.getByText('Magic Missile')).toBeInTheDocument();
    expect(screen.getByText(/Wizard spellbook — CL 9/)).toBeInTheDocument();
  });

  it('sends the generated book to pending loot as a spellbook item', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Generate Spellbook/i }));
    await waitFor(() => expect(screen.getByText('Fireball')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Send to Pending Loot/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/loot-generator/commit', expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ type: 'spellbook' })]),
      }));
    });
  });
});
