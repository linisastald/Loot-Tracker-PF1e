import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const loot = vi.hoisted(() => ({
  getUnprocessedCount: vi.fn(),
  getUnidentifiedCount: vi.fn(),
}));
const version = vi.hoisted(() => ({ getVersion: vi.fn() }));

vi.mock('../../../services/lootService', () => ({ default: loot }));
vi.mock('../../../services/versionService', () => ({ default: version }));
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'dm-user', role: 'DM' } }),
}));
vi.mock('../../../contexts/CampaignContext', () => {
  const ctx = {
    currentCampaign: { id: 1, name: 'Test Campaign', slug: 't' },
    campaignSettings: {},
    isSuperadmin: false,
    campaignRole: 'DM',
  };
  return { useCampaign: () => ctx, useIsDM: () => true };
});

import Sidebar from '../Sidebar';

const renderSidebar = (path = '/loot-entry', onLogout: () => unknown = vi.fn()) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar
        isCollapsed={false}
        setIsCollapsed={vi.fn()}
        mobileOpen={false}
        onMobileClose={vi.fn()}
        onLogout={onLogout}
      />
    </MemoryRouter>,
  );

describe('Sidebar behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loot.getUnprocessedCount.mockResolvedValue({ data: { count: 0 } });
    loot.getUnidentifiedCount.mockResolvedValue({ data: { count: 0 } });
    version.getVersion.mockResolvedValue({ data: { version: '1.2.3', buildNumber: 1, fullVersion: '1.2.3' } });
  });

  it('fetches each badge count once on mount', async () => {
    renderSidebar();
    await waitFor(() => expect(version.getVersion).toHaveBeenCalled());
    expect(loot.getUnprocessedCount).toHaveBeenCalledTimes(1);
    expect(loot.getUnidentifiedCount).toHaveBeenCalledTimes(1);
  });

  it('still shows the version when a badge count request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    loot.getUnprocessedCount.mockRejectedValue(new Error('down'));
    renderSidebar();
    expect(await screen.findByText('v1.2.3')).toBeInTheDocument();
  });

  it('highlights a nav item for nested routes under it', async () => {
    renderSidebar('/loot-management/sold');
    const link = (await screen.findByText('Loot Management')).closest('a');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Loot Entry').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('does not intercept the keyboard on link items (native Enter activation stays)', async () => {
    renderSidebar();
    const link = (await screen.findByText('Gold')).closest('a') as HTMLElement;
    const notCancelled = fireEvent.keyDown(link, { key: 'Enter' });
    expect(notCancelled).toBe(true);
  });

  it('toggles a category once per click and keeps the items mounted across re-renders', async () => {
    renderSidebar();
    const category = (await screen.findByText('Session Tools')).closest('[aria-expanded]') as HTMLElement;
    expect(category).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(category);
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    const calendar = screen.getByText('Calendar');
    // a badge refresh re-renders the sidebar; the item node must survive it
    await waitFor(() => expect(loot.getUnprocessedCount).toHaveBeenCalled());
    window.dispatchEvent(new CustomEvent('app:loot-counts-changed'));
    await waitFor(() => expect(loot.getUnprocessedCount).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Calendar')).toBe(calendar);
  });

  it('keeps the logout dialog open with a message when the server could not be reached', async () => {
    const onLogout = vi.fn().mockResolvedValue(false);
    renderSidebar('/loot-entry', onLogout);
    fireEvent.click(await screen.findByRole('button', { name: 'Logout' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Logout' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Could not reach the server/);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes the logout dialog once logout succeeds', async () => {
    const onLogout = vi.fn().mockResolvedValue(true);
    renderSidebar('/loot-entry', onLogout);
    fireEvent.click(await screen.findByRole('button', { name: 'Logout' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Logout' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
