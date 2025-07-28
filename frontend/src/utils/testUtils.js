/**
 * Frontend test utilities
 * Shared utilities for React component testing
 */

import React from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from '../theme';
import ConfigContext from '../contexts/ConfigContext';

// Default config for testing
const defaultTestConfig = {
  apiUrl: 'http://localhost:5000/api',
  features: {
    weatherSystem: true,
    calendar: true,
    ships: true,
    crew: true,
  },
};

/**
 * Custom render function that includes all necessary providers
 */
export const renderWithProviders = (
  ui,
  {
    initialEntries = ['/'],
    config = defaultTestConfig,
    ...renderOptions
  } = {}
) => {
  function Wrapper({ children }) {
    return (
      <BrowserRouter>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <ConfigContext.Provider value={{ config, loading: false }}>
            {children}
          </ConfigContext.Provider>
        </ThemeProvider>
      </BrowserRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

/**
 * Mock authenticated user context
 */
export const mockAuthenticatedUser = {
  user: {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    role: 'player',
  },
  token: 'mock-jwt-token',
  isAuthenticated: true,
};

/**
 * Mock API service for testing
 */
export const createMockApiService = () => {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  };
};

/**
 * Mock form data for testing forms
 */
export const mockFormData = {
  lootEntry: {
    name: 'Test Item',
    description: 'A test item description',
    value: 100,
    quantity: 1,
    identified: true,
  },
  character: {
    name: 'Test Character',
    class: 'Fighter',
    level: 5,
  },
  user: {
    username: 'testuser',
    email: 'test@example.com',
    password: 'testpassword123',
    confirmPassword: 'testpassword123',
  },
};

/**
 * Mock Material-UI components that might cause issues in tests
 */
export const mockMuiComponents = () => {
  // Mock Material-UI DatePicker if needed
  jest.mock('@mui/x-date-pickers/DatePicker', () => {
    return function MockDatePicker({ value, onChange, ...props }) {
      return (
        <input
          type="date"
          value={value ? value.toISOString().split('T')[0] : ''}
          onChange={(e) => onChange && onChange(new Date(e.target.value))}
          data-testid="date-picker"
          {...props}
        />
      );
    };
  });
};

/**
 * Helper to wait for async operations
 */
export const waitFor = async (callback, timeout = 3000) => {
  const { waitFor } = await import('@testing-library/react');
  return waitFor(callback, { timeout });
};

/**
 * Helper to fire events
 */
export const fireEvent = {
  async click(element) {
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(element);
  },
  
  async change(element, value) {
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(element, { target: { value } });
  },
  
  async submit(element) {
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.submit(element);
  },
};

/**
 * Helper to get user event utilities
 */
export const getUserEvent = () => {
  const userEvent = require('@testing-library/user-event');
  return userEvent.default ? userEvent.default.setup() : userEvent.setup();
};

/**
 * Mock successful API responses
 */
export const mockApiResponses = {
  login: {
    data: {
      success: true,
      message: 'Login successful',
      user: mockAuthenticatedUser.user,
      token: mockAuthenticatedUser.token,
    },
  },
  
  getLoot: {
    data: {
      success: true,
      data: [
        {
          id: 1,
          name: 'Magic Sword',
          description: 'A shiny magic sword',
          value: 1000,
          quantity: 1,
          identified: true,
        },
        {
          id: 2,
          name: 'Healing Potion',
          description: 'Restores health',
          value: 50,
          quantity: 3,
          identified: true,
        },
      ],
    },
  },
  
  getCharacters: {
    data: {
      success: true,
      data: [
        {
          id: 1,
          name: 'Fighter Bob',
          class: 'Fighter',
          level: 5,
        },
        {
          id: 2,
          name: 'Wizard Alice',
          class: 'Wizard',
          level: 3,
        },
      ],
    },
  },
};

/**
 * Mock error API responses
 */
export const mockApiErrors = {
  unauthorized: {
    response: {
      status: 401,
      data: {
        success: false,
        message: 'Unauthorized access',
      },
    },
  },
  
  validation: {
    response: {
      status: 400,
      data: {
        success: false,
        message: 'Validation failed',
        errors: [
          { field: 'name', message: 'Name is required' },
        ],
      },
    },
  },
  
  serverError: {
    response: {
      status: 500,
      data: {
        success: false,
        message: 'Internal server error',
      },
    },
  },
};

/**
 * Helper to create mock props for components
 */
export const createMockProps = (overrides = {}) => {
  return {
    onSubmit: jest.fn(),
    onCancel: jest.fn(),
    onChange: jest.fn(),
    onClick: jest.fn(),
    onDelete: jest.fn(),
    onEdit: jest.fn(),
    ...overrides,
  };
};

/**
 * Helper to assert component rendering
 */
export const expectComponentToRender = (component) => {
  expect(component).toBeInTheDocument();
};

/**
 * Helper to assert loading states
 */
export const expectLoadingState = (component) => {
  const loadingElement = component.getByTestId('loading') || 
                        component.getByText(/loading/i) ||
                        component.querySelector('[role="progressbar"]');
  expect(loadingElement).toBeInTheDocument();
};

/**
 * Helper to assert error states
 */
export const expectErrorState = (component, errorMessage) => {
  const errorElement = component.getByTestId('error') ||
                      component.getByText(errorMessage) ||
                      component.getByRole('alert');
  expect(errorElement).toBeInTheDocument();
};