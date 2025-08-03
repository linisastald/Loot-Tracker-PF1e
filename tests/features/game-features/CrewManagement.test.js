/**
 * Tests for CrewManagement.js - Frontend Crew Management Interface
 * Tests crew listing, creation, editing, movement, recruitment, and status changes
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CrewManagement from '../../../frontend/src/components/pages/CrewManagement';
import crewService from '../../../frontend/src/services/crewService';
import shipService from '../../../frontend/src/services/shipService';
import outpostService from '../../../frontend/src/services/outpostService';

// Mock services
jest.mock('../../../frontend/src/services/crewService');
jest.mock('../../../frontend/src/services/shipService');
jest.mock('../../../frontend/src/services/outpostService');

// Mock race and date utilities
jest.mock('../../../frontend/src/data/raceData', () => ({
  STANDARD_RACES: ['Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome'],
  generateRandomName: jest.fn(() => 'Random McCrewface'),
  generateRandomRace: jest.fn(() => 'Human'),
  generateRandomAge: jest.fn(() => 25)
}));

jest.mock('../../../frontend/src/utils/golarionDate', () => ({
  getTodayInInputFormat: jest.fn(() => Promise.resolve('4724-01-15')),
  golarionToInputFormat: jest.fn((year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`),
  inputFormatToGolarion: jest.fn((dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return { year, month, day };
  })
}));

describe('CrewManagement Component', () => {
  const mockCrew = [
    {
      id: 1,
      name: 'Captain Redbeard',
      race: 'Human',
      age: 45,
      description: 'Experienced pirate captain',
      location_type: 'ship',
      location_id: 1,
      ship_position: 'captain',
      hire_date: { year: 4723, month: 12, day: 1 },
      is_alive: true,
      location_name: 'The Crimson Storm'
    },
    {
      id: 2,
      name: 'First Mate Anne',
      race: 'Human',
      age: 32,
      description: 'Loyal and skilled navigator',
      location_type: 'ship',
      location_id: 1,
      ship_position: 'first mate',
      hire_date: { year: 4723, month: 12, day: 5 },
      is_alive: true,
      location_name: 'The Crimson Storm'
    },
    {
      id: 3,
      name: 'Dock Worker Dan',
      race: 'Dwarf',
      age: 67,
      description: 'Reliable dock worker',
      location_type: 'outpost',
      location_id: 2,
      ship_position: null,
      hire_date: { year: 4723, month: 11, day: 20 },
      is_alive: true,
      location_name: 'Port Peril'
    }
  ];

  const mockDeceasedCrew = [
    {
      id: 4,
      name: 'Poor Tom',
      race: 'Human',
      age: 28,
      description: 'Lost to the sea',
      death_date: { year: 4723, month: 11, day: 15 },
      is_alive: false,
      last_known_location: 'The Black Pearl'
    }
  ];

  const mockShips = [
    {
      id: 1,
      name: 'The Crimson Storm',
      status: 'PC Active',
      location: 'Port Peril'
    },
    {
      id: 2,
      name: 'The Black Pearl',
      status: 'Active',
      location: 'Tortuga'
    }
  ];

  const mockOutposts = [
    {
      id: 1,
      name: 'Port Peril',
      location: 'Shackles'
    },
    {
      id: 2,
      name: 'Tortuga',
      location: 'Caribbean'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful API responses
    crewService.getAllCrew.mockResolvedValue({
      data: { crew: mockCrew }
    });
    
    crewService.getDeceasedCrew.mockResolvedValue({
      data: { crew: mockDeceasedCrew }
    });
    
    shipService.getAllShips.mockResolvedValue({
      data: { ships: mockShips }
    });
    
    outpostService.getAllOutposts.mockResolvedValue({
      data: { outposts: mockOutposts }
    });
    
    crewService.createCrew.mockResolvedValue({
      data: { crew: mockCrew[0] }
    });
    
    crewService.updateCrew.mockResolvedValue({
      data: { crew: mockCrew[0] }
    });
    
    crewService.deleteCrew.mockResolvedValue({
      data: { message: 'Crew deleted successfully' }
    });
    
    crewService.moveCrewToLocation.mockResolvedValue({
      data: { crew: mockCrew[0] }
    });
    
    crewService.markCrewDead.mockResolvedValue({
      data: { crew: { ...mockCrew[0], is_alive: false } }
    });
    
    crewService.markCrewDeparted.mockResolvedValue({
      data: { crew: { ...mockCrew[0], is_alive: false } }
    });
  });

  describe('Initial Loading and Display', () => {
    it('should show loading spinner initially', () => {
      crewService.getAllCrew.mockReturnValue(new Promise(() => {})); // Never resolves
      
      render(<CrewManagement />);
      
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should display crew members after loading', async () => {
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
        expect(screen.getByText('First Mate Anne')).toBeInTheDocument();
        expect(screen.getByText('Dock Worker Dan')).toBeInTheDocument();
      });
      
      expect(crewService.getAllCrew).toHaveBeenCalledTimes(1);
      expect(shipService.getAllShips).toHaveBeenCalledTimes(1);
      expect(outpostService.getAllOutposts).toHaveBeenCalledTimes(1);
      expect(crewService.getDeceasedCrew).toHaveBeenCalledTimes(1);
    });

    it('should display crew information correctly', async () => {
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Check crew details in table
      expect(screen.getByText('Human')).toBeInTheDocument();
      expect(screen.getByText('45')).toBeInTheDocument();
      expect(screen.getByText('captain')).toBeInTheDocument();
      expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
    });

    it('should handle loading errors gracefully', async () => {
      crewService.getAllCrew.mockRejectedValue(new Error('API Error'));
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load data')).toBeInTheDocument();
      });
    });

    it('should display empty state when no crew', async () => {
      crewService.getAllCrew.mockResolvedValue({
        data: { crew: [] }
      });
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Crew Management')).toBeInTheDocument();
      });
      
      // Should still show table headers but no crew rows
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Race')).toBeInTheDocument();
      expect(screen.getByText('Position')).toBeInTheDocument();
    });
  });

  describe('Crew Creation', () => {
    it('should open crew dialog when Add Crew button is clicked', async () => {
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      const addButton = screen.getByText('Add Crew Member');
      fireEvent.click(addButton);
      
      // Should open dialog with form fields
      expect(screen.getByLabelText('Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Race')).toBeInTheDocument();
      expect(screen.getByLabelText('Location')).toBeInTheDocument();
    });

    it('should create new crew member successfully', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open dialog
      const addButton = screen.getByText('Add Crew Member');
      await user.click(addButton);
      
      // Fill crew details
      const nameInput = screen.getByLabelText('Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'New Test Crew');
      
      const raceSelect = screen.getByLabelText('Race');
      fireEvent.mouseDown(raceSelect);
      const humanOption = await screen.findByText('Human');
      fireEvent.click(humanOption);
      
      const locationSelect = screen.getByLabelText('Location');
      fireEvent.mouseDown(locationSelect);
      const shipOption = await screen.findByText('The Crimson Storm');
      fireEvent.click(shipOption);
      
      // Save crew
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(crewService.createCrew).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Test Crew',
            race: 'Human',
            location_type: 'ship',
            location_id: 1
          })
        );
      });
      
      expect(screen.getByText('Crew member created successfully')).toBeInTheDocument();
    });

    it('should validate required crew name', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open dialog
      const addButton = screen.getByText('Add Crew Member');
      await user.click(addButton);
      
      // Try to save without name
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      expect(screen.getByText('Crew member name is required')).toBeInTheDocument();
      expect(crewService.createCrew).not.toHaveBeenCalled();
    });

    it('should validate required location', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open dialog and fill name only
      const addButton = screen.getByText('Add Crew Member');
      await user.click(addButton);
      
      const nameInput = screen.getByLabelText('Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Test Crew');
      
      // Try to save without location
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      expect(screen.getByText('Location is required')).toBeInTheDocument();
      expect(crewService.createCrew).not.toHaveBeenCalled();
    });

    it('should handle custom races', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open dialog
      const addButton = screen.getByText('Add Crew Member');
      await user.click(addButton);
      
      // Fill details with custom race
      const nameInput = screen.getByLabelText('Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Aquatic Crew');
      
      const raceSelect = screen.getByLabelText('Race');
      fireEvent.mouseDown(raceSelect);
      const otherOption = await screen.findByText('Other');
      fireEvent.click(otherOption);
      
      // Should show custom race input
      const customRaceInput = await screen.findByLabelText('Custom Race');
      await user.type(customRaceInput, 'Merfolk');
      
      const locationSelect = screen.getByLabelText('Location');
      fireEvent.mouseDown(locationSelect);
      const shipOption = await screen.findByText('The Crimson Storm');
      fireEvent.click(shipOption);
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(crewService.createCrew).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Aquatic Crew',
            race: 'Merfolk'
          })
        );
      });
    });

    it('should set ship position for ship locations', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open dialog and select ship location
      const addButton = screen.getByText('Add Crew Member');
      await user.click(addButton);
      
      const nameInput = screen.getByLabelText('Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Ship Crew');
      
      const locationSelect = screen.getByLabelText('Location');
      fireEvent.mouseDown(locationSelect);
      const shipOption = await screen.findByText('The Crimson Storm');
      fireEvent.click(shipOption);
      
      // Should show ship position field
      const positionSelect = await screen.findByLabelText('Ship Position');
      fireEvent.mouseDown(positionSelect);
      const gunnerOption = await screen.findByText('Gunner');
      fireEvent.click(gunnerOption);
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(crewService.createCrew).toHaveBeenCalledWith(
          expect.objectContaining({
            ship_position: 'Gunner'
          })
        );
      });
    });

    it('should handle crew creation errors', async () => {
      crewService.createCrew.mockRejectedValue(new Error('Creation failed'));
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open dialog and fill details
      const addButton = screen.getByText('Add Crew Member');
      await user.click(addButton);
      
      const nameInput = screen.getByLabelText('Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Test Crew');
      
      const locationSelect = screen.getByLabelText('Location');
      fireEvent.mouseDown(locationSelect);
      const shipOption = await screen.findByText('The Crimson Storm');
      fireEvent.click(shipOption);
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to save crew member')).toBeInTheDocument();
      });
    });
  });

  describe('Crew Editing', () => {
    it('should open crew dialog for editing when edit button is clicked', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Find and click edit button for first crew member
      const editButtons = screen.getAllByTitle('Edit');
      await user.click(editButtons[0]);
      
      // Should populate form with existing data
      expect(screen.getByDisplayValue('Captain Redbeard')).toBeInTheDocument();
      expect(screen.getByDisplayValue('45')).toBeInTheDocument();
    });

    it('should update crew member successfully', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open edit dialog
      const editButtons = screen.getAllByTitle('Edit');
      await user.click(editButtons[0]);
      
      // Modify crew name
      const nameInput = screen.getByDisplayValue('Captain Redbeard');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Captain Name');
      
      // Save changes
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(crewService.updateCrew).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            name: 'Updated Captain Name'
          })
        );
      });
      
      expect(screen.getByText('Crew member updated successfully')).toBeInTheDocument();
    });

    it('should handle custom race in editing', async () => {
      // Use crew with custom race
      const customRaceCrew = { ...mockCrew[0], race: 'Merfolk' };
      crewService.getAllCrew.mockResolvedValue({
        data: { crew: [customRaceCrew] }
      });
      
      const user = userEvent.setup();
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open edit dialog
      const editButtons = screen.getAllByTitle('Edit');
      await user.click(editButtons[0]);
      
      // Should show "Other" as race and custom race field
      expect(screen.getByDisplayValue('Other')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Merfolk')).toBeInTheDocument();
    });
  });

  describe('Crew Movement', () => {
    it('should open move dialog when move button is clicked', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Click move button
      const moveButtons = screen.getAllByTitle('Move Crew');
      await user.click(moveButtons[0]);
      
      expect(screen.getByText('Move Crew Member')).toBeInTheDocument();
      expect(screen.getByLabelText('New Location')).toBeInTheDocument();
    });

    it('should move crew member successfully', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open move dialog
      const moveButtons = screen.getAllByTitle('Move Crew');
      await user.click(moveButtons[0]);
      
      // Select new location
      const locationSelect = screen.getByLabelText('New Location');
      fireEvent.mouseDown(locationSelect);
      const outpostOption = await screen.findByText('Port Peril');
      fireEvent.click(outpostOption);
      
      // Move crew
      const moveButton = screen.getByRole('button', { name: /move crew/i });
      await user.click(moveButton);
      
      await waitFor(() => {
        expect(crewService.moveCrewToLocation).toHaveBeenCalledWith(
          1,
          'outpost',
          1,
          null
        );
      });
      
      expect(screen.getByText('Crew member moved successfully')).toBeInTheDocument();
    });

    it('should handle ship position when moving to ship', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open move dialog
      const moveButtons = screen.getAllByTitle('Move Crew');
      await user.click(moveButtons[0]);
      
      // Select ship location
      const locationSelect = screen.getByLabelText('New Location');
      fireEvent.mouseDown(locationSelect);
      const shipOption = await screen.findByText('The Black Pearl');
      fireEvent.click(shipOption);
      
      // Should show ship position field
      const positionSelect = await screen.findByLabelText('Ship Position');
      fireEvent.mouseDown(positionSelect);
      const navigatorOption = await screen.findByText('Navigator');
      fireEvent.click(navigatorOption);
      
      // Move crew
      const moveButton = screen.getByRole('button', { name: /move crew/i });
      await user.click(moveButton);
      
      await waitFor(() => {
        expect(crewService.moveCrewToLocation).toHaveBeenCalledWith(
          1,
          'ship',
          2,
          'Navigator'
        );
      });
    });
  });

  describe('Crew Recruitment', () => {
    it('should open recruitment dialog when recruit button is clicked', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      const recruitButton = screen.getByText('Recruit Crew');
      await user.click(recruitButton);
      
      expect(screen.getByText('Recruit Crew Members')).toBeInTheDocument();
      expect(screen.getByLabelText('Skill Used')).toBeInTheDocument();
      expect(screen.getByLabelText('Roll Result')).toBeInTheDocument();
    });

    it('should recruit crew members on successful roll', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open recruitment dialog
      const recruitButton = screen.getByText('Recruit Crew');
      await user.click(recruitButton);
      
      // Fill recruitment details
      const rollInput = screen.getByLabelText('Roll Result');
      await user.clear(rollInput);
      await user.type(rollInput, '25'); // Above DC 20
      
      // Start recruitment
      const startButton = screen.getByRole('button', { name: /start recruitment/i });
      await user.click(startButton);
      
      await waitFor(() => {
        expect(crewService.createCrew).toHaveBeenCalled();
      });
      
      expect(screen.getByText(/Recruitment successful!/)).toBeInTheDocument();
    });

    it('should fail recruitment on low roll', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open recruitment dialog
      const recruitButton = screen.getByText('Recruit Crew');
      await user.click(recruitButton);
      
      // Fill recruitment details with low roll
      const rollInput = screen.getByLabelText('Roll Result');
      await user.clear(rollInput);
      await user.type(rollInput, '15'); // Below DC 20
      
      // Start recruitment
      const startButton = screen.getByRole('button', { name: /start recruitment/i });
      await user.click(startButton);
      
      expect(screen.getByText(/Recruitment failed!/)).toBeInTheDocument();
      expect(crewService.createCrew).not.toHaveBeenCalled();
    });

    it('should use different skill types for recruitment', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open recruitment dialog
      const recruitButton = screen.getByText('Recruit Crew');
      await user.click(recruitButton);
      
      // Select intimidate skill
      const skillSelect = screen.getByLabelText('Skill Used');
      fireEvent.mouseDown(skillSelect);
      const intimidateOption = await screen.findByText('Intimidate');
      fireEvent.click(intimidateOption);
      
      const rollInput = screen.getByLabelText('Roll Result');
      await user.clear(rollInput);
      await user.type(rollInput, '25');
      
      const startButton = screen.getByRole('button', { name: /start recruitment/i });
      await user.click(startButton);
      
      await waitFor(() => {
        expect(screen.getByText(/Intimidate check/)).toBeInTheDocument();
      });
    });

    it('should validate roll result input', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open recruitment dialog
      const recruitButton = screen.getByText('Recruit Crew');
      await user.click(recruitButton);
      
      // Try without roll result
      const startButton = screen.getByRole('button', { name: /start recruitment/i });
      await user.click(startButton);
      
      expect(screen.getByText('Please enter a valid roll result')).toBeInTheDocument();
    });
  });

  describe('Crew Status Changes', () => {
    it('should mark crew as dead', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Click status button (assuming it opens a menu)
      const statusButtons = screen.getAllByTitle('Change Status');
      await user.click(statusButtons[0]);
      
      // Select mark as dead option
      const deadOption = await screen.findByText('Mark as Dead');
      await user.click(deadOption);
      
      // Confirm action
      const confirmButton = screen.getByRole('button', { name: /mark as dead/i });
      await user.click(confirmButton);
      
      await waitFor(() => {
        expect(crewService.markCrewDead).toHaveBeenCalledWith(1, expect.any(Date));
      });
      
      expect(screen.getByText('Crew member marked as deceased')).toBeInTheDocument();
    });

    it('should mark crew as departed', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Click status button
      const statusButtons = screen.getAllByTitle('Change Status');
      await user.click(statusButtons[0]);
      
      // Select mark as departed option
      const departedOption = await screen.findByText('Mark as Departed');
      await user.click(departedOption);
      
      // Fill departure reason
      const reasonInput = screen.getByLabelText('Departure Reason');
      await user.type(reasonInput, 'Seeking new adventures');
      
      // Confirm action
      const confirmButton = screen.getByRole('button', { name: /mark as departed/i });
      await user.click(confirmButton);
      
      await waitFor(() => {
        expect(crewService.markCrewDeparted).toHaveBeenCalledWith(
          1,
          expect.any(Date),
          'Seeking new adventures'
        );
      });
      
      expect(screen.getByText('Crew member marked as departed')).toBeInTheDocument();
    });
  });

  describe('Crew Deletion', () => {
    it('should open delete confirmation dialog', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Click delete button
      const deleteButtons = screen.getAllByTitle('Delete');
      await user.click(deleteButtons[0]);
      
      expect(screen.getByText('Delete Crew Member')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
    });

    it('should delete crew when confirmed', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open delete dialog
      const deleteButtons = screen.getAllByTitle('Delete');
      await user.click(deleteButtons[0]);
      
      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: 'Delete' });
      await user.click(confirmButton);
      
      await waitFor(() => {
        expect(crewService.deleteCrew).toHaveBeenCalledWith(1);
      });
      
      expect(screen.getByText('Crew member deleted successfully')).toBeInTheDocument();
    });

    it('should cancel deletion when Cancel is clicked', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Open delete dialog
      const deleteButtons = screen.getAllByTitle('Delete');
      await user.click(deleteButtons[0]);
      
      // Cancel deletion
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      await user.click(cancelButton);
      
      expect(screen.queryByText('Delete Crew Member')).not.toBeInTheDocument();
      expect(crewService.deleteCrew).not.toHaveBeenCalled();
    });
  });

  describe('Deceased Crew Tab', () => {
    it('should display deceased crew in separate tab', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Switch to deceased tab
      const deceasedTab = screen.getByText('Deceased/Departed');
      await user.click(deceasedTab);
      
      await waitFor(() => {
        expect(screen.getByText('Poor Tom')).toBeInTheDocument();
      });
      
      expect(screen.getByText('The Black Pearl')).toBeInTheDocument(); // last known location
    });

    it('should show empty state for deceased tab when no deceased crew', async () => {
      crewService.getDeceasedCrew.mockResolvedValue({
        data: { crew: [] }
      });
      
      const user = userEvent.setup();
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Switch to deceased tab
      const deceasedTab = screen.getByText('Deceased/Departed');
      await user.click(deceasedTab);
      
      expect(screen.getByText('No deceased or departed crew members')).toBeInTheDocument();
    });
  });

  describe('Table Pagination', () => {
    it('should paginate crew when there are many', async () => {
      const manyCrew = Array.from({ length: 25 }, (_, i) => ({
        ...mockCrew[0],
        id: i + 1,
        name: `Crew Member ${i + 1}`
      }));
      
      crewService.getAllCrew.mockResolvedValue({
        data: { crew: manyCrew }
      });
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Crew Member 1')).toBeInTheDocument();
      });
      
      // Should show pagination controls
      expect(screen.getByText('1–10 of 25')).toBeInTheDocument();
      
      // Should not show crew beyond page 1
      expect(screen.queryByText('Crew Member 11')).not.toBeInTheDocument();
    });

    it('should change pages when pagination controls are used', async () => {
      const manyCrew = Array.from({ length: 25 }, (_, i) => ({
        ...mockCrew[0],
        id: i + 1,
        name: `Crew Member ${i + 1}`
      }));
      
      crewService.getAllCrew.mockResolvedValue({
        data: { crew: manyCrew }
      });
      
      const user = userEvent.setup();
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Crew Member 1')).toBeInTheDocument();
      });
      
      // Go to next page
      const nextButton = screen.getByRole('button', { name: 'Go to next page' });
      await user.click(nextButton);
      
      // Should show crew from page 2
      expect(screen.getByText('Crew Member 11')).toBeInTheDocument();
      expect(screen.queryByText('Crew Member 1')).not.toBeInTheDocument();
    });
  });

  describe('Location Display', () => {
    it('should display correct location names for crew', async () => {
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Should show ship names for ship crew
      expect(screen.getByText('The Crimson Storm')).toBeInTheDocument();
      
      // Should show outpost names for outpost crew
      expect(screen.getByText('Port Peril')).toBeInTheDocument();
    });

    it('should handle crew without location names', async () => {
      const crewWithoutLocation = [{
        ...mockCrew[0],
        location_name: null
      }];
      
      crewService.getAllCrew.mockResolvedValue({
        data: { crew: crewWithoutLocation }
      });
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      expect(screen.getByText('Unknown Location')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle individual service failures gracefully', async () => {
      shipService.getAllShips.mockRejectedValue(new Error('Ships loading failed'));
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load data')).toBeInTheDocument();
      });
    });

    it('should clear error messages when successful operations occur', async () => {
      const user = userEvent.setup();
      
      // Start with an error
      crewService.createCrew.mockRejectedValueOnce(new Error('Creation failed'));
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Try to create crew (will fail first time)
      const addButton = screen.getByText('Add Crew Member');
      await user.click(addButton);
      
      const nameInput = screen.getByLabelText('Name');
      await user.type(nameInput, 'Test Crew');
      
      const locationSelect = screen.getByLabelText('Location');
      fireEvent.mouseDown(locationSelect);
      const shipOption = await screen.findByText('The Crimson Storm');
      fireEvent.click(shipOption);
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to save crew member')).toBeInTheDocument();
      });
      
      // Now succeed on retry
      crewService.createCrew.mockResolvedValue({
        data: { crew: mockCrew[0] }
      });
      
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(screen.getByText('Crew member created successfully')).toBeInTheDocument();
        expect(screen.queryByText('Failed to save crew member')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', async () => {
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Check for proper table structure
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getAllByRole('columnheader')).toHaveLength(7); // Assuming 7 columns
      
      // Check for proper button labels
      expect(screen.getByRole('button', { name: 'Add Crew Member' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Recruit Crew' })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      
      render(<CrewManagement />);
      
      await waitFor(() => {
        expect(screen.getByText('Captain Redbeard')).toBeInTheDocument();
      });
      
      // Tab to Add Crew button
      await user.tab();
      expect(screen.getByText('Add Crew Member')).toHaveFocus();
      
      // Press Enter to activate
      await user.keyboard('[Enter]');
      expect(screen.getByLabelText('Name')).toBeInTheDocument();
    });
  });
});