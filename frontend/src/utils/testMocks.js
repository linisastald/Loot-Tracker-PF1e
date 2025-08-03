/**
 * Test mocks for external dependencies
 */

import React from 'react';

// Mock Material-UI theme
export const mockTheme = {
  palette: {
    mode: 'dark',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    error: {
      main: '#f44336',
    },
    warning: {
      main: '#ff9800',
    },
    info: {
      main: '#2196f3',
    },
    success: {
      main: '#4caf50',
    },
  },
  typography: {
    fontFamily: 'Roboto, Arial, sans-serif',
  },
  spacing: (factor) => `${8 * factor}px`,
  breakpoints: {
    up: () => '@media (min-width:0px)',
    down: () => '@media (max-width:9999px)',
  },
};

// Mock ThemeProvider
export const MockThemeProvider = ({ children }) => {
  return React.createElement('div', { 'data-testid': 'theme-provider' }, children);
};

// Mock CssBaseline
export const MockCssBaseline = () => {
  return React.createElement('div', { 'data-testid': 'css-baseline' });
};

// Mock ConfigContext
export const mockConfigContext = {
  config: {
    apiUrl: 'http://localhost:5000/api',
    features: {
      weatherSystem: true,
      calendar: true,
      ships: true,
      crew: true,
    },
  },
  loading: false,
};

export const MockConfigProvider = ({ children, value = mockConfigContext }) => {
  return React.createElement('div', { 'data-testid': 'config-provider' }, children);
};

// Mock Material-UI components that might cause issues
export const mockMuiComponents = () => {
  // Mock components that are known to have issues with React 19
  jest.mock('@mui/material/styles', () => ({
    ThemeProvider: MockThemeProvider,
    createTheme: () => mockTheme,
    useTheme: () => mockTheme,
  }));

  jest.mock('@mui/material/CssBaseline', () => {
    return MockCssBaseline;
  });
};

// Setup mock for all Material-UI imports
export const setupMaterialUiMocks = () => {
  // Mock the theme module
  jest.mock('../theme', () => mockTheme);
  
  // Mock the context module
  jest.mock('../contexts/ConfigContext', () => ({
    default: React.createContext(mockConfigContext),
    ConfigProvider: MockConfigProvider,
  }));
  
  mockMuiComponents();
};