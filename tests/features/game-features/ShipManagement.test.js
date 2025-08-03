/**
 * Tests for ShipManagement.js - Frontend Ship Management Interface
 * Tests ship listing, creation, editing, damage/repair, and detailed view functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ShipManagement from '../../../frontend/src/components/pages/ShipManagement';
import shipService from '../../../frontend/src/services/shipService';
import crewService from '../../../frontend/src/services/crewService';

// Mock services
jest.mock('../../../frontend/src/services/shipService');
jest.mock('../../../frontend/src/services/crewService');

// Mock ShipDialog component
jest.mock('../../../frontend/src/components/pages/ShipDialog', () => {
  return function MockShipDialog({ 
    open, 
    onClose, 
    selectedShip, 
    editingShip,
    setEditingShip,
    onSave,
    onShipTypeChange
  }) {
    if (!open) return null;
    
    return (
      <div data-testid="ship-dialog">
        <input
          data-testid="ship-name-input"
          value={editingShip.name}
          onChange={(e) => setEditingShip({ ...editingShip, name: e.target.value })}
          placeholder="Ship Name"
        />
        <input
          data-testid="ship-location-input"
          value={editingShip.location}
          onChange={(e) => setEditingShip({ ...editingShip, location: e.target.value })}
          placeholder="Location"
        />
        <button data-testid="ship-dialog-save" onClick={onSave}>
          Save Ship
        </button>
        <button data-testid="ship-dialog-close" onClick={onClose}>
          Close
        </button>
        <button 
          data-testid="ship-type-change"
          onClick={() => onShipTypeChange({ key: 'frigate' })}
        >
          Set Frigate Type
        </button>
      </div>
    );
  };
});

// Mock ship improvements data
jest.mock('../../../frontend/src/data/shipData', () => ({
  SHIP_IMPROVEMENTS: {
    'reinforced_hull': {
      name: 'Reinforced Hull',
      description: 'Improved structural integrity',
      effects: { hardness: '+2', max_hp: '+20%' }
    },
    'improved_rigging': {
      name: 'Improved Rigging',
      description: 'Better sail management',
      effects: { max_speed: '+10', acceleration: '+5' }
    }
  }
}));

describe('ShipManagement Component', () => {
  const mockShips = [
    {
      id: 1,
      name: 'The Crimson Storm',
      location: 'Port Peril',
      status: 'Active',
      ship_type: 'frigate',
      crew_count: 25,
      current_hp: 1620,
      max_hp: 1620,
      base_ac: 2,
      initiative: 2,
      plunder: 500,
      infamy: 25,
      disrepute: 10,
      captain_name: 'Captain Redbeard',
      ship_notes: 'Fast pirate vessel',
      flag_description: 'Black flag with crimson storm',
      officers: [
        { position: 'Captain', name: 'Captain Redbeard' },
        { position: 'First Mate', name: 'Anne Bonny' }
      ],
      improvements: ['reinforced_hull', 'improved_rigging'],
      weapon_types: [
        { type: 'cannons', quantity: 12 },
        { type: 'ballistae', quantity: 4 }
      ]
    },
    {
      id: 2,
      name: 'The Black Pearl',
      location: 'Tortuga',
      status: 'PC Active',
      ship_type: 'galleon',
      crew_count: 15,
      current_hp: 800,
      max_hp: 2000,
      base_ac: 3,
      initiative: 1,
      plunder: 1000,
      infamy: 50,
      disrepute: 25
    }
  ];

  const mockShipTypes = [
    { key: 'frigate', name: 'Frigate' },
    { key: 'galleon', name: 'Galleon' },
    { key: 'sloop', name: 'Sloop' }
  ];

  const mockShipTypeData = {
    name: 'Frigate',
    size: 'Large',
    cost: 37000,
    max_speed: 60,
    acceleration: 30,
    propulsion: 'wind',
    min_crew: 20,
    max_crew: 200,
    cargo_capacity: 150,
    max_passengers: 120,
    decks: 3,
    max_hp: 1620,
    base_ac: 2,
    touch_ac: 8,
    hardness: 5,
    cmb: 8,
    cmd: 18,
    saves: { fort: 15, ref: 5, will: 9 },
    initiative: 2,
    ramming_damage: '8d8',
    sails_oars: 'sails',
    sailing_check_bonus: 4
  };

  const mockCrew = [
    {
      id: 1,
      name: 'Captain Redbeard',
      race: 'Human',
      age: 45,
      ship_position: 'captain',
      description: 'Experienced pirate captain'
    },
    {
      id: 2,
      name: 'First Mate Anne',
      race: 'Human',
      age: 32,
      ship_position: 'first mate',
      description: 'Loyal and skilled navigator'
    },
    {
      id: 3,
      name: 'Gunner Pete',
      race: 'Dwarf',
      age: 67,
      ship_position: 'gunner',
      description: 'Master of artillery'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful API responses
    shipService.getAllShips.mockResolvedValue({
      data: { ships: mockShips }
    });
    
    shipService.getShipTypes.mockResolvedValue({
      data: { shipTypes: mockShipTypes }
    });
    
    shipService.getShipTypeData.mockResolvedValue({
      data: mockShipTypeData
    });
    
    shipService.createShip.mockResolvedValue({
      data: { ship: mockShips[0] }
    });
    
    shipService.updateShip.mockResolvedValue({
      data: { ship: mockShips[0] }
    });
    
    shipService.deleteShip.mockResolvedValue({
      data: { message: 'Ship deleted successfully' }
    });
    
    shipService.applyDamage.mockResolvedValue({
      data: { message: 'Damage applied successfully' }
    });
    
    shipService.repairShip.mockResolvedValue({
      data: { message: 'Ship repaired successfully' }
    });
    
    crewService.getCrewByLocation.mockResolvedValue({
      data: { crew: mockCrew }
    });
  });

  describe('Initial Loading and Display', () => {
    it('should show loading spinner initially', () => {
      shipService.getAllShips.mockReturnValue(new Promise(() => {})); // Never resolves
      
      render(<ShipManagement />);
      
      expect(screen.getByText('Loading ships...')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should display ships after loading', async () => {
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
        expect(screen.getByText('The Black Pearl')).toBeInTheDocument();
      });
      
      expect(shipService.getAllShips).toHaveBeenCalledTimes(1);
      expect(shipService.getShipTypes).toHaveBeenCalledTimes(1);
    });

    it('should display ship information correctly', async () => {
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Check ship details in table
      expect(screen.getByText('Port Peril')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument(); // crew count
      expect(screen.getByText('1620/1620')).toBeInTheDocument(); // HP
      expect(screen.getByText('Pristine')).toBeInTheDocument(); // HP status
      expect(screen.getByText('AC 2')).toBeInTheDocument();
      expect(screen.getByText('Init +2')).toBeInTheDocument();
    });

    it('should handle loading errors gracefully', async () => {
      shipService.getAllShips.mockRejectedValue(new Error('API Error'));
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load ships')).toBeInTheDocument();
      });
    });

    it('should display empty state when no ships', async () => {
      shipService.getAllShips.mockResolvedValue({
        data: { ships: [] }
      });
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Ship Management')).toBeInTheDocument();
      });
      
      // Should still show table headers but no ship rows
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Location')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  describe('Ship Creation', () => {
    it('should open ship dialog when Add Ship button is clicked', async () => {
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      const addButton = screen.getByText('Add Ship');
      fireEvent.click(addButton);
      
      expect(screen.getByTestId('ship-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('ship-name-input')).toHaveValue('');
    });

    it('should create new ship successfully', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Open dialog
      const addButton = screen.getByText('Add Ship');
      await user.click(addButton);
      
      // Fill ship details
      const nameInput = screen.getByTestId('ship-name-input');
      const locationInput = screen.getByTestId('ship-location-input');
      
      await user.clear(nameInput);
      await user.type(nameInput, 'New Test Ship');
      await user.clear(locationInput);
      await user.type(locationInput, 'Test Port');
      
      // Save ship
      const saveButton = screen.getByTestId('ship-dialog-save');
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(shipService.createShip).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Test Ship',
            location: 'Test Port',
            status: 'Active'
          })
        );
      });
      
      expect(screen.getByText('Ship created successfully')).toBeInTheDocument();
    });

    it('should validate required ship name', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Open dialog
      const addButton = screen.getByText('Add Ship');
      await user.click(addButton);
      
      // Try to save without name
      const saveButton = screen.getByTestId('ship-dialog-save');
      await user.click(saveButton);
      
      expect(screen.getByText('Ship name is required')).toBeInTheDocument();
      expect(shipService.createShip).not.toHaveBeenCalled();
    });

    it('should auto-fill ship data when ship type is selected', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Open dialog
      const addButton = screen.getByText('Add Ship');
      await user.click(addButton);
      
      // Select ship type
      const typeButton = screen.getByTestId('ship-type-change');
      await user.click(typeButton);
      
      await waitFor(() => {
        expect(shipService.getShipTypeData).toHaveBeenCalledWith('frigate');
      });
      
      expect(screen.getByText('Auto-filled ship stats for Frigate')).toBeInTheDocument();
    });

    it('should handle ship creation errors', async () => {
      shipService.createShip.mockRejectedValue(new Error('Creation failed'));
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Open dialog and fill details
      const addButton = screen.getByText('Add Ship');
      await user.click(addButton);
      
      const nameInput = screen.getByTestId('ship-name-input');
      await user.clear(nameInput);
      await user.type(nameInput, 'Test Ship');
      
      const saveButton = screen.getByTestId('ship-dialog-save');
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to save ship')).toBeInTheDocument();
      });
    });
  });

  describe('Ship Editing', () => {
    it('should open ship dialog for editing when edit button is clicked', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Find and click edit button for first ship
      const editButtons = screen.getAllByTitle('Edit');
      await user.click(editButtons[0]);
      
      expect(screen.getByTestId('ship-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('ship-name-input')).toHaveValue('The Crimson Storm');
      expect(screen.getByTestId('ship-location-input')).toHaveValue('Port Peril');
    });

    it('should update ship successfully', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Open edit dialog
      const editButtons = screen.getAllByTitle('Edit');
      await user.click(editButtons[0]);
      
      // Modify ship name
      const nameInput = screen.getByTestId('ship-name-input');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Ship Name');
      
      // Save changes
      const saveButton = screen.getByTestId('ship-dialog-save');
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(shipService.updateShip).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            name: 'Updated Ship Name'
          })
        );
      });
      
      expect(screen.getByText('Ship updated successfully')).toBeInTheDocument();
    });

    it('should handle ship update errors', async () => {
      shipService.updateShip.mockRejectedValue(new Error('Update failed'));
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Open edit dialog and try to save
      const editButtons = screen.getAllByTitle('Edit');
      await user.click(editButtons[0]);
      
      const saveButton = screen.getByTestId('ship-dialog-save');
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to save ship')).toBeInTheDocument();
      });
    });
  });

  describe('Ship Deletion', () => {
    it('should open delete confirmation dialog', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Click delete button
      const deleteButtons = screen.getAllByTitle('Delete');
      await user.click(deleteButtons[0]);
      
      expect(screen.getByText('Delete Ship')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete "The Crimson Storm"/)).toBeInTheDocument();
    });

    it('should delete ship when confirmed', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Open delete dialog
      const deleteButtons = screen.getAllByTitle('Delete');
      await user.click(deleteButtons[0]);
      
      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: 'Delete' });
      await user.click(confirmButton);
      
      await waitFor(() => {
        expect(shipService.deleteShip).toHaveBeenCalledWith(1);
      });
      
      expect(screen.getByText('Ship deleted successfully')).toBeInTheDocument();
    });

    it('should cancel deletion when Cancel is clicked', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Open delete dialog
      const deleteButtons = screen.getAllByTitle('Delete');
      await user.click(deleteButtons[0]);
      
      // Cancel deletion
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      await user.click(cancelButton);
      
      expect(screen.queryByText('Delete Ship')).not.toBeInTheDocument();
      expect(shipService.deleteShip).not.toHaveBeenCalled();
    });

    it('should handle ship deletion errors', async () => {
      shipService.deleteShip.mockRejectedValue(new Error('Deletion failed'));
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Open delete dialog and confirm
      const deleteButtons = screen.getAllByTitle('Delete');
      await user.click(deleteButtons[0]);
      
      const confirmButton = screen.getByRole('button', { name: 'Delete' });
      await user.click(confirmButton);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to delete ship')).toBeInTheDocument();
      });
    });
  });

  describe('Damage and Repair', () => {
    it('should open damage dialog when damage button is clicked', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Click damage button
      const damageButtons = screen.getAllByTitle('Apply Damage');
      await user.click(damageButtons[0]);
      
      expect(screen.getByText('Apply Damage - The Crimson Storm')).toBeInTheDocument();
      expect(screen.getByText('Current HP: 1620 / 1620')).toBeInTheDocument();
    });

    it('should apply damage successfully', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Open damage dialog
      const damageButtons = screen.getAllByTitle('Apply Damage');
      await user.click(damageButtons[0]);
      
      // Enter damage amount
      const damageInput = screen.getByLabelText('Damage Amount');
      await user.clear(damageInput);
      await user.type(damageInput, '100');
      
      // Apply damage
      const applyButton = screen.getByRole('button', { name: 'Apply Damage' });
      await user.click(applyButton);
      
      await waitFor(() => {
        expect(shipService.applyDamage).toHaveBeenCalledWith(1, 100);
      });
      
      expect(screen.getByText('Damage applied successfully')).toBeInTheDocument();
    });

    it('should open repair dialog when repair button is clicked', async () => {
      const user = userEvent.setup();
      
      // Use damaged ship for repair test
      const damagedShip = { ...mockShips[0], current_hp: 1200 };
      shipService.getAllShips.mockResolvedValue({
        data: { ships: [damagedShip, mockShips[1]] }
      });
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Click repair button
      const repairButtons = screen.getAllByTitle('Repair Ship');
      await user.click(repairButtons[0]);
      
      expect(screen.getByText('Repair Ship - The Crimson Storm')).toBeInTheDocument();
      expect(screen.getByText('Current HP: 1200 / 1620')).toBeInTheDocument();
    });

    it('should repair ship successfully', async () => {
      const user = userEvent.setup();
      
      // Use damaged ship
      const damagedShip = { ...mockShips[0], current_hp: 1200 };
      shipService.getAllShips.mockResolvedValue({
        data: { ships: [damagedShip, mockShips[1]] }
      });
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Open repair dialog
      const repairButtons = screen.getAllByTitle('Repair Ship');
      await user.click(repairButtons[0]);
      
      // Enter repair amount
      const repairInput = screen.getByLabelText('Repair Amount');
      await user.clear(repairInput);
      await user.type(repairInput, '200');
      
      // Apply repair
      const repairButton = screen.getByRole('button', { name: 'Repair Ship' });
      await user.click(repairButton);
      
      await waitFor(() => {
        expect(shipService.repairShip).toHaveBeenCalledWith(1, 200);
      });
      
      expect(screen.getByText('Ship repaired successfully')).toBeInTheDocument();
    });

    it('should validate damage/repair amounts', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Open damage dialog
      const damageButtons = screen.getAllByTitle('Apply Damage');
      await user.click(damageButtons[0]);
      
      // Try to apply without amount
      const applyButton = screen.getByRole('button', { name: 'Apply Damage' });
      await user.click(applyButton);
      
      expect(screen.getByText('Amount must be a positive number')).toBeInTheDocument();
      expect(shipService.applyDamage).not.toHaveBeenCalled();
    });

    it('should disable damage button for sunk ships', async () => {
      // Use sunk ship
      const sunkShip = { ...mockShips[0], current_hp: 0 };
      shipService.getAllShips.mockResolvedValue({
        data: { ships: [sunkShip, mockShips[1]] }
      });
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Damage button should be disabled
      const damageButtons = screen.getAllByTitle('Apply Damage');
      expect(damageButtons[0]).toBeDisabled();
    });

    it('should disable repair button for undamaged ships', async () => {
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Repair button should be disabled for ship at full HP
      const repairButtons = screen.getAllByTitle('Repair Ship');
      expect(repairButtons[0]).toBeDisabled();
    });
  });

  describe('Ship Details View', () => {
    it('should switch to details tab when View Details is clicked', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Click view details button
      const viewButtons = screen.getAllByTitle('View Details');
      await user.click(viewButtons[0]);
      
      await waitFor(() => {
        expect(crewService.getCrewByLocation).toHaveBeenCalledWith('ship', 1);
      });
      
      // Should switch to Ship Details tab
      expect(screen.getByText('Ship Details')).toBeInTheDocument();
    });

    it('should display comprehensive ship information in details view', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Switch to details view
      const viewButtons = screen.getAllByTitle('View Details');
      await user.click(viewButtons[0]);
      
      await waitFor(() => {
        // Ship Information section
        expect(screen.getByText('Ship Information')).toBeInTheDocument();
        expect(screen.getByText('frigate')).toBeInTheDocument();
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
        expect(screen.getByText('Fast pirate vessel')).toBeInTheDocument();
        
        // Physical Characteristics
        expect(screen.getByText('Physical Characteristics')).toBeInTheDocument();
        expect(screen.getByText('60 ft.')).toBeInTheDocument(); // max speed
        expect(screen.getByText('30 ft.')).toBeInTheDocument(); // acceleration
        
        // Combat Statistics
        expect(screen.getByText('Combat Statistics')).toBeInTheDocument();
        expect(screen.getByText('1620 / 1620')).toBeInTheDocument(); // HP
        
        // Pirate Campaign Stats
        expect(screen.getByText('Pirate Campaign Stats')).toBeInTheDocument();
        expect(screen.getByText('500')).toBeInTheDocument(); // plunder
        expect(screen.getByText('25')).toBeInTheDocument(); // infamy
        expect(screen.getByText('10')).toBeInTheDocument(); // disrepute
      });
    });

    it('should display ship weapons correctly', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Switch to details view
      const viewButtons = screen.getAllByTitle('View Details');
      await user.click(viewButtons[0]);
      
      await waitFor(() => {
        expect(screen.getByText('Ship Weapons')).toBeInTheDocument();
        expect(screen.getByText('cannons (12)')).toBeInTheDocument();
        expect(screen.getByText('ballistae (4)')).toBeInTheDocument();
      });
    });

    it('should display ship improvements with details', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Switch to details view
      const viewButtons = screen.getAllByTitle('View Details');
      await user.click(viewButtons[0]);
      
      await waitFor(() => {
        expect(screen.getByText('Ship Improvements')).toBeInTheDocument();
        expect(screen.getByText('Reinforced Hull')).toBeInTheDocument();
        expect(screen.getByText('Improved Rigging')).toBeInTheDocument();
      });
    });

    it('should display crew members in details view', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Switch to details view
      const viewButtons = screen.getAllByTitle('View Details');
      await user.click(viewButtons[0]);
      
      await waitFor(() => {
        expect(screen.getByText('Crew Members')).toBeInTheDocument();
        expect(screen.getByText('3 crew members aboard')).toBeInTheDocument();
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
        expect(screen.getByText('First Mate Anne')).toBeInTheDocument();
        expect(screen.getByText('Gunner Pete')).toBeInTheDocument();
      });
    });

    it('should display officers information', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Switch to details view
      const viewButtons = screen.getAllByTitle('View Details');
      await user.click(viewButtons[0]);
      
      await waitFor(() => {
        expect(screen.getByText('Officers')).toBeInTheDocument();
        expect(screen.getByText('Captain')).toBeInTheDocument();
        expect(screen.getByText('First Mate')).toBeInTheDocument();
        expect(screen.getByText('Anne Bonny')).toBeInTheDocument();
      });
    });

    it('should display ship flag description', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Switch to details view
      const viewButtons = screen.getAllByTitle('View Details');
      await user.click(viewButtons[0]);
      
      await waitFor(() => {
        expect(screen.getByText("Ship's Flag")).toBeInTheDocument();
        expect(screen.getByText('Black flag with crimson storm')).toBeInTheDocument();
      });
    });

    it('should handle crew loading errors', async () => {
      crewService.getCrewByLocation.mockRejectedValue(new Error('Crew loading failed'));
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Switch to details view
      const viewButtons = screen.getAllByTitle('View Details');
      await user.click(viewButtons[0]);
      
      await waitFor(() => {
        expect(screen.getByText('No crew members assigned')).toBeInTheDocument();
      });
    });
  });

  describe('Ship Status and HP Display', () => {
    it('should display correct HP status colors and labels', async () => {
      const shipsWithDifferentHP = [
        { ...mockShips[0], current_hp: 1620, max_hp: 1620 }, // Pristine
        { ...mockShips[0], id: 2, name: 'Ship 2', current_hp: 1200, max_hp: 1620 }, // Minor damage (74%)
        { ...mockShips[0], id: 3, name: 'Ship 3', current_hp: 800, max_hp: 1620 }, // Moderate damage (49%)
        { ...mockShips[0], id: 4, name: 'Ship 4', current_hp: 400, max_hp: 1620 }, // Heavy damage (25%)
        { ...mockShips[0], id: 5, name: 'Ship 5', current_hp: 100, max_hp: 1620 }, // Critical damage (6%)
        { ...mockShips[0], id: 6, name: 'Ship 6', current_hp: 0, max_hp: 1620 }, // Sunk
      ];
      
      shipService.getAllShips.mockResolvedValue({
        data: { ships: shipsWithDifferentHP }
      });
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Pristine')).toBeInTheDocument();
        expect(screen.getByText('Minor Damage')).toBeInTheDocument();
        expect(screen.getByText('Moderate Damage')).toBeInTheDocument();
        expect(screen.getByText('Heavy Damage')).toBeInTheDocument();
        expect(screen.getByText('Critical Damage')).toBeInTheDocument();
        expect(screen.getByText('Sunk')).toBeInTheDocument();
      });
    });

    it('should display ship status chips with correct colors', async () => {
      const shipsWithDifferentStatuses = [
        { ...mockShips[0], status: 'PC Active' },
        { ...mockShips[0], id: 2, name: 'Ship 2', status: 'Active' },
        { ...mockShips[0], id: 3, name: 'Ship 3', status: 'Docked' },
        { ...mockShips[0], id: 4, name: 'Ship 4', status: 'Lost' },
        { ...mockShips[0], id: 5, name: 'Ship 5', status: 'Sunk' },
      ];
      
      shipService.getAllShips.mockResolvedValue({
        data: { ships: shipsWithDifferentStatuses }
      });
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('PC Active')).toBeInTheDocument();
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Docked')).toBeInTheDocument();
        expect(screen.getByText('Lost')).toBeInTheDocument();
        expect(screen.getByText('Sunk')).toBeInTheDocument();
      });
    });
  });

  describe('Table Pagination', () => {
    it('should paginate ships when there are many', async () => {
      const manyShips = Array.from({ length: 25 }, (_, i) => ({
        ...mockShips[0],
        id: i + 1,
        name: `Ship ${i + 1}`
      }));
      
      shipService.getAllShips.mockResolvedValue({
        data: { ships: manyShips }
      });
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Ship 1')).toBeInTheDocument();
      });
      
      // Should show pagination controls
      expect(screen.getByText('1–10 of 25')).toBeInTheDocument();
      
      // Should not show ships beyond page 1
      expect(screen.queryByText('Ship 11')).not.toBeInTheDocument();
    });

    it('should change pages when pagination controls are used', async () => {
      const manyShips = Array.from({ length: 25 }, (_, i) => ({
        ...mockShips[0],
        id: i + 1,
        name: `Ship ${i + 1}`
      }));
      
      shipService.getAllShips.mockResolvedValue({
        data: { ships: manyShips }
      });
      
      const user = userEvent.setup();
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Ship 1')).toBeInTheDocument();
      });
      
      // Go to next page
      const nextButton = screen.getByRole('button', { name: 'Go to next page' });
      await user.click(nextButton);
      
      // Should show ships from page 2
      expect(screen.getByText('Ship 11')).toBeInTheDocument();
      expect(screen.queryByText('Ship 1')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle ship type loading errors', async () => {
      shipService.getShipTypes.mockRejectedValue(new Error('Ship types loading failed'));
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Should still display ships even if ship types fail to load
      expect(screen.getByText('Ship Management')).toBeInTheDocument();
    });

    it('should handle ship type data loading errors', async () => {
      shipService.getShipTypeData.mockRejectedValue(new Error('Ship type data failed'));
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Open ship dialog and try to set ship type
      const addButton = screen.getByText('Add Ship');
      await user.click(addButton);
      
      const typeButton = screen.getByTestId('ship-type-change');
      await user.click(typeButton);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load ship type data')).toBeInTheDocument();
      });
    });

    it('should clear error messages when successful operations occur', async () => {
      const user = userEvent.setup();
      
      // Start with an error
      shipService.getAllShips.mockRejectedValueOnce(new Error('API Error'));
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load ships')).toBeInTheDocument();
      });
      
      // Then succeed on retry
      shipService.getAllShips.mockResolvedValue({
        data: { ships: mockShips }
      });
      
      // Manually trigger refetch (this would normally happen through user interaction)
      // For this test, we'll simulate a successful ship creation which triggers refetch
      shipService.createShip.mockResolvedValue({
        data: { ship: mockShips[0] }
      });
      
      const addButton = screen.getByText('Add Ship');
      await user.click(addButton);
      
      const nameInput = screen.getByTestId('ship-name-input');
      await user.clear(nameInput);
      await user.type(nameInput, 'Test Ship');
      
      const saveButton = screen.getByTestId('ship-dialog-save');
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(screen.getByText('Ship created successfully')).toBeInTheDocument();
        expect(screen.queryByText('Failed to load ships')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', async () => {
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Check for proper table structure
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getAllByRole('columnheader')).toHaveLength(7);
      expect(screen.getAllByRole('row')).toHaveLength(3); // Header + 2 ships
      
      // Check for proper button labels
      expect(screen.getByRole('button', { name: 'Add Ship' })).toBeInTheDocument();
      expect(screen.getAllByTitle('Edit')).toHaveLength(2);
      expect(screen.getAllByTitle('Delete')).toHaveLength(2);
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      
      render(<ShipManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      });
      
      // Tab to Add Ship button
      await user.tab();
      expect(screen.getByText('Add Ship')).toHaveFocus();
      
      // Press Enter to activate
      await user.keyboard('[Enter]');
      expect(screen.getByTestId('ship-dialog')).toBeInTheDocument();
    });
  });
});