import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../../../utils/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { message: 'Password reset successfully' } }),
  },
}));

import ResetPassword from '../ResetPassword';

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
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it('renders Reset Password button with token', () => {
    renderWithToken('valid-token-123');
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('renders Back to Login link with token', () => {
    renderWithToken('valid-token-123');
    expect(screen.getByText(/back to login/i)).toBeInTheDocument();
  });

  it('renders password visibility toggle buttons', () => {
    renderWithToken('valid-token-123');
    const toggleButtons = screen.getAllByRole('button', { name: /show password/i });
    expect(toggleButtons.length).toBe(2);
  });
});
