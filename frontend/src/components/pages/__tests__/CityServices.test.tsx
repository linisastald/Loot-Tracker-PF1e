import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock lootService
vi.mock('../../../services/lootService', () => ({
  default: {
    suggestItems: vi.fn(),
    getMods: vi.fn(),
  },
}));

import api from '../../../utils/api';
import lootService from '../../../services/lootService';
import CityServices from '../CityServices';

const mockedApi = vi.mocked(api, true);
const mockedLoot = vi.mocked(lootService, true);

const CITIES = [
  { id: 1, name: 'Sandpoint', size: 'Small Town', base_value: 1000, purchase_limit: 5000, max_spell_level: 1, population: 1240 },
  { id: 2, name: 'Magnimar', size: 'Large City', base_value: 8000, purchase_limit: 50000, max_spell_level: 6, population: 16428 },
];

const RIDDLEPORT = {
  id: 7, name: 'Riddleport', size: 'Small City', base_value: 4000, purchase_limit: 25000, max_spell_level: 4,
};

const installDefaultMocks = () => {
  mockedApi.get.mockReset();
  mockedApi.post.mockReset();
  mockedLoot.suggestItems.mockReset();
  mockedLoot.getMods.mockReset();

  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/cities') return Promise.resolve({ data: CITIES });
    if (url === '/spellcasting/spells') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
  mockedApi.post.mockResolvedValue({ data: {} });
  mockedLoot.suggestItems.mockResolvedValue({ data: { suggestions: [], count: 0 } } as never);
  mockedLoot.getMods.mockResolvedValue({ data: { mods: [] } } as never);
};

const renderCityServices = () => {
  return render(
    <BrowserRouter>
      <CityServices />
    </BrowserRouter>
  );
};

const typeCity = (name: string) => {
  fireEvent.change(screen.getByLabelText(/City Name/i), { target: { value: name } });
};

const pickItem = async () => {
  mockedLoot.suggestItems.mockResolvedValue({
    data: { suggestions: [{ id: 5, name: 'Longsword', value: 15, type: 'weapon' }], count: 1 },
  } as never);
  fireEvent.change(screen.getByLabelText(/^Item/i), { target: { value: 'Long' } });
  const option = await screen.findByRole('option', { name: /Longsword/ });
  fireEvent.click(option);
};

describe('CityServices', () => {
  beforeEach(() => {
    installDefaultMocks();
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

  it('shows the corrected Village population and labels spellcasting as a house rule', async () => {
    renderCityServices();

    expect(screen.getByText('61-200')).toBeInTheDocument();
    expect(screen.queryByText('20-200')).not.toBeInTheDocument();
    expect(screen.getAllByText(/house rule/i).length).toBeGreaterThan(0);
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

  it('loads the city list and mods through the shared services on mount', async () => {
    renderCityServices();

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/cities'));
    await waitFor(() => expect(mockedLoot.getMods).toHaveBeenCalled());
  });

  it('shows an error instead of failing silently when the city list cannot load', async () => {
    mockedApi.get.mockImplementation((url: string) =>
      url === '/cities'
        ? Promise.reject({ response: { data: { message: 'Cities unavailable' } } })
        : Promise.resolve({ data: {} })
    );
    renderCityServices();

    expect(await screen.findByText('Cities unavailable')).toBeInTheDocument();
  });

  describe('city selection', () => {
    it('shows the settlement statistics when an existing city is chosen', async () => {
      renderCityServices();
      await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/cities'));

      fireEvent.mouseDown(screen.getByLabelText(/City Name/i));
      fireEvent.click(await screen.findByRole('option', { name: /Magnimar \(Large City\)/ }));

      const panel = within(screen.getByTestId('settlement-information'));
      expect(await panel.findByText('8,000 gp')).toBeInTheDocument();
      expect(panel.getByText('50,000 gp')).toBeInTheDocument();
      expect(panel.getByText('16,428')).toBeInTheDocument();
      expect(screen.getByLabelText(/City Name/i)).toHaveValue('Magnimar');
    });
  });

  describe('item availability check', () => {
    it('requires a city name', async () => {
      renderCityServices();

      fireEvent.click(screen.getByRole('button', { name: /Check Availability/i }));

      expect(await screen.findByText('Please enter a city name')).toBeInTheDocument();
      expect(mockedApi.post).not.toHaveBeenCalled();
    });

    it('requires an item', async () => {
      renderCityServices();
      typeCity('Riddleport');

      fireEvent.click(screen.getByRole('button', { name: /Check Availability/i }));

      expect(await screen.findByText('Please select an item')).toBeInTheDocument();
      expect(mockedApi.post).not.toHaveBeenCalled();
    });

    it('posts the city, size, item and active character, then shows the found result', async () => {
      mockedApi.post.mockResolvedValue({
        data: {
          found: true,
          roll_result: 12,
          availability: { threshold: 75, percentage: 75, description: 'Within base value' },
          item_value: 15,
          item_name: 'Longsword',
          city: RIDDLEPORT,
        },
      });
      renderCityServices();
      typeCity('Riddleport');
      await pickItem();

      fireEvent.click(screen.getByRole('button', { name: /Check Availability/i }));

      await waitFor(() => expect(mockedApi.post).toHaveBeenCalledTimes(1));
      expect(mockedApi.post).toHaveBeenCalledWith('/item-search/check', {
        item_id: 5,
        mod_ids: [],
        city_name: 'Riddleport',
        city_size: 'Small City',
        character_id: 10,
      });
      expect(await screen.findByText('Success! Longsword was found in Riddleport!')).toBeInTheDocument();
      const results = screen.getByText('Search Results').closest('.MuiCard-root') as HTMLElement;
      expect(within(results).getByText('FOUND')).toBeInTheDocument();
      expect(within(results).getByText('12 / 75')).toBeInTheDocument();
    });

    it('reports an item that was not found this time', async () => {
      mockedApi.post.mockResolvedValue({
        data: {
          found: false,
          roll_result: 90,
          availability: { threshold: 75, percentage: 75, description: 'Within base value' },
          item_value: 15,
          item_name: 'Longsword',
          city: RIDDLEPORT,
        },
      });
      renderCityServices();
      typeCity('Riddleport');
      await pickItem();

      fireEvent.click(screen.getByRole('button', { name: /Check Availability/i }));

      expect(await screen.findByText('Longsword was not found in Riddleport. Try again in 1 week.')).toBeInTheDocument();
      expect(screen.getByText('NOT FOUND')).toBeInTheDocument();
    });

    it('keeps the typed city name after a check (does not turn it into "Name (Size)")', async () => {
      mockedApi.post.mockResolvedValue({
        data: {
          found: true,
          roll_result: 12,
          availability: { threshold: 75, percentage: 75, description: 'Within base value' },
          item_value: 15,
          item_name: 'Longsword',
          city: RIDDLEPORT,
        },
      });
      renderCityServices();
      typeCity('Riddleport');
      await pickItem();

      fireEvent.click(screen.getByRole('button', { name: /Check Availability/i }));
      await screen.findByText('Success! Longsword was found in Riddleport!');
      expect(screen.getByLabelText(/City Name/i)).toHaveValue('Riddleport');
      fireEvent.click(screen.getByRole('button', { name: /Check Availability/i }));

      await waitFor(() => expect(mockedApi.post).toHaveBeenCalledTimes(2));
      expect(mockedApi.post.mock.calls[1][1]).toMatchObject({ city_name: 'Riddleport', city_size: 'Small City' });
    });

    it('shows the server message when the check fails', async () => {
      mockedApi.post.mockRejectedValue({ response: { data: { message: 'Item not found' } } });
      renderCityServices();
      typeCity('Riddleport');
      await pickItem();

      fireEvent.click(screen.getByRole('button', { name: /Check Availability/i }));

      expect(await screen.findByText('Item not found')).toBeInTheDocument();
    });

    it('does not let a slow earlier search overwrite newer results', async () => {
      let resolveSlow: (v: unknown) => void = () => undefined;
      mockedLoot.suggestItems
        .mockImplementationOnce(() => new Promise((resolve) => { resolveSlow = resolve; }) as never)
        .mockResolvedValue({ data: { suggestions: [{ id: 6, name: 'Longbow', value: 75, type: 'weapon' }], count: 1 } } as never);
      renderCityServices();

      const input = screen.getByLabelText(/^Item/i);
      fireEvent.change(input, { target: { value: 'Lo' } });
      await waitFor(() => expect(mockedLoot.suggestItems).toHaveBeenCalledTimes(1));
      fireEvent.change(input, { target: { value: 'Longb' } });
      expect(await screen.findByRole('option', { name: /Longbow/ })).toBeInTheDocument();

      resolveSlow({ data: { suggestions: [{ id: 9, name: 'Stale Sword', value: 1, type: 'weapon' }], count: 1 } });
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(screen.queryByRole('option', { name: /Stale Sword/ })).not.toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Longbow/ })).toBeInTheDocument();
    });
  });

  describe('spellcasting check', () => {
    const openSpellTab = () => fireEvent.click(screen.getByRole('tab', { name: /Spellcasting Services/i }));

    const pickSpell = async () => {
      mockedApi.get.mockImplementation((url: string) => {
        if (url === '/cities') return Promise.resolve({ data: CITIES });
        if (url === '/spellcasting/spells') {
          return Promise.resolve({ data: [{ id: 3, name: 'Fireball', spelllevel: 3 }] });
        }
        return Promise.resolve({ data: {} });
      });
      fireEvent.change(screen.getByLabelText(/^Spell/i), { target: { value: 'Fire' } });
      fireEvent.click(await screen.findByRole('option', { name: /Fireball \(Level 3\)/ }));
    };

    it('requires a spell', async () => {
      renderCityServices();
      typeCity('Riddleport');
      openSpellTab();

      fireEvent.click(await screen.findByRole('button', { name: /Check Availability & Cost/i }));

      expect(await screen.findByText('Please select a spell')).toBeInTheDocument();
      expect(mockedApi.post).not.toHaveBeenCalled();
    });

    it('defaults the caster level to the spell minimum and posts the request', async () => {
      mockedApi.post.mockResolvedValue({
        data: {
          available: true,
          cost: 750,
          formula: '3 x 5 x 10',
          spell_name: 'Fireball',
          spell_level: 3,
          caster_level: 5,
          settlement_caster_level: 9,
          city: RIDDLEPORT,
        },
      });
      renderCityServices();
      typeCity('Riddleport');
      openSpellTab();
      await pickSpell();

      expect(screen.getByLabelText(/Caster Level/i)).toHaveValue(5);
      fireEvent.click(screen.getByRole('button', { name: /Check Availability & Cost/i }));

      await waitFor(() => expect(mockedApi.post).toHaveBeenCalledTimes(1));
      const [url, payload] = mockedApi.post.mock.calls[0];
      expect(url).toBe('/spellcasting/check');
      expect(payload).toMatchObject({
        spell_id: 3,
        spell_name: 'Fireball',
        spell_level: 3,
        caster_level: 5,
        city_name: 'Riddleport',
        city_size: 'Small City',
      });
      expect(await screen.findByText('Fireball is available for 750 gp')).toBeInTheDocument();
      expect(screen.getByText('AVAILABLE')).toBeInTheDocument();
    });

    it('shows a not-available result with the backend message', async () => {
      mockedApi.post.mockResolvedValue({
        data: {
          available: false,
          message: 'Spell level exceeds this settlement',
          spell_name: 'Fireball',
          spell_level: 3,
          caster_level: 5,
          city: { ...RIDDLEPORT, max_spell_level: 1 },
        },
      });
      renderCityServices();
      typeCity('Riddleport');
      openSpellTab();
      await pickSpell();

      fireEvent.click(screen.getByRole('button', { name: /Check Availability & Cost/i }));

      expect(await screen.findByText('Spell level exceeds this settlement')).toBeInTheDocument();
      expect(screen.getByText('NOT AVAILABLE')).toBeInTheDocument();
    });
  });
});
