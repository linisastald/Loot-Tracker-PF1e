import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock services before importing the component
vi.mock('../../../services/shipService', () => ({
  default: {
    getAllShips: vi.fn().mockResolvedValue({ data: { ships: [] } }),
    getShipTypes: vi.fn().mockResolvedValue({ data: { shipTypes: [] } }),
    createShip: vi.fn(),
    updateShip: vi.fn(),
    deleteShip: vi.fn(),
  },
}));

vi.mock('../../../services/crewService', () => ({
  default: {
    getCrewByLocation: vi.fn().mockResolvedValue({ data: { crew: [] } }),
  },
}));

vi.mock('../ShipDialog', () => ({
  default: () => <div data-testid="ship-dialog" />,
}));

vi.mock('../../../data/shipData', () => ({
  SHIP_IMPROVEMENTS: [],
}));

import ShipManagement from '../ShipManagement';
import shipService from '../../../services/shipService';

const renderComponent = () =>
  render(
    <BrowserRouter>
      <ShipManagement />
    </BrowserRouter>
  );

describe('ShipManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    renderComponent();
    expect(screen.getByText('Loading ships...')).toBeInTheDocument();
  });

  it('renders ship management heading after loading', async () => {
    renderComponent();
    const heading = await screen.findByText('Ship Management');
    expect(heading).toBeInTheDocument();
  });

  it('renders Add Ship button', async () => {
    renderComponent();
    const button = await screen.findByRole('button', { name: /add ship/i });
    expect(button).toBeInTheDocument();
  });

  it('renders tabs for Ship List and Ship Details', async () => {
    renderComponent();
    const listTab = await screen.findByRole('tab', { name: /ship list/i });
    expect(listTab).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /ship details/i })).toBeInTheDocument();
  });

  it('renders table headers when ship list loads', async () => {
    renderComponent();
    expect(await screen.findByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('calls shipService.getAllShips on mount', async () => {
    renderComponent();
    await screen.findByText('Ship Management');
    expect(shipService.getAllShips).toHaveBeenCalledTimes(1);
  });

  it('renders ships when data is returned', async () => {
    vi.mocked(shipService.getAllShips).mockResolvedValueOnce({
      data: {
        ships: [
          {
            id: 1,
            name: 'The Black Pearl',
            type: 'Sailing Ship',
            status: 'Active',
            hull_points: 100,
            max_hull_points: 100,
            crew_min: 20,
            crew_max: 50,
            current_hp: 100,
            max_hp: 100,
            crew_count: 30,
          },
        ],
      },
    });
    renderComponent();
    expect(await screen.findByText('The Black Pearl')).toBeInTheDocument();
  });

  it('shows error message when fetch fails', async () => {
    vi.mocked(shipService.getAllShips).mockRejectedValueOnce(new Error('Network error'));
    renderComponent();
    expect(await screen.findByText('Failed to load ships')).toBeInTheDocument();
  });
});
