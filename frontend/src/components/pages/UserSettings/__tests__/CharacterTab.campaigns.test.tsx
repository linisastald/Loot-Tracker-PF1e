/**
 * CharacterTab across campaigns: the tab lists the user's characters in every
 * campaign they belong to (with the campaign named per row) and lets a new
 * character be created in any of them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

vi.mock('../../../../utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'p', role: 'Player' }, isAuthenticated: true, refreshUser: vi.fn().mockResolvedValue(undefined) }),
}));

const campaigns = [
  { id: 1, name: 'Rise of the Runelords', slug: 'rotrl', role: 'Player' },
  { id: 2, name: 'Skulls & Shackles', slug: 'sns', role: 'DM' },
];
vi.mock('../../../../contexts/CampaignContext', () => ({
  useCampaign: () => ({
    refresh: vi.fn().mockResolvedValue(undefined),
    campaigns,
    currentCampaign: { id: 1, name: 'Rise of the Runelords', slug: 'rotrl' },
  }),
}));

vi.mock('../../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({ timezone: 'UTC', loading: false, error: null }),
}));

import api from '../../../../utils/api';
import CharacterTab from '../CharacterTab';

const rows = [
  { id: 1, name: 'Valeros', active: true, appraisal_bonus: 2, birthday: null, deathday: null, campaign_id: 1, campaign_name: 'Rise of the Runelords', campaign_active: true },
  { id: 2, name: 'Jirelle', active: true, appraisal_bonus: 0, birthday: null, deathday: null, campaign_id: 2, campaign_name: 'Skulls & Shackles', campaign_active: false },
];

// MUI Select needs a working ResizeObserver constructor
class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
(global as any).ResizeObserver = MockResizeObserver;

describe('CharacterTab across campaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: rows } as never);
    vi.mocked(api.post).mockResolvedValue({ data: {} } as never);
  });

  it('asks for every campaign and names the campaign on each row', async () => {
    render(<CharacterTab />);

    expect(await screen.findByText('Valeros')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/user/characters', { params: { scope: 'all' } });

    const jirelle = screen.getByText('Jirelle').closest('tr') as HTMLElement;
    expect(within(jirelle).getByText('Skulls & Shackles')).toBeInTheDocument();
    expect(within(jirelle).getByText('Inactive campaign')).toBeInTheDocument();
    const valeros = screen.getByText('Valeros').closest('tr') as HTMLElement;
    expect(within(valeros).queryByText('Inactive campaign')).not.toBeInTheDocument();
  });

  it('creates a new character in the chosen campaign', async () => {
    render(<CharacterTab />);
    await screen.findByText('Valeros');

    fireEvent.click(screen.getByRole('button', { name: /add character/i }));
    // Defaults to the open campaign
    const picker = await screen.findByRole('combobox', { name: /campaign/i });
    expect(picker).toHaveTextContent('Rise of the Runelords');

    fireEvent.mouseDown(picker);
    fireEvent.click(await screen.findByRole('option', { name: 'Skulls & Shackles' }));
    fireEvent.change(screen.getByLabelText(/character name/i), { target: { value: 'Kyra' } });
    fireEvent.click(screen.getByRole('button', { name: /create character/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/user/characters', expect.objectContaining({ name: 'Kyra', campaignId: 2 }))
    );
  });
});
