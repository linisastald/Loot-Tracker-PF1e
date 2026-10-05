import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

// Mock crewService
vi.mock('../../../services/crewService', () => ({
  default: {
    getAllCrew: vi.fn().mockResolvedValue({
      data: {
        crew: [
          { id: 1, name: 'Barnabas Bligh', race: 'Human', age: 34, location_id: 1, location_type: 'ship', ship_position: 'Crew' },
          { id: 2, name: 'Crimson Cogward', race: 'Human', age: 29, location_id: 1, location_type: 'ship', ship_position: 'Rigger' },
          // Outpost id 1 deliberately shares its id with ship id 1
          { id: 4, name: 'Dockhand Dune', race: 'Human', age: 40, location_id: 1, location_type: 'outpost', ship_position: null },
        ],
      },
    }),
    getDeceasedCrew: vi.fn().mockResolvedValue({
      data: {
        crew: [
          { id: 3, name: 'Badger Medlar', race: 'Half-Orc', death_date: '2024-01-01', last_known_location: 'The Wormwood' },
        ],
      },
    }),
    createCrew: vi.fn().mockResolvedValue({ data: {} }),
    updateCrew: vi.fn().mockResolvedValue({ data: {} }),
    deleteCrew: vi.fn().mockResolvedValue({ data: {} }),
    moveCrewToLocation: vi.fn().mockResolvedValue({ data: {} }),
    markCrewDead: vi.fn().mockResolvedValue({ data: {} }),
    markCrewDeparted: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock shipService
vi.mock('../../../services/shipService', () => ({
  default: {
    getAllShips: vi.fn().mockResolvedValue({
      data: {
        ships: [
          { id: 1, name: "Man's Promise", status: 'PC Active', type: 'ship' },
        ],
      },
    }),
  },
}));

// Mock outpostService
vi.mock('../../../services/outpostService', () => ({
  default: {
    getAllOutposts: vi.fn().mockResolvedValue({
      data: {
        outposts: [
          { id: 1, name: 'Tidewater Rock', type: 'outpost' },
        ],
      },
    }),
  },
}));

// Mock golarionDate utilities
vi.mock('../../../utils/golarionDate', () => ({
  getTodayInInputFormat: vi.fn().mockResolvedValue('4722-01-15'),
  golarionToInputFormat: vi.fn().mockReturnValue('4722-01-15'),
  inputFormatToGolarion: vi.fn().mockReturnValue({ year: 4722, month: 1, day: 15 }),
}));

// Mock raceData
vi.mock('../../../data/raceData', () => ({
  STANDARD_RACES: ['Human', 'Elf', 'Dwarf', 'Halfling', 'Half-Elf', 'Half-Orc', 'Gnome'],
  generateRandomName: vi.fn().mockReturnValue('Random Sailor'),
  generateRandomRace: vi.fn().mockReturnValue('Human'),
  generateRandomAge: vi.fn().mockReturnValue(25),
}));

import CrewManagement from '../CrewManagement';
import crewService from '../../../services/crewService';

const renderCrewManagement = () => {
  return render(
    <BrowserRouter>
      <CrewManagement />
    </BrowserRouter>
  );
};

describe('CrewManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    renderCrewManagement();

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('renders the Crew Management heading after loading', async () => {
    renderCrewManagement();

    await waitFor(() => {
      expect(screen.getByText('Crew Management')).toBeInTheDocument();
    });
  });

  it('renders Add Crew Member button after loading', async () => {
    renderCrewManagement();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Crew Member/i })).toBeInTheDocument();
    });
  });

  it('renders Recruit Crew button after loading', async () => {
    renderCrewManagement();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Recruit Crew/i })).toBeInTheDocument();
    });
  });

  it('renders Active Crew and Deceased/Departed tabs', async () => {
    renderCrewManagement();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Active Crew/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Deceased\/Departed/i })).toBeInTheDocument();
    });
  });

  it('renders crew member names in the table after loading', async () => {
    renderCrewManagement();

    await waitFor(() => {
      expect(screen.getByText('Barnabas Bligh')).toBeInTheDocument();
      expect(screen.getByText('Crimson Cogward')).toBeInTheDocument();
    });
  });

  it('renders crew table column headers', async () => {
    renderCrewManagement();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Race')).toBeInTheDocument();
      expect(screen.getByText('Location')).toBeInTheDocument();
      expect(screen.getByText('Position')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  it('shows ship location for crew members assigned to ships', async () => {
    renderCrewManagement();

    await waitFor(() => {
      // Both crew members are on Man's Promise
      const locationCells = screen.getAllByText("Man's Promise");
      expect(locationCells.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ship and outpost sharing the same id', () => {
    it('saves an edit of an outpost crew member with location_type outpost', async () => {
      const user = userEvent.setup();
      renderCrewManagement();
      const row = (await screen.findByText('Dockhand Dune')).closest('tr') as HTMLElement;
      await user.click(within(row).getByTitle('Edit'));
      // The dialog must preselect the outpost, not the ship with the same id
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText(/Location/)).toHaveValue('Tidewater Rock (Outpost)');
      await user.click(within(dialog).getByRole('button', { name: 'Update' }));
      await waitFor(() => expect(crewService.updateCrew).toHaveBeenCalled());
      expect(crewService.updateCrew).toHaveBeenCalledWith(
        4,
        expect.objectContaining({ location_type: 'outpost', location_id: 1 })
      );
    });

    it('moves a crew member to the outpost, not the same-id ship', async () => {
      const user = userEvent.setup();
      renderCrewManagement();
      const row = (await screen.findByText('Barnabas Bligh')).closest('tr') as HTMLElement;
      await user.click(within(row).getByTitle('Move'));
      const dialog = await screen.findByRole('dialog');
      // Crew is on ship 1: the same-id outpost must still be offered
      await user.click(within(dialog).getByLabelText(/New Location/));
      await user.click(await screen.findByRole('option', { name: /Tidewater Rock/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Move' }));
      await waitFor(() => expect(crewService.moveCrewToLocation).toHaveBeenCalled());
      expect(crewService.moveCrewToLocation).toHaveBeenCalledWith(1, 'outpost', 1, null);
    });
  });
});
