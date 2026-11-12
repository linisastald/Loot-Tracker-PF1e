import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { SnackbarProvider } from 'notistack';

vi.mock('../../../../utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import api from '../../../../utils/api';
import History from '../History';

const ENTRIES = [
  {
    id: 10, user_id: 2, username: 'alice', action: 'loot.status', entity_type: 'loot', entity_ids: [5, 6],
    before: [{ id: 5, name: 'Longsword', status: null, whohas: null }, { id: 6, name: 'Rope', status: null, whohas: null }],
    after: { status: 'Trashed' }, summary: 'Moved 2 items to Trashed: Longsword, Rope',
    created_at: '2026-10-09T10:00:00Z', undone_at: null, undone_by: null, undone_by_username: null, undo_of: null, undoable: true,
  },
  {
    id: 9, user_id: 1, username: 'dm', action: 'gold.create', entity_type: 'gold', entity_ids: [77],
    before: null, after: [{ id: 77, transaction_type: 'Deposit', gold: 100 }], summary: 'Deposit of 100 gp',
    created_at: '2026-10-09T09:00:00Z', undone_at: '2026-10-09T09:30:00Z', undone_by: 1, undone_by_username: 'dm', undo_of: null, undoable: false,
  },
];

const renderPage = () => render(<SnackbarProvider><History /></SnackbarProvider>);

describe('History page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as any).mockResolvedValue({ success: true, data: { entries: ENTRIES, total: 2 } });
  });

  it('lists entries newest first with who, what and an Undo button only where allowed', async () => {
    renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/audit', { params: { limit: 50, offset: 0 } }));

    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]).getByText('alice')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Status change')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('button', { name: /undo/i })).toBeInTheDocument();

    const goldRow = screen.getByText('Deposit of 100 gp').closest('tr') as HTMLElement;
    expect(within(goldRow).queryByRole('button', { name: /undo/i })).toBeNull();
    expect(within(goldRow).getByText(/Undone by dm/)).toBeInTheDocument();
  });

  it('shows the before and after snapshot when a row is expanded', async () => {
    renderPage();
    await screen.findByText('Moved 2 items to Trashed: Longsword, Rope');
    fireEvent.click(screen.getAllByRole('button', { name: 'Show details' })[0]);
    expect(await screen.findByText(/name: Longsword/)).toBeInTheDocument();
    expect(screen.getByText(/status: Trashed/)).toBeInTheDocument();
  });

  it('filters by gold and resets to the first page', async () => {
    renderPage();
    await screen.findByText('Deposit of 100 gp');
    fireEvent.click(screen.getByRole('button', { name: 'Gold' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith('/audit', { params: { limit: 50, offset: 0, entityType: 'gold' } })
    );
  });

  it('undoes an entry after confirmation and reloads', async () => {
    (api.post as any).mockResolvedValue({ success: true, data: {} });
    renderPage();
    await screen.findByText('Moved 2 items to Trashed: Longsword, Rope');
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Moved 2 items to Trashed/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Undo$/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/audit/10/undo'));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Change undone')).toBeInTheDocument();
  });

  it('shows the server reason when an undo is refused', async () => {
    (api.post as any).mockRejectedValue({
      response: { data: { message: 'Undo the later change first: Sold 1 item for 10.00 gp: Longsword' } },
    });
    renderPage();
    await screen.findByText('Moved 2 items to Trashed: Longsword, Rope');
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Undo$/ }));
    expect(await screen.findByText(/Undo the later change first/)).toBeInTheDocument();
  });

  it('shows an empty state and a load error', async () => {
    (api.get as any).mockResolvedValueOnce({ success: true, data: { entries: [], total: 0 } });
    renderPage();
    expect(await screen.findByText('No changes recorded yet.')).toBeInTheDocument();

    (api.get as any).mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('Failed to load history')).toBeInTheDocument();
  });
});
