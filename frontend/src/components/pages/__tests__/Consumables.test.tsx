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
});
