import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

// Mock all sub-route components
vi.mock('../DMSettings/SystemSettings', () => ({
  default: () => <div data-testid="system-settings">System Settings</div>,
}));

vi.mock('../DMSettings/UserManagement', () => ({
  default: () => <div data-testid="user-management">User Management Content</div>,
}));

vi.mock('../DMSettings/CharacterManagement', () => ({
  default: () => <div data-testid="character-management">Character Management Content</div>,
}));

vi.mock('../DMSettings/CampaignSettings', () => ({
  default: () => <div data-testid="campaign-settings">Campaign Settings Content</div>,
}));

import CharacterAndUserManagement from '../CharacterAndUserManagement';

const renderComponent = (initialPath = '/character-user-management') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/character-user-management/*" element={<CharacterAndUserManagement />} />
      </Routes>
    </MemoryRouter>
  );

describe('CharacterAndUserManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all tab labels', () => {
    renderComponent();
    expect(screen.getByRole('tab', { name: /system settings/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /user management/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /character management/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /campaign settings/i })).toBeInTheDocument();
  });

  it('renders System Settings sub-route by default', () => {
    renderComponent();
    expect(screen.getByTestId('system-settings')).toBeInTheDocument();
  });

  it('renders User Management sub-route', () => {
    renderComponent('/character-user-management/user-management');
    expect(screen.getByTestId('user-management')).toBeInTheDocument();
  });

  it('renders Character Management sub-route', () => {
    renderComponent('/character-user-management/character-management');
    expect(screen.getByTestId('character-management')).toBeInTheDocument();
  });

  it('renders Campaign Settings sub-route', () => {
    renderComponent('/character-user-management/campaign-settings');
    expect(screen.getByTestId('campaign-settings')).toBeInTheDocument();
  });

  it('renders tablist with the correct aria label', () => {
    renderComponent();
    expect(screen.getByRole('tablist', { name: /management tabs/i })).toBeInTheDocument();
  });
});
