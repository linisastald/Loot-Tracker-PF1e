import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
          { id: 10, name: 'Tidewater Rock', type: 'outpost' },
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

  it('shows loading spinner initially', () => {
    renderCrewManagement();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText(/Loading crew/i)).toBeInTheDocument();
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
});
