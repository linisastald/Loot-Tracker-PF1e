/**
 * Tests for UnidentifiedItemsManagement component
 * Tests the unidentified items management and identification functionality
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnidentifiedItemsManagement from '../../../frontend/src/components/pages/ItemManagement/UnidentifiedItemsManagement';
import lootService from '../../../frontend/src/services/lootService';
import { 
  calculateSpellcraftDC, 
  formatDate, 
  formatItemNameWithMods, 
  identifyItem, 
  updateItemAsDM 
} from '../../../frontend/src/utils/utils';

// Mock dependencies
jest.mock('../../../frontend/src/services/lootService');
jest.mock('../../../frontend/src/utils/utils', () => ({
  calculateSpellcraftDC: jest.fn(),
  formatDate: jest.fn((date) => date ? '2024-01-15' : ''),
  formatItemNameWithMods: jest.fn((item) => item.name || 'Unknown Item'),
  identifyItem: jest.fn(),
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
  Paper: ({ children, component }) => <div data-testid="paper">{children}</div>,
  Box: ({ children, sx, display, justifyContent, p }) => (
    <div data-testid="box">{children}</div>
  ),
  Typography: ({ children, variant, gutterBottom, paragraph }) => (
    <div data-testid={`typography-${variant}`}>{children}</div>
  ),
  CircularProgress: () => <div data-testid="loading-spinner">Loading...</div>,
  TableContainer: ({ children, component }) => (
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
  TableCell: ({ children }) => <td data-testid="table-cell">{children}</td>,
  Button: ({ children, onClick, variant, size, color, disabled, ...props }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={`button-${children?.toString().toLowerCase().replace(/\s+/g, '-')}`}
      {...props}
    >
      {children}
    </button>
  ),
  Tooltip: ({ children, title }) => (
    <div data-testid="tooltip" title={title}>{children}</div>
  ),
}));

describe('UnidentifiedItemsManagement Component', () => {
  const mockUnidentifiedItems = [
    {
      id: 1,
      session_date: '2024-01-15T10:00:00Z',
      quantity: 1,
      name: 'Unknown Magical Sword',
      type: 'weapon',
      itemid: 101,
      modids: [1, 2],
      spellcraft_dc: 25,
      unidentified: true
    },
    {
      id: 2,
      session_date: '2024-01-14T10:00:00Z',
      quantity: 3,
      name: 'Mysterious Potions',
      type: 'magic',
      itemid: null,
      modids: null,
      spellcraft_dc: null,
      unidentified: true
    }
  ];

  const mockItems = {
    101: { id: 101, name: 'Long Sword', type: 'weapon', casterlevel: 5 }
  };

  const mockMods = {
    1: { id: 1, name: '+1 Enhancement', target: 'weapon', casterlevel: 3 },
    2: { id: 2, name: 'Flaming', target: 'weapon', casterlevel: 10 }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    lootService.getUnidentifiedItems.mockResolvedValue({
      data: { items: mockUnidentifiedItems }
    });
    lootService.getItemsByIds.mockResolvedValue({
      data: { items: Object.values(mockItems) }
    });
    lootService.getModsByIds.mockResolvedValue({
      data: Object.values(mockMods)
    });
    lootService.getMods.mockResolvedValue({
      data: Object.values(mockMods)
    });
    
    calculateSpellcraftDC.mockReturnValue(20);
    formatItemNameWithMods.mockImplementation((item) => {
      if (item.itemid) return `${mockItems[item.itemid]?.name || 'Unknown'} +1 Flaming`;
      return 'Not linked';
    });
    updateItemAsDM.mockImplementation((id, data, onSuccess, onError) => {
      onSuccess('Item updated successfully');
    });
    identifyItem.mockImplementation((item, itemsMap, onSuccess, onError) => {
      onSuccess('Item identified successfully');
    });
  });

  describe('Component Initialization', () => {
    it('should render component with title and description', async () => {
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      expect(screen.getByTestId('typography-h6')).toHaveTextContent('Unidentified Items');
      expect(screen.getByTestId('typography-body1')).toHaveTextContent('Manage items that have been marked as unidentified');
    });

    it('should show loading spinner initially', async () => {
      render(<UnidentifiedItemsManagement />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should load unidentified items on mount', async () => {
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(lootService.getUnidentifiedItems).toHaveBeenCalled();
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });

    it('should load associated items and mods after getting unidentified items', async () => {
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(lootService.getItemsByIds).toHaveBeenCalledWith([101]);
        expect(lootService.getModsByIds).toHaveBeenCalledWith([1, 2]);
      });
    });

    it('should handle unidentified items without associated data', async () => {
      const itemsWithoutAssociations = [
        { id: 3, name: 'Test Item', itemid: null, modids: null }
      ];
      lootService.getUnidentifiedItems.mockResolvedValue({
        data: { items: itemsWithoutAssociations }
      });

      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(lootService.getMods).toHaveBeenCalled(); // Should fetch all mods as fallback
      });
    });
  });

  describe('Table Rendering', () => {
    beforeEach(async () => {
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });

    it('should render table with correct headers', () => {
      expect(screen.getByTestId('table-container')).toBeInTheDocument();
      expect(screen.getByText('Session Date')).toBeInTheDocument();
      expect(screen.getByText('Quantity')).toBeInTheDocument();
      expect(screen.getByText('Current Name')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Real Item')).toBeInTheDocument();
      expect(screen.getByText('Spellcraft DC')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('should display unidentified items data', () => {
      expect(screen.getByText('Unknown Magical Sword')).toBeInTheDocument();
      expect(screen.getByText('Mysterious Potions')).toBeInTheDocument();
      expect(screen.getByText('weapon')).toBeInTheDocument();
      expect(screen.getByText('magic')).toBeInTheDocument();
    });

    it('should show formatted item names for linked items', () => {
      expect(formatItemNameWithMods).toHaveBeenCalledWith(
        mockUnidentifiedItems[0],
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should display spellcraft DC values', () => {
      expect(screen.getByText('25')).toBeInTheDocument(); // Set DC
      expect(screen.getByText('20')).toBeInTheDocument(); // Calculated DC
    });

    it('should show identify buttons', () => {
      const identifyButtons = screen.getAllByTestId('button-identify');
      expect(identifyButtons).toHaveLength(2);
    });

    it('should disable identify button for items without itemid', () => {
      const identifyButtons = screen.getAllByTestId('button-identify');
      expect(identifyButtons[1]).toBeDisabled(); // Second item has no itemid
    });
  });

  describe('Item Identification', () => {
    beforeEach(async () => {
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });

    it('should call identifyItem when identify button is clicked', async () => {
      const user = userEvent.setup();
      
      const identifyButtons = screen.getAllByTestId('button-identify');
      await user.click(identifyButtons[0]);

      expect(identifyItem).toHaveBeenCalledWith(
        mockUnidentifiedItems[0],
        expect.any(Object),
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should show success message after identification', async () => {
      const user = userEvent.setup();
      
      const identifyButtons = screen.getAllByTestId('button-identify');
      await user.click(identifyButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('alert-success')).toHaveTextContent('Item identified successfully');
      });
    });

    it('should refresh items list after identification', async () => {
      const user = userEvent.setup();
      
      const identifyButtons = screen.getAllByTestId('button-identify');
      await user.click(identifyButtons[0]);

      await waitFor(() => {
        expect(lootService.getUnidentifiedItems).toHaveBeenCalledTimes(2); // Initial + refresh
      });
    });

    it('should handle identification errors', async () => {
      const user = userEvent.setup();
      identifyItem.mockImplementation((item, itemsMap, onSuccess, onError) => {
        onError('Identification failed');
      });
      
      const identifyButtons = screen.getAllByTestId('button-identify');
      await user.click(identifyButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Identification failed');
      });
    });

    it('should prevent row click when identify button is clicked', async () => {
      const user = userEvent.setup();
      
      const identifyButtons = screen.getAllByTestId('button-identify');
      await user.click(identifyButtons[0]);

      // Dialog should not open
      expect(screen.queryByTestId('item-management-dialog')).not.toBeInTheDocument();
    });
  });

  describe('Item Update Dialog', () => {
    beforeEach(async () => {
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });

    it('should open dialog when table row is clicked', async () => {
      const user = userEvent.setup();
      
      const tableRows = screen.getAllByTestId('table-row');
      await user.click(tableRows[0]);

      await waitFor(() => {
        expect(screen.getByTestId('item-management-dialog')).toBeInTheDocument();
        expect(screen.getByTestId('dialog-title')).toHaveTextContent('Update Unidentified Item');
      });
    });

    it('should pass selected item to dialog', async () => {
      const user = userEvent.setup();
      
      const tableRows = screen.getAllByTestId('table-row');
      await user.click(tableRows[0]);

      await waitFor(() => {
        expect(screen.getByTestId('dialog-item-name')).toHaveTextContent('Unknown Magical Sword');
      });
    });

    it('should close dialog when close button is clicked', async () => {
      const user = userEvent.setup();
      
      const tableRows = screen.getAllByTestId('table-row');
      await user.click(tableRows[0]);

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
      
      const tableRows = screen.getAllByTestId('table-row');
      await user.click(tableRows[0]);

      await waitFor(() => {
        expect(screen.getByTestId('item-management-dialog')).toBeInTheDocument();
      });

      const saveButton = screen.getByTestId('dialog-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(updateItemAsDM).toHaveBeenCalledWith(
          1, // item id
          mockUnidentifiedItems[0], // updated data
          expect.any(Function), // success callback
          expect.any(Function)  // error callback
        );
      });
    });

    it('should calculate spellcraft DC if not set during update', async () => {
      const user = userEvent.setup();
      const itemWithoutDC = { ...mockUnidentifiedItems[0], spellcraft_dc: null };
      
      const tableRows = screen.getAllByTestId('table-row');
      await user.click(tableRows[0]);

      await waitFor(() => {
        expect(screen.getByTestId('item-management-dialog')).toBeInTheDocument();
      });

      // Mock the save to pass item without DC
      const saveButton = screen.getByTestId('dialog-save');
      const dialogSave = jest.fn();
      saveButton.onclick = () => dialogSave(itemWithoutDC);
      
      await user.click(saveButton);

      expect(calculateSpellcraftDC).toHaveBeenCalled();
    });

    it('should show success message after update', async () => {
      const user = userEvent.setup();
      
      const tableRows = screen.getAllByTestId('table-row');
      await user.click(tableRows[0]);

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
      
      const tableRows = screen.getAllByTestId('table-row');
      await user.click(tableRows[0]);

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

  describe('Data Loading and Error Handling', () => {
    it('should handle unidentified items loading errors', async () => {
      lootService.getUnidentifiedItems.mockRejectedValue(new Error('Failed to load'));
      
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Failed to fetch unidentified items');
      });
    });

    it('should handle unexpected data structure', async () => {
      lootService.getUnidentifiedItems.mockResolvedValue({
        data: { unexpected: 'format' }
      });
      
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Invalid data structure received from server');
      });
    });

    it('should fallback to individual item fetching when batch fails', async () => {
      lootService.getItemsByIds.mockRejectedValue(new Error('Batch fetch failed'));
      lootService.getAllLoot.mockResolvedValue({ data: [mockItems[101]] });
      
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(lootService.getAllLoot).toHaveBeenCalledWith({ query: 101 });
      });
    });

    it('should fallback to all mods when mod batch fetch fails', async () => {
      lootService.getModsByIds.mockRejectedValue(new Error('Mod batch fetch failed'));
      
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(lootService.getMods).toHaveBeenCalled();
      });
    });

    it('should handle array response format for items', async () => {
      lootService.getItemsByIds.mockResolvedValue({
        data: Object.values(mockItems) // Direct array format
      });
      
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });

      // Should still work correctly
      expect(screen.getByText('Unknown Magical Sword')).toBeInTheDocument();
    });

    it('should handle array response format for mods', async () => {
      lootService.getModsByIds.mockResolvedValue({
        data: Object.values(mockMods) // Direct array format
      });
      
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });

      // Should still work correctly
      expect(screen.getByText('Unknown Magical Sword')).toBeInTheDocument();
    });
  });

  describe('Spellcraft DC Calculation', () => {
    beforeEach(async () => {
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });

    it('should display existing spellcraft DC', () => {
      expect(screen.getByText('25')).toBeInTheDocument(); // Item with set DC
    });

    it('should calculate DC for items without set DC', () => {
      expect(calculateSpellcraftDC).toHaveBeenCalledWith(
        mockUnidentifiedItems[1],
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should show "Not set" for items that cannot calculate DC', () => {
      calculateSpellcraftDC.mockReturnValue(null);
      
      // Re-render to apply the mock change
      act(() => {
        render(<UnidentifiedItemsManagement />);
      });

      // Should show fallback text for items without calculable DC
      expect(screen.getByText('Not set')).toBeInTheDocument();
    });
  });

  describe('User Experience', () => {
    beforeEach(async () => {
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });

    it('should show cursor pointer on table rows', () => {
      const tableRows = screen.getAllByTestId('table-row');
      expect(tableRows[0]).toHaveStyle('cursor: pointer');
    });

    it('should show tooltip on identify button', () => {
      const tooltips = screen.getAllByTestId('tooltip');
      expect(tooltips[0]).toHaveAttribute('title', 'Mark as identified using linked item');
    });

    it('should handle empty unidentified items list', async () => {
      lootService.getUnidentifiedItems.mockResolvedValue({
        data: { items: [] }
      });
      
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('table')).toBeInTheDocument();
        expect(screen.queryByTestId('table-row')).not.toBeInTheDocument();
      });
    });

    it('should format dates using utility function', () => {
      expect(formatDate).toHaveBeenCalledWith('2024-01-15T10:00:00Z');
      expect(formatDate).toHaveBeenCalledWith('2024-01-14T10:00:00Z');
    });
  });

  describe('Integration Features', () => {
    beforeEach(async () => {
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });

    it('should refresh data after successful identification', async () => {
      const user = userEvent.setup();
      
      const identifyButtons = screen.getAllByTestId('button-identify');
      await user.click(identifyButtons[0]);

      await waitFor(() => {
        expect(lootService.getUnidentifiedItems).toHaveBeenCalledTimes(2);
      });
    });

    it('should refresh data after successful update', async () => {
      const user = userEvent.setup();
      
      const tableRows = screen.getAllByTestId('table-row');
      await user.click(tableRows[0]);

      await waitFor(() => {
        expect(screen.getByTestId('item-management-dialog')).toBeInTheDocument();
      });

      const saveButton = screen.getByTestId('dialog-save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(lootService.getUnidentifiedItems).toHaveBeenCalledTimes(2);
      });
    });

    it('should handle items with duplicate IDs in batch requests', async () => {
      const itemsWithDuplicates = [
        { ...mockUnidentifiedItems[0], itemid: 101 },
        { ...mockUnidentifiedItems[1], itemid: 101 }
      ];
      lootService.getUnidentifiedItems.mockResolvedValue({
        data: { items: itemsWithDuplicates }
      });
      
      await act(async () => {
        render(<UnidentifiedItemsManagement />);
      });

      await waitFor(() => {
        expect(lootService.getItemsByIds).toHaveBeenCalledWith([101]); // Should deduplicate
      });
    });
  });
});