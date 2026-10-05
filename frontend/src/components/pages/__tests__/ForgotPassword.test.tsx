import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../../../utils/api', () => ({
  default: {
    // Real shape after the api response interceptor: the unwrapped body
    post: vi.fn().mockResolvedValue({ success: true, message: 'Reset link sent', data: null }),
  },
}));

import ForgotPassword from '../ForgotPassword';
import api from '../../../utils/api';

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

  it('shows the success message and clears the fields when the request succeeds', async () => {
    renderComponent();
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText('Reset link sent')).toBeInTheDocument();
    expect(screen.queryByText(/failed to process/i)).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', { username: 'alice', email: 'a@example.com' });
    await waitFor(() => expect(screen.getByLabelText(/username/i)).toHaveValue(''));
  });

  it('requires both username and email before posting', async () => {
    renderComponent();
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText('Username and email are required')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('submits with the Enter key', async () => {
    renderComponent();
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice' } });
    await userEvent.type(screen.getByLabelText(/email/i), 'a@example.com{Enter}');

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', { username: 'alice', email: 'a@example.com' })
    );
  });

  it('shows the backend message when the request is rejected with one (e.g. rate limiting)', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { message: 'Too many requests' } } });
    renderComponent();
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText('Too many requests')).toBeInTheDocument();
  });

  it('shows a failure message when the request is rejected', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('network'));
    renderComponent();
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/failed to process password reset request/i)).toBeInTheDocument();
  });
});
