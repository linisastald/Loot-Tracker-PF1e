import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import Register from '../Register';
import api from '../../../utils/api';

type RegistrationMode = 'open' | 'invite-only' | 'closed';

// The api response interceptor returns the body, so mocks resolve the envelope:
// { success, message, data } -> component reads response.data
const setupGetMock = (mode: RegistrationMode, dmExists = true) => {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.includes('check-dm')) {
      return Promise.resolve({ data: { dmExists } } as any);
    }
    if (url.includes('check-registration-status')) {
      return Promise.resolve({
        data: { mode },
      } as any);
    }
    return Promise.resolve({ data: {} } as any);
  });
};

const renderComponent = (onLogin?: (user: any) => void) =>
  render(
    <BrowserRouter>
      <Register onLogin={onLogin} />
    </BrowserRouter>
  );

const fillBasicFields = async () => {
  fireEvent.change(await screen.findByLabelText(/username/i), {
    target: { value: 'newplayer' },
  });
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'player@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/^password/i, { selector: 'input' }), {
    target: { value: 'longenoughpassword' },
  });
};

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupGetMock('open');
    vi.mocked(api.post).mockResolvedValue({ data: { token: 'mock-token' } } as any);
  });

  describe('open mode', () => {
    it('renders the Register heading and basic fields', async () => {
      renderComponent();
      expect(await screen.findByRole('heading', { name: /register/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i, { selector: 'input' })).toBeInTheDocument();
    });

    it('shows an OPTIONAL invite code field', async () => {
      renderComponent();
      expect(
        await screen.findByLabelText(/invite code \(optional/i)
      ).toBeInTheDocument();
    });

    it('checks DM existence and registration status on mount, without the removed invite endpoint', async () => {
      renderComponent();
      await screen.findByRole('heading', { name: /register/i });
      expect(api.get).toHaveBeenCalledWith('/auth/check-dm');
      expect(api.get).toHaveBeenCalledWith('/auth/check-registration-status');
      expect(api.get).not.toHaveBeenCalledWith('/auth/check-invite-required');
    });

    it('registers without an invite code', async () => {
      renderComponent();
      await fillBasicFields();

      fireEvent.click(screen.getByRole('button', { name: /register/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/auth/register', {
          username: 'newplayer',
          email: 'player@example.com',
          password: 'longenoughpassword',
          role: 'Player',
          inviteCode: undefined,
        });
      });
    });

    it('signs the new user in locally (App state + cached user) so the next page is not bounced to /login', async () => {
      const onLogin = vi.fn();
      const newUser = { id: 9, username: 'newplayer', role: 'Player' };
      vi.mocked(api.post).mockResolvedValueOnce({ data: { user: newUser } } as any);
      renderComponent(onLogin);
      await fillBasicFields();

      fireEvent.click(screen.getByRole('button', { name: /register/i }));

      await waitFor(() => expect(onLogin).toHaveBeenCalledWith(newUser));
    });

    it('does not sign in when registration fails', async () => {
      const onLogin = vi.fn();
      vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { message: 'Username already exists' } } });
      renderComponent(onLogin);
      await fillBasicFields();

      fireEvent.click(screen.getByRole('button', { name: /register/i }));

      expect(await screen.findByText('Username already exists')).toBeInTheDocument();
      expect(onLogin).not.toHaveBeenCalled();
    });

    describe('role selector (DM bootstrap only on an empty install)', () => {
      it('is locked when accounts already exist', async () => {
        setupGetMock('open', true);
        renderComponent();
        const role = await screen.findByRole('combobox', { name: /role/i });
        await waitFor(() => expect(role).toHaveAttribute('aria-disabled', 'true'));
      });

      it('is unlocked only when the server confirms no account exists yet', async () => {
        setupGetMock('open', false);
        renderComponent();
        const role = await screen.findByRole('combobox', { name: /role/i });
        await waitFor(() => expect(role).not.toHaveAttribute('aria-disabled', 'true'));
      });

      it('stays locked when the DM check fails', async () => {
        vi.mocked(api.get).mockImplementation((url: string) =>
          url.includes('check-dm')
            ? Promise.reject(new Error('down'))
            : Promise.resolve({ data: { mode: 'open' } } as any)
        );
        renderComponent();
        const role = await screen.findByRole('combobox', { name: /role/i });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(role).toHaveAttribute('aria-disabled', 'true');
      });
    });

    it('uppercases the invite code input and submits it', async () => {
      renderComponent();
      await fillBasicFields();

      const inviteField = screen.getByLabelText(/invite code \(optional/i) as HTMLInputElement;
      fireEvent.change(inviteField, { target: { value: 'abcd1234' } });
      expect(inviteField.value).toBe('ABCD1234');

      fireEvent.click(screen.getByRole('button', { name: /register/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/auth/register',
          expect.objectContaining({ inviteCode: 'ABCD1234' })
        );
      });
    });

    it('rejects invite codes that are not 6-8 alphanumeric characters', async () => {
      renderComponent();
      await fillBasicFields();

      const inviteField = screen.getByLabelText(/invite code \(optional/i);
      fireEvent.change(inviteField, { target: { value: 'ABC' } });

      fireEvent.click(screen.getByRole('button', { name: /register/i }));

      expect(
        await screen.findByText(/invite codes are 6-8 letters and numbers/i)
      ).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('surfaces the backend validation message on registration failure', async () => {
      vi.mocked(api.post).mockRejectedValueOnce({
        response: { data: { message: 'Invite code has already been used' } },
      });

      renderComponent();
      await fillBasicFields();

      fireEvent.click(screen.getByRole('button', { name: /register/i }));

      expect(
        await screen.findByText('Invite code has already been used')
      ).toBeInTheDocument();
    });
  });

  describe('invite-only mode', () => {
    beforeEach(() => {
      setupGetMock('invite-only');
    });

    it('shows a REQUIRED invite code field', async () => {
      renderComponent();
      expect(
        await screen.findByLabelText(/invite code \(required\)/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/registration requires an invite code from your dm/i)
      ).toBeInTheDocument();
    });

    it('blocks submission without an invite code', async () => {
      renderComponent();
      await fillBasicFields();

      const registerBtn = screen.getByRole('button', { name: /register/i });
      expect(registerBtn).toBeDisabled();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('submits with the invite code once provided', async () => {
      renderComponent();
      await fillBasicFields();

      fireEvent.change(screen.getByLabelText(/invite code \(required\)/i), {
        target: { value: 'wxyz9876' },
      });

      const registerBtn = screen.getByRole('button', { name: /register/i });
      expect(registerBtn).not.toBeDisabled();
      fireEvent.click(registerBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/auth/register',
          expect.objectContaining({ inviteCode: 'WXYZ9876' })
        );
      });
    });

    it('accepts legacy 6-character invite codes', async () => {
      renderComponent();
      await fillBasicFields();

      fireEvent.change(screen.getByLabelText(/invite code \(required\)/i), {
        target: { value: 'abc123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /register/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/auth/register',
          expect.objectContaining({ inviteCode: 'ABC123' })
        );
      });
    });
  });

  describe('closed mode', () => {
    beforeEach(() => {
      setupGetMock('closed');
    });

    it('shows a friendly closed message and no form', async () => {
      renderComponent();
      expect(
        await screen.findByText(/registration is currently closed/i)
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /register/i })).not.toBeInTheDocument();
    });

    it('treats a failed status check as closed', async () => {
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url.includes('check-dm')) {
          return Promise.resolve({ data: { dmExists: true } } as any);
        }
        return Promise.reject(new Error('network down'));
      });

      renderComponent();
      expect(
        await screen.findByText(/registration is currently closed/i)
      ).toBeInTheDocument();
    });
  });
});
