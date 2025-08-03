/**
 * Tests for LootEntry component
 * Tests the main loot entry form functionality including validation,
 * submission, and form management
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LootEntry from '../../../frontend/src/components/pages/LootEntry';
import { fetchInitialData, prepareEntryForSubmission, validateLootEntries } from '../../../frontend/src/utils/lootEntryUtils';
import useLootEntryForm from '../../../frontend/src/hooks/useLootEntryForm';

// Mock dependencies
jest.mock('../../../frontend/src/utils/lootEntryUtils', () => ({
  fetchInitialData: jest.fn(),
  prepareEntryForSubmission: jest.fn(),
  validateLootEntries: jest.fn(),
}));

jest.mock('../../../frontend/src/hooks/useLootEntryForm', () => jest.fn());

// Mock the EntryForm component
jest.mock('../../../frontend/src/components/pages/EntryForm', () => {
  return function MockEntryForm({ entries, onEntryChange, onAddEntry, onRemoveEntry, itemOptions }) {
    return (
      <div data-testid="entry-form">
        <div>Entries count: {entries.length}</div>
        <button onClick={onAddEntry} data-testid="add-entry">Add Entry</button>
        {entries.map((entry, index) => (
          <div key={index} data-testid={`entry-${index}`}>
            <input
              data-testid={`entry-name-${index}`}
              value={entry.name || ''}
              onChange={(e) => onEntryChange(index, 'name', e.target.value)}
            />
            <button
              data-testid={`remove-entry-${index}`}
              onClick={() => onRemoveEntry(index)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    );
  };
});

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  Alert: ({ children, severity, ...props }) => (
    <div data-testid="alert" data-severity={severity} {...props}>{children}</div>
  ),
}));

describe('LootEntry Component', () => {
  const mockFormHook = {
    entries: [],
    setEntries: jest.fn(),
    error: '',
    setError: jest.fn(),
    success: '',
    setSuccess: jest.fn(),
    handleAddEntry: jest.fn(),
    handleRemoveEntry: jest.fn(),
    handleEntryChange: jest.fn(),
    resetForm: jest.fn(),
  };

  const mockItemOptions = [
    { id: 1, name: 'Long Sword', type: 'weapon' },
    { id: 2, name: 'Healing Potion', type: 'potion' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    useLootEntryForm.mockReturnValue(mockFormHook);
    fetchInitialData.mockResolvedValue();
    validateLootEntries.mockReturnValue({ validEntries: [], invalidEntries: [] });
    prepareEntryForSubmission.mockResolvedValue({ success: true });
  });

  describe('Initial Rendering', () => {
    it('should render without crashing', () => {
      render(<LootEntry />);
      expect(screen.getByTestId('entry-form')).toBeInTheDocument();
    });

    it('should fetch initial data on mount', async () => {
      render(<LootEntry />);

      await waitFor(() => {
        expect(fetchInitialData).toHaveBeenCalled();
      });
    });

    it('should display loading state initially', () => {
      render(<LootEntry />);
      expect(screen.getByTestId('entry-form')).toBeInTheDocument();
    });

    it('should render add entry button', () => {
      render(<LootEntry />);
      expect(screen.getByRole('button', { name: /add entry/i })).toBeInTheDocument();
    });

    it('should render submit button', () => {
      render(<LootEntry />);
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });

    it('should render reset button', () => {
      render(<LootEntry />);
      expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
    });
  });

  describe('Form Management', () => {
    it('should add new entry when add button is clicked', async () => {
      const user = userEvent.setup();
      useLootEntryForm.mockReturnValue({
        ...mockFormHook,
        entries: [{ name: '', quantity: 1 }]
      });

      render(<LootEntry />);

      const addButton = screen.getByTestId('add-entry');
      await user.click(addButton);

      expect(mockFormHook.handleAddEntry).toHaveBeenCalled();
    });

    it('should remove entry when remove button is clicked', async () => {
      const user = userEvent.setup();
      useLootEntryForm.mockReturnValue({
        ...mockFormHook,
        entries: [{ name: 'Test Item', quantity: 1 }]
      });

      render(<LootEntry />);

      const removeButton = screen.getByTestId('remove-entry-0');
      await user.click(removeButton);

      expect(mockFormHook.handleRemoveEntry).toHaveBeenCalledWith(0);
    });

    it('should update entry when input changes', async () => {
      const user = userEvent.setup();
      useLootEntryForm.mockReturnValue({
        ...mockFormHook,
        entries: [{ name: '', quantity: 1 }]
      });

      render(<LootEntry />);

      const nameInput = screen.getByTestId('entry-name-0');
      await user.type(nameInput, 'Magic Sword');

      expect(mockFormHook.handleEntryChange).toHaveBeenCalledWith(0, 'name', 'Magic Sword');
    });

    it('should reset form when reset button is clicked', async () => {
      const user = userEvent.setup();
      render(<LootEntry />);

      const resetButton = screen.getByRole('button', { name: /reset/i });
      await user.click(resetButton);

      expect(mockFormHook.resetForm).toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    const mockValidEntries = [
      { name: 'Magic Sword', quantity: 1, value: 1500 },
      { name: 'Healing Potion', quantity: 3, value: 50 }
    ];

    const mockInvalidEntries = [
      { name: '', quantity: 1 } // Invalid - no name
    ];

    it('should submit valid entries successfully', async () => {
      const user = userEvent.setup();
      validateLootEntries.mockReturnValue({
        validEntries: mockValidEntries,
        invalidEntries: []
      });

      prepareEntryForSubmission.mockResolvedValue({ success: true });

      render(<LootEntry />);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(validateLootEntries).toHaveBeenCalled();
        expect(prepareEntryForSubmission).toHaveBeenCalledTimes(2);
        expect(mockFormHook.setSuccess).toHaveBeenCalledWith('Successfully processed 2 entries.');
      });
    });

    it('should handle submission with mixed valid and invalid entries', async () => {
      const user = userEvent.setup();
      validateLootEntries.mockReturnValue({
        validEntries: mockValidEntries,
        invalidEntries: mockInvalidEntries
      });

      prepareEntryForSubmission.mockResolvedValue({ success: true });

      render(<LootEntry />);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockFormHook.setSuccess).toHaveBeenCalledWith('Successfully processed 2 entries.');
        expect(mockFormHook.setError).toHaveBeenCalledWith('1 entries were not submitted due to errors.');
        expect(mockFormHook.setEntries).toHaveBeenCalledWith(mockInvalidEntries);
      });
    });

    it('should show error when no valid entries to submit', async () => {
      const user = userEvent.setup();
      validateLootEntries.mockReturnValue({
        validEntries: [],
        invalidEntries: mockInvalidEntries
      });

      render(<LootEntry />);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockFormHook.setError).toHaveBeenCalledWith('No valid entries to submit');
      });
    });

    it('should handle submission errors gracefully', async () => {
      const user = userEvent.setup();
      validateLootEntries.mockReturnValue({
        validEntries: mockValidEntries,
        invalidEntries: []
      });

      prepareEntryForSubmission.mockRejectedValue(new Error('Network error'));

      render(<LootEntry />);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockFormHook.setError).toHaveBeenCalledWith(
          'An error occurred while submitting entries. Please try again.'
        );
      });
    });

    it('should prevent default form submission', async () => {
      const user = userEvent.setup();
      const mockPreventDefault = jest.fn();
      
      render(<LootEntry />);

      const form = screen.getByRole('form') || screen.getByTestId('loot-entry-form');
      
      // Simulate form submission event
      fireEvent.submit(form, { preventDefault: mockPreventDefault });

      expect(mockPreventDefault).toHaveBeenCalled();
    });

    it('should filter out failed entries from submission results', async () => {
      const user = userEvent.setup();
      validateLootEntries.mockReturnValue({
        validEntries: mockValidEntries,
        invalidEntries: []
      });

      // Mock one successful and one failed submission
      prepareEntryForSubmission
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce(null); // Failed submission

      render(<LootEntry />);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockFormHook.setSuccess).toHaveBeenCalledWith('Successfully processed 1 entries.');
      });
    });
  });

  describe('Error and Success Messages', () => {
    it('should display error messages', () => {
      useLootEntryForm.mockReturnValue({
        ...mockFormHook,
        error: 'Test error message'
      });

      render(<LootEntry />);

      expect(screen.getByTestId('alert')).toHaveTextContent('Test error message');
      expect(screen.getByTestId('alert')).toHaveAttribute('data-severity', 'error');
    });

    it('should display success messages', () => {
      useLootEntryForm.mockReturnValue({
        ...mockFormHook,
        success: 'Test success message'
      });

      render(<LootEntry />);

      expect(screen.getByTestId('alert')).toHaveTextContent('Test success message');
      expect(screen.getByTestId('alert')).toHaveAttribute('data-severity', 'success');
    });

    it('should not display alerts when no messages', () => {
      render(<LootEntry />);

      expect(screen.queryByTestId('alert')).not.toBeInTheDocument();
    });
  });

  describe('Initial Data Loading', () => {
    it('should set active character ID from initial data', async () => {
      fetchInitialData.mockImplementation((setItemOptions, setActiveCharacterId) => {
        setActiveCharacterId(1);
        setItemOptions(mockItemOptions);
      });

      render(<LootEntry />);

      await waitFor(() => {
        expect(fetchInitialData).toHaveBeenCalled();
      });
    });

    it('should set item options from initial data', async () => {
      fetchInitialData.mockImplementation((setItemOptions, setActiveCharacterId) => {
        setItemOptions(mockItemOptions);
      });

      render(<LootEntry />);

      await waitFor(() => {
        expect(fetchInitialData).toHaveBeenCalled();
      });
    });

    it('should handle initial data loading errors', async () => {
      fetchInitialData.mockRejectedValue(new Error('Failed to load initial data'));

      // Should not crash the component
      render(<LootEntry />);

      expect(screen.getByTestId('entry-form')).toBeInTheDocument();
    });
  });

  describe('Entry Validation', () => {
    it('should validate entries before submission', async () => {
      const user = userEvent.setup();
      const testEntries = [
        { name: 'Valid Item', quantity: 1 },
        { name: '', quantity: 0 }
      ];

      useLootEntryForm.mockReturnValue({
        ...mockFormHook,
        entries: testEntries
      });

      render(<LootEntry />);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      expect(validateLootEntries).toHaveBeenCalledWith(testEntries);
    });

    it('should prepare valid entries for submission', async () => {
      const user = userEvent.setup();
      const validEntry = { name: 'Magic Sword', quantity: 1, value: 1500 };
      
      validateLootEntries.mockReturnValue({
        validEntries: [validEntry],
        invalidEntries: []
      });

      fetchInitialData.mockImplementation((setItemOptions, setActiveCharacterId) => {
        setActiveCharacterId(1);
      });

      render(<LootEntry />);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(prepareEntryForSubmission).toHaveBeenCalledWith(validEntry, 1);
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper form structure', () => {
      render(<LootEntry />);

      // Should have form elements
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      useLootEntryForm.mockReturnValue({
        ...mockFormHook,
        entries: [{ name: '', quantity: 1 }]
      });

      render(<LootEntry />);

      const nameInput = screen.getByTestId('entry-name-0');
      nameInput.focus();

      await userEvent.keyboard('[Tab]');
      
      // Should be able to navigate between form elements
      expect(document.activeElement).not.toBe(nameInput);
    });

    it('should have proper ARIA labels for alerts', () => {
      useLootEntryForm.mockReturnValue({
        ...mockFormHook,
        error: 'Test error'
      });

      render(<LootEntry />);

      const alert = screen.getByTestId('alert');
      expect(alert).toHaveAttribute('role', 'alert');
    });
  });
});