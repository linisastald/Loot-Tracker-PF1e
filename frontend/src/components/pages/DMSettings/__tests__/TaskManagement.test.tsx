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

// Every option at its default, as the API returns it
const OPTION_DEFAULTS = {
  quantity: 1,
  min_characters: null,
  max_characters: null,
  is_snack_master: false,
  requires_previous_attendance: false,
  exclude_late: false,
  exclude_early: false,
  dm_eligible: false,
  announce_label: null,
  sticky: false,
  avoid_repeat: false,
  priority: 0,
  is_active: true,
  description: null,
  fixed_character_id: null,
};

const TASKS = [
  { id: 1, phase: 'pre', name: 'Get Dice Trays', sort_order: 1, ...OPTION_DEFAULTS, exclude_late: true },
  {
    id: 2, phase: 'pre', name: 'Bring in extra chairs if needed', sort_order: 2,
    ...OPTION_DEFAULTS, exclude_late: true, min_characters: 6,
  },
  {
    id: 3, phase: 'during', name: 'Loot Master', sort_order: 1,
    ...OPTION_DEFAULTS, quantity: 2, sticky: true, priority: 1, description: 'Track the party loot',
  },
  {
    id: 4, phase: 'post', name: 'Ensure no duplicate snacks for next session', sort_order: 1,
    ...OPTION_DEFAULTS, dm_eligible: true, is_snack_master: true, announce_label: 'Snack Master',
    fixed_character_id: 42,
  },
];

const CHARACTERS = [
  { id: 42, name: 'Fighter Bob', player_name: 'Bob' },
  { id: 43, name: 'Wizard Alice', player_name: 'Alice' },
];

// What the page sends for a task with nothing but a name set in the dialog
const payloadDefaults = (phase: string) => ({
  phase,
  description: null,
  quantity: 1,
  min_characters: null,
  max_characters: null,
  is_active: true,
  exclude_late: phase === 'pre',
  exclude_early: false,
  dm_eligible: phase === 'post',
  requires_previous_attendance: false,
  fixed_character_id: null,
  sticky: false,
  avoid_repeat: false,
  priority: 0,
  announce_label: null,
});

const taskListCalls = () =>
  vi.mocked(api.get).mock.calls.filter(call => call[0] === '/session-tasks').length;

const renderPage = () =>
  render(
    <SnackbarProvider maxSnack={3}>
      <TaskManagement />
    </SnackbarProvider>
  );

describe('TaskManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/user/active-characters') return Promise.resolve({ data: CHARACTERS });
      return Promise.resolve({ data: { data: TASKS } });
    });
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
    expect(screen.getAllByText('Not late arrivals')).toHaveLength(2);
    expect(screen.getByText('Sticky')).toBeInTheDocument();
    expect(screen.getByText('High priority')).toBeInTheDocument();
    expect(screen.getByText('Track the party loot')).toBeInTheDocument();
    expect(screen.getByText('DM can draw')).toBeInTheDocument();
    expect(screen.getByText('Announces Snack Master')).toBeInTheDocument();
    // The fixed assignee is shown by name once the character list has loaded.
    expect(await screen.findByText('Always Fighter Bob')).toBeInTheDocument();
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
        ...payloadDefaults('during'),
        name: 'Snack Runner',
        quantity: 2,
      });
    });
    // List is reloaded after a save.
    await waitFor(() => expect(taskListCalls()).toBe(2));
  });

  it('pre-fills a new pre-session task to skip late arrivals and a post-session task to let the DM draw', async () => {
    renderPage();
    await screen.findByText('Get Dice Trays');

    fireEvent.click(screen.getAllByRole('button', { name: /add task/i })[2]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/the dm can draw this task/i)).toBeChecked();
    expect(within(dialog).getByLabelText(/skip characters arriving late/i)).not.toBeChecked();

    fireEvent.change(within(dialog).getByLabelText(/task name/i), {
      target: { value: 'Lock up' },
    });
    fireEvent.change(within(dialog).getByLabelText(/announce as/i), {
      target: { value: 'Key holder' },
    });
    fireEvent.change(within(dialog).getByLabelText(/description/i), {
      target: { value: 'Check both doors' },
    });
    fireEvent.click(within(dialog).getByLabelText(/never the same person two sessions running/i));
    fireEvent.click(within(dialog).getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/session-tasks', {
        ...payloadDefaults('post'),
        name: 'Lock up',
        description: 'Check both doors',
        announce_label: 'Key holder',
        avoid_repeat: true,
      });
    });
  });

  it('refuses a task that is both sticky and rotating', async () => {
    renderPage();
    await screen.findByText('Get Dice Trays');

    fireEvent.click(screen.getByRole('button', { name: /edit loot master/i }));
    const dialog = await screen.findByRole('dialog');
    // Loot Master is sticky, so the rotate option is disabled.
    expect(within(dialog).getByLabelText(/stays with whoever had it last session/i)).toBeChecked();
    expect(within(dialog).getByLabelText(/never the same person two sessions running/i)).toBeDisabled();
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

    // Existing options are loaded into the form.
    expect(within(dialog).getByLabelText(/skip characters arriving late/i)).toBeChecked();

    fireEvent.change(nameInput, { target: { value: 'Fetch Dice Trays' } });
    fireEvent.change(within(dialog).getByLabelText(/maximum characters/i), {
      target: { value: '8' },
    });
    fireEvent.click(within(dialog).getByLabelText(/requires attendance at the last session/i));
    fireEvent.click(within(dialog).getByLabelText(/^active$/i));
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/session-tasks/1', {
        ...payloadDefaults('pre'),
        name: 'Fetch Dice Trays',
        max_characters: 8,
        requires_previous_attendance: true,
        is_active: false,
      });
    });
  });

  it('loads the fixed assignee and announce label into the edit form', async () => {
    renderPage();
    await screen.findByText('Always Fighter Bob');

    fireEvent.click(
      screen.getByRole('button', { name: /edit ensure no duplicate snacks/i })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      (within(dialog).getByLabelText(/announce as/i) as HTMLInputElement).value
    ).toBe('Snack Master');
    expect(within(dialog).getByLabelText(/always goes to/i)).toHaveTextContent('Fighter Bob');
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
