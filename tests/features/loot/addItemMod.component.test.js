/**
 * Tests for AddItemMod component
 * Tests the item and mod creation/editing functionality
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddItemMod from '../../../frontend/src/components/pages/ItemManagement/AddItemMod';
import api from '../../../frontend/src/utils/api';
import lootService from '../../../frontend/src/services/lootService';

// Mock dependencies
jest.mock('../../../frontend/src/utils/api');
jest.mock('../../../frontend/src/services/lootService');

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  Alert: ({ children, severity }) => (
    <div data-testid={`alert-${severity}`}>{children}</div>
  ),
  Paper: ({ children, sx }) => <div data-testid="paper">{children}</div>,
  Box: ({ children, sx, mb, py, display, justifyContent, mt }) => (
    <div data-testid="box">{children}</div>
  ),
  Typography: ({ children, variant, gutterBottom }) => (
    <div data-testid={`typography-${variant}`}>{children}</div>
  ),
  Tabs: ({ children, value, onChange }) => (
    <div data-testid="tabs" data-value={value} onClick={() => onChange(null, value === 0 ? 1 : 0)}>
      {children}
    </div>
  ),
  Tab: ({ label }) => (
    <button data-testid={`tab-${label.toLowerCase()}`}>{label}</button>
  ),
  Divider: ({ sx, my }) => <hr data-testid="divider" />,
  Grid: ({ children, container, spacing, size, xs, md }) => (
    <div data-testid={container ? "grid-container" : "grid-item"}>
      {children}
    </div>
  ),
  TextField: ({ label, name, value, onChange, type, required, disabled, fullWidth, margin, variant, helperText, placeholder, ...props }) => (
    <div data-testid="text-field">
      <label>{label}{required && ' *'}</label>
      <input
        name={name}
        type={type || 'text'}
        value={value || ''}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        data-testid={`textfield-${name || label?.toLowerCase().replace(/\s+/g, '-').replace(/[()]/g, '')}`}
        {...props}
      />
      {helperText && <span data-testid="helper-text">{helperText}</span>}
    </div>
  ),
  FormControl: ({ children, fullWidth, margin, required }) => (
    <div data-testid="form-control">{children}</div>
  ),
  InputLabel: ({ children }) => <label data-testid="input-label">{children}</label>,
  Select: ({ children, name, value, onChange, label, ...props }) => (
    <select 
      data-testid={`select-${name}`}
      name={name}
      value={value || ''}
      onChange={onChange}
      {...props}
    >
      {children}
    </select>
  ),
  MenuItem: ({ children, value }) => (
    <option value={value}>{children}</option>
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
  Autocomplete: ({ options, inputValue, onInputChange, onChange, getOptionLabel, renderInput, loading }) => (
    <div data-testid="autocomplete">
      {renderInput({ 
        inputProps: { 
          'data-testid': 'autocomplete-input',
          value: inputValue || '',
          onChange: (e) => onInputChange && onInputChange(e, e.target.value)
        }
      })}
      {loading && <span data-testid="autocomplete-loading">Loading...</span>}
      <select 
        data-testid="autocomplete-options"
        onChange={(e) => {
          const option = options.find(opt => opt.id?.toString() === e.target.value);
          onChange && onChange(null, option);
        }}
      >
        <option value="">Select an option</option>
        {options.map(option => (
          <option key={option.id} value={option.id}>
            {getOptionLabel ? getOptionLabel(option) : option.name}
          </option>
        ))}
      </select>
    </div>
  ),
}));

describe('AddItemMod Component', () => {
  const mockItems = [
    { id: 1, name: 'Long Sword', type: 'weapon', value: 15, weight: 4, casterlevel: 5 },
    { id: 2, name: 'Healing Potion', type: 'magic', value: 50, weight: 0.1, casterlevel: 1 }
  ];

  const mockMods = [
    { id: 1, name: '+1 Enhancement', type: 'Power', target: 'weapon', plus: '+1', valuecalc: '+2000' },
    { id: 2, name: 'Flaming', type: 'Power', target: 'weapon', subtarget: 'melee', valuecalc: '+8000' }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    lootService.getAllLoot.mockResolvedValue({ data: mockItems });
    lootService.getMods.mockResolvedValue({ data: mockMods });
    api.post.mockResolvedValue({ data: { success: true } });
    api.put.mockResolvedValue({ data: { success: true } });
  });

  describe('Component Initialization', () => {
    it('should render component with default tab', async () => {
      await act(async () => {
        render(<AddItemMod />);
      });

      expect(screen.getByTestId('typography-h6')).toHaveTextContent('Add or Edit Items & Mods');
      expect(screen.getByTestId('tab-items')).toBeInTheDocument();
      expect(screen.getByTestId('tab-mods')).toBeInTheDocument();
    });

    it('should load items and mods on mount', async () => {
      await act(async () => {
        render(<AddItemMod />);
      });

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
        expect(lootService.getMods).toHaveBeenCalled();
      });
    });

    it('should show items tab by default', async () => {
      await act(async () => {
        render(<AddItemMod />);
      });

      expect(screen.getByText('Add New Item')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-name')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should switch to mods tab when clicked', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      const tabs = screen.getByTestId('tabs');
      await user.click(tabs);

      await waitFor(() => {
        expect(screen.getByText('Add New Mod')).toBeInTheDocument();
      });
    });

    it('should show different content for each tab', async () => {
      await act(async () => {
        render(<AddItemMod />);
      });

      // Items tab content
      expect(screen.getByTestId('textfield-name')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-value')).toBeInTheDocument();

      // Switch to mods tab
      const user = userEvent.setup();
      const tabs = screen.getByTestId('tabs');
      await user.click(tabs);

      await waitFor(() => {
        expect(screen.getByTestId('select-target')).toBeInTheDocument();
      });
    });
  });

  describe('Item Form', () => {
    it('should render all item form fields', async () => {
      await act(async () => {
        render(<AddItemMod />);
      });

      expect(screen.getByTestId('textfield-id-non-editable')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-name')).toBeInTheDocument();
      expect(screen.getByTestId('select-type')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-subtype')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-value')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-weight')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-casterlevel')).toBeInTheDocument();
    });

    it('should update item form fields', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      const nameField = screen.getByTestId('textfield-name');
      await user.type(nameField, 'Test Item');

      expect(nameField).toHaveValue('Test Item');
    });

    it('should handle item search and selection', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-input')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('autocomplete-input');
      await user.type(searchInput, 'Long');

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalledWith({ query: 'Long' });
      });
    });

    it('should populate form when item is selected', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-options')).toBeInTheDocument();
      });

      const autocompleteSelect = screen.getByTestId('autocomplete-options');
      await user.selectOptions(autocompleteSelect, '1');

      await waitFor(() => {
        expect(screen.getByTestId('textfield-name')).toHaveValue('Long Sword');
        expect(screen.getByTestId('textfield-value')).toHaveValue('15');
      });
    });

    it('should validate required item fields', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      const submitButton = screen.getByTestId('button-add-item');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Item name is required');
      });
    });

    it('should submit new item successfully', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      // Fill required fields
      await user.type(screen.getByTestId('textfield-name'), 'New Item');
      await user.selectOptions(screen.getByTestId('select-type'), 'weapon');
      await user.type(screen.getByTestId('textfield-value'), '100');

      const submitButton = screen.getByTestId('button-add-item');
      await user.click(submitButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/admin/items', expect.objectContaining({
          name: 'New Item',
          type: 'weapon',
          value: 100
        }));
      });
    });

    it('should clear item form when reset button is clicked', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      // Fill some fields
      await user.type(screen.getByTestId('textfield-name'), 'Test Item');
      await user.type(screen.getByTestId('textfield-value'), '50');

      const clearButton = screen.getByTestId('button-clear-form');
      await user.click(clearButton);

      expect(screen.getByTestId('textfield-name')).toHaveValue('');
      expect(screen.getByTestId('textfield-value')).toHaveValue('');
    });
  });

  describe('Mod Form', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      // Switch to mods tab
      const tabs = screen.getByTestId('tabs');
      await user.click(tabs);
    });

    it('should render all mod form fields', async () => {
      await waitFor(() => {
        expect(screen.getByTestId('textfield-name')).toBeInTheDocument();
        expect(screen.getByTestId('select-type')).toBeInTheDocument();
        expect(screen.getByTestId('textfield-plus')).toBeInTheDocument();
        expect(screen.getByTestId('textfield-valuecalc')).toBeInTheDocument();
        expect(screen.getByTestId('select-target')).toBeInTheDocument();
        expect(screen.getByTestId('select-subtarget')).toBeInTheDocument();
      });
    });

    it('should handle mod search and selection', async () => {
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-input')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('autocomplete-input');
      await user.type(searchInput, 'Enhancement');

      // Should trigger local filtering since mods are already loaded
      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-options')).toBeInTheDocument();
      });
    });

    it('should validate required mod fields', async () => {
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByTestId('button-add-mod')).toBeInTheDocument();
      });

      const submitButton = screen.getByTestId('button-add-mod');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Mod name is required');
      });
    });

    it('should submit new mod successfully', async () => {
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByTestId('textfield-name')).toBeInTheDocument();
      });

      // Fill required fields
      await user.type(screen.getByTestId('textfield-name'), 'New Mod');
      await user.selectOptions(screen.getByTestId('select-type'), 'Power');
      await user.selectOptions(screen.getByTestId('select-target'), 'weapon');

      const submitButton = screen.getByTestId('button-add-mod');
      await user.click(submitButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/admin/mods', expect.objectContaining({
          name: 'New Mod',
          type: 'Power',
          target: 'weapon'
        }));
      });
    });

    it('should clear mod form when reset button is clicked', async () => {
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByTestId('textfield-name')).toBeInTheDocument();
      });

      // Fill some fields
      await user.type(screen.getByTestId('textfield-name'), 'Test Mod');
      await user.type(screen.getByTestId('textfield-plus'), '+1');

      const clearButton = screen.getByTestId('button-clear-form');
      await user.click(clearButton);

      expect(screen.getByTestId('textfield-name')).toHaveValue('');
      expect(screen.getByTestId('textfield-plus')).toHaveValue('');
    });
  });

  describe('Form Options', () => {
    it('should show all item type options', async () => {
      await act(async () => {
        render(<AddItemMod />);
      });

      const typeSelect = screen.getByTestId('select-type');
      expect(typeSelect).toHaveTextContent('weapon');
      expect(typeSelect).toHaveTextContent('armor');
      expect(typeSelect).toHaveTextContent('magic');
      expect(typeSelect).toHaveTextContent('gear');
      expect(typeSelect).toHaveTextContent('trade good');
      expect(typeSelect).toHaveTextContent('other');
    });

    it('should show all mod type options', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      // Switch to mods tab
      const tabs = screen.getByTestId('tabs');
      await user.click(tabs);

      await waitFor(() => {
        const typeSelect = screen.getByTestId('select-type');
        expect(typeSelect).toHaveTextContent('Material');
        expect(typeSelect).toHaveTextContent('Enhancement');
      });
    });

    it('should show all mod target options', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      // Switch to mods tab
      const tabs = screen.getByTestId('tabs');
      await user.click(tabs);

      await waitFor(() => {
        const targetSelect = screen.getByTestId('select-target');
        expect(targetSelect).toHaveTextContent('weapon');
        expect(targetSelect).toHaveTextContent('armor');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors for item creation', async () => {
      const user = userEvent.setup();
      api.post.mockRejectedValue({ 
        response: { data: { message: 'Item creation failed' } } 
      });
      
      await act(async () => {
        render(<AddItemMod />);
      });

      // Fill and submit
      await user.type(screen.getByTestId('textfield-name'), 'Test Item');
      await user.selectOptions(screen.getByTestId('select-type'), 'weapon');
      await user.type(screen.getByTestId('textfield-value'), '100');

      const submitButton = screen.getByTestId('button-add-item');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Item creation failed');
      });
    });

    it('should handle data loading errors', async () => {
      lootService.getAllLoot.mockRejectedValue(new Error('Failed to load items'));
      
      await act(async () => {
        render(<AddItemMod />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Failed to load items');
      });
    });

    it('should handle malformed mod data', async () => {
      lootService.getMods.mockResolvedValue({ data: { unexpected: 'format' } });
      
      await act(async () => {
        render(<AddItemMod />);
      });

      // Should not crash and handle gracefully
      await waitFor(() => {
        expect(screen.getByTestId('tab-mods')).toBeInTheDocument();
      });
    });
  });

  describe('Success Messages', () => {
    it('should show success message after item creation', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      // Fill and submit
      await user.type(screen.getByTestId('textfield-name'), 'Success Item');
      await user.selectOptions(screen.getByTestId('select-type'), 'weapon');
      await user.type(screen.getByTestId('textfield-value'), '100');

      const submitButton = screen.getByTestId('button-add-item');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-success')).toHaveTextContent('Item "Success Item" created successfully!');
      });
    });

    it('should show success message after mod update', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      // Switch to mods tab
      const tabs = screen.getByTestId('tabs');
      await user.click(tabs);

      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-options')).toBeInTheDocument();
      });

      // Select existing mod
      const autocompleteSelect = screen.getByTestId('autocomplete-options');
      await user.selectOptions(autocompleteSelect, '1');

      // Update and submit
      const nameField = screen.getByTestId('textfield-name');
      await user.clear(nameField);
      await user.type(nameField, 'Updated Mod');

      const submitButton = screen.getByTestId('button-update-mod');
      await user.click(submitButton);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalled();
        expect(screen.getByTestId('alert-success')).toHaveTextContent('Mod "Updated Mod" updated successfully!');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null item selection', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-options')).toBeInTheDocument();
      });

      // Select and then clear
      const autocompleteSelect = screen.getByTestId('autocomplete-options');
      await user.selectOptions(autocompleteSelect, '1');
      await user.selectOptions(autocompleteSelect, '');

      expect(screen.getByTestId('textfield-name')).toHaveValue('');
    });

    it('should handle invalid numeric values', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      // Try to submit with invalid value
      await user.type(screen.getByTestId('textfield-name'), 'Test Item');
      await user.selectOptions(screen.getByTestId('select-type'), 'weapon');
      await user.type(screen.getByTestId('textfield-value'), 'invalid');

      const submitButton = screen.getByTestId('button-add-item');
      await user.click(submitButton);

      // Should handle the invalid value gracefully
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/admin/items', expect.objectContaining({
          value: NaN
        }));
      });
    });
  });

  describe('Form State Management', () => {
    it('should maintain separate state for item and mod forms', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      // Fill item form
      await user.type(screen.getByTestId('textfield-name'), 'Item Name');

      // Switch to mod tab
      const tabs = screen.getByTestId('tabs');
      await user.click(tabs);

      await waitFor(() => {
        expect(screen.getByTestId('textfield-name')).toHaveValue('');
      });

      // Fill mod form
      await user.type(screen.getByTestId('textfield-name'), 'Mod Name');

      // Switch back to item tab
      await user.click(tabs);

      await waitFor(() => {
        expect(screen.getByTestId('textfield-name')).toHaveValue('Item Name');
      });
    });

    it('should reset form state after successful submission', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<AddItemMod />);
      });

      // Fill and submit item
      await user.type(screen.getByTestId('textfield-name'), 'Test Item');
      await user.selectOptions(screen.getByTestId('select-type'), 'weapon');
      await user.type(screen.getByTestId('textfield-value'), '100');

      const submitButton = screen.getByTestId('button-add-item');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId('textfield-name')).toHaveValue('');
        expect(screen.getByTestId('textfield-value')).toHaveValue('');
      });
    });
  });
});