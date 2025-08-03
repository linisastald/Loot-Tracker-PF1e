/**
 * Component tests for Login page
 */

import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import Login from '../Login';
import { renderWithProviders, getUserEvent, mockApiResponses, mockApiErrors } from '../../../utils/testUtils';
import api from '../../../utils/api';

// Mock dependencies
jest.mock('../../../utils/api');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

describe.skip('Login Component', () => {
  const mockNavigate = jest.fn();
  const mockOnLogin = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useNavigate.mockReturnValue(mockNavigate);
    
    // Clear localStorage
    localStorage.clear();
  });

  const renderLogin = (props = {}) => {
    return renderWithProviders(
      <Login onLogin={mockOnLogin} {...props} />
    );
  };

  describe('Rendering', () => {
    it('should render login form with all required elements', () => {
      renderLogin();
      
      expect(screen.getByRole('heading', { name: /pathfinder loot tracker/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /login/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
      expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
      expect(screen.getByText(/register here/i)).toBeInTheDocument();
    });

    it('should have username field focused by default', () => {
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      expect(usernameField).toHaveFocus();
    });

    it('should render password field as hidden by default', () => {
      renderLogin();
      
      const passwordField = screen.getByLabelText(/password/i);
      expect(passwordField).toHaveAttribute('type', 'password');
    });
  });

  describe('Form Interactions', () => {
    it('should update username when typing', async () => {
      const user = await getUserEvent();
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      await user.type(usernameField, 'testuser');
      
      expect(usernameField).toHaveValue('testuser');
    });

    it('should update password when typing', async () => {
      const user = await getUserEvent();
      renderLogin();
      
      const passwordField = screen.getByLabelText(/password/i);
      await user.type(passwordField, 'password123');
      
      expect(passwordField).toHaveValue('password123');
    });

    it('should toggle password visibility when eye icon is clicked', async () => {
      const user = await getUserEvent();
      renderLogin();
      
      const passwordField = screen.getByLabelText(/password/i);
      const toggleButton = screen.getByLabelText(/show password/i);
      
      // Initially hidden
      expect(passwordField).toHaveAttribute('type', 'password');
      
      // Click to show
      await user.click(toggleButton);
      expect(passwordField).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText(/hide password/i)).toBeInTheDocument();
      
      // Click to hide again
      await user.click(screen.getByLabelText(/hide password/i));
      expect(passwordField).toHaveAttribute('type', 'password');
    });

    it('should submit form when Enter key is pressed in username field', async () => {
      const user = await getUserEvent();
      api.post.mockResolvedValue(mockApiResponses.login);
      
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      
      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'password123');
      await user.type(usernameField, '{enter}');
      
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/auth/login', {
          username: 'testuser',
          password: 'password123'
        });
      });
    });

    it('should submit form when Enter key is pressed in password field', async () => {
      const user = await getUserEvent();
      api.post.mockResolvedValue(mockApiResponses.login);
      
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      
      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'password123{enter}');
      
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/auth/login', {
          username: 'testuser',
          password: 'password123'
        });
      });
    });
  });

  describe('Form Validation', () => {
    it('should show error when username is empty', async () => {
      const user = await getUserEvent();
      renderLogin();
      
      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);
      
      expect(screen.getByText(/username and password are required/i)).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('should show error when password is empty', async () => {
      const user = await getUserEvent();
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      const loginButton = screen.getByRole('button', { name: /login/i });
      
      await user.type(usernameField, 'testuser');
      await user.click(loginButton);
      
      expect(screen.getByText(/username and password are required/i)).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('should show error when both fields are empty', async () => {
      const user = await getUserEvent();
      renderLogin();
      
      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);
      
      expect(screen.getByText(/username and password are required/i)).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('should mark fields as error when validation fails', async () => {
      const user = await getUserEvent();
      renderLogin();
      
      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      
      expect(usernameField).toHaveAttribute('aria-invalid', 'true');
      expect(passwordField).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Successful Login', () => {
    it('should call API with correct credentials', async () => {
      const user = await getUserEvent();
      api.post.mockResolvedValue(mockApiResponses.login);
      
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      const loginButton = screen.getByRole('button', { name: /login/i });
      
      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'password123');
      await user.click(loginButton);
      
      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        username: 'testuser',
        password: 'password123'
      });
    });

    it('should store user data in localStorage', async () => {
      const user = await getUserEvent();
      api.post.mockResolvedValue(mockApiResponses.login);
      
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      const loginButton = screen.getByRole('button', { name: /login/i });
      
      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'password123');
      await user.click(loginButton);
      
      await waitFor(() => {
        const storedUser = localStorage.getItem('user');
        expect(storedUser).toBeTruthy();
        expect(JSON.parse(storedUser)).toEqual(mockApiResponses.login.data.user);
      });
    });

    it('should call onLogin callback with user data', async () => {
      const user = await getUserEvent();
      api.post.mockResolvedValue(mockApiResponses.login);
      
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      const loginButton = screen.getByRole('button', { name: /login/i });
      
      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'password123');
      await user.click(loginButton);
      
      await waitFor(() => {
        expect(mockOnLogin).toHaveBeenCalledWith(mockApiResponses.login.data.user);
      });
    });

    it('should navigate to loot-entry page', async () => {
      const user = await getUserEvent();
      api.post.mockResolvedValue(mockApiResponses.login);
      
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      const loginButton = screen.getByRole('button', { name: /login/i });
      
      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'password123');
      await user.click(loginButton);
      
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/loot-entry');
      });
    });

    it('should work without onLogin callback', async () => {
      const user = await getUserEvent();
      api.post.mockResolvedValue(mockApiResponses.login);
      
      renderWithProviders(<Login />);
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      const loginButton = screen.getByRole('button', { name: /login/i });
      
      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'password123');
      await user.click(loginButton);
      
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/loot-entry');
      });
    });
  });

  describe('Login Errors', () => {
    it('should display API error message', async () => {
      const user = await getUserEvent();
      api.post.mockRejectedValue(mockApiErrors.unauthorized);
      
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      const loginButton = screen.getByRole('button', { name: /login/i });
      
      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'wrongpassword');
      await user.click(loginButton);
      
      await waitFor(() => {
        expect(screen.getByText(/unauthorized access/i)).toBeInTheDocument();
      });
    });

    it('should display default error message when API error has no message', async () => {
      const user = await getUserEvent();
      const errorWithoutMessage = {
        response: {
          status: 500,
          data: {}
        }
      };
      api.post.mockRejectedValue(errorWithoutMessage);
      
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      const loginButton = screen.getByRole('button', { name: /login/i });
      
      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'password123');
      await user.click(loginButton);
      
      await waitFor(() => {
        expect(screen.getByText(/login failed\. please check your credentials/i)).toBeInTheDocument();
      });
    });

    it('should mark fields as error when login fails', async () => {
      const user = await getUserEvent();
      api.post.mockRejectedValue(mockApiErrors.unauthorized);
      
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      const loginButton = screen.getByRole('button', { name: /login/i });
      
      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'wrongpassword');
      await user.click(loginButton);
      
      await waitFor(() => {
        expect(usernameField).toHaveAttribute('aria-invalid', 'true');
        expect(passwordField).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('should handle network errors gracefully', async () => {
      const user = await getUserEvent();
      api.post.mockRejectedValue(new Error('Network Error'));
      
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      const loginButton = screen.getByRole('button', { name: /login/i });
      
      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'password123');
      await user.click(loginButton);
      
      await waitFor(() => {
        expect(screen.getByText(/login failed\. please check your credentials/i)).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to register page when register link is clicked', async () => {
      const user = await getUserEvent();
      renderLogin();
      
      const registerLink = screen.getByText(/register here/i);
      await user.click(registerLink);
      
      expect(mockNavigate).toHaveBeenCalledWith('/register');
    });

    it('should navigate to forgot password page when forgot password link is clicked', async () => {
      const user = await getUserEvent();
      renderLogin();
      
      const forgotPasswordLink = screen.getByText(/forgot password/i);
      await user.click(forgotPasswordLink);
      
      expect(mockNavigate).toHaveBeenCalledWith('/forgot-password');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      renderLogin();
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      
      expect(usernameField).toHaveAttribute('required');
      expect(passwordField).toHaveAttribute('required');
    });

    it('should associate error message with form fields', async () => {
      const user = await getUserEvent();
      renderLogin();
      
      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);
      
      const usernameField = screen.getByLabelText(/username/i);
      const passwordField = screen.getByLabelText(/password/i);
      const errorMessage = screen.getByRole('alert');
      
      expect(usernameField).toHaveAttribute('aria-describedby', 'login-error');
      expect(passwordField).toHaveAttribute('aria-describedby', 'login-error');
      expect(errorMessage).toHaveAttribute('id', 'login-error');
    });

    it('should have proper button labels for password toggle', () => {
      renderLogin();
      
      const showPasswordButton = screen.getByLabelText(/show password/i);
      expect(showPasswordButton).toBeInTheDocument();
    });
  });
});