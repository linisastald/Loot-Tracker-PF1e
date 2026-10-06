import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock the api utility
vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../utils/api';
import Consumables from '../Consumables';

const mockConsumablesData = {
  wands: [
    { id: 1, name: 'Wand of Cure Light Wounds', quantity: 1, charges: 35 },
    { id: 2, name: 'Wand of Magic Missile', quantity: 2, charges: 10 },
  ],
  potionsScrolls: [
    { itemid: 1, name: 'Potion of Healing', quantity: 3 },
    { itemid: 2, name: 'Potion of Invisibility', quantity: 1 },
    { itemid: 3, name: 'Scroll of Fireball', quantity: 2 },
    { itemid: 4, name: 'Scroll of Identify', quantity: 5 },
  ],
};

const renderConsumables = () => {
  return render(
    <BrowserRouter>
      <Consumables />
    </BrowserRouter>
  );
};

describe('Consumables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as any).mockResolvedValue({ data: mockConsumablesData });
  });

  it('renders wands, potions, and scrolls section headers', async () => {
    renderConsumables();

    await waitFor(() => {
      expect(screen.getByText('Wands')).toBeInTheDocument();
    });

    expect(screen.getByText('Potions')).toBeInTheDocument();
    expect(screen.getByText('Scrolls')).toBeInTheDocument();
  });

  it('renders wand data from the API', async () => {
    renderConsumables();

    await waitFor(() => {
      expect(screen.getByText('Wand of Cure Light Wounds')).toBeInTheDocument();
      expect(screen.getByText('Wand of Magic Missile')).toBeInTheDocument();
    });
  });

  it('renders potion data from the API', async () => {
    renderConsumables();

    await waitFor(() => {
      expect(screen.getByText('Potion of Healing')).toBeInTheDocument();
      expect(screen.getByText('Potion of Invisibility')).toBeInTheDocument();
    });
  });

  it('renders scroll data from the API', async () => {
    renderConsumables();

    await waitFor(() => {
      expect(screen.getByText('Scroll of Fireball')).toBeInTheDocument();
      expect(screen.getByText('Scroll of Identify')).toBeInTheDocument();
    });
  });

  it('renders the search input', async () => {
    renderConsumables();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search consumables/i)).toBeInTheDocument();
    });
  });

  it('filters consumables based on search query', async () => {
    renderConsumables();

    await waitFor(() => {
      expect(screen.getByText('Wand of Cure Light Wounds')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search consumables/i);
    fireEvent.change(searchInput, { target: { value: 'Fireball' } });

    await waitFor(() => {
      expect(screen.getByText('Scroll of Fireball')).toBeInTheDocument();
      expect(screen.queryByText('Wand of Cure Light Wounds')).not.toBeInTheDocument();
      expect(screen.queryByText('Potion of Healing')).not.toBeInTheDocument();
    });
  });

  it('shows "No matching" messages when search yields no results in a section', async () => {
    renderConsumables();

    await waitFor(() => {
      expect(screen.getByText('Wand of Cure Light Wounds')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search consumables/i);
    fireEvent.change(searchInput, { target: { value: 'Nonexistent Item' } });

    await waitFor(() => {
      expect(screen.getByText(/no matching wands found/i)).toBeInTheDocument();
      expect(screen.getByText(/no matching potions found/i)).toBeInTheDocument();
      expect(screen.getByText(/no matching scrolls found/i)).toBeInTheDocument();
    });
  });

  it('displays wand charge information', async () => {
    renderConsumables();

    await waitFor(() => {
      expect(screen.getByText('35/50')).toBeInTheDocument();
      expect(screen.getByText('10/50')).toBeInTheDocument();
    });
  });

  it('fetches consumables from the API on mount', async () => {
    renderConsumables();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/consumables');
    });
  });

  it('sorts wands by a column when its header is clicked', async () => {
    renderConsumables();

    await waitFor(() => {
      expect(screen.getByText('Wand of Cure Light Wounds')).toBeInTheDocument();
    });

    // Default sort is by name ascending
    const namesBefore = screen.getAllByText(/^Wand of/).map((el) => el.textContent);
    expect(namesBefore).toEqual(['Wand of Cure Light Wounds', 'Wand of Magic Missile']);

    // Sorting by Charges ascending puts the 10-charge wand before the 35-charge wand
    fireEvent.click(screen.getByRole('button', { name: /charges/i }));

    await waitFor(() => {
      const namesAfter = screen.getAllByText(/^Wand of/).map((el) => el.textContent);
      expect(namesAfter).toEqual(['Wand of Magic Missile', 'Wand of Cure Light Wounds']);
    });
  });

  it('handles empty consumables data', async () => {
    (api.get as any).mockResolvedValue({
      data: { wands: [], potionsScrolls: [] },
    });

    renderConsumables();

    await waitFor(() => {
      expect(screen.getByText(/no wands available/i)).toBeInTheDocument();
      expect(screen.getByText(/no potions available/i)).toBeInTheDocument();
      expect(screen.getByText(/no scrolls available/i)).toBeInTheDocument();
    });
  });

  it('sends the type of the section a row is in, not one guessed from its name (F-1114)', async () => {
    (api.get as any).mockResolvedValue({
      data: {
        wands: [{ id: 9, name: 'Wand of Scroll of Doom', quantity: 1, charges: 5 }],
        potionsScrolls: [],
      },
    });
    (api.post as any).mockResolvedValue({ data: {} });
    renderConsumables();

    await waitFor(() => expect(screen.getByText('Wand of Scroll of Doom')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[0]);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/consumables/use', { itemid: 9, type: 'wand' });
    });
  });

  it('shows the server message when using a consumable fails (F-1116)', async () => {
    (api.post as any).mockRejectedValue({ response: { data: { message: 'Consumable not found or no uses left' } } });
    renderConsumables();

    await waitFor(() => expect(screen.getByText('Potion of Healing')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[0]);

    expect(await screen.findByText('Consumable not found or no uses left')).toBeInTheDocument();
  });

  it('shows an error when the consumables cannot be loaded (F-1116)', async () => {
    (api.get as any).mockRejectedValue(new Error('network'));
    renderConsumables();

    expect(await screen.findByText('Failed to load consumables')).toBeInTheDocument();
  });

  it('keeps the charges dialog open and explains a failed update (F-1116)', async () => {
    (api.get as any).mockResolvedValue({
      data: { wands: [{ id: 3, name: 'Wand of Fireball', quantity: 1, charges: null }], potionsScrolls: [] },
    });
    (api.put as any).mockRejectedValue({ response: { data: { message: 'Charges must be between 1 and 50' } } });
    renderConsumables();

    fireEvent.click(await screen.findByRole('button', { name: 'Enter Charges' }));
    fireEvent.change(screen.getByLabelText('Charges'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    expect(await screen.findByText('Charges must be between 1 and 50')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });
});
