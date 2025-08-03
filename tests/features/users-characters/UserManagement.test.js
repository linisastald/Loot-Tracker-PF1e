/**
 * Tests for UserManagement.js - Admin User Management Component
 * Tests user CRUD operations, password resets, invites, and bulk actions
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import UserManagement from '../../../frontend/src/components/pages/DMSettings/UserManagement';
import api from '../../../frontend/src/utils/api';

// Mock the API
jest.mock('../../../frontend/src/utils/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn()
}));

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn().mockResolvedValue()
  }
});

describe('UserManagement', () => {
  const mockUsers = [
    {
      id: 1,
      username: 'player1',
      email: 'player1@example.com',
      role: 'Player',
      active: true,
      last_login: '2023-12-01T10:00:00Z'
    },
    {
      id: 2,
      username: 'player2',
      email: 'player2@example.com',
      role: 'Player',
      active: true,
      last_login: '2023-11-28T15:30:00Z'
    },
    {
      id: 3,
      username: 'dmuser',
      email: 'dm@example.com',
      role: 'DM',
      active: true,
      last_login: '2023-12-02T09:15:00Z'
    },
    {
      id: 4,
      username: 'inactive_user',
      email: 'inactive@example.com',
      role: 'Player',
      active: false,
      last_login: null
    }
  ];

  const mockInvites = [
    {
      id: 1,
      email: 'invite1@example.com',
      role: 'Player',
      token: 'abc123',
      expires_at: '2023-12-10T12:00:00Z',
      created_at: '2023-12-01T12:00:00Z'
    },
    {
      id: 2,
      email: 'invite2@example.com',
      role: 'DM',
      token: 'def456',
      expires_at: '2023-12-15T12:00:00Z',
      created_at: '2023-12-02T12:00:00Z'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default successful API responses
    api.get.mockImplementation((url) => {
      if (url === '/users') {
        return Promise.resolve({ data: { data: mockUsers } });
      }
      if (url === '/auth/invites') {
        return Promise.resolve({ data: { data: mockInvites } });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    api.post.mockResolvedValue({
      data: {
        success: true,
        message: 'Operation completed successfully'
      }
    });

    api.put.mockResolvedValue({
      data: {
        success: true,
        message: 'User updated successfully'
      }
    });

    api.delete.mockResolvedValue({
      data: {
        success: true,
        message: 'User deleted successfully'
      }
    });
  });

  describe('Component Rendering', () => {
    it('should render user management interface', async () => {
      render(<UserManagement />);

      expect(screen.getByText('User Management')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
        expect(screen.getByText('player2')).toBeInTheDocument();
        expect(screen.getByText('dmuser')).toBeInTheDocument();
      });
    });

    it('should display user table headers', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('Username')).toBeInTheDocument();
        expect(screen.getByText('Email')).toBeInTheDocument();
        expect(screen.getByText('Role')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Last Login')).toBeInTheDocument();
        expect(screen.getByText('Actions')).toBeInTheDocument();
      });
    });

    it('should display user data correctly', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        // Check usernames
        expect(screen.getByText('player1')).toBeInTheDocument();
        expect(screen.getByText('player2')).toBeInTheDocument();
        expect(screen.getByText('dmuser')).toBeInTheDocument();
        expect(screen.getByText('inactive_user')).toBeInTheDocument();

        // Check emails
        expect(screen.getByText('player1@example.com')).toBeInTheDocument();
        expect(screen.getByText('dm@example.com')).toBeInTheDocument();

        // Check roles
        expect(screen.getAllByText('Player')).toHaveLength(3); // 3 players
        expect(screen.getByText('DM')).toBeInTheDocument();
      });
    });

    it('should show active/inactive status', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        const activeStatuses = screen.getAllByText('Active');
        const inactiveStatuses = screen.getAllByText('Inactive');
        
        expect(activeStatuses).toHaveLength(3); // 3 active users
        expect(inactiveStatuses).toHaveLength(1); // 1 inactive user
      });
    });

    it('should display last login dates', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        // Should show formatted dates for users with last_login
        expect(screen.getByText(/Dec.*2023/)).toBeInTheDocument();
        expect(screen.getByText(/Nov.*2023/)).toBeInTheDocument();
        
        // Should show "Never" for users without last_login
        expect(screen.getByText('Never')).toBeInTheDocument();
      });
    });
  });

  describe('Data Loading', () => {
    it('should fetch users and invites on mount', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/users');
        expect(api.get).toHaveBeenCalledWith('/auth/invites');
      });
    });

    it('should show loading state', () => {
      api.get.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<UserManagement />);

      expect(screen.getByText('User Management')).toBeInTheDocument();
      // Users should not be loaded yet
      expect(screen.queryByText('player1')).not.toBeInTheDocument();
    });

    it('should handle API errors during data loading', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      api.get.mockRejectedValue(new Error('Failed to load users'));

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText(/error.*loading.*users/i)).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });

    it('should handle empty user list', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/users') {
          return Promise.resolve({ data: { data: [] } });
        }
        if (url === '/auth/invites') {
          return Promise.resolve({ data: { data: mockInvites } });
        }
        return Promise.resolve({ data: { data: [] } });
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('User Management')).toBeInTheDocument();
        // Should still show table headers but no user data
        expect(screen.getByText('Username')).toBeInTheDocument();
      });
    });
  });

  describe('User Selection', () => {
    it('should allow selecting individual users', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      // Find checkboxes (exclude the select all checkbox)
      const checkboxes = screen.getAllByRole('checkbox');
      const userCheckboxes = checkboxes.slice(1); // Skip the select all checkbox

      // Select first user
      fireEvent.click(userCheckboxes[0]);
      expect(userCheckboxes[0]).toBeChecked();

      // Select second user
      fireEvent.click(userCheckboxes[1]);
      expect(userCheckboxes[1]).toBeChecked();

      // Deselect first user
      fireEvent.click(userCheckboxes[0]);
      expect(userCheckboxes[0]).not.toBeChecked();
      expect(userCheckboxes[1]).toBeChecked();
    });

    it('should allow selecting all users', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
      fireEvent.click(selectAllCheckbox);

      const userCheckboxes = screen.getAllByRole('checkbox').slice(1);
      userCheckboxes.forEach(checkbox => {
        expect(checkbox).toBeChecked();
      });

      // Deselect all
      fireEvent.click(selectAllCheckbox);
      userCheckboxes.forEach(checkbox => {
        expect(checkbox).not.toBeChecked();
      });
    });

    it('should update select all state when individual users are selected', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      const selectAllCheckbox = checkboxes[0];
      const userCheckboxes = checkboxes.slice(1);

      // Select all users individually
      userCheckboxes.forEach(checkbox => {
        fireEvent.click(checkbox);
      });

      // Select all should be checked
      expect(selectAllCheckbox).toBeChecked();

      // Deselect one user
      fireEvent.click(userCheckboxes[0]);

      // Select all should be unchecked
      expect(selectAllCheckbox).not.toBeChecked();
    });
  });

  describe('Password Reset', () => {
    it('should open password reset dialog', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      // Select a user
      const userCheckboxes = screen.getAllByRole('checkbox').slice(1);
      fireEvent.click(userCheckboxes[0]);

      // Click reset password button
      const resetPasswordButton = screen.getByText('Reset Password');
      fireEvent.click(resetPasswordButton);

      await waitFor(() => {
        expect(screen.getByText('Reset Password for Selected Users')).toBeInTheDocument();
        expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
      });
    });

    it('should validate password requirements', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      // Select a user and open dialog
      const userCheckboxes = screen.getAllByRole('checkbox').slice(1);
      fireEvent.click(userCheckboxes[0]);

      const resetPasswordButton = screen.getByText('Reset Password');
      fireEvent.click(resetPasswordButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByLabelText(/new password/i);
      const resetButton = screen.getByRole('button', { name: /reset/i });

      // Test short password
      await user.type(passwordInput, 'short');
      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
      });

      expect(api.post).not.toHaveBeenCalled();
    });

    it('should reset password successfully', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      // Select a user and open dialog
      const userCheckboxes = screen.getAllByRole('checkbox').slice(1);
      fireEvent.click(userCheckboxes[0]);

      const resetPasswordButton = screen.getByText('Reset Password');
      fireEvent.click(resetPasswordButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByLabelText(/new password/i);
      const resetButton = screen.getByRole('button', { name: /reset/i });

      await user.type(passwordInput, 'newpassword123');
      await user.click(resetButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/users/reset-password', {
          userIds: [1],
          newPassword: 'newpassword123'
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/password reset successfully/i)).toBeInTheDocument();
      });

      // Dialog should close
      expect(screen.queryByText('Reset Password for Selected Users')).not.toBeInTheDocument();
    });

    it('should toggle password visibility', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      // Select a user and open dialog
      const userCheckboxes = screen.getAllByRole('checkbox').slice(1);
      fireEvent.click(userCheckboxes[0]);

      const resetPasswordButton = screen.getByText('Reset Password');
      fireEvent.click(resetPasswordButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByLabelText(/new password/i);
      const visibilityToggle = screen.getByRole('button', { name: /toggle password visibility/i });

      expect(passwordInput).toHaveAttribute('type', 'password');

      fireEvent.click(visibilityToggle);
      expect(passwordInput).toHaveAttribute('type', 'text');

      fireEvent.click(visibilityToggle);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('should handle password reset errors', async () => {
      api.post.mockRejectedValue(new Error('Password reset failed'));

      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      // Select a user and open dialog
      const userCheckboxes = screen.getAllByRole('checkbox').slice(1);
      fireEvent.click(userCheckboxes[0]);

      const resetPasswordButton = screen.getByText('Reset Password');
      fireEvent.click(resetPasswordButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByLabelText(/new password/i);
      const resetButton = screen.getByRole('button', { name: /reset/i });

      await user.type(passwordInput, 'newpassword123');
      await user.click(resetButton);

      await waitFor(() => {
        expect(screen.getByText(/password reset failed/i)).toBeInTheDocument();
      });
    });

    it('should require user selection for password reset', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      // Don't select any users
      const resetPasswordButton = screen.getByText('Reset Password');
      
      // Button should be disabled or show error when clicked without selection
      expect(resetPasswordButton).toBeDisabled();
    });
  });

  describe('User Deletion', () => {
    it('should open delete confirmation dialog', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      // Select a user
      const userCheckboxes = screen.getAllByRole('checkbox').slice(1);
      fireEvent.click(userCheckboxes[0]);

      // Click delete button
      const deleteButton = screen.getByText('Delete Users');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
        expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument();
      });
    });

    it('should delete users successfully', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      // Select users
      const userCheckboxes = screen.getAllByRole('checkbox').slice(1);
      fireEvent.click(userCheckboxes[0]);
      fireEvent.click(userCheckboxes[1]);

      const deleteButton = screen.getByText('Delete Users');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/users/bulk', {
          data: { userIds: [1, 2] }
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/users deleted successfully/i)).toBeInTheDocument();
      });
    });

    it('should handle deletion errors', async () => {
      api.delete.mockRejectedValue(new Error('Deletion failed'));

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      const userCheckboxes = screen.getAllByRole('checkbox').slice(1);
      fireEvent.click(userCheckboxes[0]);

      const deleteButton = screen.getByText('Delete Users');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/deletion failed/i)).toBeInTheDocument();
      });
    });

    it('should cancel deletion', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      const userCheckboxes = screen.getAllByRole('checkbox').slice(1);
      fireEvent.click(userCheckboxes[0]);

      const deleteButton = screen.getByText('Delete Users');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(screen.queryByText(/are you sure you want to delete/i)).not.toBeInTheDocument();
      expect(api.delete).not.toHaveBeenCalled();
    });
  });

  describe('Invite Management', () => {
    it('should display active invites section', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('Active Invites')).toBeInTheDocument();
        expect(screen.getByText('invite1@example.com')).toBeInTheDocument();
        expect(screen.getByText('invite2@example.com')).toBeInTheDocument();
      });
    });

    it('should show invite details', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('invite1@example.com')).toBeInTheDocument();
        expect(screen.getByText('invite2@example.com')).toBeInTheDocument();
        
        // Should show roles
        expect(screen.getAllByText('Player')).toHaveLength(4); // 3 users + 1 invite
        expect(screen.getAllByText('DM')).toHaveLength(2); // 1 user + 1 invite
      });
    });

    it('should create new invite', async () => {
      const user = userEvent.setup();
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('Active Invites')).toBeInTheDocument();
      });

      // Find and click create invite button
      const createInviteButton = screen.getByText('Create Invite');
      fireEvent.click(createInviteButton);

      await waitFor(() => {
        expect(screen.getByText('Create New Invite')).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText(/email/i);
      const roleSelect = screen.getByLabelText(/role/i);
      const createButton = screen.getByRole('button', { name: /create invite/i });

      await user.type(emailInput, 'newuser@example.com');
      
      // Select role
      fireEvent.mouseDown(roleSelect);
      const playerOption = screen.getByRole('option', { name: 'Player' });
      fireEvent.click(playerOption);

      await user.click(createButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/auth/invite', {
          email: 'newuser@example.com',
          role: 'Player'
        });
      });
    });

    it('should copy invite links', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('invite1@example.com')).toBeInTheDocument();
      });

      // Find copy buttons
      const copyButtons = screen.getAllByRole('button', { name: /copy invite link/i });
      fireEvent.click(copyButtons[0]);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          expect.stringContaining('abc123')
        );
      });

      expect(screen.getByText(/invite link copied/i)).toBeInTheDocument();
    });

    it('should delete invites', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('invite1@example.com')).toBeInTheDocument();
      });

      // Find delete buttons for invites
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      const inviteDeleteButton = deleteButtons.find(button => 
        button.closest('tr')?.textContent?.includes('invite1@example.com')
      );

      fireEvent.click(inviteDeleteButton);

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/auth/invite/1');
      });
    });

    it('should show invite expiration status', async () => {
      // Mock an expired invite
      const expiredInvites = [
        {
          id: 3,
          email: 'expired@example.com',
          role: 'Player',
          token: 'expired123',
          expires_at: '2023-11-01T12:00:00Z', // Past date
          created_at: '2023-10-01T12:00:00Z'
        }
      ];

      api.get.mockImplementation((url) => {
        if (url === '/users') {
          return Promise.resolve({ data: { data: mockUsers } });
        }
        if (url === '/auth/invites') {
          return Promise.resolve({ data: { data: [...mockInvites, ...expiredInvites] } });
        }
        return Promise.resolve({ data: { data: [] } });
      });

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('expired@example.com')).toBeInTheDocument();
        expect(screen.getByText(/expired/i)).toBeInTheDocument();
      });
    });
  });

  describe('User Status Management', () => {
    it('should toggle user active status', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      // Find the status toggle for player1 (should be active)
      const userRow = screen.getByText('player1').closest('tr');
      const statusToggle = within(userRow).getByRole('checkbox');

      expect(statusToggle).toBeChecked(); // User is active

      fireEvent.click(statusToggle);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/users/1/status', {
          active: false
        });
      });
    });

    it('should handle status update errors', async () => {
      api.put.mockRejectedValue(new Error('Status update failed'));

      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      const userRow = screen.getByText('player1').closest('tr');
      const statusToggle = within(userRow).getByRole('checkbox');

      fireEvent.click(statusToggle);

      await waitFor(() => {
        expect(screen.getByText(/status update failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      // Check table accessibility
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getAllByRole('columnheader')).toHaveLength(7); // 6 columns + checkbox column
      
      // Check button accessibility
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAttribute('aria-label', expect.any(String));
      });
    });

    it('should support keyboard navigation', async () => {
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      
      // Focus should be manageable via keyboard
      checkboxes[0].focus();
      expect(checkboxes[0]).toHaveFocus();
    });
  });

  describe('Performance', () => {
    it('should handle large user lists', async () => {
      const largeUserList = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        username: `user${i + 1}`,
        email: `user${i + 1}@example.com`,
        role: i % 10 === 0 ? 'DM' : 'Player',
        active: i % 5 !== 0,
        last_login: i % 3 === 0 ? '2023-12-01T10:00:00Z' : null
      }));

      api.get.mockImplementation((url) => {
        if (url === '/users') {
          return Promise.resolve({ data: { data: largeUserList } });
        }
        if (url === '/auth/invites') {
          return Promise.resolve({ data: { data: mockInvites } });
        }
        return Promise.resolve({ data: { data: [] } });
      });

      const startTime = performance.now();
      render(<UserManagement />);

      await waitFor(() => {
        expect(screen.getByText('user1')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within reasonable time
      expect(renderTime).toBeLessThan(3000);
    });

    it('should not re-render unnecessarily', async () => {
      const renderSpy = jest.fn();
      
      const TestComponent = () => {
        renderSpy();
        return <UserManagement />;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByText('player1')).toBeInTheDocument();
      });

      // Should only render once initially
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Boundaries', () => {
    it('should handle malformed user data gracefully', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/users') {
          return Promise.resolve({ 
            data: { 
              data: [
                { id: 1, username: 'valid' },
                { malformed: 'data' }, // Missing required fields
                null, // Null entry
                { id: 'invalid', username: null } // Invalid types
              ] 
            } 
          });
        }
        return Promise.resolve({ data: { data: [] } });
      });

      render(<UserManagement />);

      // Should not crash and should show valid data
      await waitFor(() => {
        expect(screen.getByText('valid')).toBeInTheDocument();
      });
    });
  });
});