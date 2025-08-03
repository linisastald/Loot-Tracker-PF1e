/**
 * Tests for ItemManagementDialog component
 * Tests the item editing dialog functionality
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemManagementDialog from '../../../frontend/src/components/common/dialogs/ItemManagementDialog';
import api from '../../../frontend/src/utils/api';
import lootService from '../../../frontend/src/services/lootService';

// Mock dependencies
jest.mock('../../../frontend/src/utils/api');
jest.mock('../../../frontend/src/services/lootService');

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  Dialog: ({ children, open, onClose }) => (
    open ? <div data-testid="dialog" onClick={onClose}>{children}</div> : null
  ),
  DialogTitle: ({ children }) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogActions: ({ children }) => <div data-testid="dialog-actions">{children}</div>,
  Autocomplete: ({ options, value, onChange, onInputChange, renderInput, loading }) => (
    <div data-testid="autocomplete">
      {renderInput({ 
        inputProps: { 
          'data-testid': 'autocomplete-input',
          value: value?.name || '',
          onChange: (e) => onInputChange && onInputChange(e, e.target.value)
        }
      })}
      {loading && <span data-testid="autocomplete-loading">Loading...</span>}
      <select 
        data-testid="autocomplete-options"
        onChange={(e) => {
          const option = options.find(opt => opt.id.toString() === e.target.value);
          onChange && onChange(null, option);
        }}
      >
        <option value="">Select an item</option>
        {options.map(option => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </select>
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
  FormControl: ({ children }) => <div data-testid="form-control">{children}</div>,
  InputLabel: ({ children }) => <label data-testid="input-label">{children}</label>,
  TextField: ({ label, value, onChange, error, helperText, multiline, rows, ...props }) => (
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
          value={value || ''}
          onChange={(e) => onChange({ target: { value: e.target.value } })}
          data-testid={`textfield-${label?.toLowerCase().replace(/\s+/g, '-')}`}
          {...props}
        />
      )}
      {error && <span data-testid="field-error">{helperText}</span>}
    </div>
  ),
  Button: ({ children, onClick, variant, color, disabled, ...props }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={`button-${children?.toString().toLowerCase().replace(/\s+/g, '-')}`}
      {...props}
    >
      {children}
    </button>
  ),
}));

describe('ItemManagementDialog Component', () => {
  const mockItem = {
    id: 1,
    name: 'Magic Sword',
    quantity: 1,
    value: 1500,
    description: 'A glowing blade',
    notes: 'Found in treasure chest',
    itemid: 1,
    modids: [1, 2],
    unidentified: false,
    cursed: false
  };

  const mockItems = [
    { id: 1, name: 'Long Sword', type: 'weapon' },
    { id: 2, name: 'Healing Potion', type: 'potion' }
  ];

  const mockMods = [
    { id: 1, name: '+1 Enhancement', cost: 2000 },
    { id: 2, name: 'Flaming', cost: 8000 }
  ];

  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    item: mockItem,
    onSave: jest.fn(),
    title: 'Update Item'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    api.get.mockResolvedValue({ data: mockItems });
    lootService.getAllLoot.mockResolvedValue({ data: mockItems });
    lootService.getMods.mockResolvedValue({ data: mockMods });
  });

  describe('Dialog Rendering', () => {
    it('should render dialog when open', () => {
      render(<ItemManagementDialog {...defaultProps} />);

      expect(screen.getByTestId('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-title')).toHaveTextContent('Update Item');
    });

    it('should not render dialog when closed', () => {
      render(<ItemManagementDialog {...defaultProps} open={false} />);

      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('should render with custom title', () => {
      render(<ItemManagementDialog {...defaultProps} title="Create New Item" />);

      expect(screen.getByTestId('dialog-title')).toHaveTextContent('Create New Item');
    });

    it('should render all form fields', () => {
      render(<ItemManagementDialog {...defaultProps} />);

      expect(screen.getByTestId('textfield-name')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-quantity')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-value')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-description')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-notes')).toBeInTheDocument();
      expect(screen.getByTestId('autocomplete')).toBeInTheDocument();
    });
  });

  describe('Form Initialization', () => {
    it('should populate form with item data', async () => {
      render(<ItemManagementDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('textfield-name')).toHaveValue('Magic Sword');
        expect(screen.getByTestId('textfield-quantity')).toHaveValue('1');
        expect(screen.getByTestId('textfield-value')).toHaveValue('1500');
        expect(screen.getByTestId('textfield-description')).toHaveValue('A glowing blade');
        expect(screen.getByTestId('textfield-notes')).toHaveValue('Found in treasure chest');
      });
    });

    it('should load items and mods on dialog open', async () => {
      render(<ItemManagementDialog {...defaultProps} />);

      await waitFor(() => {
        expect(lootService.getMods).toHaveBeenCalled();
        expect(api.get).toHaveBeenCalledWith('/items/reference');
      });
    });

    it('should handle empty item gracefully', () => {
      render(<ItemManagementDialog {...defaultProps} item={null} />);

      expect(screen.getByTestId('textfield-name')).toHaveValue('');
      expect(screen.getByTestId('textfield-quantity')).toHaveValue('');
    });

    it('should populate item autocomplete when itemid exists', async () => {
      render(<ItemManagementDialog {...defaultProps} />);

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalledWith({ query: 1 });
      });
    });
  });

  describe('Form Interactions', () => {
    it('should update name field', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const nameField = screen.getByTestId('textfield-name');
      await user.clear(nameField);
      await user.type(nameField, 'Updated Sword');

      expect(nameField).toHaveValue('Updated Sword');
    });

    it('should update quantity field', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const quantityField = screen.getByTestId('textfield-quantity');
      await user.clear(quantityField);
      await user.type(quantityField, '5');

      expect(quantityField).toHaveValue('5');
    });

    it('should update value field', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const valueField = screen.getByTestId('textfield-value');
      await user.clear(valueField);
      await user.type(valueField, '2000');

      expect(valueField).toHaveValue('2000');
    });

    it('should update description field', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const descriptionField = screen.getByTestId('textfield-description');
      await user.clear(descriptionField);
      await user.type(descriptionField, 'Updated description');

      expect(descriptionField).toHaveValue('Updated description');
    });

    it('should update notes field', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const notesField = screen.getByTestId('textfield-notes');
      await user.clear(notesField);
      await user.type(notesField, 'Updated notes');

      expect(notesField).toHaveValue('Updated notes');
    });
  });

  describe('Item Selection', () => {
    it('should handle item autocomplete selection', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-options')).toBeInTheDocument();
      });

      const autocompleteSelect = screen.getByTestId('autocomplete-options');
      await user.selectOptions(autocompleteSelect, '2');

      // Should update the selected item
      expect(autocompleteSelect).toHaveValue('2');
    });

    it('should handle item search input', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const autocompleteInput = screen.getByTestId('autocomplete-input');
      await user.type(autocompleteInput, 'Healing');

      // Should trigger search
      expect(autocompleteInput.value).toContain('Healing');
    });

    it('should show loading state for item search', async () => {
      api.get.mockImplementation(() => new Promise(resolve => 
        setTimeout(() => resolve({ data: mockItems }), 100)
      ));

      render(<ItemManagementDialog {...defaultProps} />);

      // Should show loading indicator
      await waitFor(() => {
        expect(screen.queryByTestId('autocomplete-loading')).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    it('should show validation error for empty name', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const nameField = screen.getByTestId('textfield-name');
      await user.clear(nameField);

      const saveButton = screen.getByTestId('button-save');
      await user.click(saveButton);

      expect(screen.getByTestId('field-error')).toHaveTextContent(/name is required/i);
    });

    it('should show validation error for invalid quantity', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const quantityField = screen.getByTestId('textfield-quantity');
      await user.clear(quantityField);
      await user.type(quantityField, '-1');

      const saveButton = screen.getByTestId('button-save');
      await user.click(saveButton);

      expect(screen.getByTestId('field-error')).toHaveTextContent(/quantity must be positive/i);
    });

    it('should show validation error for invalid value', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const valueField = screen.getByTestId('textfield-value');
      await user.clear(valueField);
      await user.type(valueField, 'invalid');

      const saveButton = screen.getByTestId('button-save');
      await user.click(saveButton);

      expect(screen.getByTestId('field-error')).toHaveTextContent(/value must be a number/i);
    });

    it('should allow saving with valid data', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const saveButton = screen.getByTestId('button-save');
      await user.click(saveButton);

      expect(defaultProps.onSave).toHaveBeenCalledWith({
        ...mockItem,
        // Should include any form updates
      });
    });
  });

  describe('Dialog Actions', () => {
    it('should call onSave with updated data', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      // Update the name
      const nameField = screen.getByTestId('textfield-name');
      await user.clear(nameField);
      await user.type(nameField, 'Updated Name');

      const saveButton = screen.getByTestId('button-save');
      await user.click(saveButton);

      expect(defaultProps.onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Name'
        })
      );
    });

    it('should call onClose when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const cancelButton = screen.getByTestId('button-cancel');
      await user.click(cancelButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should call onClose when dialog backdrop is clicked', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const dialog = screen.getByTestId('dialog');
      await user.click(dialog);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should close dialog after successful save', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const saveButton = screen.getByTestId('button-save');
      await user.click(saveButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Status and Identification Fields', () => {
    it('should show status dropdown', () => {
      render(<ItemManagementDialog {...defaultProps} />);

      expect(screen.getByTestId('select')).toBeInTheDocument();
    });

    it('should handle status change', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const statusSelect = screen.getByTestId('select');
      await user.selectOptions(statusSelect, 'Pending Sale');

      expect(statusSelect).toHaveValue('Pending Sale');
    });

    it('should show unidentified checkbox', () => {
      render(<ItemManagementDialog {...defaultProps} />);

      expect(screen.getByTestId('checkbox-unidentified')).toBeInTheDocument();
    });

    it('should handle unidentified toggle', async () => {
      const user = userEvent.setup();
      render(<ItemManagementDialog {...defaultProps} />);

      const unidentifiedCheckbox = screen.getByTestId('checkbox-unidentified');
      await user.click(unidentifiedCheckbox);

      expect(unidentifiedCheckbox).toBeChecked();
    });

    it('should show cursed checkbox', () => {
      render(<ItemManagementDialog {...defaultProps} />);

      expect(screen.getByTestId('checkbox-cursed')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      api.get.mockRejectedValue(new Error('API Error'));
      lootService.getMods.mockRejectedValue(new Error('Mods API Error'));

      render(<ItemManagementDialog {...defaultProps} />);

      // Should not crash and show error
      await waitFor(() => {
        expect(screen.getByTestId('dialog')).toBeInTheDocument();
      });
    });

    it('should handle save errors', async () => {
      const user = userEvent.setup();
      const saveError = new Error('Save failed');
      defaultProps.onSave.mockRejectedValue(saveError);

      render(<ItemManagementDialog {...defaultProps} />);

      const saveButton = screen.getByTestId('button-save');
      await user.click(saveButton);

      expect(screen.getByText(/save failed/i)).toBeInTheDocument();
    });

    it('should handle missing item data', () => {
      render(<ItemManagementDialog {...defaultProps} item={undefined} />);

      expect(screen.getByTestId('textfield-name')).toHaveValue('');
    });
  });

  describe('Data Loading', () => {
    it('should fetch items from reference API', async () => {
      render(<ItemManagementDialog {...defaultProps} />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/items/reference');
      });
    });

    it('should fetch mods from loot service', async () => {
      render(<ItemManagementDialog {...defaultProps} />);

      await waitFor(() => {
        expect(lootService.getMods).toHaveBeenCalled();
      });
    });

    it('should handle empty API responses', async () => {
      api.get.mockResolvedValue({ data: [] });
      lootService.getMods.mockResolvedValue({ data: [] });

      render(<ItemManagementDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('autocomplete')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper dialog ARIA attributes', () => {
      render(<ItemManagementDialog {...defaultProps} />);

      const dialog = screen.getByTestId('dialog');
      expect(dialog).toHaveAttribute('role', 'dialog');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('should have proper form labels', () => {
      render(<ItemManagementDialog {...defaultProps} />);

      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/value/i)).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      render(<ItemManagementDialog {...defaultProps} />);

      const nameField = screen.getByTestId('textfield-name');
      nameField.focus();

      await userEvent.keyboard('[Tab]');
      
      // Should be able to navigate between form fields
      expect(document.activeElement).not.toBe(nameField);
    });
  });
});