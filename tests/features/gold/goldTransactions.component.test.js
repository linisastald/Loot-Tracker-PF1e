/**
 * Tests for GoldTransactions component
 * Tests the comprehensive gold management functionality
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GoldTransactions from '../../../frontend/src/components/pages/GoldTransactions';
import api from '../../../frontend/src/utils/api';
import lootService from '../../../frontend/src/services/lootService';

// Mock dependencies
jest.mock('../../../frontend/src/utils/api');
jest.mock('../../../frontend/src/services/lootService');

// Mock date picker components
jest.mock('@mui/x-date-pickers', () => ({
  DatePicker: ({ label, value, onChange, renderInput }) => {
    const handleChange = (e) => {
      const date = new Date(e.target.value);
      onChange(date);
    };
    
    return renderInput ? 
      renderInput({
        inputProps: {
          'data-testid': `datepicker-${label?.toLowerCase().replace(/\s+/g, '-')}`,
          value: value ? value.toISOString().split('T')[0] : '',
          onChange: handleChange
        }
      }) : (
        <input
          type="date"
          data-testid={`datepicker-${label?.toLowerCase().replace(/\s+/g, '-')}`}
          value={value ? value.toISOString().split('T')[0] : ''}
          onChange={handleChange}
        />
      );
  },
  LocalizationProvider: ({ children }) => <div data-testid="localization-provider">{children}</div>
}));

jest.mock('@mui/x-date-pickers/AdapterDateFns', () => ({
  AdapterDateFns: jest.fn()
}));

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  Alert: ({ children, severity }) => (
    <div data-testid={`alert-${severity}`}>{children}</div>
  ),
  Container: ({ children, maxWidth, component }) => (
    <div data-testid="container">{children}</div>
  ),
  Paper: ({ children, sx }) => <div data-testid="paper">{children}</div>,
  Card: ({ children, sx }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }) => <div data-testid="card-content">{children}</div>,
  Box: ({ children, sx, display, justifyContent, p, mt, mb, borderBottom, borderColor }) => (
    <div data-testid="box">{children}</div>
  ),
  Typography: ({ children, variant, gutterBottom, paragraph, color, sx }) => (
    <div data-testid={`typography-${variant}`}>{children}</div>
  ),
  Grid: ({ children, container, spacing, size, xs, sm, md }) => (
    <div data-testid={container ? "grid-container" : "grid-item"}>
      {children}
    </div>
  ),
  Tabs: ({ children, value, onChange }) => (
    <div data-testid="tabs" data-value={value}>
      {children}
    </div>
  ),
  Tab: ({ label, ...props }) => (
    <button 
      data-testid={`tab-${label?.toLowerCase().replace(/\s+/g, '-')}`}
      onClick={() => props.onClick && props.onClick()}
    >
      {label}
    </button>
  ),
  TextField: ({ label, value, onChange, type, multiline, rows, fullWidth, inputProps, ...params }) => (
    <div data-testid="text-field">
      <label>{label}</label>
      {multiline ? (
        <textarea
          value={value || ''}
          onChange={onChange}
          rows={rows}
          data-testid={`textfield-${label?.toLowerCase().replace(/\s+/g, '-')}`}
          {...params.inputProps}
        />
      ) : (
        <input
          type={type || 'text'}
          value={value || ''}
          onChange={onChange}
          data-testid={`textfield-${label?.toLowerCase().replace(/\s+/g, '-')}`}
          min={inputProps?.min}
          {...params.inputProps}
        />
      )}
    </div>
  ),
  FormControl: ({ children, fullWidth }) => (
    <div data-testid="form-control">{children}</div>
  ),
  InputLabel: ({ children }) => <label data-testid="input-label">{children}</label>,
  Select: ({ children, value, onChange, label, ...props }) => (
    <select 
      data-testid={`select-${label?.toLowerCase().replace(/\s+/g, '-')}`}
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
  Button: ({ children, onClick, variant, color, fullWidth, disabled, type, size, sx, ...props }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      type={type}
      data-testid={`button-${children?.toString().toLowerCase().replace(/\s+/g, '-')}`}
      {...props}
    >
      {children}
    </button>
  ),
  TableContainer: ({ children, component }) => (
    <div data-testid="table-container">{children}</div>
  ),
  Table: ({ children }) => <table data-testid="table">{children}</table>,
  TableHead: ({ children }) => <thead data-testid="table-head">{children}</thead>,
  TableBody: ({ children }) => <tbody data-testid="table-body">{children}</tbody>,
  TableRow: ({ children, sx }) => (
    <tr data-testid="table-row">{children}</tr>
  ),
  TableCell: ({ children, align, colSpan, component, scope, sx }) => (
    <td data-testid="table-cell" style={{ textAlign: align }} colSpan={colSpan}>
      {children}
    </td>
  ),
  CircularProgress: () => <div data-testid="loading-spinner">Loading...</div>,
}));

// Mock TabPanel component
const TabPanel = ({ children, value, index }) => {
  return value === index ? (
    <div data-testid={`tab-panel-${index}`}>
      {children}
    </div>
  ) : null;
};

describe('GoldTransactions Component', () => {
  const mockGoldEntries = [
    {
      id: 1,
      session_date: '2024-01-15T10:00:00Z',
      transaction_type: 'Deposit',
      platinum: 5,
      gold: 100,
      silver: 50,
      copper: 25,
      notes: 'Treasure from dungeon'
    },
    {
      id: 2,
      session_date: '2024-01-14T10:00:00Z',
      transaction_type: 'Withdrawal',
      platinum: 0,
      gold: 20,
      silver: 0,
      copper: 0,
      notes: 'Equipment purchase'
    }
  ];

  const mockLedgerData = {
    characters: [
      {
        character: 'Alice',
        active: true,
        lootvalue: '1500.00',
        payments: '1200.00'
      },
      {
        character: 'Bob',
        active: false,
        lootvalue: '800.00',
        payments: '900.00'
      }
    ]
  };

  const mockUserResponse = {
    data: {
      user: { role: 'Player' }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    api.get.mockImplementation((url) => {
      if (url === '/gold') {
        return Promise.resolve({ data: mockGoldEntries });
      }
      if (url === '/auth/status') {
        return Promise.resolve(mockUserResponse);
      }
      return Promise.resolve({ data: [] });
    });
    
    api.post.mockResolvedValue({ data: { success: true } });
    
    lootService.getCharacterLedger.mockResolvedValue({
      data: mockLedgerData
    });
  });

  describe('Component Initialization', () => {
    it('should render component with default overview tab', async () => {
      await act(async () => {
        render(<GoldTransactions />);
      });

      expect(screen.getByTestId('container')).toBeInTheDocument();
      expect(screen.getByTestId('tabs')).toBeInTheDocument();
      expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
    });

    it('should load gold entries on mount', async () => {
      await act(async () => {
        render(<GoldTransactions />);
      });

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/gold', expect.objectContaining({
          params: expect.objectContaining({
            startDate: expect.any(Date),
            endDate: expect.any(Date)
          })
        }));
      });
    });

    it('should load user role on mount', async () => {
      await act(async () => {
        render(<GoldTransactions />);
      });

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/auth/status');
      });
    });

    it('should load ledger data on mount', async () => {
      await act(async () => {
        render(<GoldTransactions />);
      });

      await waitFor(() => {
        expect(lootService.getCharacterLedger).toHaveBeenCalled();
      });
    });

    it('should calculate totals correctly', async () => {
      await act(async () => {
        render(<GoldTransactions />);
      });

      await waitFor(() => {
        // Should show calculated totals: 5 platinum + 120 gold + 50 silver + 25 copper
        // Total in gold: (5 * 10) + 120 + (50 / 10) + (25 / 100) = 50 + 120 + 5 + 0.25 = 175.25
        expect(screen.getByText('5')).toBeInTheDocument(); // Platinum
        expect(screen.getByText('120')).toBeInTheDocument(); // Gold (100 + 20)
        expect(screen.getByText('50')).toBeInTheDocument(); // Silver
        expect(screen.getByText('25')).toBeInTheDocument(); // Copper
        expect(screen.getByText('175.25 GP')).toBeInTheDocument(); // Total
      });
    });
  });

  describe('Tab Navigation', () => {
    beforeEach(async () => {
      await act(async () => {
        render(<GoldTransactions />);
      });
    });

    it('should show all tab headers', () => {
      expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
      expect(screen.getByTestId('tab-add-transaction')).toBeInTheDocument();
      expect(screen.getByTestId('tab-transaction-history')).toBeInTheDocument();
      expect(screen.getByTestId('tab-management')).toBeInTheDocument();
      expect(screen.getByTestId('tab-character-ledger')).toBeInTheDocument();
    });

    it('should show overview content by default', () => {
      expect(screen.getByText('Currency Summary')).toBeInTheDocument();
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });

    it('should show quick action buttons in overview', () => {
      expect(screen.getByTestId('button-add-new-transaction')).toBeInTheDocument();
      expect(screen.getByTestId('button-manage-gold')).toBeInTheDocument();
      expect(screen.getByTestId('button-view-history')).toBeInTheDocument();
    });
  });

  describe('Currency Summary Display', () => {
    beforeEach(async () => {
      await act(async () => {
        render(<GoldTransactions />);
      });

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });
    });

    it('should display individual currency totals', () => {
      expect(screen.getByText('Platinum')).toBeInTheDocument();
      expect(screen.getByText('Gold')).toBeInTheDocument();
      expect(screen.getByText('Silver')).toBeInTheDocument();
      expect(screen.getByText('Copper')).toBeInTheDocument();
    });

    it('should display total value in gold pieces', () => {
      expect(screen.getByText('Total Value (in Gold)')).toBeInTheDocument();
      expect(screen.getByText('175.25 GP')).toBeInTheDocument();
    });

    it('should handle empty gold entries', async () => {
      api.get.mockResolvedValue({ data: [] });
      
      await act(async () => {
        render(<GoldTransactions />);
      });

      await waitFor(() => {
        expect(screen.getByText('0')).toBeInTheDocument(); // Should show 0 for all currencies
        expect(screen.getByText('0.00 GP')).toBeInTheDocument();
      });
    });
  });

  describe('Add Transaction Form', () => {
    beforeEach(async () => {
      await act(async () => {
        render(<GoldTransactions />);
      });

      // Switch to Add Transaction tab
      const addTransactionTab = screen.getByTestId('tab-add-transaction');
      await userEvent.click(addTransactionTab);
    });

    it('should render transaction form fields', () => {
      expect(screen.getByTestId('textfield-platinum')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-gold')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-silver')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-copper')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-notes')).toBeInTheDocument();
      expect(screen.getByTestId('select-transaction-type')).toBeInTheDocument();
    });

    it('should show all transaction type options', () => {
      const transactionSelect = screen.getByTestId('select-transaction-type');
      expect(transactionSelect).toHaveTextContent('Deposit');
      expect(transactionSelect).toHaveTextContent('Withdrawal');
      expect(transactionSelect).toHaveTextContent('Sale');
      expect(transactionSelect).toHaveTextContent('Purchase');
      expect(transactionSelect).toHaveTextContent('Party Loot Purchase');
      expect(transactionSelect).toHaveTextContent('Party Payment');
      expect(transactionSelect).toHaveTextContent('Party Payback');
      expect(transactionSelect).toHaveTextContent('Balance');
      expect(transactionSelect).toHaveTextContent('Other');
    });

    it('should update form fields when user types', async () => {
      const user = userEvent.setup();
      
      const goldField = screen.getByTestId('textfield-gold');
      await user.type(goldField, '100');

      expect(goldField).toHaveValue('100');
    });

    it('should validate required fields before submission', async () => {
      const user = userEvent.setup();
      
      const submitButton = screen.getByTestId('button-add-transaction');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('At least one currency amount is required');
      });
    });

    it('should validate transaction type is required', async () => {
      const user = userEvent.setup();
      
      // Clear transaction type and add currency
      const transactionSelect = screen.getByTestId('select-transaction-type');
      await user.selectOptions(transactionSelect, '');
      
      const goldField = screen.getByTestId('textfield-gold');
      await user.type(goldField, '100');

      const submitButton = screen.getByTestId('button-add-transaction');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Transaction type is required');
      });
    });

    it('should submit valid transaction successfully', async () => {
      const user = userEvent.setup();
      
      // Fill out form
      const transactionSelect = screen.getByTestId('select-transaction-type');
      await user.selectOptions(transactionSelect, 'Deposit');
      
      const goldField = screen.getByTestId('textfield-gold');
      await user.type(goldField, '100');
      
      const notesField = screen.getByTestId('textfield-notes');
      await user.type(notesField, 'Test transaction');

      const submitButton = screen.getByTestId('button-add-transaction');
      await user.click(submitButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/gold', {
          goldEntries: [{
            sessionDate: expect.any(Date),
            transactionType: 'Deposit',
            platinum: 0,
            gold: 100,
            silver: 0,
            copper: 0,
            notes: 'Test transaction'
          }]
        });
      });
    });

    it('should show success message after successful submission', async () => {
      const user = userEvent.setup();
      
      const goldField = screen.getByTestId('textfield-gold');
      await user.type(goldField, '100');

      const submitButton = screen.getByTestId('button-add-transaction');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-success')).toHaveTextContent('Gold entry created successfully!');
      });
    });

    it('should clear form after successful submission', async () => {
      const user = userEvent.setup();
      
      const goldField = screen.getByTestId('textfield-gold');
      await user.type(goldField, '100');

      const submitButton = screen.getByTestId('button-add-transaction');
      await user.click(submitButton);

      await waitFor(() => {
        expect(goldField).toHaveValue('');
      });
    });

    it('should handle submission errors', async () => {
      const user = userEvent.setup();
      api.post.mockRejectedValue(new Error('Network error'));
      
      const goldField = screen.getByTestId('textfield-gold');
      await user.type(goldField, '100');

      const submitButton = screen.getByTestId('button-add-transaction');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Failed to create gold entry.');
      });
    });
  });

  describe('Transaction History', () => {
    beforeEach(async () => {
      await act(async () => {
        render(<GoldTransactions />);
      });

      // Switch to Transaction History tab
      const historyTab = screen.getByTestId('tab-transaction-history');
      await userEvent.click(historyTab);
    });

    it('should render date filter controls', () => {
      expect(screen.getByTestId('datepicker-start-date')).toBeInTheDocument();
      expect(screen.getByTestId('datepicker-end-date')).toBeInTheDocument();
      expect(screen.getByTestId('button-apply-filter')).toBeInTheDocument();
    });

    it('should render quick filter buttons', () => {
      expect(screen.getByTestId('button-last-month')).toBeInTheDocument();
      expect(screen.getByTestId('button-last-3-months')).toBeInTheDocument();
      expect(screen.getByTestId('button-last-6-months')).toBeInTheDocument();
      expect(screen.getByTestId('button-last-year')).toBeInTheDocument();
    });

    it('should display transaction history table', () => {
      expect(screen.getByTestId('table')).toBeInTheDocument();
      expect(screen.getByText('Session Date')).toBeInTheDocument();
      expect(screen.getByText('Transaction Type')).toBeInTheDocument();
      expect(screen.getByText('Platinum')).toBeInTheDocument();
      expect(screen.getByText('Gold')).toBeInTheDocument();
      expect(screen.getByText('Silver')).toBeInTheDocument();
      expect(screen.getByText('Copper')).toBeInTheDocument();
      expect(screen.getByText('Notes')).toBeInTheDocument();
    });

    it('should display transaction data in table', async () => {
      await waitFor(() => {
        expect(screen.getByText('Deposit')).toBeInTheDocument();
        expect(screen.getByText('Withdrawal')).toBeInTheDocument();
        expect(screen.getByText('Treasure from dungeon')).toBeInTheDocument();
        expect(screen.getByText('Equipment purchase')).toBeInTheDocument();
      });
    });

    it('should handle quick filter buttons', async () => {
      const user = userEvent.setup();
      
      const lastMonthButton = screen.getByTestId('button-last-month');
      await user.click(lastMonthButton);

      // Should trigger a new API call with updated date range
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(2); // Initial + filter
      });
    });

    it('should handle date range filter', async () => {
      const user = userEvent.setup();
      
      const startDatePicker = screen.getByTestId('datepicker-start-date');
      await user.clear(startDatePicker);
      await user.type(startDatePicker, '2024-01-01');

      const applyFilterButton = screen.getByTestId('button-apply-filter');
      await user.click(applyFilterButton);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/gold', expect.objectContaining({
          params: expect.objectContaining({
            startDate: expect.any(Date),
            endDate: expect.any(Date)
          })
        }));
      });
    });

    it('should show no transactions message when empty', async () => {
      api.get.mockResolvedValue({ data: [] });
      
      await act(async () => {
        render(<GoldTransactions />);
      });

      const historyTab = screen.getByTestId('tab-transaction-history');
      await userEvent.click(historyTab);

      await waitFor(() => {
        expect(screen.getByText('No transactions found')).toBeInTheDocument();
      });
    });
  });

  describe('Gold Management Operations', () => {
    beforeEach(async () => {
      await act(async () => {
        render(<GoldTransactions />);
      });

      // Switch to Management tab
      const managementTab = screen.getByTestId('tab-management');
      await userEvent.click(managementTab);
    });

    it('should render management action buttons', () => {
      expect(screen.getByTestId('button-distribute-all')).toBeInTheDocument();
      expect(screen.getByTestId('button-distribute-+-party-loot')).toBeInTheDocument();
    });

    it('should handle distribute all gold', async () => {
      const user = userEvent.setup();
      
      const distributeButton = screen.getByTestId('button-distribute-all');
      await user.click(distributeButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/gold/distribute-all', {});
      });
    });

    it('should handle distribute with party loot', async () => {
      const user = userEvent.setup();
      
      const distributePartyButton = screen.getByTestId('button-distribute-+-party-loot');
      await user.click(distributePartyButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/gold/distribute-plus-party-loot', {});
      });
    });

    it('should show DM-only balance button for DM users', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/auth/status') {
          return Promise.resolve({ data: { user: { role: 'DM' } } });
        }
        return Promise.resolve({ data: mockGoldEntries });
      });

      await act(async () => {
        render(<GoldTransactions />);
      });

      const managementTab = screen.getByTestId('tab-management');
      await userEvent.click(managementTab);

      await waitFor(() => {
        expect(screen.getByTestId('button-balance-currencies')).toBeInTheDocument();
      });
    });

    it('should handle balance currencies for DM', async () => {
      const user = userEvent.setup();
      api.get.mockImplementation((url) => {
        if (url === '/auth/status') {
          return Promise.resolve({ data: { user: { role: 'DM' } } });
        }
        return Promise.resolve({ data: mockGoldEntries });
      });

      await act(async () => {
        render(<GoldTransactions />);
      });

      const managementTab = screen.getByTestId('tab-management');
      await userEvent.click(managementTab);

      await waitFor(() => {
        expect(screen.getByTestId('button-balance-currencies')).toBeInTheDocument();
      });

      const balanceButton = screen.getByTestId('button-balance-currencies');
      await user.click(balanceButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/gold/balance', {});
      });
    });

    it('should show success message after operations', async () => {
      const user = userEvent.setup();
      
      const distributeButton = screen.getByTestId('button-distribute-all');
      await user.click(distributeButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-success')).toHaveTextContent('Gold distributed successfully!');
      });
    });

    it('should handle operation errors', async () => {
      const user = userEvent.setup();
      api.post.mockRejectedValue(new Error('Distribution failed'));
      
      const distributeButton = screen.getByTestId('button-distribute-all');
      await user.click(distributeButton);

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Failed to distribute gold.');
      });
    });
  });

  describe('Character Ledger', () => {
    beforeEach(async () => {
      await act(async () => {
        render(<GoldTransactions />);
      });

      // Switch to Character Ledger tab
      const ledgerTab = screen.getByTestId('tab-character-ledger');
      await userEvent.click(ledgerTab);
    });

    it('should render ledger description', () => {
      expect(screen.getByText('Character Loot Ledger')).toBeInTheDocument();
      expect(screen.getByText(/This table shows the value of items kept by each character/)).toBeInTheDocument();
    });

    it('should render ledger table headers', () => {
      expect(screen.getByText('Character')).toBeInTheDocument();
      expect(screen.getByText('Value of Loot')).toBeInTheDocument();
      expect(screen.getByText('Payments')).toBeInTheDocument();
      expect(screen.getByText('Balance')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    it('should display character data in ledger', async () => {
      await waitFor(() => {
        expect(screen.getByText('Alice (Active)')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByText('1500.00')).toBeInTheDocument();
        expect(screen.getByText('1200.00')).toBeInTheDocument();
        expect(screen.getByText('300.00')).toBeInTheDocument(); // Alice's balance
        expect(screen.getByText('-100.00')).toBeInTheDocument(); // Bob's balance (overpaid)
      });
    });

    it('should show character status correctly', async () => {
      await waitFor(() => {
        expect(screen.getByText('Underpaid')).toBeInTheDocument(); // Alice
        expect(screen.getByText('Overpaid')).toBeInTheDocument(); // Bob
      });
    });

    it('should show loading spinner while fetching ledger data', () => {
      lootService.getCharacterLedger.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ data: mockLedgerData }), 100))
      );

      act(() => {
        render(<GoldTransactions />);
      });

      const ledgerTab = screen.getByTestId('tab-character-ledger');
      userEvent.click(ledgerTab);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should handle empty ledger data', async () => {
      lootService.getCharacterLedger.mockResolvedValue({
        data: { characters: [] }
      });

      await act(async () => {
        render(<GoldTransactions />);
      });

      const ledgerTab = screen.getByTestId('tab-character-ledger');
      await userEvent.click(ledgerTab);

      await waitFor(() => {
        expect(screen.getByText('No ledger data available')).toBeInTheDocument();
      });
    });

    it('should handle ledger refresh', async () => {
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByTestId('button-refresh-ledger-data')).toBeInTheDocument();
      });

      const refreshButton = screen.getByTestId('button-refresh-ledger-data');
      await user.click(refreshButton);

      await waitFor(() => {
        expect(lootService.getCharacterLedger).toHaveBeenCalledTimes(2); // Initial + refresh
      });
    });

    it('should handle ledger loading errors', async () => {
      lootService.getCharacterLedger.mockRejectedValue(new Error('Ledger fetch failed'));

      await act(async () => {
        render(<GoldTransactions />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Failed to load ledger data. Please try again later.');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle gold entries fetch errors', async () => {
      api.get.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(<GoldTransactions />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('alert-error')).toHaveTextContent('Failed to fetch gold entries.');
      });
    });

    it('should handle user role fetch errors gracefully', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/auth/status') {
          return Promise.reject(new Error('Auth error'));
        }
        return Promise.resolve({ data: mockGoldEntries });
      });

      await act(async () => {
        render(<GoldTransactions />);
      });

      // Should still render component despite auth error
      await waitFor(() => {
        expect(screen.getByTestId('container')).toBeInTheDocument();
      });
    });

    it('should handle malformed gold entries data', async () => {
      api.get.mockResolvedValue({ data: null });

      await act(async () => {
        render(<GoldTransactions />);
      });

      // Should handle null data gracefully
      await waitFor(() => {
        expect(screen.getByText('0.00 GP')).toBeInTheDocument();
      });
    });

    it('should handle invalid ledger data format', async () => {
      lootService.getCharacterLedger.mockResolvedValue({
        data: { invalid: 'format' }
      });

      await act(async () => {
        render(<GoldTransactions />);
      });

      const ledgerTab = screen.getByTestId('tab-character-ledger');
      await userEvent.click(ledgerTab);

      await waitFor(() => {
        expect(screen.getByText('No ledger data available')).toBeInTheDocument();
      });
    });
  });

  describe('Date Formatting and Calculations', () => {
    beforeEach(async () => {
      await act(async () => {
        render(<GoldTransactions />);
      });
    });

    it('should format dates correctly in transaction history', async () => {
      const historyTab = screen.getByTestId('tab-transaction-history');
      await userEvent.click(historyTab);

      await waitFor(() => {
        // Should format dates as readable strings
        expect(screen.getByText(/January 15, 2024/)).toBeInTheDocument();
        expect(screen.getByText(/January 14, 2024/)).toBeInTheDocument();
      });
    });

    it('should calculate totals with correct currency conversion', async () => {
      await waitFor(() => {
        // Verify the calculation: 5pp + 120gp + 50sp + 25cp = 50 + 120 + 5 + 0.25 = 175.25gp
        expect(screen.getByText('175.25 GP')).toBeInTheDocument();
      });
    });

    it('should handle negative balances in ledger', async () => {
      const ledgerTab = screen.getByTestId('tab-character-ledger');
      await userEvent.click(ledgerTab);

      await waitFor(() => {
        // Bob has 800 loot value - 900 payments = -100
        expect(screen.getByText('-100.00')).toBeInTheDocument();
      });
    });
  });
});