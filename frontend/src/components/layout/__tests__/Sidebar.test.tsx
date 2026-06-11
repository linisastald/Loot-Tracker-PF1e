import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Badge counts + version come from services; settings come from the campaign
// context (multi-campaign Phase 4c) — no ad-hoc settings GETs remain.
vi.mock('../../../services/lootService', () => ({
  default: {
    getUnprocessedCount: vi.fn().mockResolvedValue({ data: { count: 0 } }),
    getUnidentifiedCount: vi.fn().mockResolvedValue({ data: { count: 0 } }),
  },
}));

vi.mock('../../../services/versionService', () => ({
  default: {
    getVersion: vi.fn().mockResolvedValue({
      data: { version: '1.0.0', buildNumber: 1, fullVersion: '1.0.0' },
    }),
  },
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'dm-user' }, isDM: true }),
}));

let campaignContextValue: any;

vi.mock('../../../contexts/CampaignContext', () => ({
  useCampaign: () => campaignContextValue,
}));

import Sidebar from '../Sidebar';

const makeContext = (
  settings: Record<string, unknown> = {},
  currentCampaign: { id: number; name: string; slug: string } | null = {
    id: 1,
    name: 'Rise of the Runelords',
    slug: 'rotrl',
  },
  isSuperadmin = false,
) => ({
  campaigns: [],
  currentCampaign,
  campaignRole: 'DM' as const,
  isSuperadmin,
  campaignSettings: settings,
  loading: false,
  switchCampaign: vi.fn(),
  refresh: vi.fn(),
});

const renderSidebar = () =>
  render(
    <MemoryRouter>
      <Sidebar
        isCollapsed={false}
        setIsCollapsed={vi.fn()}
        mobileOpen={false}
        onMobileClose={vi.fn()}
        onLogout={vi.fn()}
      />
    </MemoryRouter>,
  );

describe('Sidebar (campaign context integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignContextValue = makeContext();
  });

  it('titles the sidebar with the active campaign name from the context', async () => {
    renderSidebar();

    await waitFor(() => {
      expect(screen.getAllByText('Rise of the Runelords').length).toBeGreaterThan(0);
    });
  });

  it('falls back to "Loot Tracker" when no campaign is resolved yet', async () => {
    campaignContextValue = makeContext({}, null);

    renderSidebar();

    await waitFor(() => {
      expect(screen.getAllByText('Loot Tracker').length).toBeGreaterThan(0);
    });
  });

  it('shows the Infamy nav entries when the campaign setting is "1"', async () => {
    campaignContextValue = makeContext({ infamy_system_enabled: '1' });

    renderSidebar();

    await waitFor(() => {
      expect(screen.getAllByText('Infamy').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Fleet Management').length).toBeGreaterThan(0);
  });

  it('hides the Infamy nav entries when the campaign setting is "0" or missing', async () => {
    campaignContextValue = makeContext({ infamy_system_enabled: '0' });

    renderSidebar();

    await waitFor(() => {
      expect(screen.getAllByText('Loot Entry').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Infamy')).not.toBeInTheDocument();
    expect(screen.queryByText('Fleet Management')).not.toBeInTheDocument();
  });

  it('shows the System Admin entry only for superadmins', async () => {
    campaignContextValue = makeContext({}, undefined, true);

    renderSidebar();

    await waitFor(() => {
      expect(screen.getAllByText('System Admin').length).toBeGreaterThan(0);
    });
  });

  it('hides the System Admin entry for plain DMs', async () => {
    renderSidebar();

    await waitFor(() => {
      expect(screen.getAllByText('Loot Entry').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('System Admin')).not.toBeInTheDocument();
  });
});
