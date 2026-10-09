import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const campaign: any = {};
vi.mock('../../../contexts/CampaignContext', () => ({
  useCampaign: () => campaign,
}));

import RoleRoute from '../RoleRoute';

const setCampaign = (over: Record<string, unknown>) => {
  Object.keys(campaign).forEach((k) => delete campaign[k]);
  Object.assign(campaign, {
    isDM: false, isSuperadmin: false, campaignRole: null, loading: false, error: null, refresh: vi.fn(), ...over,
  });
};

const renderRoute = (require: 'dm' | 'superadmin' = 'dm') =>
  render(
    <MemoryRouter initialEntries={['/dm-page']}>
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route path="/dm-page" element={<RoleRoute require={require}><div>secret dm page</div></RoleRoute>} />
      </Routes>
    </MemoryRouter>
  );

describe('RoleRoute', () => {
  beforeEach(() => setCampaign({}));

  it('shows the page to a DM', () => {
    setCampaign({ isDM: true, campaignRole: 'DM' });
    renderRoute();
    expect(screen.getByText('secret dm page')).toBeInTheDocument();
  });

  it('redirects a player (loaded fine, simply not allowed) home', () => {
    setCampaign({ campaignRole: 'Player' });
    renderRoute();
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('shows an error with a retry, and does NOT redirect, when the campaign could not be loaded (L-7)', () => {
    const refresh = vi.fn();
    setCampaign({ error: 'Failed to load campaign information', refresh });
    renderRoute();

    expect(screen.queryByText('home')).not.toBeInTheDocument();
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the page up when a later refresh fails but the role is already known', () => {
    setCampaign({ isDM: true, campaignRole: 'DM', error: 'Failed to load campaign information' });
    renderRoute();
    expect(screen.getByText('secret dm page')).toBeInTheDocument();
  });

  it('gates a superadmin-only page on isSuperadmin', () => {
    setCampaign({ isDM: true, campaignRole: 'DM' });
    renderRoute('superadmin');
    expect(screen.getByText('home')).toBeInTheDocument();
  });
});
