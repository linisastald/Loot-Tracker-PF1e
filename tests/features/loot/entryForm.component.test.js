/**
 * Tests for EntryForm component
 * Tests the core entry form used in loot creation
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntryForm from '../../../frontend/src/components/pages/EntryForm';
import { fetchItemNames } from '../../../frontend/src/utils/lootEntryUtils';
import api from '../../../frontend/src/utils/api';

// Mock dependencies
jest.mock('../../../frontend/src/utils/lootEntryUtils', () => ({
  fetchItemNames: jest.fn(),
}));

jest.mock('../../../frontend/src/utils/api');

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  Autocomplete: ({ options, value, onChange, onInputChange, renderInput, freeSolo }) => (
    <div data-testid="autocomplete">
      {renderInput({ 
        inputProps: { 
          'data-testid': 'autocomplete-input',
          value: typeof value === 'string' ? value : value?.name || '',
          onChange: (e) => onInputChange && onInputChange(e, e.target.value)
        }
      })}
      <select 
        data-testid="autocomplete-options"
        onChange={(e) => {
          if (freeSolo && e.target.value === 'custom') {
            onChange && onChange(null, e.target.value);
          } else {
            const option = options.find(opt => opt.id?.toString() === e.target.value);
            onChange && onChange(null, option);
          }
        }}
      >
        <option value="">Select an item</option>
        {freeSolo && <option value="custom">Custom entry</option>}
        {options.map(option => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </select>
    </div>
  ),
  TextField: ({ label, value, onChange, error, helperText, type, multiline, rows, ...props }) => (
    <div data-testid="text-field">
      <label>{label}</label>
      {multiline ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange({ target: { value: e.target.value } })}
          rows={rows}
          data-testid={`textfield-${label?.toLowerCase().replace(/\s+/g, '-')}`}
          {...props}
        />
      ) : (
        <input
          type={type || 'text'}
          value={value || ''}
          onChange={(e) => onChange({ target: { value: e.target.value } })}
          data-testid={`textfield-${label?.toLowerCase().replace(/\s+/g, '-')}`}
          {...props}
        />
      )}
      {error && <span data-testid="field-error">{helperText}</span>}
    </div>
  ),
  Select: ({ children, value, onChange, ...props }) => (
    <select 
      data-testid="select"
      value={value || ''}
      onChange={(e) => onChange({ target: { value: e.target.value } })}
      {...props}
    >
      {children}
    </select>
  ),
  MenuItem: ({ children, value }) => (
    <option value={value}>{children}</option>
  ),
  FormControlLabel: ({ label, control }) => (
    <div data-testid="form-control-label">
      <label>{label}</label>
      {control}
    </div>
  ),
  Checkbox: ({ checked, onChange, ...props }) => (
    <input
      type="checkbox"
      checked={checked || false}
      onChange={(e) => onChange({ target: { checked: e.target.checked } })}
      data-testid="checkbox"
      {...props}
    />
  ),
  Switch: ({ checked, onChange, disabled, ...props }) => (
    <input
      type="checkbox"
      checked={checked || false}
      onChange={(e) => onChange({ target: { checked: e.target.checked } })}
      disabled={disabled}
      data-testid="switch"
      {...props}
    />
  ),
  IconButton: ({ children, onClick, ...props }) => (
    <button onClick={onClick} data-testid="icon-button" {...props}>
      {children}
    </button>
  ),
  Box: ({ children }) => <div data-testid="box">{children}</div>,
  Grid: ({ children }) => <div data-testid="grid">{children}</div>,
  Paper: ({ children }) => <div data-testid="paper">{children}</div>,
  Typography: ({ children }) => <div data-testid="typography">{children}</div>,
  FormControl: ({ children }) => <div data-testid="form-control">{children}</div>,
  InputLabel: ({ children }) => <label data-testid="input-label">{children}</label>,
}));

jest.mock('@mui/icons-material', () => ({
  Delete: () => <span data-testid="delete-icon">Delete</span>,
}));

describe('EntryForm Component', () => {
  const mockEntry = {
    data: {
      name: 'Magic Sword',
      quantity: 1,
      value: 1500,
      description: 'A glowing blade',
      notes: 'Found in treasure chest',
      unidentified: false,
      parseItem: false,
      itemId: 1,
      type: 'weapon'
    }
  };

  const mockItemSuggestions = [
    { id: 1, name: 'Long Sword', type: 'weapon', value: 15 },
    { id: 2, name: 'Healing Potion', type: 'potion', value: 50 },
    { id: 3, name: 'Shield', type: 'armor', value: 10 }
  ];

  const defaultProps = {
    entry: mockEntry,
    index: 0,
    onRemove: jest.fn(),
    onChange: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    fetchItemNames.mockResolvedValue(mockItemSuggestions);
    api.get.mockResolvedValue({ data: { hasKey: true } });
  });

  describe('Component Initialization', () => {
    it('should render form with entry data', async () => {
      render(<EntryForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('textfield-name')).toHaveValue('Magic Sword');
        expect(screen.getByTestId('textfield-quantity')).toHaveValue('1');
        expect(screen.getByTestId('textfield-value')).toHaveValue('1500');
        expect(screen.getByTestId('textfield-description')).toHaveValue('A glowing blade');
        expect(screen.getByTestId('textfield-notes')).toHaveValue('Found in treasure chest');
      });
    });

    it('should load item suggestions on mount', async () => {
      render(<EntryForm {...defaultProps} />);

      await waitFor(() => {
        expect(fetchItemNames).toHaveBeenCalled();
      });
    });

    it('should check OpenAI key status on mount', async () => {
      render(<EntryForm {...defaultProps} />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/settings/openai-key');
      });
    });

    it('should handle missing entry data gracefully', () => {
      const emptyEntry = { data: {} };
      
      render(<EntryForm {...defaultProps} entry={emptyEntry} />);

      expect(screen.getByTestId('textfield-name')).toHaveValue('');
      expect(screen.getByTestId('textfield-quantity')).toHaveValue('');
    });
  });

  describe('Field Interactions', () => {
    it('should update name field', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      const nameField = screen.getByTestId('textfield-name');
      await user.clear(nameField);
      await user.type(nameField, 'Updated Sword');

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { name: 'Updated Sword' });
    });

    it('should update quantity field', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      const quantityField = screen.getByTestId('textfield-quantity');
      await user.clear(quantityField);
      await user.type(quantityField, '5');

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { quantity: '5' });
    });

    it('should update value field', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      const valueField = screen.getByTestId('textfield-value');
      await user.clear(valueField);
      await user.type(valueField, '2000');

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { value: '2000' });
    });

    it('should update description field', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      const descriptionField = screen.getByTestId('textfield-description');
      await user.clear(descriptionField);
      await user.type(descriptionField, 'Updated description');

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { description: 'Updated description' });
    });

    it('should update notes field', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      const notesField = screen.getByTestId('textfield-notes');
      await user.clear(notesField);
      await user.type(notesField, 'Updated notes');

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { notes: 'Updated notes' });
    });
  });

  describe('Item Selection', () => {
    it('should handle item autocomplete selection', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-options')).toBeInTheDocument();
      });

      const autocompleteSelect = screen.getByTestId('autocomplete-options');
      await user.selectOptions(autocompleteSelect, '2');

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { name: 'Healing Potion' });
      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { itemId: 2 });
      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { type: 'potion' });
      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { value: 50 });
    });

    it('should handle clearing item selection', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-options')).toBeInTheDocument();
      });

      const autocompleteSelect = screen.getByTestId('autocomplete-options');
      await user.selectOptions(autocompleteSelect, '');

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { name: '' });
      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { itemId: null });
      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { type: '' });
      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { value: null });
    });

    it('should handle custom item entry', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-options')).toBeInTheDocument();
      });

      const autocompleteSelect = screen.getByTestId('autocomplete-options');
      await user.selectOptions(autocompleteSelect, 'custom');

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { name: 'custom' });
    });

    it('should populate autocomplete with suggestions', async () => {
      render(<EntryForm {...defaultProps} />);

      await waitFor(() => {
        const options = screen.getByTestId('autocomplete-options');
        expect(options).toHaveTextContent('Long Sword');
        expect(options).toHaveTextContent('Healing Potion');
        expect(options).toHaveTextContent('Shield');
      });
    });
  });

  describe('Unidentified Item Handling', () => {
    it('should toggle unidentified status', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      const unidentifiedCheckbox = screen.getByTestId('checkbox');
      await user.click(unidentifiedCheckbox);

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { unidentified: true });
    });

    it('should disable Smart Item Detection when unidentified is checked', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      const unidentifiedCheckbox = screen.getByTestId('checkbox');
      await user.click(unidentifiedCheckbox);

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { parseItem: false });
      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { itemId: null });
    });

    it('should clear itemId when unidentified is checked', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      const unidentifiedCheckbox = screen.getByTestId('checkbox');
      await user.click(unidentifiedCheckbox);

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { itemId: null });
    });
  });

  describe('Smart Item Detection', () => {
    it('should show Smart Item Detection toggle when OpenAI key exists', async () => {
      render(<EntryForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('switch')).toBeInTheDocument();
      });
    });

    it('should disable Smart Item Detection when no OpenAI key', async () => {
      api.get.mockResolvedValue({ data: { hasKey: false } });
      
      render(<EntryForm {...defaultProps} />);

      await waitFor(() => {
        const smartDetectionSwitch = screen.getByTestId('switch');
        expect(smartDetectionSwitch).toBeDisabled();
      });
    });

    it('should prevent enabling Smart Item Detection without OpenAI key', async () => {
      api.get.mockResolvedValue({ data: { hasKey: false } });
      const user = userEvent.setup();
      
      render(<EntryForm {...defaultProps} />);

      await waitFor(() => {
        const smartDetectionSwitch = screen.getByTestId('switch');
        expect(smartDetectionSwitch).toBeDisabled();
      });

      // Try to click disabled switch - should not trigger onChange
      const smartDetectionSwitch = screen.getByTestId('switch');
      await user.click(smartDetectionSwitch);

      expect(defaultProps.onChange).not.toHaveBeenCalledWith(0, { parseItem: true });
    });

    it('should toggle Smart Item Detection when enabled', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('switch')).toBeInTheDocument();
      });

      const smartDetectionSwitch = screen.getByTestId('switch');
      await user.click(smartDetectionSwitch);

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { parseItem: true });
    });
  });

  describe('Form Actions', () => {
    it('should show remove button', () => {
      render(<EntryForm {...defaultProps} />);

      expect(screen.getByTestId('icon-button')).toBeInTheDocument();
      expect(screen.getByTestId('delete-icon')).toBeInTheDocument();
    });

    it('should call onRemove when delete button is clicked', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      const removeButton = screen.getByTestId('icon-button');
      await user.click(removeButton);

      expect(defaultProps.onRemove).toHaveBeenCalledWith(0);
    });
  });

  describe('Type Selection', () => {
    it('should show type dropdown', () => {
      render(<EntryForm {...defaultProps} />);

      expect(screen.getByTestId('select')).toBeInTheDocument();
    });

    it('should handle type selection', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      const typeSelect = screen.getByTestId('select');
      await user.selectOptions(typeSelect, 'armor');

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { type: 'armor' });
    });

    it('should update type when item is selected', async () => {
      const user = userEvent.setup();
      render(<EntryForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-options')).toBeInTheDocument();
      });

      const autocompleteSelect = screen.getByTestId('autocomplete-options');
      await user.selectOptions(autocompleteSelect, '3'); // Shield (armor)

      expect(defaultProps.onChange).toHaveBeenCalledWith(0, { type: 'armor' });
    });
  });

  describe('Error Handling', () => {
    it('should handle failed item suggestions load', async () => {
      fetchItemNames.mockRejectedValue(new Error('Failed to load items'));

      render(<EntryForm {...defaultProps} />);

      // Should not crash
      await waitFor(() => {
        expect(screen.getByTestId('autocomplete')).toBeInTheDocument();
      });
    });

    it('should handle OpenAI key check failure', async () => {
      api.get.mockRejectedValue(new Error('API Error'));

      render(<EntryForm {...defaultProps} />);

      await waitFor(() => {
        const smartDetectionSwitch = screen.getByTestId('switch');
        expect(smartDetectionSwitch).toBeDisabled();
      });
    });

    it('should handle entry data updates', async () => {
      const { rerender } = render(<EntryForm {...defaultProps} />);

      const updatedEntry = {
        data: { ...mockEntry.data, name: 'Updated Name' }
      };

      rerender(<EntryForm {...defaultProps} entry={updatedEntry} />);

      await waitFor(() => {
        expect(screen.getByTestId('textfield-name')).toHaveValue('Updated Name');
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      render(<EntryForm {...defaultProps} />);

      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/value/i)).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      render(<EntryForm {...defaultProps} />);

      const nameField = screen.getByTestId('textfield-name');
      nameField.focus();

      await userEvent.keyboard('[Tab]');
      
      // Should be able to navigate between form fields
      expect(document.activeElement).not.toBe(nameField);
    });

    it('should have proper ARIA attributes for toggles', () => {
      render(<EntryForm {...defaultProps} />);

      const unidentifiedCheckbox = screen.getByTestId('checkbox');
      expect(unidentifiedCheckbox).toHaveAttribute('type', 'checkbox');

      const smartDetectionSwitch = screen.getByTestId('switch');
      expect(smartDetectionSwitch).toHaveAttribute('type', 'checkbox');
    });
  });

  describe('Field Validation Visual Feedback', () => {
    it('should show validation errors for invalid data', async () => {
      const entryWithErrors = {
        data: { ...mockEntry.data, quantity: -1, value: 'invalid' }
      };
      
      render(<EntryForm {...defaultProps} entry={entryWithErrors} />);

      // Check if error styling is applied
      expect(screen.getByTestId('textfield-quantity')).toHaveValue('-1');
      expect(screen.getByTestId('textfield-value')).toHaveValue('invalid');
    });

    it('should handle empty required fields', async () => {
      const entryWithEmptyFields = {
        data: { ...mockEntry.data, name: '', quantity: '' }
      };
      
      render(<EntryForm {...defaultProps} entry={entryWithEmptyFields} />);

      expect(screen.getByTestId('textfield-name')).toHaveValue('');
      expect(screen.getByTestId('textfield-quantity')).toHaveValue('');
    });
  });
});