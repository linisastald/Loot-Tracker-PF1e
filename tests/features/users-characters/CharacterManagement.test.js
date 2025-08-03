/**
 * Tests for CharacterManagement.js - DM Character Management Component
 * Tests character CRUD operations, sorting, user assignment, and error handling
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CharacterManagement from '../../../frontend/src/components/pages/DMSettings/CharacterManagement';
import api from '../../../frontend/src/utils/api';

// Mock the API
jest.mock('../../../frontend/src/utils/api', () => ({
  get: jest.fn(),
  put: jest.fn()
}));

// Mock Material-UI date picker if used
jest.mock('@mui/x-date-pickers', () => ({
  DatePicker: ({ value, onChange, label, ...props }) => (
    <input
      type="date"
      value={value || ''}
      onChange={(e) => onChange && onChange(e.target.value)}
      placeholder={label}
      {...props}
    />
  )
}));

describe('CharacterManagement', () => {
  const mockCharacters = [
    {
      id: 1,
      name: 'Aragorn',
      username: 'player1',
      appraisal_bonus: 5,
      birthday: '2023-01-15',
      deathday: null,
      active: true,
      user_id: 101
    },
    {
      id: 2,
      name: 'Legolas',
      username: 'player2',
      appraisal_bonus: 3,
      birthday: '2023-02-20',
      deathday: '2023-12-01',
      active: false,
      user_id: 102
    },
    {
      id: 3,
      name: 'Gimli',
      username: 'player3',
      appraisal_bonus: 4,
      birthday: null,
      deathday: null,
      active: true,
      user_id: 103
    }
  ];

  const mockUsers = [
    { id: 101, username: 'player1' },
    { id: 102, username: 'player2' },
    { id: 103, username: 'player3' },
    { id: 104, username: 'player4' }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default successful API responses
    api.get.mockImplementation((url) => {
      if (url === '/users/all-characters') {
        return Promise.resolve({ data: { data: mockCharacters } });
      }
      if (url === '/users') {
        return Promise.resolve({ data: { data: mockUsers } });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    api.put.mockResolvedValue({ 
      data: { 
        success: true,
        data: { id: 1, name: 'Updated Character' },
        message: 'Character updated successfully' 
      } 
    });
  });

  describe('Component Rendering', () => {
    it('should render character management interface', async () => {
      render(<CharacterManagement />);

      expect(screen.getByText('Character Management')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
        expect(screen.getByText('Legolas')).toBeInTheDocument();
        expect(screen.getByText('Gimli')).toBeInTheDocument();
      });
    });

    it('should display character table headers', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Character Name')).toBeInTheDocument();
        expect(screen.getByText('Player')).toBeInTheDocument();
        expect(screen.getByText('Appraisal Bonus')).toBeInTheDocument();
        expect(screen.getByText('Birthday')).toBeInTheDocument();
        expect(screen.getByText('Death Day')).toBeInTheDocument();
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Actions')).toBeInTheDocument();
      });
    });

    it('should display character data correctly', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        // Check character names
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
        expect(screen.getByText('Legolas')).toBeInTheDocument();
        expect(screen.getByText('Gimli')).toBeInTheDocument();

        // Check usernames
        expect(screen.getByText('player1')).toBeInTheDocument();
        expect(screen.getByText('player2')).toBeInTheDocument();
        expect(screen.getByText('player3')).toBeInTheDocument();

        // Check appraisal bonuses
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();
      });
    });

    it('should handle empty character list', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/users/all-characters') {
          return Promise.resolve({ data: { data: [] } });
        }
        if (url === '/users') {
          return Promise.resolve({ data: { data: mockUsers } });
        }
        return Promise.resolve({ data: { data: [] } });
      });

      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Character Management')).toBeInTheDocument();
        // Should still show table headers but no character data
        expect(screen.getByText('Character Name')).toBeInTheDocument();
      });
    });
  });

  describe('Data Loading', () => {
    it('should fetch characters and users on mount', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/users/all-characters');
        expect(api.get).toHaveBeenCalledWith('/users');
      });
    });

    it('should handle API errors during data loading', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      api.get.mockRejectedValue(new Error('API Error'));

      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });

    it('should handle network errors gracefully', async () => {
      api.get.mockRejectedValue(new Error('Network Error'));

      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Character Sorting', () => {
    it('should sort characters by name', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      // Click on name header to sort
      const nameHeader = screen.getByText('Character Name');
      fireEvent.click(nameHeader);

      // Should maintain alphabetical order by default (Aragorn, Gimli, Legolas)
      const characterRows = screen.getAllByRole('row');
      expect(characterRows[1]).toHaveTextContent('Aragorn');
      expect(characterRows[2]).toHaveTextContent('Gimli');
      expect(characterRows[3]).toHaveTextContent('Legolas');
    });

    it('should reverse sort when clicking same header twice', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      const nameHeader = screen.getByText('Character Name');
      
      // First click - ascending
      fireEvent.click(nameHeader);
      
      // Second click - descending
      fireEvent.click(nameHeader);

      const characterRows = screen.getAllByRole('row');
      // Should be reverse alphabetical (Legolas, Gimli, Aragorn)
      expect(characterRows[1]).toHaveTextContent('Legolas');
      expect(characterRows[2]).toHaveTextContent('Gimli');
      expect(characterRows[3]).toHaveTextContent('Aragorn');
    });

    it('should sort by appraisal bonus', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      const bonusHeader = screen.getByText('Appraisal Bonus');
      fireEvent.click(bonusHeader);

      // Should sort by appraisal bonus ascending (3, 4, 5)
      const characterRows = screen.getAllByRole('row');
      expect(characterRows[1]).toHaveTextContent('Legolas'); // 3
      expect(characterRows[2]).toHaveTextContent('Gimli');   // 4
      expect(characterRows[3]).toHaveTextContent('Aragorn'); // 5
    });

    it('should sort by player name', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      const playerHeader = screen.getByText('Player');
      fireEvent.click(playerHeader);

      // Should sort by username (player1, player2, player3)
      const characterRows = screen.getAllByRole('row');
      expect(characterRows[1]).toHaveTextContent('player1');
      expect(characterRows[2]).toHaveTextContent('player2');
      expect(characterRows[3]).toHaveTextContent('player3');
    });
  });

  describe('Character Update Dialog', () => {
    it('should open update dialog when edit button clicked', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      // Find and click the first edit button
      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Update Character')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Aragorn')).toBeInTheDocument();
        expect(screen.getByDisplayValue('5')).toBeInTheDocument();
      });
    });

    it('should populate dialog with character data', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Aragorn')).toBeInTheDocument();
        expect(screen.getByDisplayValue('5')).toBeInTheDocument();
        expect(screen.getByDisplayValue('2023-01-15')).toBeInTheDocument();
        
        // Check that active checkbox is checked
        const activeCheckbox = screen.getByRole('checkbox', { name: /active/i });
        expect(activeCheckbox).toBeChecked();
      });
    });

    it('should close dialog when cancel clicked', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Update Character')).toBeInTheDocument();
      });

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Update Character')).not.toBeInTheDocument();
      });
    });

    it('should handle form input changes', async () => {
      const user = userEvent.setup();
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Aragorn')).toBeInTheDocument();
      });

      // Change character name
      const nameInput = screen.getByDisplayValue('Aragorn');
      await user.clear(nameInput);
      await user.type(nameInput, 'Strider');

      expect(screen.getByDisplayValue('Strider')).toBeInTheDocument();

      // Change appraisal bonus
      const bonusInput = screen.getByDisplayValue('5');
      await user.clear(bonusInput);
      await user.type(bonusInput, '7');

      expect(screen.getByDisplayValue('7')).toBeInTheDocument();
    });
  });

  describe('Character Update Submission', () => {
    it('should submit character updates successfully', async () => {
      const user = userEvent.setup();
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Aragorn')).toBeInTheDocument();
      });

      // Update character name
      const nameInput = screen.getByDisplayValue('Aragorn');
      await user.clear(nameInput);
      await user.type(nameInput, 'Strider');

      // Submit the form
      const updateButton = screen.getByText('Update');
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/users/character/1', {
          name: 'Strider',
          appraisal_bonus: 5,
          birthday: '2023-01-15',
          deathday: '',
          active: true,
          user_id: 101
        });
      });

      // Dialog should close and success message should appear
      await waitFor(() => {
        expect(screen.queryByText('Update Character')).not.toBeInTheDocument();
        expect(screen.getByText(/success/i)).toBeInTheDocument();
      });
    });

    it('should handle update API errors', async () => {
      api.put.mockRejectedValue(new Error('Update failed'));

      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Aragorn')).toBeInTheDocument();
      });

      const updateButton = screen.getByText('Update');
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
    });

    it('should update character user assignment', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Aragorn')).toBeInTheDocument();
      });

      // Change user assignment
      const userSelect = screen.getByRole('button', { name: /player/i });
      fireEvent.mouseDown(userSelect);

      await waitFor(() => {
        const player4Option = screen.getByText('player4');
        fireEvent.click(player4Option);
      });

      const updateButton = screen.getByText('Update');
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/users/character/1', 
          expect.objectContaining({
            user_id: 104
          })
        );
      });
    });

    it('should toggle character active status', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Aragorn')).toBeInTheDocument();
      });

      // Toggle active checkbox
      const activeCheckbox = screen.getByRole('checkbox', { name: /active/i });
      fireEvent.click(activeCheckbox);

      const updateButton = screen.getByText('Update');
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/users/character/1', 
          expect.objectContaining({
            active: false
          })
        );
      });
    });
  });

  describe('Date Handling', () => {
    it('should handle birthday and deathday updates', async () => {
      const user = userEvent.setup();
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('2023-01-15')).toBeInTheDocument();
      });

      // Update birthday
      const birthdayInput = screen.getByDisplayValue('2023-01-15');
      await user.clear(birthdayInput);
      await user.type(birthdayInput, '2023-03-20');

      // Update deathday
      const deathdayInput = screen.getByPlaceholderText(/death/i) || screen.getAllByRole('textbox')[3];
      await user.type(deathdayInput, '2023-12-25');

      const updateButton = screen.getByText('Update');
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/users/character/1', 
          expect.objectContaining({
            birthday: '2023-03-20',
            deathday: '2023-12-25'
          })
        );
      });
    });

    it('should handle null/empty dates correctly', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Gimli')).toBeInTheDocument();
      });

      // Edit Gimli (who has null birthday and deathday)
      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[2]); // Gimli is third character

      await waitFor(() => {
        expect(screen.getByDisplayValue('Gimli')).toBeInTheDocument();
      });

      const updateButton = screen.getByText('Update');
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/users/character/3', 
          expect.objectContaining({
            birthday: '',
            deathday: ''
          })
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error messages', async () => {
      api.get.mockRejectedValue(new Error('Failed to load characters'));

      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
    });

    it('should handle malformed API responses', async () => {
      api.get.mockResolvedValue({ data: null });

      render(<CharacterManagement />);

      // Should not crash and handle gracefully
      await waitFor(() => {
        expect(screen.getByText('Character Management')).toBeInTheDocument();
      });
    });

    it('should clear error messages after successful operation', async () => {
      // First render with error
      api.get.mockRejectedValueOnce(new Error('API Error'))
             .mockResolvedValue({ data: { data: mockCharacters } });

      const { rerender } = render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });

      // Re-render should clear error
      rerender(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      // Check for table accessibility
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getAllByRole('columnheader')).toHaveLength(7);
      expect(screen.getAllByRole('row')).toHaveLength(4); // Header + 3 data rows
    });

    it('should support keyboard navigation', async () => {
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByText('Edit');
      
      // Focus should be manageable via keyboard
      editButtons[0].focus();
      expect(editButtons[0]).toHaveFocus();
    });
  });

  describe('Performance', () => {
    it('should handle large character lists', async () => {
      const largeCharacterList = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `Character ${i + 1}`,
        username: `player${i + 1}`,
        appraisal_bonus: Math.floor(Math.random() * 10),
        birthday: '2023-01-01',
        deathday: null,
        active: i % 2 === 0,
        user_id: i + 1
      }));

      api.get.mockImplementation((url) => {
        if (url === '/users/all-characters') {
          return Promise.resolve({ data: { data: largeCharacterList } });
        }
        if (url === '/users') {
          return Promise.resolve({ data: { data: mockUsers } });
        }
        return Promise.resolve({ data: { data: [] } });
      });

      const startTime = performance.now();
      render(<CharacterManagement />);

      await waitFor(() => {
        expect(screen.getByText('Character 1')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within reasonable time (less than 2 seconds)
      expect(renderTime).toBeLessThan(2000);
    });

    it('should not re-render unnecessarily', async () => {
      const renderSpy = jest.fn();
      
      const TestComponent = () => {
        renderSpy();
        return <CharacterManagement />;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByText('Aragorn')).toBeInTheDocument();
      });

      // Should only render once initially (plus any necessary re-renders for data loading)
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });
});