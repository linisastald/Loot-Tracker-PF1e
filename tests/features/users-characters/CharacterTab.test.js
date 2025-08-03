/**
 * Tests for CharacterTab.js - User Character Settings Component
 * Tests character CRUD operations, activation, and form validation
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CharacterTab from '../../../frontend/src/components/pages/UserSettings/CharacterTab';
import api from '../../../frontend/src/utils/api';

// Mock the API
jest.mock('../../../frontend/src/utils/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn()
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

describe('CharacterTab', () => {
  const mockCharacters = [
    {
      id: 1,
      name: 'Thorgar Ironbeard',
      appraisal_bonus: 5,
      birthday: '2023-01-15',
      deathday: null,
      active: true
    },
    {
      id: 2,
      name: 'Elara Moonwhisper',
      appraisal_bonus: 3,
      birthday: '2023-02-20',
      deathday: null,
      active: false
    },
    {
      id: 3,
      name: 'Grimm Shadowstep',
      appraisal_bonus: 4,
      birthday: null,
      deathday: '2023-11-30',
      active: false
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default successful API responses
    api.get.mockResolvedValue({
      data: {
        success: true,
        data: mockCharacters
      }
    });

    api.post.mockResolvedValue({
      data: {
        success: true,
        data: { id: 4, name: 'New Character' },
        message: 'Character created successfully'
      }
    });

    api.put.mockResolvedValue({
      data: {
        success: true,
        data: { id: 1, name: 'Updated Character' },
        message: 'Character updated successfully'
      }
    });

    api.delete.mockResolvedValue({
      data: {
        success: true,
        message: 'Character deleted successfully'
      }
    });
  });

  describe('Component Rendering', () => {
    it('should render character tab interface', async () => {
      render(<CharacterTab />);

      expect(screen.getByText('My Characters')).toBeInTheDocument();
      expect(screen.getByText('Add Character')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
        expect(screen.getByText('Elara Moonwhisper')).toBeInTheDocument();
        expect(screen.getByText('Grimm Shadowstep')).toBeInTheDocument();
      });
    });

    it('should display character cards correctly', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      // Check character information display
      expect(screen.getByText('Appraisal Bonus: +5')).toBeInTheDocument();
      expect(screen.getByText('Appraisal Bonus: +3')).toBeInTheDocument();
      expect(screen.getByText('Appraisal Bonus: +4')).toBeInTheDocument();

      // Check active status indicators
      const activeIndicators = screen.getAllByTestId('star-icon');
      expect(activeIndicators).toHaveLength(1); // Only Thorgar is active

      // Check death status
      expect(screen.getByText(/died/i)).toBeInTheDocument(); // Grimm is dead
    });

    it('should show active character prominently', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      // Active character should have star icon
      const thorgarCard = screen.getByText('Thorgar Ironbeard').closest('.MuiCard-root');
      expect(within(thorgarCard).getByTestId('star-icon')).toBeInTheDocument();

      // Inactive characters should have border star icon
      const elaraCard = screen.getByText('Elara Moonwhisper').closest('.MuiCard-root');
      expect(within(elaraCard).getByTestId('star-border-icon')).toBeInTheDocument();
    });

    it('should display birthday and deathday information', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      // Should show formatted dates
      expect(screen.getByText(/Jan.*15.*2023/)).toBeInTheDocument(); // Thorgar's birthday
      expect(screen.getByText(/Feb.*20.*2023/)).toBeInTheDocument(); // Elara's birthday
      expect(screen.getByText(/Nov.*30.*2023/)).toBeInTheDocument(); // Grimm's deathday
    });

    it('should handle empty character list', async () => {
      api.get.mockResolvedValue({
        data: {
          success: true,
          data: []
        }
      });

      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('My Characters')).toBeInTheDocument();
        expect(screen.getByText('Add Character')).toBeInTheDocument();
      });

      expect(screen.getByText(/no characters/i)).toBeInTheDocument();
    });
  });

  describe('Data Loading', () => {
    it('should fetch characters on mount', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/users/characters');
      });
    });

    it('should handle API errors during loading', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      api.get.mockRejectedValue(new Error('Failed to load characters'));

      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText(/error.*loading.*characters/i)).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });

    it('should show loading state', () => {
      api.get.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<CharacterTab />);

      expect(screen.getByText('My Characters')).toBeInTheDocument();
      // Characters should not be loaded yet
      expect(screen.queryByText('Thorgar Ironbeard')).not.toBeInTheDocument();
    });
  });

  describe('Character Creation', () => {
    it('should open add character dialog', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Add Character');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('Add New Character')).toBeInTheDocument();
        expect(screen.getByLabelText(/character name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/appraisal bonus/i)).toBeInTheDocument();
      });
    });

    it('should validate character form', async () => {
      const user = userEvent.setup();
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Add Character');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/character name/i)).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/character name is required/i)).toBeInTheDocument();
      });

      expect(api.post).not.toHaveBeenCalled();
    });

    it('should create character successfully', async () => {
      const user = userEvent.setup();
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Add Character');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/character name/i)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/character name/i);
      const bonusInput = screen.getByLabelText(/appraisal bonus/i);
      const birthdayInput = screen.getByLabelText(/birthday/i);
      const activeSwitch = screen.getByRole('checkbox', { name: /active/i });
      const saveButton = screen.getByRole('button', { name: /save/i });

      await user.type(nameInput, 'New Hero');
      await user.clear(bonusInput);
      await user.type(bonusInput, '6');
      await user.type(birthdayInput, '2023-03-15');
      await user.click(activeSwitch);

      await user.click(saveButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/users/characters', {
          name: 'New Hero',
          appraisal_bonus: 6,
          birthday: '2023-03-15',
          deathday: '',
          active: true
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/character created successfully/i)).toBeInTheDocument();
      });

      // Dialog should close
      expect(screen.queryByText('Add New Character')).not.toBeInTheDocument();
    });

    it('should handle character creation errors', async () => {
      api.post.mockRejectedValue(new Error('Character name already exists'));

      const user = userEvent.setup();
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Add Character');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/character name/i)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/character name/i);
      const saveButton = screen.getByRole('button', { name: /save/i });

      await user.type(nameInput, 'Duplicate Name');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/character name already exists/i)).toBeInTheDocument();
      });
    });

    it('should close dialog when cancelled', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Add Character');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('Add New Character')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(screen.queryByText('Add New Character')).not.toBeInTheDocument();
    });
  });

  describe('Character Editing', () => {
    it('should open edit character dialog', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Edit Character')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Thorgar Ironbeard')).toBeInTheDocument();
        expect(screen.getByDisplayValue('5')).toBeInTheDocument();
      });
    });

    it('should populate edit form with character data', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Thorgar Ironbeard')).toBeInTheDocument();
        expect(screen.getByDisplayValue('5')).toBeInTheDocument();
        expect(screen.getByDisplayValue('2023-01-15')).toBeInTheDocument();
        
        // Active switch should be checked
        const activeSwitch = screen.getByRole('checkbox', { name: /active/i });
        expect(activeSwitch).toBeChecked();
      });
    });

    it('should update character successfully', async () => {
      const user = userEvent.setup();
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const nameInput = screen.getByDisplayValue('Thorgar Ironbeard');
      const bonusInput = screen.getByDisplayValue('5');
      const saveButton = screen.getByRole('button', { name: /save/i });

      await user.clear(nameInput);
      await user.type(nameInput, 'Thorgar the Mighty');
      await user.clear(bonusInput);
      await user.type(bonusInput, '7');

      await user.click(saveButton);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/users/characters/1', {
          name: 'Thorgar the Mighty',
          appraisal_bonus: 7,
          birthday: '2023-01-15',
          deathday: '',
          active: true
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/character updated successfully/i)).toBeInTheDocument();
      });
    });

    it('should handle character update errors', async () => {
      api.put.mockRejectedValue(new Error('Update failed'));

      const user = userEvent.setup();
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/update failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Character Activation', () => {
    it('should activate character from card', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Elara Moonwhisper')).toBeInTheDocument();
      });

      // Find inactive character and click to activate
      const elaraCard = screen.getByText('Elara Moonwhisper').closest('.MuiCard-root');
      const activateButton = within(elaraCard).getByTestId('star-border-icon');
      
      fireEvent.click(activateButton);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/users/characters/2', {
          name: 'Elara Moonwhisper',
          appraisal_bonus: 3,
          birthday: '2023-02-20',
          deathday: '',
          active: true
        });
      });
    });

    it('should deactivate active character', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      // Find active character and click to deactivate
      const thorgarCard = screen.getByText('Thorgar Ironbeard').closest('.MuiCard-root');
      const deactivateButton = within(thorgarCard).getByTestId('star-icon');
      
      fireEvent.click(deactivateButton);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/users/characters/1', {
          name: 'Thorgar Ironbeard',
          appraisal_bonus: 5,
          birthday: '2023-01-15',
          deathday: '',
          active: false
        });
      });
    });

    it('should handle activation errors', async () => {
      api.put.mockRejectedValue(new Error('Activation failed'));

      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Elara Moonwhisper')).toBeInTheDocument();
      });

      const elaraCard = screen.getByText('Elara Moonwhisper').closest('.MuiCard-root');
      const activateButton = within(elaraCard).getByTestId('star-border-icon');
      
      fireEvent.click(activateButton);

      await waitFor(() => {
        expect(screen.getByText(/activation failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Character Deletion', () => {
    it('should open delete confirmation dialog', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
        expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument();
      });
    });

    it('should delete character successfully', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/users/characters/1');
      });

      await waitFor(() => {
        expect(screen.getByText(/character deleted successfully/i)).toBeInTheDocument();
      });
    });

    it('should handle deletion errors', async () => {
      api.delete.mockRejectedValue(new Error('Deletion failed'));

      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/deletion failed/i)).toBeInTheDocument();
      });
    });

    it('should cancel deletion', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(screen.queryByText(/are you sure you want to delete/i)).not.toBeInTheDocument();
      expect(api.delete).not.toHaveBeenCalled();
    });
  });

  describe('Date Handling', () => {
    it('should handle null dates correctly', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Grimm Shadowstep')).toBeInTheDocument();
      });

      // Grimm has null birthday but has deathday
      const grimmCard = screen.getByText('Grimm Shadowstep').closest('.MuiCard-root');
      expect(within(grimmCard).queryByText(/birthday/i)).not.toBeInTheDocument();
      expect(within(grimmCard).getByText(/died/i)).toBeInTheDocument();
    });

    it('should format dates correctly', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      // Should display human-readable date formats
      expect(screen.getByText(/Jan.*15.*2023/)).toBeInTheDocument();
      expect(screen.getByText(/Feb.*20.*2023/)).toBeInTheDocument();
      expect(screen.getByText(/Nov.*30.*2023/)).toBeInTheDocument();
    });

    it('should handle date updates in form', async () => {
      const user = userEvent.setup();
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('2023-01-15')).toBeInTheDocument();
      });

      const birthdayInput = screen.getByDisplayValue('2023-01-15');
      const deathdayInput = screen.getByLabelText(/deathday/i);
      const saveButton = screen.getByRole('button', { name: /save/i });

      await user.clear(birthdayInput);
      await user.type(birthdayInput, '2023-05-20');
      await user.type(deathdayInput, '2023-12-01');

      await user.click(saveButton);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/users/characters/1', 
          expect.objectContaining({
            birthday: '2023-05-20',
            deathday: '2023-12-01'
          })
        );
      });
    });
  });

  describe('Form Validation', () => {
    it('should validate appraisal bonus is numeric', async () => {
      const user = userEvent.setup();
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Add Character');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/character name/i)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/character name/i);
      const bonusInput = screen.getByLabelText(/appraisal bonus/i);
      const saveButton = screen.getByRole('button', { name: /save/i });

      await user.type(nameInput, 'Test Character');
      await user.clear(bonusInput);
      await user.type(bonusInput, 'not-a-number');

      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/appraisal bonus must be a number/i)).toBeInTheDocument();
      });

      expect(api.post).not.toHaveBeenCalled();
    });

    it('should validate character name length', async () => {
      const user = userEvent.setup();
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Add Character');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/character name/i)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/character name/i);
      const saveButton = screen.getByRole('button', { name: /save/i });

      await user.type(nameInput, 'a'.repeat(256)); // Very long name

      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/character name is too long/i)).toBeInTheDocument();
      });

      expect(api.post).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      // Check button accessibility
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAttribute('aria-label', expect.any(String));
      });

      // Check form accessibility when dialog is open
      const addButton = screen.getByText('Add Character');
      fireEvent.click(addButton);

      await waitFor(() => {
        const inputs = screen.getAllByRole('textbox');
        inputs.forEach(input => {
          expect(input).toHaveAccessibleName();
        });
      });
    });

    it('should support keyboard navigation', async () => {
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Add Character');
      
      // Focus should be manageable via keyboard
      addButton.focus();
      expect(addButton).toHaveFocus();
    });
  });

  describe('Performance', () => {
    it('should handle many characters efficiently', async () => {
      const manyCharacters = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        name: `Character ${i + 1}`,
        appraisal_bonus: Math.floor(Math.random() * 10),
        birthday: '2023-01-01',
        deathday: i % 10 === 0 ? '2023-12-01' : null,
        active: i === 0
      }));

      api.get.mockResolvedValue({
        data: {
          success: true,
          data: manyCharacters
        }
      });

      const startTime = performance.now();
      render(<CharacterTab />);

      await waitFor(() => {
        expect(screen.getByText('Character 1')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within reasonable time
      expect(renderTime).toBeLessThan(2000);
    });

    it('should not re-render unnecessarily', async () => {
      const renderSpy = jest.fn();
      
      const TestComponent = () => {
        renderSpy();
        return <CharacterTab />;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByText('Thorgar Ironbeard')).toBeInTheDocument();
      });

      // Should only render once initially
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });
});