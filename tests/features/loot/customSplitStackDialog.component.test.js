/**
 * Tests for CustomSplitStackDialog component
 * Tests the stack splitting dialog functionality
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomSplitStackDialog from '../../../frontend/src/components/common/dialogs/CustomSplitStackDialog';

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  Dialog: ({ children, open, onClose }) => (
    open ? <div data-testid="dialog" onClick={onClose}>{children}</div> : null
  ),
  DialogTitle: ({ children }) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogActions: ({ children }) => <div data-testid="dialog-actions">{children}</div>,
  TextField: ({ label, value, onChange, type, fullWidth, margin, ...props }) => (
    <div data-testid="text-field">
      <label>{label}</label>
      <input
        type={type || 'text'}
        value={value || ''}
        onChange={onChange}
        data-testid={`textfield-${label?.toLowerCase().replace(/\s+/g, '-')}`}
        {...props}
      />
    </div>
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

describe('CustomSplitStackDialog Component', () => {
  const mockSplitQuantities = [
    { quantity: 5 },
    { quantity: 3 },
    { quantity: 2 }
  ];

  const defaultProps = {
    open: true,
    handleClose: jest.fn(),
    splitQuantities: mockSplitQuantities,
    handleSplitChange: jest.fn(),
    handleAddSplit: jest.fn(),
    handleSplitSubmit: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Dialog Rendering', () => {
    it('should render dialog when open', () => {
      render(<CustomSplitStackDialog {...defaultProps} />);

      expect(screen.getByTestId('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-title')).toHaveTextContent('Split Stack');
    });

    it('should not render dialog when closed', () => {
      render(<CustomSplitStackDialog {...defaultProps} open={false} />);

      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('should render dialog actions', () => {
      render(<CustomSplitStackDialog {...defaultProps} />);

      expect(screen.getByTestId('button-cancel')).toBeInTheDocument();
      expect(screen.getByTestId('button-split')).toBeInTheDocument();
      expect(screen.getByTestId('button-add-split')).toBeInTheDocument();
    });

    it('should render split quantity fields', () => {
      render(<CustomSplitStackDialog {...defaultProps} />);

      expect(screen.getByTestId('textfield-quantity-1')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-quantity-2')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-quantity-3')).toBeInTheDocument();
    });
  });

  describe('Split Quantities Display', () => {
    it('should display all split quantities', () => {
      render(<CustomSplitStackDialog {...defaultProps} />);

      expect(screen.getByTestId('textfield-quantity-1')).toHaveValue('5');
      expect(screen.getByTestId('textfield-quantity-2')).toHaveValue('3');
      expect(screen.getByTestId('textfield-quantity-3')).toHaveValue('2');
    });

    it('should handle empty split quantities', () => {
      render(<CustomSplitStackDialog {...defaultProps} splitQuantities={[]} />);

      expect(screen.queryByTestId('textfield-quantity-1')).not.toBeInTheDocument();
    });

    it('should handle null split quantities', () => {
      render(<CustomSplitStackDialog {...defaultProps} splitQuantities={null} />);

      expect(screen.queryByTestId('textfield-quantity-1')).not.toBeInTheDocument();
    });

    it('should handle undefined split quantities', () => {
      render(<CustomSplitStackDialog {...defaultProps} splitQuantities={undefined} />);

      expect(screen.queryByTestId('textfield-quantity-1')).not.toBeInTheDocument();
    });

    it('should show correct labels for each field', () => {
      render(<CustomSplitStackDialog {...defaultProps} />);

      expect(screen.getByText('Quantity 1')).toBeInTheDocument();
      expect(screen.getByText('Quantity 2')).toBeInTheDocument();
      expect(screen.getByText('Quantity 3')).toBeInTheDocument();
    });
  });

  describe('Form Interactions', () => {
    it('should call handleSplitChange when quantity is updated', async () => {
      const user = userEvent.setup();
      render(<CustomSplitStackDialog {...defaultProps} />);

      const quantityField = screen.getByTestId('textfield-quantity-1');
      await user.clear(quantityField);
      await user.type(quantityField, '10');

      expect(defaultProps.handleSplitChange).toHaveBeenCalledWith(0, '10');
    });

    it('should call handleSplitChange for different indices', async () => {
      const user = userEvent.setup();
      render(<CustomSplitStackDialog {...defaultProps} />);

      const secondQuantityField = screen.getByTestId('textfield-quantity-2');
      await user.clear(secondQuantityField);
      await user.type(secondQuantityField, '7');

      expect(defaultProps.handleSplitChange).toHaveBeenCalledWith(1, '7');
    });

    it('should call handleSplitChange for third field', async () => {
      const user = userEvent.setup();
      render(<CustomSplitStackDialog {...defaultProps} />);

      const thirdQuantityField = screen.getByTestId('textfield-quantity-3');
      await user.clear(thirdQuantityField);
      await user.type(thirdQuantityField, '1');

      expect(defaultProps.handleSplitChange).toHaveBeenCalledWith(2, '1');
    });

    it('should handle partial input changes', async () => {
      const user = userEvent.setup();
      render(<CustomSplitStackDialog {...defaultProps} />);

      const quantityField = screen.getByTestId('textfield-quantity-1');
      await user.clear(quantityField);
      await user.type(quantityField, '1');

      expect(defaultProps.handleSplitChange).toHaveBeenCalledWith(0, '1');
    });

    it('should handle empty input', async () => {
      const user = userEvent.setup();
      render(<CustomSplitStackDialog {...defaultProps} />);

      const quantityField = screen.getByTestId('textfield-quantity-1');
      await user.clear(quantityField);

      expect(defaultProps.handleSplitChange).toHaveBeenCalledWith(0, '');
    });
  });

  describe('Dialog Actions', () => {
    it('should call handleAddSplit when Add Split button is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomSplitStackDialog {...defaultProps} />);

      const addSplitButton = screen.getByTestId('button-add-split');
      await user.click(addSplitButton);

      expect(defaultProps.handleAddSplit).toHaveBeenCalled();
    });

    it('should call handleSplitSubmit when Split button is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomSplitStackDialog {...defaultProps} />);

      const splitButton = screen.getByTestId('button-split');
      await user.click(splitButton);

      expect(defaultProps.handleSplitSubmit).toHaveBeenCalled();
    });

    it('should call handleClose when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomSplitStackDialog {...defaultProps} />);

      const cancelButton = screen.getByTestId('button-cancel');
      await user.click(cancelButton);

      expect(defaultProps.handleClose).toHaveBeenCalled();
    });

    it('should call handleClose when dialog backdrop is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomSplitStackDialog {...defaultProps} />);

      const dialog = screen.getByTestId('dialog');
      await user.click(dialog);

      expect(defaultProps.handleClose).toHaveBeenCalled();
    });
  });

  describe('Input Field Properties', () => {
    it('should have number type for quantity fields', () => {
      render(<CustomSplitStackDialog {...defaultProps} />);

      const quantityFields = screen.getAllByTestId(/textfield-quantity-/);
      quantityFields.forEach(field => {
        expect(field).toHaveAttribute('type', 'number');
      });
    });

    it('should display correct values for different quantities', () => {
      const customQuantities = [
        { quantity: 100 },
        { quantity: 0 },
        { quantity: 1 }
      ];

      render(<CustomSplitStackDialog {...defaultProps} splitQuantities={customQuantities} />);

      expect(screen.getByTestId('textfield-quantity-1')).toHaveValue('100');
      expect(screen.getByTestId('textfield-quantity-2')).toHaveValue('0');
      expect(screen.getByTestId('textfield-quantity-3')).toHaveValue('1');
    });

    it('should handle string quantity values', () => {
      const stringQuantities = [
        { quantity: '15' },
        { quantity: '25' }
      ];

      render(<CustomSplitStackDialog {...defaultProps} splitQuantities={stringQuantities} />);

      expect(screen.getByTestId('textfield-quantity-1')).toHaveValue('15');
      expect(screen.getByTestId('textfield-quantity-2')).toHaveValue('25');
    });
  });

  describe('Dynamic Split Management', () => {
    it('should render different numbers of split fields', () => {
      const singleSplit = [{ quantity: 5 }];
      
      render(<CustomSplitStackDialog {...defaultProps} splitQuantities={singleSplit} />);

      expect(screen.getByTestId('textfield-quantity-1')).toBeInTheDocument();
      expect(screen.queryByTestId('textfield-quantity-2')).not.toBeInTheDocument();
    });

    it('should handle many split fields', () => {
      const manySplits = [
        { quantity: 1 },
        { quantity: 2 },
        { quantity: 3 },
        { quantity: 4 },
        { quantity: 5 }
      ];

      render(<CustomSplitStackDialog {...defaultProps} splitQuantities={manySplits} />);

      expect(screen.getByTestId('textfield-quantity-1')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-quantity-2')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-quantity-3')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-quantity-4')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-quantity-5')).toBeInTheDocument();
    });

    it('should maintain field order', () => {
      const orderedQuantities = [
        { quantity: 10 },
        { quantity: 20 },
        { quantity: 30 }
      ];

      render(<CustomSplitStackDialog {...defaultProps} splitQuantities={orderedQuantities} />);

      expect(screen.getByTestId('textfield-quantity-1')).toHaveValue('10');
      expect(screen.getByTestId('textfield-quantity-2')).toHaveValue('20');
      expect(screen.getByTestId('textfield-quantity-3')).toHaveValue('30');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing callback props gracefully', () => {
      const propsWithoutCallbacks = {
        open: true,
        splitQuantities: mockSplitQuantities
      };

      expect(() => {
        render(<CustomSplitStackDialog {...propsWithoutCallbacks} />);
      }).not.toThrow();
    });

    it('should handle null quantity values', () => {
      const nullQuantities = [
        { quantity: null },
        { quantity: undefined },
        { }
      ];

      render(<CustomSplitStackDialog {...defaultProps} splitQuantities={nullQuantities} />);

      expect(screen.getByTestId('textfield-quantity-1')).toHaveValue('');
      expect(screen.getByTestId('textfield-quantity-2')).toHaveValue('');
      expect(screen.getByTestId('textfield-quantity-3')).toHaveValue('');
    });

    it('should handle malformed split quantity objects', () => {
      const malformedQuantities = [
        { quantity: 5 },
        null,
        { notQuantity: 10 },
        { quantity: 'invalid' }
      ];

      expect(() => {
        render(<CustomSplitStackDialog {...defaultProps} splitQuantities={malformedQuantities} />);
      }).not.toThrow();
    });

    it('should handle zero quantities', () => {
      const zeroQuantities = [
        { quantity: 0 },
        { quantity: 0 }
      ];

      render(<CustomSplitStackDialog {...defaultProps} splitQuantities={zeroQuantities} />);

      expect(screen.getByTestId('textfield-quantity-1')).toHaveValue('0');
      expect(screen.getByTestId('textfield-quantity-2')).toHaveValue('0');
    });
  });

  describe('Accessibility', () => {
    it('should have proper button text', () => {
      render(<CustomSplitStackDialog {...defaultProps} />);

      expect(screen.getByTestId('button-add-split')).toHaveTextContent('Add Split');
      expect(screen.getByTestId('button-split')).toHaveTextContent('Split');
      expect(screen.getByTestId('button-cancel')).toHaveTextContent('Cancel');
    });

    it('should have proper field labels', () => {
      render(<CustomSplitStackDialog {...defaultProps} />);

      expect(screen.getByText('Quantity 1')).toBeInTheDocument();
      expect(screen.getByText('Quantity 2')).toBeInTheDocument();
      expect(screen.getByText('Quantity 3')).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      render(<CustomSplitStackDialog {...defaultProps} />);

      const firstField = screen.getByTestId('textfield-quantity-1');
      firstField.focus();

      await userEvent.keyboard('[Tab]');
      
      // Should be able to navigate between form fields
      expect(document.activeElement).not.toBe(firstField);
    });

    it('should have proper dialog structure', () => {
      render(<CustomSplitStackDialog {...defaultProps} />);

      expect(screen.getByTestId('dialog-title')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-actions')).toBeInTheDocument();
    });
  });

  describe('Interaction Sequences', () => {
    it('should handle multiple field updates in sequence', async () => {
      const user = userEvent.setup();
      render(<CustomSplitStackDialog {...defaultProps} />);

      // Update first field
      const firstField = screen.getByTestId('textfield-quantity-1');
      await user.clear(firstField);
      await user.type(firstField, '8');

      // Update second field
      const secondField = screen.getByTestId('textfield-quantity-2');
      await user.clear(secondField);
      await user.type(secondField, '6');

      expect(defaultProps.handleSplitChange).toHaveBeenCalledWith(0, '8');
      expect(defaultProps.handleSplitChange).toHaveBeenCalledWith(1, '6');
    });

    it('should handle add split then submit workflow', async () => {
      const user = userEvent.setup();
      render(<CustomSplitStackDialog {...defaultProps} />);

      // Add a split
      const addSplitButton = screen.getByTestId('button-add-split');
      await user.click(addSplitButton);

      // Then submit
      const splitButton = screen.getByTestId('button-split');
      await user.click(splitButton);

      expect(defaultProps.handleAddSplit).toHaveBeenCalled();
      expect(defaultProps.handleSplitSubmit).toHaveBeenCalled();
    });

    it('should handle cancel after making changes', async () => {
      const user = userEvent.setup();
      render(<CustomSplitStackDialog {...defaultProps} />);

      // Make changes
      const firstField = screen.getByTestId('textfield-quantity-1');
      await user.clear(firstField);
      await user.type(firstField, '99');

      // Then cancel
      const cancelButton = screen.getByTestId('button-cancel');
      await user.click(cancelButton);

      expect(defaultProps.handleSplitChange).toHaveBeenCalled();
      expect(defaultProps.handleClose).toHaveBeenCalled();
    });
  });
});