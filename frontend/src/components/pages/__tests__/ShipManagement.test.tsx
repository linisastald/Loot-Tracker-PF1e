import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  default: (props: { editingShip: unknown; onSave: () => void }) => (
    <div data-testid="ship-dialog">
      <button onClick={props.onSave}>Save Ship</button>
    </div>
  ),
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

  describe('editing an existing ship', () => {
    const baseShip = {
      id: 7,
      name: 'The Wormwood',
      type: 'Sailing Ship',
      status: 'PC Active',
      ship_type: 'sailing-ship',
      max_hp: 120,
      current_hp: 0,
      crew_count: 3,
    };

    const editAndSave = async (ship: Record<string, unknown>) => {
      vi.mocked(shipService.getAllShips).mockResolvedValueOnce({ data: { ships: [ship] } });
      vi.mocked(shipService.updateShip).mockResolvedValueOnce({ data: {} });
      const user = userEvent.setup();
      renderComponent();
      await screen.findByText(ship.name as string);
      await user.click(screen.getByTitle('Edit'));
      await user.click(await screen.findByRole('button', { name: 'Save Ship' }));
      await waitFor(() => expect(shipService.updateShip).toHaveBeenCalled());
      return vi.mocked(shipService.updateShip).mock.calls[0];
    };

    it('round-trips weapon_types, is_squibbing and zero hit points', async () => {
      const weaponTypes = [{ type: 'Ballista', quantity: 2 }];
      const [id, payload] = await editAndSave({
        ...baseShip,
        weapon_types: weaponTypes,
        weapons: [],
        is_squibbing: true,
      });
      expect(id).toBe(7);
      expect(payload.weapon_types).toEqual(weaponTypes);
      expect(payload.is_squibbing).toBe(true);
      expect(payload.current_hp).toBe(0);
    });

    it('does not send an empty weapon_types that would wipe legacy weapons', async () => {
      const legacy = [{ name: 'Light catapult', type: 'direct-fire' }];
      const [, payload] = await editAndSave({
        ...baseShip,
        weapon_types: [],
        weapons: legacy,
        is_squibbing: false,
      });
      expect(payload.weapons).toEqual(legacy);
      expect(payload.weapon_types || payload.weapons).toEqual(legacy);
      expect(payload.is_squibbing).toBe(false);
    });
  });
});
