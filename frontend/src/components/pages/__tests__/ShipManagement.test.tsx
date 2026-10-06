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
    getShipTypeData: vi.fn(),
    createShip: vi.fn(),
    updateShip: vi.fn(),
    deleteShip: vi.fn(),
    applyDamage: vi.fn(),
    repairShip: vi.fn(),
  },
}));

vi.mock('../../../services/crewService', () => ({
  default: {
    getCrewByLocation: vi.fn().mockResolvedValue({ data: { crew: [] } }),
  },
}));

vi.mock('../ShipDialog', () => ({
  default: (props: { editingShip: unknown; onSave: () => void; error?: string; open: boolean }) => (
    <div data-testid="ship-dialog">
      {props.open && props.error && <div role="alert">{props.error}</div>}
      <button onClick={props.onSave}>Save Ship</button>
    </div>
  ),
}));

vi.mock('../../../data/shipData', () => ({
  SHIP_IMPROVEMENTS: {},
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
            ship_type: 'sailing-ship',
            status: 'Active',
            min_crew: 20,
            max_crew: 50,
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

  describe('hull status', () => {
    it('labels a ship at 0 HP as Sunk, not Unknown', async () => {
      vi.mocked(shipService.getAllShips).mockResolvedValueOnce({
        data: { ships: [{ id: 1, name: 'Wreck', status: 'Sunk', current_hp: 0, max_hp: 100 }] },
      });
      renderComponent();
      await screen.findByText('Wreck');
      expect(screen.getAllByText('Sunk').length).toBeGreaterThan(0);
      expect(screen.queryByText('Unknown', { selector: '.MuiChip-label' })).not.toBeInTheDocument();
    });

    it('shows Pristine for a full-HP ship and Critical Damage for a nearly sunk one', async () => {
      vi.mocked(shipService.getAllShips).mockResolvedValueOnce({
        data: {
          ships: [
            { id: 1, name: 'Fresh', status: 'Active', current_hp: 100, max_hp: 100 },
            { id: 2, name: 'Battered', status: 'Active', current_hp: 5, max_hp: 100 },
          ],
        },
      });
      renderComponent();
      await screen.findByText('Fresh');
      expect(screen.getByText('Pristine')).toBeInTheDocument();
      expect(screen.getByText('Critical Damage')).toBeInTheDocument();
    });
  });

  describe('saving', () => {
    it('shows the server message inside the dialog when the save fails', async () => {
      vi.mocked(shipService.getAllShips).mockResolvedValueOnce({
        data: { ships: [{ id: 3, name: 'Hulk', status: 'Active', current_hp: 10, max_hp: 10 }] },
      });
      vi.mocked(shipService.updateShip).mockRejectedValueOnce({
        response: { data: { message: 'Ship name is required' } },
      });
      const user = userEvent.setup();
      renderComponent();
      await screen.findByText('Hulk');
      await user.click(screen.getByTitle('Edit'));
      await user.click(await screen.findByRole('button', { name: 'Save Ship' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Ship name is required');
    });

    it('clamps current HP to max HP and does not send fields the dialog cannot edit', async () => {
      vi.mocked(shipService.getAllShips).mockResolvedValueOnce({
        data: {
          ships: [{
            id: 4, name: 'Tall', status: 'Active', current_hp: 500, max_hp: 50,
            plunder: 9, officers: [{ name: 'x', position: 'y' }], captain_name: 'Cap', ship_notes: 'n',
          }],
        },
      });
      vi.mocked(shipService.updateShip).mockResolvedValueOnce({ data: {} });
      const user = userEvent.setup();
      renderComponent();
      await screen.findByText('Tall');
      await user.click(screen.getByTitle('Edit'));
      await user.click(await screen.findByRole('button', { name: 'Save Ship' }));
      await waitFor(() => expect(shipService.updateShip).toHaveBeenCalled());
      const payload = vi.mocked(shipService.updateShip).mock.calls[0][1];
      expect(payload.current_hp).toBe(50);
      ['plunder', 'officers', 'captain_name', 'ship_notes', 'infamy', 'cargo_manifest'].forEach((key) => {
        expect(payload).not.toHaveProperty(key);
      });
    });
  });

  describe('deleting', () => {
    const ship = { id: 5, name: 'Doomed', status: 'Active', current_hp: 10, max_hp: 10 };

    it('asks for confirmation, deletes and refreshes the list', async () => {
      vi.mocked(shipService.getAllShips)
        .mockResolvedValueOnce({ data: { ships: [ship] } })
        .mockResolvedValueOnce({ data: { ships: [] } });
      vi.mocked(shipService.deleteShip).mockResolvedValueOnce({ data: {} });
      const user = userEvent.setup();
      renderComponent();
      await screen.findByText('Doomed');
      await user.click(screen.getByTitle('Delete'));
      expect(await screen.findByText(/Are you sure you want to delete "Doomed"/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(shipService.deleteShip).toHaveBeenCalledWith(5));
      expect(await screen.findByText('Ship deleted successfully')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText('Doomed')).not.toBeInTheDocument());
    });

    it('shows the server message when the delete fails', async () => {
      vi.mocked(shipService.getAllShips).mockResolvedValueOnce({ data: { ships: [ship] } });
      vi.mocked(shipService.deleteShip).mockRejectedValueOnce({ response: { data: { message: 'Ship not found' } } });
      const user = userEvent.setup();
      renderComponent();
      await screen.findByText('Doomed');
      await user.click(screen.getByTitle('Delete'));
      await user.click(await screen.findByRole('button', { name: 'Delete' }));
      expect(await screen.findByText('Ship not found')).toBeInTheDocument();
    });

    it('closes the details tab when the ship shown there is deleted', async () => {
      vi.mocked(shipService.getAllShips)
        .mockResolvedValueOnce({ data: { ships: [ship] } })
        .mockResolvedValueOnce({ data: { ships: [] } });
      vi.mocked(shipService.deleteShip).mockResolvedValueOnce({ data: {} });
      const user = userEvent.setup();
      renderComponent();
      await screen.findByText('Doomed');
      await user.click(screen.getByTitle('View Details'));
      expect(await screen.findByText('Ship Information')).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: /ship list/i }));
      await user.click(screen.getByTitle('Delete'));
      await user.click(await screen.findByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.getByRole('tab', { name: /ship details/i })).toBeDisabled());
      expect(screen.getByRole('tab', { name: /ship list/i })).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('damage and repair', () => {
    const ship = { id: 6, name: 'Brig', status: 'Active', current_hp: 80, max_hp: 100, base_ac: 0 };

    it('applies damage, refreshes the list and keeps the details tab current', async () => {
      vi.mocked(shipService.getAllShips)
        .mockResolvedValueOnce({ data: { ships: [ship] } })
        .mockResolvedValueOnce({ data: { ships: [{ ...ship, current_hp: 50 }] } });
      vi.mocked(shipService.applyDamage).mockResolvedValueOnce({ data: { message: '30 damage applied' } });
      const user = userEvent.setup();
      renderComponent();
      await screen.findByText('Brig');
      await user.click(screen.getByTitle('View Details'));
      expect(await screen.findByText('80 / 100')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Apply Damage' }));
      await user.type(await screen.findByLabelText('Damage Amount'), '30');
      expect(screen.getByText('New HP: 50 / 100')).toBeInTheDocument();
      await user.click(screen.getAllByRole('button', { name: 'Apply Damage' }).pop() as HTMLElement);

      await waitFor(() => expect(shipService.applyDamage).toHaveBeenCalledWith(6, 30));
      expect(await screen.findByText('30 damage applied')).toBeInTheDocument();
      expect(await screen.findByText('50 / 100')).toBeInTheDocument();
    });

    it('repairs a damaged ship', async () => {
      vi.mocked(shipService.getAllShips)
        .mockResolvedValueOnce({ data: { ships: [ship] } })
        .mockResolvedValueOnce({ data: { ships: [{ ...ship, current_hp: 100 }] } });
      vi.mocked(shipService.repairShip).mockResolvedValueOnce({ data: { message: '20 HP repaired' } });
      const user = userEvent.setup();
      renderComponent();
      await screen.findByText('Brig');
      await user.click(screen.getByTitle('Repair Ship'));
      await user.type(await screen.findByLabelText('Repair Amount'), '20');
      await user.click(screen.getAllByRole('button', { name: 'Repair Ship' }).pop() as HTMLElement);
      await waitFor(() => expect(shipService.repairShip).toHaveBeenCalledWith(6, 20));
      expect(await screen.findByText('20 HP repaired')).toBeInTheDocument();
    });

    it('shows the server message when damage is rejected', async () => {
      vi.mocked(shipService.getAllShips).mockResolvedValueOnce({ data: { ships: [ship] } });
      vi.mocked(shipService.applyDamage).mockRejectedValueOnce({
        response: { data: { message: 'Damage amount must be a positive whole number' } },
      });
      const user = userEvent.setup();
      renderComponent();
      await screen.findByText('Brig');
      await user.click(screen.getByTitle('Apply Damage'));
      await user.type(await screen.findByLabelText('Damage Amount'), '5');
      await user.click(screen.getAllByRole('button', { name: 'Apply Damage' }).pop() as HTMLElement);
      expect(await screen.findByText('Damage amount must be a positive whole number')).toBeInTheDocument();
    });

    it('shows a stored 0 AC as 0 on the details tab, not the default 10', async () => {
      vi.mocked(shipService.getAllShips).mockResolvedValueOnce({ data: { ships: [ship] } });
      const user = userEvent.setup();
      renderComponent();
      await screen.findByText('Brig');
      await user.click(screen.getByTitle('View Details'));
      const label = await screen.findByText('Base AC');
      expect(label.nextElementSibling).toHaveTextContent(/^0$/);
    });
  });

  describe('pagination', () => {
    it('returns to the first page when rows per page changes', async () => {
      const many = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1, name: `Ship ${String(i + 1).padStart(2, '0')}`, status: 'Active', current_hp: 10, max_hp: 10,
      }));
      vi.mocked(shipService.getAllShips).mockResolvedValueOnce({ data: { ships: many } });
      const user = userEvent.setup();
      renderComponent();
      await screen.findByText('Ship 01');
      await user.click(screen.getByRole('button', { name: /next page/i }));
      expect(await screen.findByText('Ship 11')).toBeInTheDocument();
      expect(screen.queryByText('Ship 01')).not.toBeInTheDocument();

      await user.click(screen.getByRole('combobox', { name: /rows per page/i }));
      await user.click(await screen.findByRole('option', { name: '25' }));
      expect(await screen.findByText('Ship 01')).toBeInTheDocument();
      expect(screen.getByText('Ship 12')).toBeInTheDocument();
    });
  });
});
