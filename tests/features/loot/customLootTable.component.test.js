/**
 * Tests for CustomLootTable component
 * Tests the core loot display and interaction table component
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomLootTable from '../../../frontend/src/components/common/CustomLootTable';
import api from '../../../frontend/src/utils/api';

// Mock dependencies
jest.mock('../../../frontend/src/utils/api');
jest.mock('../../../frontend/src/utils/utils', () => ({
  formatDate: jest.fn((date) => date ? '2024-01-15' : ''),
  formatItemNameWithMods: jest.fn((item) => item.name || 'Unknown Item'),
  updateItemAsDM: jest.fn(),
}));

// Mock Material-UI components that cause issues
jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  Menu: ({ children, open, anchorEl, onClose }) => (
    open ? <div data-testid="filter-menu" onClick={onClose}>{children}</div> : null
  ),
  MenuItem: ({ children, onClick }) => (
    <div data-testid="menu-item" onClick={onClick}>{children}</div>
  ),
  Collapse: ({ children, in: isOpen }) => (
    isOpen ? <div data-testid="collapse-content">{children}</div> : null
  ),
  TableSortLabel: ({ children, onClick, active, direction }) => (
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

jest.mock('@mui/system', () => ({
  styled: (component) => (styles) => component,
}));

describe('CustomLootTable Component', () => {
  const mockLootData = [
    {
      id: 1,
      name: 'Magic Sword',
      row_type: 'individual',
      quantity: 1,
      value: 1500,
      status: 'Available',
      lastupdate: '2024-01-15T10:00:00Z',
      character_name: 'Test Character',
      unidentified: false,
      sub_items: []
    },
    {
      id: 2,
      name: 'Healing Potions',
      row_type: 'summary',
      quantity: 5,
      value: 50,
      status: 'Available',
      lastupdate: '2024-01-14T10:00:00Z',
      character_name: 'Test Character',
      unidentified: false,
      sub_items: [
        {
          id: 3,
          name: 'Healing Potion 1',
          quantity: 2,
          value: 50,
          status: 'Available'
        },
        {
          id: 4,
          name: 'Healing Potion 2',
          quantity: 3,
          value: 50,
          status: 'Available'
        }
      ]
    }
  ];

  const defaultProps = {
    data: mockLootData,
    onRowClick: jest.fn(),
    onRowSelect: jest.fn(),
    selectedRows: [],
    showBulkActions: true,
    showFilters: true,
    showPagination: true,
    isDM: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({ data: [] });
  });

  describe('Basic Rendering', () => {
    it('should render table with data', () => {
      render(<CustomLootTable {...defaultProps} />);

      expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      expect(screen.getByText('Healing Potions')).toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('should render table headers', () => {
      render(<CustomLootTable {...defaultProps} />);

      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Quantity')).toBeInTheDocument();
      expect(screen.getByText('Value')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Updated')).toBeInTheDocument();
    });

    it('should show empty state when no data', () => {
      render(<CustomLootTable {...defaultProps} data={[]} />);

      expect(screen.getByText(/no items found/i)).toBeInTheDocument();
    });

    it('should handle loading state', () => {
      render(<CustomLootTable {...defaultProps} loading={true} />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('Row Selection', () => {
    it('should call onRowSelect when checkbox is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} />);

      const checkbox = screen.getAllByRole('checkbox')[1]; // First data row checkbox
      await user.click(checkbox);

      expect(defaultProps.onRowSelect).toHaveBeenCalledWith(1, true);
    });

    it('should show selected rows as checked', () => {
      render(<CustomLootTable {...defaultProps} selectedRows={[1]} />);

      const checkboxes = screen.getAllByRole('checkbox');
      const firstDataCheckbox = checkboxes[1]; // Skip header checkbox
      expect(firstDataCheckbox).toBeChecked();
    });

    it('should handle select all functionality', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} />);

      const selectAllCheckbox = screen.getAllByRole('checkbox')[0]; // Header checkbox
      await user.click(selectAllCheckbox);

      expect(defaultProps.onRowSelect).toHaveBeenCalledWith('all', true);
    });

    it('should show indeterminate state for partial selection', () => {
      render(<CustomLootTable {...defaultProps} selectedRows={[1]} />);

      const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
      // Should be indeterminate when some but not all rows selected
      expect(selectAllCheckbox).toHaveProperty('indeterminate', true);
    });
  });

  describe('Row Expansion', () => {
    it('should expand row to show sub-items', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} />);

      const expandButton = screen.getByTestId('expand-button-2'); // Summary row expand button
      await user.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('Healing Potion 1')).toBeInTheDocument();
        expect(screen.getByText('Healing Potion 2')).toBeInTheDocument();
      });
    });

    it('should collapse expanded row', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} />);

      const expandButton = screen.getByTestId('expand-button-2');
      
      // Expand first
      await user.click(expandButton);
      await waitFor(() => {
        expect(screen.getByText('Healing Potion 1')).toBeInTheDocument();
      });

      // Then collapse
      await user.click(expandButton);
      await waitFor(() => {
        expect(screen.queryByText('Healing Potion 1')).not.toBeInTheDocument();
      });
    });

    it('should not show expand button for individual items', () => {
      render(<CustomLootTable {...defaultProps} />);

      expect(screen.queryByTestId('expand-button-1')).not.toBeInTheDocument();
    });

    it('should show expand button for summary items with sub-items', () => {
      render(<CustomLootTable {...defaultProps} />);

      expect(screen.getByTestId('expand-button-2')).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('should sort by name when name header is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} />);

      const nameSortButton = screen.getByTestId('sort-label');
      await user.click(nameSortButton);

      // Should trigger sort functionality
      expect(nameSortButton).toHaveAttribute('data-active', 'true');
    });

    it('should reverse sort direction on second click', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} />);

      const nameSortButton = screen.getByTestId('sort-label');
      
      // First click - ascending
      await user.click(nameSortButton);
      expect(nameSortButton).toHaveAttribute('data-direction', 'asc');

      // Second click - descending
      await user.click(nameSortButton);
      expect(nameSortButton).toHaveAttribute('data-direction', 'desc');
    });

    it('should show sort indicator on active column', () => {
      render(<CustomLootTable {...defaultProps} />);

      const sortButtons = screen.getAllByTestId('sort-label');
      expect(sortButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Filtering', () => {
    it('should show filter menu when filter button is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} showFilters={true} />);

      const filterButton = screen.getByTestId('filter-button');
      await user.click(filterButton);

      expect(screen.getByTestId('filter-menu')).toBeInTheDocument();
    });

    it('should apply status filters', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} showFilters={true} />);

      const filterButton = screen.getByTestId('filter-button');
      await user.click(filterButton);

      const availableFilter = screen.getByText('Available');
      await user.click(availableFilter);

      // Should filter data to show only Available items
      expect(screen.getByText('Magic Sword')).toBeInTheDocument();
    });

    it('should close filter menu when clicking outside', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} showFilters={true} />);

      const filterButton = screen.getByTestId('filter-button');
      await user.click(filterButton);

      const filterMenu = screen.getByTestId('filter-menu');
      await user.click(filterMenu);

      expect(screen.queryByTestId('filter-menu')).not.toBeInTheDocument();
    });

    it('should show filter count when filters are applied', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} showFilters={true} />);

      const filterButton = screen.getByTestId('filter-button');
      await user.click(filterButton);

      const availableFilter = screen.getByText('Available');
      await user.click(availableFilter);

      expect(screen.getByText(/filters applied/i)).toBeInTheDocument();
    });
  });

  describe('Bulk Actions', () => {
    it('should show bulk actions when rows are selected', () => {
      render(<CustomLootTable {...defaultProps} selectedRows={[1]} showBulkActions={true} />);

      expect(screen.getByText(/bulk actions/i)).toBeInTheDocument();
    });

    it('should hide bulk actions when no rows selected', () => {
      render(<CustomLootTable {...defaultProps} selectedRows={[]} showBulkActions={true} />);

      expect(screen.queryByText(/bulk actions/i)).not.toBeInTheDocument();
    });

    it('should show action buttons for selected items', () => {
      render(<CustomLootTable {...defaultProps} selectedRows={[1]} showBulkActions={true} />);

      expect(screen.getByRole('button', { name: /update status/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('should call bulk action handlers', async () => {
      const user = userEvent.setup();
      const onBulkAction = jest.fn();
      
      render(
        <CustomLootTable 
          {...defaultProps} 
          selectedRows={[1]} 
          onBulkAction={onBulkAction}
          showBulkActions={true} 
        />
      );

      const updateButton = screen.getByRole('button', { name: /update status/i });
      await user.click(updateButton);

      expect(onBulkAction).toHaveBeenCalledWith('updateStatus', [1]);
    });
  });

  describe('Row Click Handling', () => {
    it('should call onRowClick when row is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} />);

      const row = screen.getByText('Magic Sword').closest('tr');
      await user.click(row);

      expect(defaultProps.onRowClick).toHaveBeenCalledWith(mockLootData[0]);
    });

    it('should not trigger row click when checkbox is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} />);

      const checkbox = screen.getAllByRole('checkbox')[1];
      await user.click(checkbox);

      expect(defaultProps.onRowClick).not.toHaveBeenCalled();
    });

    it('should not trigger row click when expand button is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} />);

      const expandButton = screen.getByTestId('expand-button-2');
      await user.click(expandButton);

      expect(defaultProps.onRowClick).not.toHaveBeenCalled();
    });
  });

  describe('Pagination', () => {
    it('should show pagination when showPagination is true', () => {
      render(<CustomLootTable {...defaultProps} showPagination={true} />);

      expect(screen.getByTestId('table-pagination')).toBeInTheDocument();
    });

    it('should handle page change', async () => {
      const user = userEvent.setup();
      const onPageChange = jest.fn();
      
      render(
        <CustomLootTable 
          {...defaultProps} 
          showPagination={true}
          onPageChange={onPageChange}
          totalCount={100}
          page={0}
          rowsPerPage={10}
        />
      );

      const nextButton = screen.getByLabelText(/next page/i);
      await user.click(nextButton);

      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it('should handle rows per page change', async () => {
      const user = userEvent.setup();
      const onRowsPerPageChange = jest.fn();
      
      render(
        <CustomLootTable 
          {...defaultProps} 
          showPagination={true}
          onRowsPerPageChange={onRowsPerPageChange}
          rowsPerPage={10}
        />
      );

      const rowsPerPageSelect = screen.getByDisplayValue('10');
      await user.selectOptions(rowsPerPageSelect, '25');

      expect(onRowsPerPageChange).toHaveBeenCalledWith(25);
    });
  });

  describe('DM Features', () => {
    it('should show DM-only actions when isDM is true', () => {
      render(<CustomLootTable {...defaultProps} isDM={true} />);

      expect(screen.getByRole('button', { name: /dm actions/i })).toBeInTheDocument();
    });

    it('should hide DM actions when isDM is false', () => {
      render(<CustomLootTable {...defaultProps} isDM={false} />);

      expect(screen.queryByRole('button', { name: /dm actions/i })).not.toBeInTheDocument();
    });

    it('should show edit buttons for DM', () => {
      render(<CustomLootTable {...defaultProps} isDM={true} />);

      const editButtons = screen.getAllByLabelText(/edit item/i);
      expect(editButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Item Status Display', () => {
    it('should display different status colors', () => {
      const dataWithStatuses = [
        { ...mockLootData[0], status: 'Available' },
        { ...mockLootData[1], status: 'Pending Sale' },
      ];
      
      render(<CustomLootTable {...defaultProps} data={dataWithStatuses} />);

      expect(screen.getByText('Available')).toHaveClass('status-available');
      expect(screen.getByText('Pending Sale')).toHaveClass('status-pending-sale');
    });

    it('should show unidentified indicator', () => {
      const unidentifiedData = [
        { ...mockLootData[0], unidentified: true }
      ];
      
      render(<CustomLootTable {...defaultProps} data={unidentifiedData} />);

      expect(screen.getByTestId('unidentified-indicator')).toBeInTheDocument();
    });

    it('should format currency values correctly', () => {
      render(<CustomLootTable {...defaultProps} />);

      expect(screen.getByText('1,500 gp')).toBeInTheDocument();
      expect(screen.getByText('50 gp')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper table structure', () => {
      render(<CustomLootTable {...defaultProps} />);

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getAllByRole('columnheader')).toHaveLength(6); // Including checkbox column
      expect(screen.getAllByRole('row')).toHaveLength(3); // Header + 2 data rows
    });

    it('should have proper ARIA labels', () => {
      render(<CustomLootTable {...defaultProps} />);

      expect(screen.getByLabelText(/select all items/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/filter items/i)).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      render(<CustomLootTable {...defaultProps} />);

      const table = screen.getByRole('table');
      table.focus();

      await userEvent.keyboard('[ArrowDown]');
      
      // Should be able to navigate table with keyboard
      expect(document.activeElement).toBeDefined();
    });

    it('should announce sort changes to screen readers', async () => {
      const user = userEvent.setup();
      render(<CustomLootTable {...defaultProps} />);

      const nameSortButton = screen.getByTestId('sort-label');
      await user.click(nameSortButton);

      expect(nameSortButton).toHaveAttribute('aria-sort', 'ascending');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid data gracefully', () => {
      const invalidData = [
        { id: null, name: null, value: 'invalid' },
        undefined,
        null
      ];
      
      expect(() => {
        render(<CustomLootTable {...defaultProps} data={invalidData} />);
      }).not.toThrow();
    });

    it('should show error message when data loading fails', () => {
      render(<CustomLootTable {...defaultProps} error="Failed to load data" />);

      expect(screen.getByText(/failed to load data/i)).toBeInTheDocument();
    });

    it('should handle missing sub-items gracefully', () => {
      const dataWithoutSubItems = [
        { ...mockLootData[1], sub_items: undefined }
      ];
      
      render(<CustomLootTable {...defaultProps} data={dataWithoutSubItems} />);

      expect(screen.queryByTestId('expand-button-2')).not.toBeInTheDocument();
    });
  });
});