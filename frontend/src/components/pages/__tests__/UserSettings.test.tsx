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

/**
 * Helper to get a password input by its associated label text.
 * MUI renders labels for required password fields with extra span elements,
 * which can cause getByLabelText with { selector: 'input' } to fail.
 * This helper finds the label element, reads its 'for' attribute, and
 * returns the input element with the matching id.
 */
const getPasswordInput = (labelPattern: RegExp): HTMLInputElement => {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find(l => labelPattern.test(l.textContent || ''));
  if (!label) throw new Error(`Could not find label matching ${labelPattern}`);
  const inputId = label.getAttribute('for');
  if (!inputId) throw new Error(`Label has no 'for' attribute`);
  const input = document.getElementById(inputId) as HTMLInputElement;
  if (!input) throw new Error(`Could not find input with id '${inputId}'`);
  return input;
};

describe('UserSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as any).mockResolvedValue(mockUserData);
  });

  it('Unlink sends a null discord id instead of re-linking the old one', async () => {
    (api.put as any).mockResolvedValue({ data: {} });
    renderUserSettings();

    const unlink = await screen.findByRole('button', { name: /^unlink$/i });
    fireEvent.click(unlink);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/user/update-discord-id', { discord_id: null });
    });
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
      expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument();
    });

    expect(getPasswordInput(/^Current Password/)).toBeInTheDocument();
    expect(getPasswordInput(/^New Password/)).toBeInTheDocument();
    expect(getPasswordInput(/^Confirm New Password/)).toBeInTheDocument();
  });

  it('shows Change Email section on Account Settings tab', async () => {
    renderUserSettings();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /change email/i })).toBeInTheDocument();
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
      expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument();
    });

    // Fill only new password fields, leave current password empty
    fireEvent.change(getPasswordInput(/^New Password/), { target: { value: 'newpassword123' } });
    fireEvent.change(getPasswordInput(/^Confirm New Password/), { target: { value: 'newpassword123' } });

    // Submit the form directly to bypass HTML5 required field validation
    // (jsdom may block submit via button click when required fields are empty)
    const form = screen.getByRole('button', { name: /change password/i }).closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Current password is required')).toBeInTheDocument();
    });
  });

  it('shows password validation error for short new password', async () => {
    renderUserSettings();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument();
    });

    fireEvent.change(getPasswordInput(/^Current Password/), { target: { value: 'oldpass123' } });
    fireEvent.change(getPasswordInput(/^New Password/), { target: { value: 'short' } });
    fireEvent.change(getPasswordInput(/^Confirm New Password/), { target: { value: 'short' } });

    const changePasswordButton = screen.getByRole('button', { name: /change password/i });
    fireEvent.click(changePasswordButton);

    await waitFor(() => {
      expect(screen.getByText('New password must be at least 8 characters long')).toBeInTheDocument();
    });
  });

  it('shows password mismatch error', async () => {
    renderUserSettings();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument();
    });

    fireEvent.change(getPasswordInput(/^Current Password/), { target: { value: 'oldpass123' } });
    fireEvent.change(getPasswordInput(/^New Password/), { target: { value: 'newpassword123' } });
    fireEvent.change(getPasswordInput(/^Confirm New Password/), { target: { value: 'differentpassword' } });

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
      expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument();
    });

    fireEvent.change(getPasswordInput(/^Current Password/), { target: { value: 'oldpass123' } });
    fireEvent.change(getPasswordInput(/^New Password/), { target: { value: 'newpassword123' } });
    fireEvent.change(getPasswordInput(/^Confirm New Password/), { target: { value: 'newpassword123' } });

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

  describe('server errors and the other account forms (F-1087)', () => {
    const waitForForms = async () => {
      await screen.findByRole('heading', { name: /change password/i });
    };

    it('shows the server message when changing the password fails', async () => {
      (api.put as any).mockRejectedValueOnce({ response: { data: { message: 'Current password is incorrect' } } });
      renderUserSettings();
      await waitForForms();

      fireEvent.change(getPasswordInput(/^Current Password/), { target: { value: 'wrongpass1' } });
      fireEvent.change(getPasswordInput(/^New Password/), { target: { value: 'newpassword123' } });
      fireEvent.change(getPasswordInput(/^Confirm New Password/), { target: { value: 'newpassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));

      expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
      expect(screen.queryByText('Password changed successfully')).not.toBeInTheDocument();
    });

    it('changes the email with the entered password and refreshes the user', async () => {
      (api.put as any).mockResolvedValueOnce({ data: { success: true } });
      renderUserSettings();
      await waitForForms();

      fireEvent.change(screen.getByLabelText(/^New Email/), { target: { value: 'new@example.com' } });
      fireEvent.change(getPasswordInput(/^Enter Password to Confirm/), { target: { value: 'mypassword1' } });
      fireEvent.click(screen.getByRole('button', { name: /^change email$/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/user/change-email', {
          email: 'new@example.com',
          password: 'mypassword1',
        });
      });
      expect(await screen.findByText('Email changed successfully')).toBeInTheDocument();
      // initial load + refresh after the change
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('rejects a malformed new email without calling the API', async () => {
      renderUserSettings();
      await waitForForms();

      const form = screen.getByRole('button', { name: /^change email$/i }).closest('form')!;
      fireEvent.change(screen.getByLabelText(/^New Email/), { target: { value: 'not-an-email' } });
      fireEvent.change(getPasswordInput(/^Enter Password to Confirm/), { target: { value: 'mypassword1' } });
      fireEvent.submit(form);

      expect(await screen.findByText('Please enter a valid email address')).toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
    });

    it('shows the server message when changing the email fails', async () => {
      (api.put as any).mockRejectedValueOnce({ response: { data: { message: 'Email already in use' } } });
      renderUserSettings();
      await waitForForms();

      fireEvent.change(screen.getByLabelText(/^New Email/), { target: { value: 'taken@example.com' } });
      fireEvent.change(getPasswordInput(/^Enter Password to Confirm/), { target: { value: 'mypassword1' } });
      fireEvent.click(screen.getByRole('button', { name: /^change email$/i }));

      expect(await screen.findByText('Email already in use')).toBeInTheDocument();
      expect(screen.queryByText('Email changed successfully')).not.toBeInTheDocument();
    });

    it('updates the Discord id from the form', async () => {
      (api.put as any).mockResolvedValueOnce({ data: { success: true } });
      renderUserSettings();
      await waitForForms();

      fireEvent.change(screen.getByLabelText(/^Discord ID/), { target: { value: '987654321098765432' } });
      fireEvent.click(screen.getByRole('button', { name: /update discord id/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/user/update-discord-id', { discord_id: '987654321098765432' });
      });
      expect(await screen.findByText('Discord ID linked successfully')).toBeInTheDocument();
    });

    it('rejects a malformed Discord id without calling the API', async () => {
      renderUserSettings();
      await waitForForms();

      fireEvent.change(screen.getByLabelText(/^Discord ID/), { target: { value: '12345' } });
      fireEvent.click(screen.getByRole('button', { name: /update discord id/i }));

      expect(await screen.findByText(/Invalid Discord ID format/)).toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
    });

    it('shows the server message when the Discord id is already linked elsewhere', async () => {
      (api.put as any).mockRejectedValueOnce({
        response: { data: { message: 'This Discord ID is already linked to another account' } },
      });
      renderUserSettings();
      await waitForForms();

      fireEvent.change(screen.getByLabelText(/^Discord ID/), { target: { value: '987654321098765432' } });
      fireEvent.click(screen.getByRole('button', { name: /update discord id/i }));

      expect(await screen.findByText('This Discord ID is already linked to another account')).toBeInTheDocument();
    });
  });
});
