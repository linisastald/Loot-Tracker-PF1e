import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../../../utils/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { message: 'Password reset successfully' } }),
  },
}));

import ResetPassword from '../ResetPassword';
import api from '../../../utils/api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderWithToken = (token?: string) => {
  const searchParams = token ? `?token=${token}` : '';
  return render(
    <MemoryRouter initialEntries={[`/reset-password${searchParams}`]}>
      <ResetPassword />
    </MemoryRouter>
  );
};

describe('ResetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Invalid Reset Link when no token is provided', () => {
    renderWithToken();
    expect(screen.getByRole('heading', { name: /invalid reset link/i })).toBeInTheDocument();
  });

  it('shows error alert when token is missing', () => {
    renderWithToken();
    expect(
      screen.getByText(/this password reset link is invalid or has expired/i)
    ).toBeInTheDocument();
  });

  it('renders link to request new reset when token is missing', () => {
    renderWithToken();
    expect(screen.getByText(/request a new password reset/i)).toBeInTheDocument();
  });

  it('renders the Set New Password form when token is present', () => {
    renderWithToken('valid-token-123');
    expect(screen.getByRole('heading', { name: /set new password/i })).toBeInTheDocument();
  });

  it('renders password and confirm password fields with token', () => {
    renderWithToken('valid-token-123');
    // MUI renders label text in both <label> and <legend> elements.
    // Use getAllByLabelText and verify count since "New Password" appears in multiple DOM locations.
    const passwordInputs = screen.getAllByLabelText(/new password/i);
    expect(passwordInputs.length).toBeGreaterThanOrEqual(2);
  });

  it('renders Reset Password button with token', () => {
    renderWithToken('valid-token-123');
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('renders Back to Login link with token', () => {
    renderWithToken('valid-token-123');
    expect(screen.getByText(/back to login/i)).toBeInTheDocument();
  });

  describe('submitting', () => {
    const fill = (newPassword: string, confirmPassword: string) => {
      const [first, second] = screen.getAllByLabelText(/new password/i, { selector: 'input' });
      fireEvent.change(first, { target: { value: newPassword } });
      fireEvent.change(second, { target: { value: confirmPassword } });
      fireEvent.click(screen.getByRole('button', { name: /^reset password$/i }));
    };

    it.each([
      ['', '', 'Both password fields are required'],
      ['longenough1', 'different123', 'Passwords do not match'],
      ['short', 'short', 'Password must be at least 8 characters long'],
    ])('rejects %j / %j without calling the API', async (a, b, message) => {
      renderWithToken('valid-token-123');
      fill(a, b);

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('posts the token and new password, shows the message and redirects to login', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        renderWithToken('valid-token-123');
        fill('brandnewpass', 'brandnewpass');

        expect(await screen.findByText('Password reset successfully')).toBeInTheDocument();
        expect(api.post).toHaveBeenCalledWith('/auth/reset-password', {
          token: 'valid-token-123',
          newPassword: 'brandnewpass',
        });
        expect(mockNavigate).not.toHaveBeenCalled();
        await act(async () => { vi.advanceTimersByTime(3000); });
        expect(mockNavigate).toHaveBeenCalledWith('/login');
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows the server message for an invalid or expired token and does not redirect', async () => {
      vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { message: 'Invalid or expired reset token' } } });
      renderWithToken('stale-token');
      fill('brandnewpass', 'brandnewpass');

      expect(await screen.findByText('Invalid or expired reset token')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('falls back to a generic message when the failure has no body', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new Error('network'));
      renderWithToken('valid-token-123');
      fill('brandnewpass', 'brandnewpass');

      expect(await screen.findByText('Failed to reset password')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('button', { name: /^reset password$/i })).toBeEnabled());
    });
  });

  it('renders password visibility toggle buttons', () => {
    renderWithToken('valid-token-123');
    const toggleButtons = screen.getAllByRole('button', { name: /show password/i });
    expect(toggleButtons.length).toBe(2);
  });
});
