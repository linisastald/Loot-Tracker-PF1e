import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

// Mock the AuthContext
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testplayer', role: 'player', activeCharacterId: 10 },
    isAuthenticated: true,
    isDM: false,
    refreshUser: vi.fn(),
    setUser: vi.fn(),
  }),
}));

// Mock api utility
vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/cities') {
        return Promise.resolve({
          data: [
            { id: 1, name: 'Sandpoint', size: 'Small Town', base_value: 1000, purchase_limit: 5000, max_spell_level: 1, population: 1240 },
            { id: 2, name: 'Magnimar', size: 'Large City', base_value: 8000, purchase_limit: 50000, max_spell_level: 6, population: 16428 },
          ],
        });
      }
      if (url === '/item-creation/mods') {
        return Promise.resolve({ data: { mods: [] } });
      }
      if (url === '/spellcasting/spells') {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock lootService
vi.mock('../../../services/lootService', () => ({
  default: {
    suggestItems: vi.fn().mockResolvedValue({ data: { suggestions: [], count: 0 } }),
  },
}));

import CityServices from '../CityServices';

const renderCityServices = () => {
  return render(
    <BrowserRouter>
      <CityServices />
    </BrowserRouter>
  );
};

describe('CityServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the City Services heading', async () => {
    renderCityServices();

    expect(screen.getByText('City Services')).toBeInTheDocument();
  });

  it('renders Item Availability and Spellcasting Services tabs', async () => {
    renderCityServices();

    expect(screen.getByRole('tab', { name: /Item Availability/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Spellcasting Services/i })).toBeInTheDocument();
  });

  it('renders the City Name autocomplete field', async () => {
    renderCityServices();

    expect(screen.getByLabelText(/City Name/i)).toBeInTheDocument();
  });

  it('renders the Settlement Size dropdown', async () => {
    renderCityServices();

    // MUI Select renders the label as text (may appear multiple times in DOM)
    const elements = screen.getAllByText(/Settlement Size/i);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('renders the Settlement Information section', async () => {
    renderCityServices();

    expect(screen.getByText('Settlement Information')).toBeInTheDocument();
  });

  it('renders Item Search section on the default tab', async () => {
    renderCityServices();

    expect(screen.getByText('Item Search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check Availability/i })).toBeInTheDocument();
  });

  it('switches to Spellcasting Services tab when clicked', async () => {
    renderCityServices();

    const spellcastingTab = screen.getByRole('tab', { name: /Spellcasting Services/i });
    fireEvent.click(spellcastingTab);

    await waitFor(() => {
      expect(screen.getByText('Spellcasting Service Request')).toBeInTheDocument();
    });
  });

  it('renders the settlement reference table', async () => {
    renderCityServices();

    expect(screen.getByText('Settlement Quick Reference')).toBeInTheDocument();
    // Check for settlement size entries in the reference table
    expect(screen.getByText('Thorp')).toBeInTheDocument();
    expect(screen.getByText('Metropolis')).toBeInTheDocument();
  });

  it('renders Check Availability & Cost button on spellcasting tab', async () => {
    renderCityServices();

    const spellcastingTab = screen.getByRole('tab', { name: /Spellcasting Services/i });
    fireEvent.click(spellcastingTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Check Availability & Cost/i })).toBeInTheDocument();
    });
  });

  it('renders Caster Level field on spellcasting tab', async () => {
    renderCityServices();

    const spellcastingTab = screen.getByRole('tab', { name: /Spellcasting Services/i });
    fireEvent.click(spellcastingTab);

    await waitFor(() => {
      expect(screen.getByLabelText(/Caster Level/i)).toBeInTheDocument();
    });
  });
});
