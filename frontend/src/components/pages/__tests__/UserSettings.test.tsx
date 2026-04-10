import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock the api utility
vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock CharacterTab to avoid deep dependency tree
vi.mock('../UserSettings/CharacterTab', () => ({
  default: () => <div data-testid="character-tab">Character Tab Content</div>,
}));

import api from '../../../utils/api';
import UserSettings from '../UserSettings';

const mockUserData = {
  data: {
    user: {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      role: 'player',
      discord_id: '123456789012345678',
    },
  },
};

const renderUserSettings = () => {
  return render(
    <BrowserRouter>
      <UserSettings />
    </BrowserRouter>
  );
};

describe('UserSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as any).mockResolvedValue(mockUserData);
  });

  it('renders the settings tabs', async () => {
    renderUserSettings();

    await waitFor(() => {
      expect(screen.getByText('Account Settings')).toBeInTheDocument();
      expect(screen.getByText('Characters')).toBeInTheDocument();
    });
  });

  it('shows Account Settings tab by default with password change form', async () => {
    renderUserSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password')).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it('shows Change Email section on Account Settings tab', async () => {
    renderUserSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Email')).toBeInTheDocument();
    });
  });

  it('fetches user data on mount', async () => {
    renderUserSettings();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/auth/status');
    });
  });

  it('switches to Characters tab when clicked', async () => {
    renderUserSettings();

    await waitFor(() => {
      expect(screen.getByText('Account Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Characters'));

    await waitFor(() => {
      expect(screen.getByTestId('character-tab')).toBeInTheDocument();
    });
  });

  it('shows password validation error for empty current password', async () => {
    renderUserSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password')).toBeInTheDocument();
    });

    // Fill only new password fields, leave current password empty
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'newpassword123' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'newpassword123' } });

    // Submit the password change form
    const changePasswordButton = screen.getByRole('button', { name: /change password/i });
    fireEvent.click(changePasswordButton);

    await waitFor(() => {
      expect(screen.getByText('Current password is required')).toBeInTheDocument();
    });
  });

  it('shows password validation error for short new password', async () => {
    renderUserSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'short' } });

    const changePasswordButton = screen.getByRole('button', { name: /change password/i });
    fireEvent.click(changePasswordButton);

    await waitFor(() => {
      expect(screen.getByText('New password must be at least 8 characters long')).toBeInTheDocument();
    });
  });

  it('shows password mismatch error', async () => {
    renderUserSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'newpassword123' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'differentpassword' } });

    const changePasswordButton = screen.getByRole('button', { name: /change password/i });
    fireEvent.click(changePasswordButton);

    await waitFor(() => {
      expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
    });
  });

  it('successfully changes password', async () => {
    (api.put as any).mockResolvedValueOnce({ data: { success: true } });

    renderUserSettings();

    await waitFor(() => {
      expect(screen.getByText('Change Password')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'newpassword123' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'newpassword123' } });

    const changePasswordButton = screen.getByRole('button', { name: /change password/i });
    fireEvent.click(changePasswordButton);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/user/change-password', {
        oldPassword: 'oldpass123',
        newPassword: 'newpassword123',
      });
      expect(screen.getByText('Password changed successfully')).toBeInTheDocument();
    });
  });
});
