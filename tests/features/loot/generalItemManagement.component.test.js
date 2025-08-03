/**
 * Tests for GeneralItemManagement component
 * Tests the advanced item search and management functionality
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GeneralItemManagement from '../../../frontend/src/components/pages/ItemManagement/GeneralItemManagement';
import lootService from '../../../frontend/src/services/lootService';
import { updateItemAsDM } from '../../../frontend/src/utils/utils';

// Mock dependencies
jest.mock('../../../frontend/src/services/lootService');
jest.mock('../../../frontend/src/utils/utils', () => ({
  formatDate: jest.fn((date) => date ? '2024-01-15' : ''),
  updateItemAsDM: jest.fn(),
}));

// Mock ItemManagementDialog
jest.mock('../../../frontend/src/components/common/dialogs/ItemManagementDialog', () => {
  return function MockItemManagementDialog({ open, onClose, item, onSave, title }) {
    return open ? (
      <div data-testid="item-management-dialog">
        <div data-testid="dialog-title">{title}</div>
        <div data-testid="dialog-item-name">{item?.name || 'No item'}</div>
        <button data-testid="dialog-save" onClick={() => onSave(item)}>Save</button>
        <button data-testid="dialog-close" onClick={onClose}>Close</button>
      </div>
    ) : null;
  };
});

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  Alert: ({ children, severity }) => (
    <div data-testid={`alert-${severity}`}>{children}</div>
  ),
  Paper: ({ children, component, sx }) => <div data-testid="paper">{children}</div>,
  Box: ({ children, sx, mt, mb }) => <div data-testid="box">{children}</div>,
  Typography: ({ children, variant, gutterBottom }) => (
    <div data-testid={`typography-${variant}`}>{children}</div>
  ),
  Grid: ({ children, container, spacing, size, xs, md }) => (
    <div data-testid={container ? "grid-container" : "grid-item"}>
      {children}
    </div>
  ),
  TextField: ({ label, value, onChange, variant, fullWidth, ...props }) => (
    <div data-testid="text-field">
      <label>{label}</label>
      <input
        value={value || ''}
        onChange={onChange}
        data-testid={`textfield-${label?.toLowerCase().replace(/\s+/g, '-')}`}
        {...props}
      />
    </div>
  ),
  FormControl: ({ children, fullWidth }) => (
    <div data-testid="form-control">{children}</div>
  ),
  InputLabel: ({ children }) => <label data-testid="input-label">{children}</label>,
  Select: ({ children, value, onChange, ...props }) => (
    <select 
      data-testid={`select-${children.props?.children || 'select'}`}
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
  Button: ({ children, onClick, variant, color, fullWidth, ...props }) => (
    <button
      onClick={onClick}
      data-testid={`button-${children?.toString().toLowerCase().replace(/\s+/g, '-')}`}
      {...props}
    >
      {children}
    </button>
  ),
  TableContainer: ({ children, component, sx }) => (
    <div data-testid="table-container">{children}</div>
  ),
  Table: ({ children }) => <table data-testid="table">{children}</table>,
  TableHead: ({ children }) => <thead data-testid="table-head">{children}</thead>,
  TableBody: ({ children }) => <tbody data-testid="table-body">{children}</tbody>,
  TableRow: ({ children, hover, onClick, sx }) => (
    <tr data-testid="table-row" onClick={onClick} style={{ cursor: sx?.cursor }}>
      {children}
    </tr>
  ),
  TableCell: ({ children, sortDirection }) => (
    <td data-testid="table-cell">{children}</td>
  ),
  TableSortLabel: ({ children, active, direction, onClick }) => (
    <button
      data-testid="sort-label"
      onClick={onClick}
      data-active={active}
      data-direction={direction}
    >
      {children}
    </button>
  ),
}));

describe('GeneralItemManagement Component', () => {
  const mockItems = [
    {
      id: 1,
      session_date: '2024-01-15T10:00:00Z',
      quantity: 1,
      name: 'Magic Sword',
      unidentified: false,
      masterwork: true,
      type: 'weapon',
      size: 'Medium',
      status: 'Available',
      value: 1500,
      notes: 'Found in treasure chest'
    },
    {
      id: 2,
      session_date: '2024-01-14T10:00:00Z',
      quantity: 5,
      name: 'Healing Potions',
      unidentified: true,
      masterwork: false,
      type: 'magic',
      size: 'Tiny',
      status: 'Pending Sale',
      value: 250,
      notes: 'Batch of potions'
    }
  ];

  const mockSearchResponse = {
    data: {
      items: mockItems
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    lootService.getAllLoot.mockResolvedValue({ data: mockItems });
    lootService.searchLoot.mockResolvedValue(mockSearchResponse);
    updateItemAsDM.mockImplementation((id, data, onSuccess, onError) => {
      onSuccess('Item updated successfully');
    });
  });

  describe('Component Initialization', () => {
    it('should render component with title', async () => {
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      expect(screen.getByTestId('typography-h6')).toHaveTextContent('General Item Search');
    });

    it('should load all items on mount', async () => {
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalled();
      });
    });

    it('should render search form', async () => {
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      expect(screen.getByTestId('textfield-search-items')).toBeInTheDocument();
      expect(screen.getByTestId('button-search')).toBeInTheDocument();
      expect(screen.getByTestId('button-clear')).toBeInTheDocument();
    });

    it('should render advanced search filters', async () => {
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      expect(screen.getByText('Unidentified')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Size')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Item ID')).toBeInTheDocument();
      expect(screen.getByText('Mod IDs')).toBeInTheDocument();
      expect(screen.getByText('Value')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should perform basic search', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const searchField = screen.getByTestId('textfield-search-items');
      await user.type(searchField, 'Magic Sword');

      const searchButton = screen.getByTestId('button-search');
      await user.click(searchButton);

      await waitFor(() => {
        expect(lootService.searchLoot).toHaveBeenCalledWith({
          query: 'Magic Sword'
        });
      });
    });

    it('should perform advanced search with filters', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      // Set advanced search filters
      const unidentifiedSelect = screen.getAllByRole('combobox')[0];
      await user.selectOptions(unidentifiedSelect, 'true');

      const typeSelect = screen.getAllByRole('combobox')[1];
      await user.selectOptions(typeSelect, 'weapon');

      const searchButton = screen.getByTestId('button-search');
      await user.click(searchButton);

      await waitFor(() => {
        expect(lootService.searchLoot).toHaveBeenCalledWith({
          query: '',
          unidentified: 'true',
          type: 'weapon'
        });
      });
    });

    it('should clear search when clear button is clicked', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      // Set some search values
      const searchField = screen.getByTestId('textfield-search-items');
      await user.type(searchField, 'test search');

      const clearButton = screen.getByTestId('button-clear');
      await user.click(clearButton);

      expect(searchField).toHaveValue('');
    });

    it('should handle search response with items array', async () => {
      const user = userEvent.setup();
      lootService.searchLoot.mockResolvedValue({ data: mockItems });
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const searchButton = screen.getByTestId('button-search');
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByTestId('table')).toBeInTheDocument();
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });
    });

    it('should handle unexpected search response structure', async () => {
      const user = userEvent.setup();
      lootService.searchLoot.mockResolvedValue({ data: { unexpected: 'format' } });
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const searchButton = screen.getByTestId('button-search');
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Unexpected response structure from server');
      });
    });

    it('should handle search errors', async () => {
      const user = userEvent.setup();
      lootService.searchLoot.mockRejectedValue(new Error('Search failed'));
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const searchButton = screen.getByTestId('button-search');
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Error searching items');
      });
    });
  });

  describe('Search Results Table', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const searchButton = screen.getByTestId('button-search');
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByTestId('table')).toBeInTheDocument();
      });
    });

    it('should render table with search results', () => {
      expect(screen.getByTestId('table-container')).toBeInTheDocument();
      expect(screen.getByTestId('table-head')).toBeInTheDocument();
      expect(screen.getByTestId('table-body')).toBeInTheDocument();
    });

    it('should display item data in table rows', () => {
      expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      expect(screen.getByText('Healing Potions')).toBeInTheDocument();
      expect(screen.getByText('weapon')).toBeInTheDocument();
      expect(screen.getByText('magic')).toBeInTheDocument();
    });

    it('should show checkmarks for boolean values', () => {
      // Masterwork column should show ✓ for Magic Sword
      const checkmarks = screen.getAllByText('✓');
      expect(checkmarks.length).toBeGreaterThan(0);
    });

    it('should handle sorting when column headers are clicked', async () => {
      const user = userEvent.setup();
      
      const sortButton = screen.getAllByTestId('sort-label')[0]; // First sortable column
      await user.click(sortButton);

      expect(sortButton).toHaveAttribute('data-active', 'true');
    });

    it('should reverse sort direction on second click', async () => {
      const user = userEvent.setup();
      
      const sortButton = screen.getAllByTestId('sort-label')[0];
      
      // First click - ascending
      await user.click(sortButton);
      expect(sortButton).toHaveAttribute('data-direction', 'ascending');

      // Second click - descending
      await user.click(sortButton);
      expect(sortButton).toHaveAttribute('data-direction', 'descending');
    });
  });

  describe('Item Update Dialog', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      // Perform search to show results
      const searchButton = screen.getByTestId('button-search');
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByTestId('table')).toBeInTheDocument();
      });
    });

    it('should open dialog when table row is clicked', async () => {
      const user = userEvent.setup();
      
      const tableRow = screen.getAllByTestId('table-row')[0]; // First data row
      await user.click(tableRow);

      await waitFor(() => {
        expect(screen.getByTestId('item-management-dialog')).toBeInTheDocument();
        expect(screen.getByTestId('dialog-title')).toHaveTextContent('Update Item');
      });
    });

    it('should pass selected item to dialog', async () => {
      const user = userEvent.setup();
      
      const tableRow = screen.getAllByTestId('table-row')[0];
      await user.click(tableRow);

      await waitFor(() => {
        expect(screen.getByTestId('dialog-item-name')).toHaveTextContent('Magic Sword');
      });
    });

    it('should close dialog when close button is clicked', async () => {
      const user = userEvent.setup();
      
      const tableRow = screen.getAllByTestId('table-row')[0];
      await user.click(tableRow);

      await waitFor(() => {
        expect(screen.getByTestId('item-management-dialog')).toBeInTheDocument();
      });

      const closeButton = screen.getByTestId('dialog-close');
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId('item-management-dialog')).not.toBeInTheDocument();
      });
    });

    it('should handle item update submission', async () => {
      const user = userEvent.setup();
      
      const tableRow = screen.getAllByTestId('table-row')[0];
      await user.click(tableRow);

      await waitFor(() => {
        expect(screen.getByTestId('item-management-dialog')).toBeInTheDocument();
      });

      const saveButton = screen.getByTestId('dialog-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(updateItemAsDM).toHaveBeenCalledWith(
          1, // item id
          mockItems[0], // updated data
          expect.any(Function), // success callback
          expect.any(Function)  // error callback
        );
      });
    });

    it('should show success message after successful update', async () => {
      const user = userEvent.setup();
      
      const tableRow = screen.getAllByTestId('table-row')[0];
      await user.click(tableRow);

      await waitFor(() => {
        expect(screen.getByTestId('item-management-dialog')).toBeInTheDocument();
      });

      const saveButton = screen.getByTestId('dialog-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-success')).toHaveTextContent('Item updated successfully');
        expect(screen.queryByTestId('item-management-dialog')).not.toBeInTheDocument();
      });
    });

    it('should handle update errors', async () => {
      const user = userEvent.setup();
      updateItemAsDM.mockImplementation((id, data, onSuccess, onError) => {
        onError('Update failed');
      });
      
      const tableRow = screen.getAllByTestId('table-row')[0];
      await user.click(tableRow);

      await waitFor(() => {
        expect(screen.getByTestId('item-management-dialog')).toBeInTheDocument();
      });

      const saveButton = screen.getByTestId('dialog-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Update failed');
      });
    });
  });

  describe('Advanced Search Filters', () => {
    it('should have all unidentified options', async () => {
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const unidentifiedSelect = screen.getAllByRole('combobox')[0];
      expect(unidentifiedSelect).toHaveTextContent('Any');
      expect(unidentifiedSelect).toHaveTextContent('Yes');
      expect(unidentifiedSelect).toHaveTextContent('No');
    });

    it('should have all type options', async () => {
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const typeSelect = screen.getAllByRole('combobox')[1];
      expect(typeSelect).toHaveTextContent('weapon');
      expect(typeSelect).toHaveTextContent('armor');
      expect(typeSelect).toHaveTextContent('magic');
      expect(typeSelect).toHaveTextContent('gear');
      expect(typeSelect).toHaveTextContent('trade good');
      expect(typeSelect).toHaveTextContent('other');
    });

    it('should have all size options', async () => {
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const sizeSelect = screen.getAllByRole('combobox')[2];
      expect(sizeSelect).toHaveTextContent('Fine');
      expect(sizeSelect).toHaveTextContent('Tiny');
      expect(sizeSelect).toHaveTextContent('Small');
      expect(sizeSelect).toHaveTextContent('Medium');
      expect(sizeSelect).toHaveTextContent('Large');
      expect(sizeSelect).toHaveTextContent('Huge');
      expect(sizeSelect).toHaveTextContent('Gargantuan');
      expect(sizeSelect).toHaveTextContent('Colossal');
    });

    it('should have all status options', async () => {
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const statusSelect = screen.getAllByRole('combobox')[3];
      expect(statusSelect).toHaveTextContent('Pending Sale');
      expect(statusSelect).toHaveTextContent('Kept Self');
      expect(statusSelect).toHaveTextContent('Kept Party');
      expect(statusSelect).toHaveTextContent('Trashed');
      expect(statusSelect).toHaveTextContent('Sold');
    });

    it('should update advanced search state when filters change', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const unidentifiedSelect = screen.getAllByRole('combobox')[0];
      await user.selectOptions(unidentifiedSelect, 'true');

      const typeSelect = screen.getAllByRole('combobox')[1];
      await user.selectOptions(typeSelect, 'weapon');

      const searchButton = screen.getByTestId('button-search');
      await user.click(searchButton);

      await waitFor(() => {
        expect(lootService.searchLoot).toHaveBeenCalledWith({
          query: '',
          unidentified: 'true',
          type: 'weapon'
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle item loading errors', async () => {
      lootService.getAllLoot.mockRejectedValue(new Error('Failed to load items'));
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Error fetching items');
      });
    });

    it('should handle empty search results gracefully', async () => {
      const user = userEvent.setup();
      lootService.searchLoot.mockResolvedValue({ data: { items: [] } });
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const searchButton = screen.getByTestId('button-search');
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.queryByTestId('table')).not.toBeInTheDocument();
      });
    });

    it('should handle null/undefined search results', async () => {
      const user = userEvent.setup();
      lootService.searchLoot.mockResolvedValue({ data: null });
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const searchButton = screen.getByTestId('button-search');
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Unexpected response structure from server');
      });
    });
  });

  describe('User Experience', () => {
    it('should show cursor pointer on table rows', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const searchButton = screen.getByTestId('button-search');
      await user.click(searchButton);

      await waitFor(() => {
        const tableRows = screen.getAllByTestId('table-row');
        expect(tableRows[0]).toHaveStyle('cursor: pointer');
      });
    });

    it('should show "Click row to edit" instruction', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      const searchButton = screen.getByTestId('button-search');
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Click row to edit')).toBeInTheDocument();
      });
    });

    it('should clear filters when clear button is clicked', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<GeneralItemManagement />);
      });

      // Set filters
      const unidentifiedSelect = screen.getAllByRole('combobox')[0];
      await user.selectOptions(unidentifiedSelect, 'true');

      const clearButton = screen.getByTestId('button-clear');
      await user.click(clearButton);

      expect(unidentifiedSelect).toHaveValue('');
    });
  });
});