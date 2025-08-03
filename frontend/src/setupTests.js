/**
 * Global test setup for frontend tests
 * This file runs before all tests and sets up the test environment
 */

import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// Mock Material-UI styled function and components to avoid React 19 compatibility issues
jest.mock('@mui/material/styles', () => ({
  ThemeProvider: ({ children }) => children,
  createTheme: () => ({}),
  useTheme: () => ({}),
  styled: (component) => (styles) => component,
}));

jest.mock('@mui/system', () => ({
  styled: (component) => (styles) => component,
  Box: ({ children, ...props }) => require('react').createElement('div', props, children),
}));

jest.mock('@mui/material/CssBaseline', () => {
  return function MockCssBaseline() {
    return null;
  };
});

// Mock common Material-UI components
jest.mock('@mui/material', () => {
  const React = require('react');
  
  const mockComponent = (name) => ({ children, ...props }) => 
    React.createElement('div', { 'data-testid': name.toLowerCase(), ...props }, children);

  return {
    Box: mockComponent('Box'),
    Button: ({ children, onClick, type, ...props }) => {
      const React = require('react');
      return React.createElement('button', {
        'data-testid': 'button',
        onClick: onClick,
        type: type || 'button',
        ...props
      }, children);
    },
    Container: mockComponent('Container'),
    IconButton: ({ children, onClick, 'aria-label': ariaLabel, ...props }) => {
      const React = require('react');
      return React.createElement('button', {
        'data-testid': 'iconbutton',
        onClick: onClick,
        'aria-label': ariaLabel,
        ...props
      }, children);
    },
    InputAdornment: mockComponent('InputAdornment'),
    Link: mockComponent('Link'),
    Paper: mockComponent('Paper'),
    TextField: ({ children, label, type, value, onChange, ...props }) => {
      const React = require('react');
      return React.createElement('input', {
        'data-testid': 'textfield',
        'aria-label': label,
        type: type || 'text',
        value: value || '',
        onChange: onChange,
        required: props.required,
        'aria-invalid': props.error ? 'true' : 'false',
        'aria-describedby': props.error ? 'login-error' : undefined,
        ...props
      });
    },
    Typography: mockComponent('Typography'),
    Grid: mockComponent('Grid'),
    Alert: mockComponent('Alert'),
    CircularProgress: mockComponent('CircularProgress'),
    Chip: mockComponent('Chip'),
    FormControl: mockComponent('FormControl'),
    InputLabel: mockComponent('InputLabel'),
    Select: mockComponent('Select'),
    MenuItem: mockComponent('MenuItem'),
    Dialog: mockComponent('Dialog'),
    DialogTitle: mockComponent('DialogTitle'),
    DialogContent: mockComponent('DialogContent'),
    DialogActions: mockComponent('DialogActions'),
    Table: mockComponent('Table'),
    TableBody: mockComponent('TableBody'),
    TableCell: mockComponent('TableCell'),
    TableContainer: mockComponent('TableContainer'),
    TableHead: mockComponent('TableHead'),
    TableRow: mockComponent('TableRow'),
    Tabs: mockComponent('Tabs'),
    Tab: mockComponent('Tab'),
    Card: mockComponent('Card'),
    CardContent: mockComponent('CardContent'),
    CardHeader: mockComponent('CardHeader'),
    Autocomplete: mockComponent('Autocomplete'),
    TablePagination: mockComponent('TablePagination'),
  };
});

// Mock Material-UI icons
jest.mock('@mui/icons-material', () => {
  const React = require('react');
  
  const mockIcon = (name) => (props) => 
    React.createElement('div', { 'data-testid': `${name.toLowerCase()}-icon`, ...props });

  return {
    Visibility: mockIcon('Visibility'),
    VisibilityOff: mockIcon('VisibilityOff'),
    Add: mockIcon('Add'),
    Edit: mockIcon('Edit'),
    Delete: mockIcon('Delete'),
    Person: mockIcon('Person'),
    DirectionsBoat: mockIcon('DirectionsBoat'),
    Home: mockIcon('Home'),
    LocationOn: mockIcon('LocationOn'),
    Warning: mockIcon('Warning'),
    MoveUp: mockIcon('MoveUp'),
    Group: mockIcon('Group'),
  };
});

// Mock the theme module
jest.mock('./theme', () => ({
  palette: {
    mode: 'dark',
    primary: { main: '#1976d2' },
  },
  typography: { fontFamily: 'Roboto' },
  spacing: (factor) => `${8 * factor}px`,
}));

// Mock the ConfigContext
jest.mock('./contexts/ConfigContext', () => {
  const React = require('react');
  const mockContext = {
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
  
  return {
    default: React.createContext(mockContext),
    ConfigProvider: ({ children }) => children,
  };
});

// Configure Testing Library
configure({
  testIdAttribute: 'data-testid',
  // Set a longer timeout for async operations
  asyncUtilTimeout: 5000,
});

// Mock environment variables
process.env.REACT_APP_API_URL = 'http://localhost:5000/api';

// Global test utilities
global.testUtils = {
  // Mock user data for tests
  mockUser: {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    role: 'player',
  },

  // Mock character data
  mockCharacter: {
    id: 1,
    name: 'Test Character',
    class: 'Fighter',
    level: 5,
    user_id: 1,
  },

  // Mock loot item data
  mockLootItem: {
    id: 1,
    name: 'Magic Sword',
    description: 'A shiny magic sword',
    value: 1000,
    quantity: 1,
    identified: true,
    character_id: 1,
  },

  // Mock API responses
  mockApiResponse: (data, status = 200) => ({
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {},
  }),

  // Mock JWT token
  mockToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbGUiOiJwbGF5ZXIiLCJpYXQiOjE2MzkwNzA0MDAsImV4cCI6MTY3MDYwNjQwMH0.mockToken',

  // Wait for element to be removed (useful for loading states)
  waitForElementToBeRemoved: async (element, options = {}) => {
    const { waitForElementToBeRemoved } = await import('@testing-library/react');
    return waitForElementToBeRemoved(element, { timeout: 3000, ...options });
  },
};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(global, 'sessionStorage', {
  value: sessionStorageMock,  
  writable: true,
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  value: jest.fn(),
  writable: true,
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Suppress console.error for expected test errors
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Clear all mocks before each test
beforeEach(() => {
  // Clear localStorage and sessionStorage mocks
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
  
  sessionStorageMock.getItem.mockClear();
  sessionStorageMock.setItem.mockClear();
  sessionStorageMock.removeItem.mockClear();
  sessionStorageMock.clear.mockClear();
});