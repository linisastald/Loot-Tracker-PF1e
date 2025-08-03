/**
 * Tests for UserSettings.js - User Profile Settings Component
 * Tests user profile management, password changes, email updates, and character settings
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import UserSettings from '../../../frontend/src/components/pages/UserSettings';
import api from '../../../frontend/src/utils/api';

// Mock the API
jest.mock('../../../frontend/src/utils/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn()
}));

// Mock the CharacterTab component
jest.mock('../../../frontend/src/components/pages/UserSettings/CharacterTab', () => {
  return function MockCharacterTab({ user, onUserUpdate }) {
    return (
      <div data-testid="character-tab">
        <p>Character Tab Component</p>
        <button onClick={() => onUserUpdate && onUserUpdate({ id: 1, username: 'updated' })}>
          Update User
        </button>
      </div>
    );
  };
});

describe('UserSettings', () => {
  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    role: 'Player'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default successful API responses
    api.get.mockResolvedValue({
      data: {
        success: true,
        data: mockUser
      }
    });

    api.post.mockResolvedValue({
      data: {
        success: true,
        message: 'Password changed successfully'
      }
    });

    api.put.mockResolvedValue({
      data: {
        success: true,
        message: 'Email changed successfully'
      }
    });
  });

  describe('Component Rendering', () => {
    it('should render user settings interface', async () => {
      render(<UserSettings />);

      expect(screen.getByText('User Settings')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.getByText('Account Settings')).toBeInTheDocument();
        expect(screen.getByText('Character Settings')).toBeInTheDocument();
      });
    });

    it('should render tabs correctly', async () => {
      render(<UserSettings />);

      const accountTab = screen.getByRole('tab', { name: /account settings/i });
      const characterTab = screen.getByRole('tab', { name: /character settings/i });

      expect(accountTab).toBeInTheDocument();
      expect(characterTab).toBeInTheDocument();
      expect(accountTab).toHaveAttribute('aria-selected', 'true');
    });

    it('should display user information after loading', async () => {
      render(<UserSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
        expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
      });
    });

    it('should handle loading state', () => {
      api.get.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<UserSettings />);

      expect(screen.getByText('User Settings')).toBeInTheDocument();
      // User data should not be loaded yet
      expect(screen.queryByDisplayValue('testuser')).not.toBeInTheDocument();
    });
  });

  describe('Data Loading', () => {
    it('should fetch user data on mount', async () => {
      render(<UserSettings />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/users/me');
      });
    });

    it('should handle API errors during user data loading', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      api.get.mockRejectedValue(new Error('Failed to load user'));

      render(<UserSettings />);

      await waitFor(() => {
        expect(screen.getByText(/error.*loading.*user/i)).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });

    it('should handle malformed user data', async () => {
      api.get.mockResolvedValue({ data: null });

      render(<UserSettings />);

      // Should not crash and handle gracefully
      await waitFor(() => {
        expect(screen.getByText('User Settings')).toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('should switch between tabs', async () => {
      render(<UserSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });

      // Should start on Account Settings tab
      expect(screen.getByText('Change Password')).toBeInTheDocument();

      // Switch to Character Settings tab
      const characterTab = screen.getByRole('tab', { name: /character settings/i });
      fireEvent.click(characterTab);

      await waitFor(() => {
        expect(screen.getByTestId('character-tab')).toBeInTheDocument();
        expect(screen.getByText('Character Tab Component')).toBeInTheDocument();
      });

      // Switch back to Account Settings
      const accountTab = screen.getByRole('tab', { name: /account settings/i });
      fireEvent.click(accountTab);

      await waitFor(() => {
        expect(screen.getByText('Change Password')).toBeInTheDocument();
      });
    });

    it('should maintain tab state correctly', async () => {
      render(<UserSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });

      const characterTab = screen.getByRole('tab', { name: /character settings/i });
      fireEvent.click(characterTab);

      expect(characterTab).toHaveAttribute('aria-selected', 'true');

      const accountTab = screen.getByRole('tab', { name: /account settings/i });
      expect(accountTab).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('Password Change', () => {
    beforeEach(async () => {
      render(<UserSettings />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });
    });

    it('should render password change form', () => {
      expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
    });

    it('should handle password input changes', async () => {
      const user = userEvent.setup();

      const currentPasswordInput = screen.getByLabelText(/current password/i);
      const newPasswordInput = screen.getByLabelText(/new password/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

      await user.type(currentPasswordInput, 'oldpass123');
      await user.type(newPasswordInput, 'newpass456');
      await user.type(confirmPasswordInput, 'newpass456');

      expect(currentPasswordInput).toHaveValue('oldpass123');
      expect(newPasswordInput).toHaveValue('newpass456');
      expect(confirmPasswordInput).toHaveValue('newpass456');
    });

    it('should show/hide password visibility', async () => {
      const user = userEvent.setup();

      // All password fields should be type="password" initially
      const currentPasswordInput = screen.getByLabelText(/current password/i);
      const newPasswordInput = screen.getByLabelText(/new password/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

      expect(currentPasswordInput).toHaveAttribute('type', 'password');
      expect(newPasswordInput).toHaveAttribute('type', 'password');
      expect(confirmPasswordInput).toHaveAttribute('type', 'password');

      // Click visibility toggles
      const visibilityButtons = screen.getAllByRole('button', { name: /toggle password visibility/i });
      
      await user.click(visibilityButtons[0]); // Current password toggle
      expect(currentPasswordInput).toHaveAttribute('type', 'text');

      await user.click(visibilityButtons[1]); // New password toggle
      expect(newPasswordInput).toHaveAttribute('type', 'text');

      await user.click(visibilityButtons[2]); // Confirm password toggle
      expect(confirmPasswordInput).toHaveAttribute('type', 'text');
    });

    it('should validate password confirmation', async () => {
      const user = userEvent.setup();

      const currentPasswordInput = screen.getByLabelText(/current password/i);
      const newPasswordInput = screen.getByLabelText(/new password/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const changePasswordButton = screen.getByRole('button', { name: /change password/i });

      await user.type(currentPasswordInput, 'oldpass123');
      await user.type(newPasswordInput, 'newpass456');
      await user.type(confirmPasswordInput, 'differentpass');

      await user.click(changePasswordButton);

      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });

      expect(api.post).not.toHaveBeenCalled();
    });

    it('should validate password length', async () => {
      const user = userEvent.setup();

      const currentPasswordInput = screen.getByLabelText(/current password/i);
      const newPasswordInput = screen.getByLabelText(/new password/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const changePasswordButton = screen.getByRole('button', { name: /change password/i });

      await user.type(currentPasswordInput, 'oldpass123');
      await user.type(newPasswordInput, 'short');
      await user.type(confirmPasswordInput, 'short');

      await user.click(changePasswordButton);

      await waitFor(() => {
        expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
      });

      expect(api.post).not.toHaveBeenCalled();
    });

    it('should submit password change successfully', async () => {
      const user = userEvent.setup();

      const currentPasswordInput = screen.getByLabelText(/current password/i);
      const newPasswordInput = screen.getByLabelText(/new password/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const changePasswordButton = screen.getByRole('button', { name: /change password/i });

      await user.type(currentPasswordInput, 'oldpass123');
      await user.type(newPasswordInput, 'newpass456');
      await user.type(confirmPasswordInput, 'newpass456');

      await user.click(changePasswordButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/users/change-password', {
          oldPassword: 'oldpass123',
          newPassword: 'newpass456'
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/password changed successfully/i)).toBeInTheDocument();
      });

      // Form should be cleared
      expect(currentPasswordInput).toHaveValue('');
      expect(newPasswordInput).toHaveValue('');
      expect(confirmPasswordInput).toHaveValue('');
    });

    it('should handle password change API errors', async () => {
      api.post.mockRejectedValue(new Error('Current password is incorrect'));

      const user = userEvent.setup();

      const currentPasswordInput = screen.getByLabelText(/current password/i);
      const newPasswordInput = screen.getByLabelText(/new password/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const changePasswordButton = screen.getByRole('button', { name: /change password/i });

      await user.type(currentPasswordInput, 'wrongpass');
      await user.type(newPasswordInput, 'newpass456');
      await user.type(confirmPasswordInput, 'newpass456');

      await user.click(changePasswordButton);

      await waitFor(() => {
        expect(screen.getByText(/current password is incorrect/i)).toBeInTheDocument();
      });
    });
  });

  describe('Email Change', () => {
    beforeEach(async () => {
      render(<UserSettings />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });
    });

    it('should render email change form', () => {
      expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
      expect(screen.getByLabelText(/new email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password.*email/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /change email/i })).toBeInTheDocument();
    });

    it('should handle email input changes', async () => {
      const user = userEvent.setup();

      const newEmailInput = screen.getByLabelText(/new email/i);
      const passwordInput = screen.getByLabelText(/password.*email/i);

      await user.type(newEmailInput, 'newemail@example.com');
      await user.type(passwordInput, 'mypassword');

      expect(newEmailInput).toHaveValue('newemail@example.com');
      expect(passwordInput).toHaveValue('mypassword');
    });

    it('should validate email format', async () => {
      const user = userEvent.setup();

      const newEmailInput = screen.getByLabelText(/new email/i);
      const passwordInput = screen.getByLabelText(/password.*email/i);
      const changeEmailButton = screen.getByRole('button', { name: /change email/i });

      await user.type(newEmailInput, 'invalid-email');
      await user.type(passwordInput, 'mypassword');

      await user.click(changeEmailButton);

      await waitFor(() => {
        expect(screen.getByText(/please enter a valid email/i)).toBeInTheDocument();
      });

      expect(api.put).not.toHaveBeenCalled();
    });

    it('should require password for email change', async () => {
      const user = userEvent.setup();

      const newEmailInput = screen.getByLabelText(/new email/i);
      const changeEmailButton = screen.getByRole('button', { name: /change email/i });

      await user.type(newEmailInput, 'newemail@example.com');

      await user.click(changeEmailButton);

      await waitFor(() => {
        expect(screen.getByText(/password is required/i)).toBeInTheDocument();
      });

      expect(api.put).not.toHaveBeenCalled();
    });

    it('should submit email change successfully', async () => {
      const user = userEvent.setup();

      const newEmailInput = screen.getByLabelText(/new email/i);
      const passwordInput = screen.getByLabelText(/password.*email/i);
      const changeEmailButton = screen.getByRole('button', { name: /change email/i });

      await user.type(newEmailInput, 'newemail@example.com');
      await user.type(passwordInput, 'mypassword');

      await user.click(changeEmailButton);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/users/change-email', {
          email: 'newemail@example.com',
          password: 'mypassword'
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/email changed successfully/i)).toBeInTheDocument();
      });

      // Form should be cleared
      expect(newEmailInput).toHaveValue('');
      expect(passwordInput).toHaveValue('');
    });

    it('should handle email change API errors', async () => {
      api.put.mockRejectedValue(new Error('Email already in use'));

      const user = userEvent.setup();

      const newEmailInput = screen.getByLabelText(/new email/i);
      const passwordInput = screen.getByLabelText(/password.*email/i);
      const changeEmailButton = screen.getByRole('button', { name: /change email/i });

      await user.type(newEmailInput, 'existing@example.com');
      await user.type(passwordInput, 'mypassword');

      await user.click(changeEmailButton);

      await waitFor(() => {
        expect(screen.getByText(/email already in use/i)).toBeInTheDocument();
      });
    });
  });

  describe('Character Tab Integration', () => {
    it('should pass user data to CharacterTab', async () => {
      render(<UserSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });

      // Switch to Character Settings tab
      const characterTab = screen.getByRole('tab', { name: /character settings/i });
      fireEvent.click(characterTab);

      await waitFor(() => {
        expect(screen.getByTestId('character-tab')).toBeInTheDocument();
      });
    });

    it('should handle user updates from CharacterTab', async () => {
      render(<UserSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });

      // Switch to Character Settings tab
      const characterTab = screen.getByRole('tab', { name: /character settings/i });
      fireEvent.click(characterTab);

      await waitFor(() => {
        expect(screen.getByTestId('character-tab')).toBeInTheDocument();
      });

      // Trigger user update from CharacterTab
      const updateButton = screen.getByText('Update User');
      fireEvent.click(updateButton);

      // Should update the user state (this would reflect in the username field when switching back)
      const accountTab = screen.getByRole('tab', { name: /account settings/i });
      fireEvent.click(accountTab);

      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should clear errors when switching tabs', async () => {
      render(<UserSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });

      // Trigger an error in password change
      const changePasswordButton = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(changePasswordButton);

      await waitFor(() => {
        expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
      });

      // Switch tabs should clear errors
      const characterTab = screen.getByRole('tab', { name: /character settings/i });
      fireEvent.click(characterTab);

      const accountTab = screen.getByRole('tab', { name: /account settings/i });
      fireEvent.click(accountTab);

      // Error should be cleared (this behavior depends on implementation)
      await waitFor(() => {
        expect(screen.queryByText(/password must be at least 8 characters/i)).not.toBeInTheDocument();
      });
    });

    it('should handle concurrent API calls gracefully', async () => {
      const user = userEvent.setup();
      render(<UserSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });

      // Trigger both password and email change simultaneously
      const currentPasswordInput = screen.getByLabelText(/current password/i);
      const newPasswordInput = screen.getByLabelText(/new password/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const changePasswordButton = screen.getByRole('button', { name: /change password/i });

      const newEmailInput = screen.getByLabelText(/new email/i);
      const emailPasswordInput = screen.getByLabelText(/password.*email/i);
      const changeEmailButton = screen.getByRole('button', { name: /change email/i });

      // Fill out both forms
      await user.type(currentPasswordInput, 'oldpass123');
      await user.type(newPasswordInput, 'newpass456');
      await user.type(confirmPasswordInput, 'newpass456');

      await user.type(newEmailInput, 'newemail@example.com');
      await user.type(emailPasswordInput, 'mypassword');

      // Click both buttons quickly
      await user.click(changePasswordButton);
      await user.click(changeEmailButton);

      // Both API calls should be made
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/users/change-password', expect.any(Object));
        expect(api.put).toHaveBeenCalledWith('/users/change-email', expect.any(Object));
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', async () => {
      render(<UserSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });

      // Check tab accessibility
      const tabList = screen.getByRole('tablist');
      expect(tabList).toBeInTheDocument();

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(2);

      tabs.forEach((tab, index) => {
        expect(tab).toHaveAttribute('aria-controls', `simple-tabpanel-${index}`);
      });

      // Check form accessibility
      const passwordInputs = screen.getAllByLabelText(/password/i);
      passwordInputs.forEach(input => {
        expect(input).toHaveAttribute('type', 'password');
      });
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<UserSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });

      // Tab navigation should work
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole('tab', { name: /account settings/i }));

      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole('tab', { name: /character settings/i }));

      // Arrow keys should work for tab navigation
      await user.keyboard('{ArrowLeft}');
      expect(screen.getByRole('tab', { name: /account settings/i })).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('Performance', () => {
    it('should not re-render unnecessarily', async () => {
      const renderSpy = jest.fn();
      
      const TestComponent = () => {
        renderSpy();
        return <UserSettings />;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });

      // Should only render minimal times for initial load and data updates
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid tab switching', async () => {
      const user = userEvent.setup();
      render(<UserSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });

      const accountTab = screen.getByRole('tab', { name: /account settings/i });
      const characterTab = screen.getByRole('tab', { name: /character settings/i });

      // Rapidly switch between tabs
      for (let i = 0; i < 5; i++) {
        await user.click(characterTab);
        await user.click(accountTab);
      }

      // Should still be functional
      expect(accountTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Change Password')).toBeInTheDocument();
    });
  });
});