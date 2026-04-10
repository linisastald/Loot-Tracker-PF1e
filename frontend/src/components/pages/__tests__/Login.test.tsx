import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import Login from '../Login';

// Mock the api utility
vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import api from '../../../utils/api';

const renderLogin = (props = {}) => {
  const defaultProps = {
    onLogin: vi.fn(),
  };
  return render(
    <BrowserRouter>
      <Login {...defaultProps} {...props} />
    </BrowserRouter>
  );
};

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form with username and password fields', () => {
    renderLogin();

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^login$/i })).toBeInTheDocument();
  });

  it('renders the page title and heading', () => {
    renderLogin();

    expect(screen.getByText('Pathfinder Loot Tracker')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('renders forgot password and register links', () => {
    renderLogin();

    expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
    expect(screen.getByText(/register here/i)).toBeInTheDocument();
  });

  it('shows error when submitting with empty fields', async () => {
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Username and password are required');
    });
  });

  it('shows error when submitting with only username', async () => {
    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Username and password are required');
    });
  });

  it('calls API and onLogin on successful login', async () => {
    const onLogin = vi.fn();
    const mockUser = { id: 1, username: 'testuser', role: 'player' };
    (api.post as any).mockResolvedValueOnce({
      data: { user: mockUser },
    });

    renderLogin({ onLogin });

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        username: 'testuser',
        password: 'password123',
      });
      expect(onLogin).toHaveBeenCalledWith(mockUser);
      expect(mockNavigate).toHaveBeenCalledWith('/loot-entry');
    });
  });

  it('shows error message on failed login', async () => {
    (api.post as any).mockRejectedValueOnce({
      response: {
        data: { error: 'Invalid credentials' },
      },
    });

    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'baduser' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'badpass' } });
    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
    });
  });

  it('shows generic error when API fails without response data', async () => {
    (api.post as any).mockRejectedValueOnce(new Error('Network Error'));

    renderLogin();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'user' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Login failed. Please check your credentials.');
    });
  });

  it('toggles password visibility', () => {
    renderLogin();

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleButton = screen.getByRole('button', { name: /show password/i });
    fireEvent.click(toggleButton);

    expect(passwordInput).toHaveAttribute('type', 'text');
  });

  it('submits on Enter key press', async () => {
    const onLogin = vi.fn();
    const mockUser = { id: 1, username: 'testuser', role: 'player' };
    (api.post as any).mockResolvedValueOnce({
      data: { user: mockUser },
    });

    renderLogin({ onLogin });

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    const passwordField = screen.getByLabelText(/password/i);
    fireEvent.change(passwordField, { target: { value: 'password123' } });
    fireEvent.keyDown(passwordField, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        username: 'testuser',
        password: 'password123',
      });
    });
  });
});
