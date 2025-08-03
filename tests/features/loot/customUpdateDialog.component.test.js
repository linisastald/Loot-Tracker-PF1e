/**
 * Tests for CustomUpdateDialog component
 * Tests the item update dialog functionality
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomUpdateDialog from '../../../frontend/src/components/common/dialogs/CustomUpdateDialog';

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  Dialog: ({ children, open, onClose }) => (
    open ? <div data-testid="dialog" onClick={onClose}>{children}</div> : null
  ),
  DialogTitle: ({ children }) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogActions: ({ children }) => <div data-testid="dialog-actions">{children}</div>,
  Grid: ({ children, item, xs, sm, container, spacing }) => (
    <div data-testid={container ? "grid-container" : "grid-item"}>
      {children}
    </div>
  ),
  TextField: ({ label, name, value, onChange, type, fullWidth, ...props }) => (
    <div data-testid="text-field">
      <label>{label}</label>
      <input
        name={name}
        type={type || 'text'}
        value={value || ''}
        onChange={(e) => onChange({ target: { name, value: e.target.value } })}
        data-testid={`textfield-${name}`}
        {...props}
      />
    </div>
  ),
  FormControl: ({ children, fullWidth }) => (
    <div data-testid="form-control">{children}</div>
  ),
  InputLabel: ({ children }) => <label data-testid="input-label">{children}</label>,
  Select: ({ children, name, value, onChange, ...props }) => (
    <select 
      data-testid={`select-${name}`}
      name={name}
      value={value || ''}
      onChange={(e) => onChange({ target: { name, value: e.target.value } })}
      {...props}
    >
      {children}
    </select>
  ),
  MenuItem: ({ children, value }) => (
    <option value={value}>{children}</option>
  ),
  Button: ({ children, onClick, variant, color, ...props }) => (
    <button
      onClick={onClick}
      data-testid={`button-${children?.toString().toLowerCase().replace(/\s+/g, '-')}`}
      {...props}
    >
      {children}
    </button>
  ),
}));

describe('CustomUpdateDialog Component', () => {
  const mockEntry = {
    quantity: 1,
    name: 'Magic Sword',
    unidentified: false,
    masterwork: true,
    type: 'Weapon',
    size: 'Medium',
    notes: 'A sharp blade'
  };

  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    updatedEntry: mockEntry,
    onUpdateChange: jest.fn(),
    onUpdateSubmit: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Dialog Rendering', () => {
    it('should render dialog when open', () => {
      render(<CustomUpdateDialog {...defaultProps} />);

      expect(screen.getByTestId('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-title')).toHaveTextContent('Update Entry');
    });

    it('should not render dialog when closed', () => {
      render(<CustomUpdateDialog {...defaultProps} open={false} />);

      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('should render all form fields', () => {
      render(<CustomUpdateDialog {...defaultProps} />);

      expect(screen.getByTestId('textfield-quantity')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-name')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-notes')).toBeInTheDocument();
      expect(screen.getByTestId('select-unidentified')).toBeInTheDocument();
      expect(screen.getByTestId('select-masterwork')).toBeInTheDocument();
      expect(screen.getByTestId('select-type')).toBeInTheDocument();
      expect(screen.getByTestId('select-size')).toBeInTheDocument();
    });

    it('should render dialog actions', () => {
      render(<CustomUpdateDialog {...defaultProps} />);

      expect(screen.getByTestId('button-cancel')).toBeInTheDocument();
      expect(screen.getByTestId('button-update')).toBeInTheDocument();
    });
  });

  describe('Form Initialization', () => {
    it('should populate form with entry data', () => {
      render(<CustomUpdateDialog {...defaultProps} />);

      expect(screen.getByTestId('textfield-quantity')).toHaveValue('1');
      expect(screen.getByTestId('textfield-name')).toHaveValue('Magic Sword');
      expect(screen.getByTestId('textfield-notes')).toHaveValue('A sharp blade');
      expect(screen.getByTestId('select-unidentified')).toHaveValue('false');
      expect(screen.getByTestId('select-masterwork')).toHaveValue('true');
      expect(screen.getByTestId('select-type')).toHaveValue('Weapon');
      expect(screen.getByTestId('select-size')).toHaveValue('Medium');
    });

    it('should handle empty updatedEntry gracefully', () => {
      render(<CustomUpdateDialog {...defaultProps} updatedEntry={{}} />);

      expect(screen.getByTestId('textfield-quantity')).toHaveValue('');
      expect(screen.getByTestId('textfield-name')).toHaveValue('');
      expect(screen.getByTestId('textfield-notes')).toHaveValue('');
    });

    it('should handle null updatedEntry gracefully', () => {
      render(<CustomUpdateDialog {...defaultProps} updatedEntry={null} />);

      expect(screen.getByTestId('textfield-quantity')).toHaveValue('');
      expect(screen.getByTestId('textfield-name')).toHaveValue('');
    });

    it('should handle null values in updatedEntry', () => {
      const entryWithNulls = {
        ...mockEntry,
        unidentified: null,
        masterwork: null,
        type: null,
        size: null
      };

      render(<CustomUpdateDialog {...defaultProps} updatedEntry={entryWithNulls} />);

      expect(screen.getByTestId('select-unidentified')).toHaveValue('');
      expect(screen.getByTestId('select-masterwork')).toHaveValue('');
      expect(screen.getByTestId('select-type')).toHaveValue('');
      expect(screen.getByTestId('select-size')).toHaveValue('');
    });
  });

  describe('Form Interactions', () => {
    it('should update quantity field', async () => {
      const user = userEvent.setup();
      render(<CustomUpdateDialog {...defaultProps} />);

      const quantityField = screen.getByTestId('textfield-quantity');
      await user.clear(quantityField);
      await user.type(quantityField, '5');

      expect(defaultProps.onUpdateChange).toHaveBeenCalledWith({
        target: { name: 'quantity', value: '5' }
      });
    });

    it('should update name field', async () => {
      const user = userEvent.setup();
      render(<CustomUpdateDialog {...defaultProps} />);

      const nameField = screen.getByTestId('textfield-name');
      await user.clear(nameField);
      await user.type(nameField, 'Updated Sword');

      expect(defaultProps.onUpdateChange).toHaveBeenCalledWith({
        target: { name: 'name', value: 'Updated Sword' }
      });
    });

    it('should update notes field', async () => {
      const user = userEvent.setup();
      render(<CustomUpdateDialog {...defaultProps} />);

      const notesField = screen.getByTestId('textfield-notes');
      await user.clear(notesField);
      await user.type(notesField, 'Updated notes');

      expect(defaultProps.onUpdateChange).toHaveBeenCalledWith({
        target: { name: 'notes', value: 'Updated notes' }
      });
    });

    it('should update unidentified select', async () => {
      const user = userEvent.setup();
      render(<CustomUpdateDialog {...defaultProps} />);

      const unidentifiedSelect = screen.getByTestId('select-unidentified');
      await user.selectOptions(unidentifiedSelect, 'true');

      expect(defaultProps.onUpdateChange).toHaveBeenCalledWith({
        target: { name: 'unidentified', value: 'true' }
      });
    });

    it('should update masterwork select', async () => {
      const user = userEvent.setup();
      render(<CustomUpdateDialog {...defaultProps} />);

      const masterworkSelect = screen.getByTestId('select-masterwork');
      await user.selectOptions(masterworkSelect, 'false');

      expect(defaultProps.onUpdateChange).toHaveBeenCalledWith({
        target: { name: 'masterwork', value: 'false' }
      });
    });

    it('should update type select', async () => {
      const user = userEvent.setup();
      render(<CustomUpdateDialog {...defaultProps} />);

      const typeSelect = screen.getByTestId('select-type');
      await user.selectOptions(typeSelect, 'Armor');

      expect(defaultProps.onUpdateChange).toHaveBeenCalledWith({
        target: { name: 'type', value: 'Armor' }
      });
    });

    it('should update size select', async () => {
      const user = userEvent.setup();
      render(<CustomUpdateDialog {...defaultProps} />);

      const sizeSelect = screen.getByTestId('select-size');
      await user.selectOptions(sizeSelect, 'Large');

      expect(defaultProps.onUpdateChange).toHaveBeenCalledWith({
        target: { name: 'size', value: 'Large' }
      });
    });
  });

  describe('Select Options', () => {
    it('should show all unidentified options', () => {
      render(<CustomUpdateDialog {...defaultProps} />);

      const unidentifiedSelect = screen.getByTestId('select-unidentified');
      expect(unidentifiedSelect).toHaveTextContent('Not Magical');
      expect(unidentifiedSelect).toHaveTextContent('Identified');
      expect(unidentifiedSelect).toHaveTextContent('Unidentified');
    });

    it('should show all masterwork options', () => {
      render(<CustomUpdateDialog {...defaultProps} />);

      const masterworkSelect = screen.getByTestId('select-masterwork');
      expect(masterworkSelect).toHaveTextContent('Yes');
      expect(masterworkSelect).toHaveTextContent('No');
    });

    it('should show all type options', () => {
      render(<CustomUpdateDialog {...defaultProps} />);

      const typeSelect = screen.getByTestId('select-type');
      expect(typeSelect).toHaveTextContent('Weapon');
      expect(typeSelect).toHaveTextContent('Armor');
      expect(typeSelect).toHaveTextContent('Magic');
      expect(typeSelect).toHaveTextContent('Gear');
      expect(typeSelect).toHaveTextContent('Trade Good');
      expect(typeSelect).toHaveTextContent('Other');
    });

    it('should show all size options', () => {
      render(<CustomUpdateDialog {...defaultProps} />);

      const sizeSelect = screen.getByTestId('select-size');
      expect(sizeSelect).toHaveTextContent('Fine');
      expect(sizeSelect).toHaveTextContent('Diminutive');
      expect(sizeSelect).toHaveTextContent('Tiny');
      expect(sizeSelect).toHaveTextContent('Small');
      expect(sizeSelect).toHaveTextContent('Medium');
      expect(sizeSelect).toHaveTextContent('Large');
      expect(sizeSelect).toHaveTextContent('Huge');
      expect(sizeSelect).toHaveTextContent('Gargantuan');
      expect(sizeSelect).toHaveTextContent('Colossal');
    });
  });

  describe('Dialog Actions', () => {
    it('should call onUpdateSubmit when Update button is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomUpdateDialog {...defaultProps} />);

      const updateButton = screen.getByTestId('button-update');
      await user.click(updateButton);

      expect(defaultProps.onUpdateSubmit).toHaveBeenCalled();
    });

    it('should call onClose when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomUpdateDialog {...defaultProps} />);

      const cancelButton = screen.getByTestId('button-cancel');
      await user.click(cancelButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should call onClose when dialog backdrop is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomUpdateDialog {...defaultProps} />);

      const dialog = screen.getByTestId('dialog');
      await user.click(dialog);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Form Labels', () => {
    it('should have proper field labels', () => {
      render(<CustomUpdateDialog {...defaultProps} />);

      expect(screen.getByText('Quantity')).toBeInTheDocument();
      expect(screen.getByText('Item Name')).toBeInTheDocument();
      expect(screen.getByText('Notes')).toBeInTheDocument();
      expect(screen.getByText('Magical?')).toBeInTheDocument();
      expect(screen.getByText('Masterwork')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Size')).toBeInTheDocument();
    });

    it('should have proper input types', () => {
      render(<CustomUpdateDialog {...defaultProps} />);

      const quantityField = screen.getByTestId('textfield-quantity');
      expect(quantityField).toHaveAttribute('type', 'number');

      const nameField = screen.getByTestId('textfield-name');
      expect(nameField).toHaveAttribute('type', 'text');
    });
  });

  describe('Data Handling', () => {
    it('should handle boolean values correctly', () => {
      const booleanEntry = {
        unidentified: true,
        masterwork: false
      };

      render(<CustomUpdateDialog {...defaultProps} updatedEntry={booleanEntry} />);

      expect(screen.getByTestId('select-unidentified')).toHaveValue('true');
      expect(screen.getByTestId('select-masterwork')).toHaveValue('false');
    });

    it('should handle string values correctly', () => {
      const stringEntry = {
        type: 'Magic',
        size: 'Tiny'
      };

      render(<CustomUpdateDialog {...defaultProps} updatedEntry={stringEntry} />);

      expect(screen.getByTestId('select-type')).toHaveValue('Magic');
      expect(screen.getByTestId('select-size')).toHaveValue('Tiny');
    });

    it('should handle numeric values correctly', () => {
      const numericEntry = {
        quantity: 10
      };

      render(<CustomUpdateDialog {...defaultProps} updatedEntry={numericEntry} />);

      expect(screen.getByTestId('textfield-quantity')).toHaveValue('10');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined updatedEntry prop', () => {
      render(<CustomUpdateDialog {...defaultProps} updatedEntry={undefined} />);

      expect(screen.getByTestId('textfield-quantity')).toHaveValue('');
      expect(screen.getByTestId('textfield-name')).toHaveValue('');
    });

    it('should handle missing callback props', () => {
      const propsWithoutCallbacks = {
        open: true,
        updatedEntry: mockEntry
      };

      expect(() => {
        render(<CustomUpdateDialog {...propsWithoutCallbacks} />);
      }).not.toThrow();
    });

    it('should handle empty string values', () => {
      const emptyEntry = {
        quantity: '',
        name: '',
        notes: '',
        type: '',
        size: ''
      };

      render(<CustomUpdateDialog {...defaultProps} updatedEntry={emptyEntry} />);

      expect(screen.getByTestId('textfield-quantity')).toHaveValue('');
      expect(screen.getByTestId('textfield-name')).toHaveValue('');
      expect(screen.getByTestId('textfield-notes')).toHaveValue('');
      expect(screen.getByTestId('select-type')).toHaveValue('');
      expect(screen.getByTestId('select-size')).toHaveValue('');
    });
  });

  describe('Accessibility', () => {
    it('should have proper form structure', () => {
      render(<CustomUpdateDialog {...defaultProps} />);

      const formControls = screen.getAllByTestId('form-control');
      expect(formControls.length).toBeGreaterThan(0);

      const inputLabels = screen.getAllByTestId('input-label');
      expect(inputLabels.length).toBeGreaterThan(0);
    });

    it('should support keyboard navigation', async () => {
      render(<CustomUpdateDialog {...defaultProps} />);

      const quantityField = screen.getByTestId('textfield-quantity');
      quantityField.focus();

      await userEvent.keyboard('[Tab]');
      
      // Should be able to navigate between form fields
      expect(document.activeElement).not.toBe(quantityField);
    });

    it('should have descriptive button text', () => {
      render(<CustomUpdateDialog {...defaultProps} />);

      expect(screen.getByTestId('button-update')).toHaveTextContent('Update');
      expect(screen.getByTestId('button-cancel')).toHaveTextContent('Cancel');
    });
  });
});