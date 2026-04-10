import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../../../utils/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { message: 'Reset link sent' } }),
  },
}));

import ForgotPassword from '../ForgotPassword';

const renderComponent = () =>
  render(
    <BrowserRouter>
      <ForgotPassword />
    </BrowserRouter>
  );

describe('ForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Reset Password heading', () => {
    renderComponent();
    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();
  });

  it('renders instruction text', () => {
    renderComponent();
    expect(
      screen.getByText(/enter your username and email address to receive a password reset link/i)
    ).toBeInTheDocument();
  });

  it('renders username and email fields', () => {
    renderComponent();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('renders the Send Reset Link button', () => {
    renderComponent();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('renders Back to Login link', () => {
    renderComponent();
    expect(screen.getByText(/back to login/i)).toBeInTheDocument();
  });
});
