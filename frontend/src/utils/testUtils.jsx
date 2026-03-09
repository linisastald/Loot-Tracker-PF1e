/**
 * Frontend test utilities
 * Shared utilities for React component testing with Vitest
 */

import React from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';

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
        {children}
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
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
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
 * Helper to create mock props for components
 */
export const createMockProps = (overrides = {}) => {
  return {
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onChange: vi.fn(),
    onClick: vi.fn(),
    onDelete: vi.fn(),
    onEdit: vi.fn(),
    ...overrides,
  };
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
