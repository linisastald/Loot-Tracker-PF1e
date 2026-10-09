import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const refreshUser = vi.fn();
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'p', role: 'Player' }, isAuthenticated: true, refreshUser }),
}));

const refreshCampaign = vi.fn();
vi.mock('../../../../contexts/CampaignContext', () => ({
  useCampaign: () => ({ refresh: refreshCampaign }),
}));

vi.mock('../../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({ timezone: 'America/New_York', loading: false, error: null }),
}));

import api from '../../../../utils/api';
import CharacterTab from '../CharacterTab';

const characters = [
  { id: 1, name: 'Valeros', active: true, appraisal_bonus: 2, birthday: '2000-01-15T00:00:00.000Z', deathday: null },
  { id: 2, name: 'Seoni', active: false, appraisal_bonus: 0, birthday: null, deathday: null },
];

describe('CharacterTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshUser.mockResolvedValue(undefined);
    refreshCampaign.mockResolvedValue(undefined);
    vi.mocked(api.get).mockResolvedValue({ data: characters } as never);
    vi.mocked(api.put).mockResolvedValue({ data: {} } as never);
    vi.mocked(api.post).mockResolvedValue({ data: {} } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists the characters', async () => {
    render(<CharacterTab />);
    expect(await screen.findByText('Valeros')).toBeInTheDocument();
    expect(screen.getByText('Seoni')).toBeInTheDocument();
  });

  it('shows an error when the list cannot be loaded', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('down'));
    render(<CharacterTab />);
    expect(await screen.findByText('Failed to load characters')).toBeInTheDocument();
  });

  it('sets a character active, reloads the list and refreshes the cached user', async () => {
    render(<CharacterTab />);
    await screen.findByText('Seoni');
    const row = screen.getByText('Seoni').closest('tr') as HTMLElement;

    fireEvent.click(within(row).getAllByRole('button')[0]);

    expect(await screen.findByText('Seoni is now your active character')).toBeInTheDocument();
    expect(api.put).toHaveBeenCalledWith('/user/characters', { id: 2, active: true });
    expect(refreshUser).toHaveBeenCalledTimes(1);
    // the campaign context serves the active character of the selected campaign
    expect(refreshCampaign).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('reports a failed change and does not refresh the user', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(new Error('nope'));
    render(<CharacterTab />);
    await screen.findByText('Seoni');
    const row = screen.getByText('Seoni').closest('tr') as HTMLElement;

    fireEvent.click(within(row).getAllByRole('button')[0]);

    expect(await screen.findByText('Failed to set active character')).toBeInTheDocument();
    expect(refreshUser).not.toHaveBeenCalled();
  });

  it('dates the death in the campaign timezone, not UTC', async () => {
    // 02:30 UTC on 10 March is still the evening of 9 March in New York
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-03-10T02:30:00Z') });
    render(<CharacterTab />);
    await screen.findByText('Seoni');
    const row = screen.getByText('Seoni').closest('tr') as HTMLElement;

    fireEvent.click(within(row).getAllByRole('button')[2]);
    fireEvent.click(await screen.findByRole('button', { name: /confirm death/i }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/user/characters', { id: 2, deathday: '2026-03-09', active: false })
    );
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
  });

  it('prefills the edit dialog from the stored dates and saves the change', async () => {
    render(<CharacterTab />);
    await screen.findByText('Valeros');
    const row = screen.getByText('Valeros').closest('tr') as HTMLElement;

    fireEvent.click(within(row).getAllByRole('button')[1]);
    expect(await screen.findByLabelText('Birthday')).toHaveValue('2000-01-15');

    fireEvent.change(screen.getByLabelText(/character name/i), { target: { value: 'Valeros the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: /update character/i }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        '/user/characters',
        expect.objectContaining({ id: 1, name: 'Valeros the Bold', birthday: '2000-01-15' })
      )
    );
    expect(await screen.findByText('Character updated successfully')).toBeInTheDocument();
    expect(refreshUser).toHaveBeenCalled();
  });

  it('creates a character from a blank form', async () => {
    render(<CharacterTab />);
    await screen.findByText('Valeros');

    fireEvent.click(screen.getByRole('button', { name: /add character/i }));
    fireEvent.change(await screen.findByLabelText(/character name/i), { target: { value: 'Kyra' } });
    fireEvent.click(screen.getByRole('button', { name: /create character/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/user/characters', {
        name: 'Kyra', appraisal_bonus: 0, birthday: '', deathday: '', active: false,
      })
    );
    expect(await screen.findByText('Character created successfully')).toBeInTheDocument();
  });
});
