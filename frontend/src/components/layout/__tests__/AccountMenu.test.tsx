import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'daniel', role: 'Player' } }),
}));

let isSuperadmin = false;
vi.mock('../../../contexts/CampaignContext', () => ({
  useCampaign: () => ({ isSuperadmin }),
}));

import AccountMenu from '../AccountMenu';

const renderMenu = () => render(
  <MemoryRouter>
    <AccountMenu />
  </MemoryRouter>
);

describe('AccountMenu', () => {
  beforeEach(() => {
    isSuperadmin = false;
  });

  it('opens from the avatar and links to the account pages', () => {
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));

    expect(screen.getByText('daniel')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /account settings/i })).toHaveAttribute('href', '/user-settings');
    expect(screen.getByRole('menuitem', { name: /my characters/i })).toHaveAttribute('href', '/user-settings/characters');
    expect(screen.queryByRole('menuitem', { name: /system admin/i })).not.toBeInTheDocument();
  });

  it('adds System Admin for a superadmin', () => {
    isSuperadmin = true;
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));

    expect(screen.getByRole('menuitem', { name: /system admin/i })).toHaveAttribute('href', '/user-settings/system-admin');
  });
});
