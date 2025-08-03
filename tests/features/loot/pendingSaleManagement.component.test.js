/**
 * Component tests for PendingSaleManagement
 * Tests the recently fixed DM sell page functionality
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PendingSaleManagement from '../../../frontend/src/components/pages/ItemManagement/PendingSaleManagement';
import lootService from '../../../frontend/src/services/lootService';

// Mock the loot service
jest.mock('../../../frontend/src/services/lootService', () => ({
  getPendingSaleItems: jest.fn(),
  getAllLoot: jest.fn(),
  getMods: jest.fn(),
  sellItems: jest.fn(),
  updateLoot: jest.fn(),
}));

// Mock the sale value calculator
jest.mock('../../../frontend/src/utils/saleValueCalculator', () => ({
  calculateItemSaleValue: jest.fn((item) => item.sale_value || 100),
  calculateTotalSaleValue: jest.fn((items) => items.reduce((sum, item) => sum + (item.sale_value || 100), 0)),
}));

// Mock the utils
jest.mock('../../../frontend/src/utils/utils', () => ({
  formatDate: jest.fn((date) => date ? new Date(date).toLocaleDateString() : ''),
  formatItemNameWithMods: jest.fn((item) => item.name || 'Unknown Item'),
  updateItemAsDM: jest.fn(),
}));

// Mock Material-UI components that cause issues
jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  Alert: ({ children, severity, ...props }) => (
    <div data-testid="alert" data-severity={severity} {...props}>{children}</div>
  ),
  CircularProgress: () => <div data-testid="loading">Loading...</div>,
}));

describe('PendingSaleManagement Component', () => {
  const mockPendingItems = [
    {
      id: 1,
      name: 'Magic Sword',
      sale_value: 150,
      quantity: 1,
      status: 'Pending Sale',
      character_name: 'Test Character',
      itemid: 1,
      modids: [1, 2],
    },
    {
      id: 2,
      name: 'Healing Potion',
      sale_value: 50,
      quantity: 3,
      status: 'Pending Sale',
      character_name: 'Test Character',
      itemid: 2,
      modids: [],
    },
  ];

  const mockAllItems = [
    { id: 1, name: 'Long Sword', type: 'weapon' },
    { id: 2, name: 'Cure Light Wounds', type: 'potion' },
  ];

  const mockMods = [
    { id: 1, name: '+1 Enhancement', cost: 2000 },
    { id: 2, name: 'Flaming', cost: 8000 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    lootService.getPendingSaleItems.mockResolvedValue({
      data: { items: mockPendingItems }
    });
    lootService.getAllLoot.mockResolvedValue({
      data: mockAllItems
    });
    lootService.getMods.mockResolvedValue({
      data: mockMods
    });
  });

  describe('Initial Rendering', () => {
    it('should render without crashing', () => {
      render(<PendingSaleManagement />);
      expect(screen.getByText(/pending sale management/i)).toBeInTheDocument();
    });

    it('should show loading state initially', () => {
      render(<PendingSaleManagement />);
      expect(screen.getByTestId('loading')).toBeInTheDocument();
    });

    it('should fetch and display pending items', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(lootService.getPendingSaleItems).toHaveBeenCalled();
        expect(lootService.getAllLoot).toHaveBeenCalled();
        expect(lootService.getMods).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
        expect(screen.getByText('Healing Potion')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error when API call fails', async () => {
      lootService.getPendingSaleItems.mockRejectedValue(new Error('API Error'));

      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByTestId('alert')).toHaveTextContent('Failed to fetch pending items.');
      });
    });

    it('should handle invalid data structure', async () => {
      lootService.getPendingSaleItems.mockResolvedValue({
        data: { invalid: 'structure' }
      });

      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByTestId('alert')).toHaveTextContent('Invalid data structure received from server');
      });
    });

    it('should handle missing data property', async () => {
      lootService.getPendingSaleItems.mockResolvedValue({
        data: null
      });

      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByTestId('alert')).toHaveTextContent('Invalid data structure received from server');
      });
    });
  });

  describe('Item Selection', () => {
    it('should allow selecting individual items', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      const checkbox = screen.getAllByRole('checkbox')[0]; // First item checkbox
      await userEvent.click(checkbox);

      expect(checkbox).toBeChecked();
    });

    it('should allow selecting all items', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      await userEvent.click(selectAllCheckbox);

      const itemCheckboxes = screen.getAllByRole('checkbox');
      // Should have select-all checkbox plus one for each item
      expect(itemCheckboxes).toHaveLength(3);
      itemCheckboxes.slice(1).forEach(checkbox => {
        expect(checkbox).toBeChecked();
      });
    });

    it('should calculate selected items total', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      const checkbox = screen.getAllByRole('checkbox')[1]; // First item checkbox
      await userEvent.click(checkbox);

      // Should show selected total (mocked to return sale_value)
      await waitFor(() => {
        expect(screen.getByText(/selected total:/i)).toBeInTheDocument();
      });
    });
  });

  describe('Sell Functionality', () => {
    it('should show sell button when items are selected', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      const checkbox = screen.getAllByRole('checkbox')[1]; // First item checkbox
      await userEvent.click(checkbox);

      expect(screen.getByRole('button', { name: /sell selected items/i })).toBeInTheDocument();
    });

    it('should successfully sell selected items', async () => {
      lootService.sellItems.mockResolvedValue({
        success: true,
        data: { soldCount: 1, totalValue: 150 }
      });

      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      // Select first item
      const checkbox = screen.getAllByRole('checkbox')[1];
      await userEvent.click(checkbox);

      // Click sell button
      const sellButton = screen.getByRole('button', { name: /sell selected items/i });
      await userEvent.click(sellButton);

      await waitFor(() => {
        expect(lootService.sellItems).toHaveBeenCalledWith([1]);
        expect(screen.getByTestId('alert')).toHaveTextContent(/successfully sold.*1.*items.*150.*gold/i);
      });

      // Should refresh data after sell
      await waitFor(() => {
        expect(lootService.getPendingSaleItems).toHaveBeenCalledTimes(2); // Initial + refresh
      });
    });

    it('should handle sell errors gracefully', async () => {
      lootService.sellItems.mockRejectedValue(new Error('Sell failed'));

      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      // Select and attempt to sell
      const checkbox = screen.getAllByRole('checkbox')[1];
      await userEvent.click(checkbox);

      const sellButton = screen.getByRole('button', { name: /sell selected items/i });
      await userEvent.click(sellButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert')).toHaveTextContent(/failed to sell items/i);
      });
    });
  });

  describe('Sell Up To Amount Feature', () => {
    it('should allow setting sell up to amount', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      const sellUpToInput = screen.getByLabelText(/sell up to amount/i);
      await userEvent.type(sellUpToInput, '100');

      expect(sellUpToInput).toHaveValue('100');
    });

    it('should sell items up to specified amount', async () => {
      lootService.sellItems.mockResolvedValue({
        success: true,
        data: { soldCount: 1, totalValue: 50 }
      });

      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      // Set sell up to amount
      const sellUpToInput = screen.getByLabelText(/sell up to amount/i);
      await userEvent.type(sellUpToInput, '100');

      // Click sell up to amount button
      const sellUpToButton = screen.getByRole('button', { name: /sell up to amount/i });
      await userEvent.click(sellUpToButton);

      await waitFor(() => {
        expect(lootService.sellItems).toHaveBeenCalled();
      });
    });
  });

  describe('Item Management Dialog', () => {
    it('should open item management dialog when edit button is clicked', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      await userEvent.click(editButtons[0]);

      // Dialog should be opened (mocked component will show)
      await waitFor(() => {
        expect(screen.getByTestId('item-management-dialog')).toBeInTheDocument();
      });
    });

    it('should close dialog and refresh data when item is updated', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      // Simulate dialog close with update
      const component = screen.getByTestId('pending-sale-management');
      fireEvent.custom(component, 'dialogClose', { detail: { updated: true } });

      await waitFor(() => {
        expect(lootService.getPendingSaleItems).toHaveBeenCalledTimes(2); // Initial + refresh
      });
    });
  });

  describe('Summary Information', () => {
    it('should display pending sale summary', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText(/total pending sale value:/i)).toBeInTheDocument();
        expect(screen.getByText(/pending sale count:/i)).toBeInTheDocument();
      });
    });

    it('should calculate summary correctly', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        // Should show count of pending items
        expect(screen.getByText(/2.*items/i)).toBeInTheDocument();
      });
    });
  });

  describe('Data Refresh', () => {
    it('should refresh data when refresh button is clicked', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      await userEvent.click(refreshButton);

      await waitFor(() => {
        expect(lootService.getPendingSaleItems).toHaveBeenCalledTimes(2); // Initial + refresh
      });
    });

    it('should handle refresh errors', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      // Mock refresh to fail
      lootService.getPendingSaleItems.mockRejectedValueOnce(new Error('Refresh failed'));

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      await userEvent.click(refreshButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert')).toHaveTextContent(/failed to fetch pending items/i);
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/sell up to amount/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sell selected items/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      render(<PendingSaleManagement />);

      await waitFor(() => {
        expect(screen.getByText('Magic Sword')).toBeInTheDocument();
      });

      const checkbox = screen.getAllByRole('checkbox')[1];
      checkbox.focus();
      
      await userEvent.keyboard('[Space]');
      expect(checkbox).toBeChecked();
    });
  });
});