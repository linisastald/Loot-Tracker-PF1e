import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
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

// DM gating comes from the current campaign
let campaignState = { loading: false, isDM: true };
vi.mock('../../../contexts/CampaignContext', () => ({
  useCampaign: () => ({ loading: campaignState.loading }),
  useIsDM: () => campaignState.isDM,
}));

import CharacterAndUserManagement from '../CharacterAndUserManagement';

const renderComponent = (initialPath = '/character-user-management') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/character-user-management/*" element={<CharacterAndUserManagement />} />
        <Route path="/" element={<div data-testid="home">home</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('CharacterAndUserManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignState = { loading: false, isDM: true };
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

describe('CharacterAndUserManagement tabs and access', () => {
  beforeEach(() => {
    campaignState = { loading: false, isDM: true };
  });

  it('marks the tab of the current URL as selected', () => {
    renderComponent('/character-user-management/character-management');
    expect(screen.getByRole('tab', { name: /character management/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /system settings/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('navigates to the clicked tab', () => {
    renderComponent();
    fireEvent.click(screen.getByRole('tab', { name: /campaign settings/i }));
    expect(screen.getByTestId('campaign-settings')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /campaign settings/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the highlighted tab in sync when the URL changes without a tab click', () => {
    const JumpLink: React.FC = () => {
      const navigate = useNavigate();
      return <button onClick={() => navigate('/character-user-management/user-management')}>jump</button>;
    };
    render(
      <MemoryRouter initialEntries={['/character-user-management']}>
        <JumpLink />
        <Routes>
          <Route path="/character-user-management/*" element={<CharacterAndUserManagement />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('tab', { name: /system settings/i })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByText('jump'));

    expect(screen.getByTestId('user-management')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /user management/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('sends a non-DM of this campaign away from the DM settings', () => {
    campaignState = { loading: false, isDM: false };
    renderComponent('/character-user-management/user-management');
    expect(screen.getByTestId('home')).toBeInTheDocument();
    expect(screen.queryByTestId('user-management')).not.toBeInTheDocument();
  });

  it('renders nothing while the campaign is still loading (no flash, no premature redirect)', () => {
    campaignState = { loading: true, isDM: false };
    renderComponent();
    expect(screen.queryByTestId('home')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
