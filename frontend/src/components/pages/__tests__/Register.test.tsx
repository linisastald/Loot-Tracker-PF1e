import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url.includes('check-dm')) return Promise.resolve({ data: { dmExists: true } });
      if (url.includes('check-registration-status')) return Promise.resolve({ data: { isOpen: true } });
      if (url.includes('check-invite-required')) return Promise.resolve({ data: { isRequired: false } });
      return Promise.resolve({ data: {} });
    }),
    post: vi.fn().mockResolvedValue({ data: { token: 'mock-token' } }),
  },
}));

import Register from '../Register';
import api from '../../../utils/api';

const renderComponent = () =>
  render(
    <BrowserRouter>
      <Register />
    </BrowserRouter>
  );

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup default mocks
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('check-dm')) return Promise.resolve({ data: { dmExists: true } });
      if (url.includes('check-registration-status')) return Promise.resolve({ data: { isOpen: true } });
      if (url.includes('check-invite-required')) return Promise.resolve({ data: { isRequired: false } });
      return Promise.resolve({ data: {} });
    });
  });

  it('renders the Register heading when registrations are open', async () => {
    renderComponent();
    expect(await screen.findByRole('heading', { name: /register/i })).toBeInTheDocument();
  });

  it('renders username, email, and password fields', async () => {
    renderComponent();
    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders role selector', async () => {
    renderComponent();
    expect(await screen.findByLabelText(/role/i)).toBeInTheDocument();
  });

  it('renders the Register button', async () => {
    renderComponent();
    expect(await screen.findByRole('button', { name: /register/i })).toBeInTheDocument();
  });

  it('renders password toggle visibility button', async () => {
    renderComponent();
    expect(
      await screen.findByRole('button', { name: /toggle password visibility/i })
    ).toBeInTheDocument();
  });

  it('renders password helper text', async () => {
    renderComponent();
    expect(
      await screen.findByText(/password must be at least 8 characters long/i)
    ).toBeInTheDocument();
  });

  it('shows closed message when registrations are closed', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('check-dm')) return Promise.resolve({ data: { dmExists: true } });
      if (url.includes('check-registration-status')) return Promise.resolve({ data: { isOpen: false } });
      if (url.includes('check-invite-required')) return Promise.resolve({ data: { isRequired: false } });
      return Promise.resolve({ data: {} });
    });
    renderComponent();
    expect(
      await screen.findByText(/registrations are currently closed/i)
    ).toBeInTheDocument();
  });

  it('checks DM existence and registration status on mount', () => {
    renderComponent();
    expect(api.get).toHaveBeenCalledWith('/auth/check-dm');
    expect(api.get).toHaveBeenCalledWith('/auth/check-registration-status');
    expect(api.get).toHaveBeenCalledWith('/auth/check-invite-required');
  });
});
