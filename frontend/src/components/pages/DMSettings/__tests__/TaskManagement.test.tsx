import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import React from 'react';
import { SnackbarProvider } from 'notistack';

// Mock the api utility (4 levels up from DMSettings/__tests__/)
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../../utils/api';
import TaskManagement from '../TaskManagement';

const TASKS = [
  {
    id: 1,
    phase: 'pre',
    name: 'Get Dice Trays',
    quantity: 1,
    min_characters: null,
    is_snack_master: false,
    sort_order: 1,
  },
  {
    id: 2,
    phase: 'pre',
    name: 'Bring in extra chairs if needed',
    quantity: 1,
    min_characters: 6,
    is_snack_master: false,
    sort_order: 2,
  },
  {
    id: 3,
    phase: 'during',
    name: 'Loot Master',
    quantity: 2,
    min_characters: null,
    is_snack_master: false,
    sort_order: 1,
  },
  {
    id: 4,
    phase: 'post',
    name: 'Ensure no duplicate snacks for next session',
    quantity: 1,
    min_characters: null,
    is_snack_master: true,
    sort_order: 1,
  },
];

const renderPage = () =>
  render(
    <SnackbarProvider maxSnack={3}>
      <TaskManagement />
    </SnackbarProvider>
  );

describe('TaskManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: { data: TASKS } });
    vi.mocked(api.post).mockResolvedValue({ data: { data: {} } });
    vi.mocked(api.put).mockResolvedValue({ data: { data: [] } });
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
  });

  it('loads and groups tasks by phase with their metadata chips', async () => {
    renderPage();

    expect(await screen.findByText('Get Dice Trays')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/session-tasks');
    expect(screen.getByText('Loot Master')).toBeInTheDocument();
    expect(screen.getByText('2 copies')).toBeInTheDocument();
    expect(screen.getByText('6+ characters')).toBeInTheDocument();
    expect(screen.getByText('Snack Master')).toBeInTheDocument();
  });

  it('shows a retryable error when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('boom'));
    renderPage();

    expect(await screen.findByText('boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Get Dice Trays')).toBeInTheDocument();
  });

  it('adds a task to the chosen phase', async () => {
    renderPage();
    await screen.findByText('Get Dice Trays');

    // The During Session card's Add button opens the dialog pre-set to that phase.
    const addButtons = screen.getAllByRole('button', { name: /add task/i });
    fireEvent.click(addButtons[1]);

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/task name/i), {
      target: { value: 'Snack Runner' },
    });
    fireEvent.change(within(dialog).getByLabelText(/copies/i), {
      target: { value: '2' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/session-tasks', {
        phase: 'during',
        name: 'Snack Runner',
        quantity: 2,
        min_characters: null,
        is_snack_master: false,
      });
    });
    // List is reloaded after a save.
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it('validates the form before saving', async () => {
    renderPage();
    await screen.findByText('Get Dice Trays');

    fireEvent.click(screen.getAllByRole('button', { name: /add task/i })[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^add$/i }));

    expect(
      await within(dialog).findByText(/task name is required/i)
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('edits an existing task', async () => {
    renderPage();
    await screen.findByText('Get Dice Trays');

    fireEvent.click(
      screen.getByRole('button', { name: /edit get dice trays/i })
    );
    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText(
      /task name/i
    ) as HTMLInputElement;
    expect(nameInput.value).toBe('Get Dice Trays');

    fireEvent.change(nameInput, { target: { value: 'Fetch Dice Trays' } });
    fireEvent.click(
      within(dialog).getByLabelText(/designates the snack master/i)
    );
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/session-tasks/1', {
        phase: 'pre',
        name: 'Fetch Dice Trays',
        quantity: 1,
        min_characters: null,
        is_snack_master: true,
      });
    });
  });

  it('deletes a task after confirmation', async () => {
    renderPage();
    await screen.findByText('Loot Master');

    fireEvent.click(
      screen.getByRole('button', { name: /delete loot master/i })
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/session-tasks/3')
    );
    await waitFor(() =>
      expect(screen.queryByText('Loot Master')).not.toBeInTheDocument()
    );
  });

  it('reorders a task within its phase', async () => {
    renderPage();
    await screen.findByText('Get Dice Trays');

    fireEvent.click(
      screen.getByRole('button', { name: /move get dice trays down/i })
    );

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/session-tasks/reorder', {
        phase: 'pre',
        ids: [2, 1],
      });
    });
  });

  it('restores defaults after confirmation', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: TASKS } });
    renderPage();
    await screen.findByText('Get Dice Trays');

    fireEvent.click(screen.getByRole('button', { name: /restore defaults/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: /restore defaults/i })
    );

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/session-tasks/reset-defaults', {})
    );
  });
});
