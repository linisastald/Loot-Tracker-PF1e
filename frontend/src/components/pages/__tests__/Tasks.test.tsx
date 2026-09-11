import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import Tasks from '../Tasks';
import api from '../../../utils/api';

// Stock task definitions as served by GET /session-tasks
const TASK_DEFINITIONS = [
  { id: 1, phase: 'pre', name: 'Get Dice Trays', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 1 },
  { id: 2, phase: 'pre', name: 'Recap', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 2 },
  { id: 3, phase: 'pre', name: 'Bring in extra chairs if needed', quantity: 1, min_characters: 6, is_snack_master: false, sort_order: 3 },
  { id: 4, phase: 'during', name: 'Calendar Master', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 1 },
  { id: 5, phase: 'during', name: 'Loot Master', quantity: 2, min_characters: null, is_snack_master: false, sort_order: 2 },
  { id: 6, phase: 'during', name: 'Lore Master', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 3 },
  { id: 7, phase: 'post', name: 'TV(s) wiped and turned off', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 1 },
  { id: 8, phase: 'post', name: 'Ensure no duplicate snacks for next session', quantity: 1, min_characters: null, is_snack_master: true, sort_order: 2 },
];

// Route api.get by URL: task definitions, characters, and everything else empty.
const mockGetWithCharacters = (characters: Array<{ id: number; name: string; player_name: string }>) => {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === '/session-tasks') return Promise.resolve({ data: { data: TASK_DEFINITIONS } });
    if (url === '/user/active-characters') return Promise.resolve({ data: characters });
    return Promise.resolve({ data: [] });
  });
};

const renderComponent = () =>
  render(
    <BrowserRouter>
      <Tasks />
    </BrowserRouter>
  );

describe('Tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the character selection instructions', async () => {
    renderComponent();
    expect(
      await screen.findByText(/characters who have rsvp'd/i)
    ).toBeInTheDocument();
  });

  it('renders the assign tasks button', () => {
    renderComponent();
    expect(
      screen.getByRole('button', { name: /assign tasks and send to discord/i })
    ).toBeInTheDocument();
  });

  it('renders the ready to assign section', () => {
    renderComponent();
    expect(screen.getByText(/ready to assign tasks/i)).toBeInTheDocument();
  });

  it('shows character count as 0 selected initially', () => {
    renderComponent();
    expect(screen.getByText(/0 selected, 0 arriving late/i)).toBeInTheDocument();
  });

  it('fetches active characters on mount', () => {
    renderComponent();
    expect(api.get).toHaveBeenCalledWith('/user/active-characters');
  });

  it('renders character names when returned from API', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: [
        { id: 1, name: 'Fighter Bob', player_name: 'Bob' },
        { id: 2, name: 'Wizard Alice', player_name: 'Alice' },
      ],
    });
    renderComponent();
    expect(await screen.findByText('Fighter Bob')).toBeInTheDocument();
    expect(screen.getByText('Wizard Alice')).toBeInTheDocument();
  });

  it('displays task description text', () => {
    renderComponent();
    expect(
      screen.getByText(/tasks will be randomly assigned to selected characters/i)
    ).toBeInTheDocument();
  });

  it('renders Assign and History tabs', () => {
    renderComponent();
    expect(screen.getByRole('tab', { name: /assign/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument();
  });

  it('fetches task history when the History tab is opened', async () => {
    renderComponent();

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/sessions/task-history');
    });
  });

  it('shows an empty-state message when there is no history', async () => {
    renderComponent();

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));

    expect(
      await screen.findByText(/no task assignments have been saved yet/i)
    ).toBeInTheDocument();
  });

  it('renders saved history records returned from the API', async () => {
    // First call: active-characters; pre-populate call; then history fetch.
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/sessions/task-history') {
        return Promise.resolve({
          data: {
            data: [
              {
                id: 1,
                session_id: 5,
                session_title: 'Session 12',
                assignments: { pre: {}, during: {}, post: {} },
                character_count: 4,
                late_count: 1,
                created_by_name: 'testdm',
                created_at: '2026-05-01T18:00:00Z',
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderComponent();
    fireEvent.click(screen.getByRole('tab', { name: /history/i }));

    expect(await screen.findByText('Session 12')).toBeInTheDocument();
  });

  it('fetches the DM-defined task list on mount', () => {
    renderComponent();
    expect(api.get).toHaveBeenCalledWith('/session-tasks');
  });

  it('warns instead of assigning when no tasks are defined', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/user/active-characters') {
        return Promise.resolve({ data: [{ id: 1, name: 'Fighter Bob', player_name: 'Bob' }] });
      }
      return Promise.resolve({ data: [] });
    });
    renderComponent();

    fireEvent.click(await screen.findByText('Fighter Bob'));
    fireEvent.click(
      screen.getByRole('button', { name: /assign tasks and send to discord/i })
    );

    expect(await screen.findByText(/no tasks are defined for this campaign/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('saves the assignment to history when tasks are assigned', async () => {
    mockGetWithCharacters([{ id: 1, name: 'Fighter Bob', player_name: 'Bob' }]);
    renderComponent();

    // Select the character, then assign.
    fireEvent.click(await screen.findByText('Fighter Bob'));
    fireEvent.click(
      screen.getByRole('button', { name: /assign tasks and send to discord/i })
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/sessions/task-history',
        expect.objectContaining({
          assignments: expect.any(Object),
          character_count: 1,
        })
      );
    });
  });

  it('assigns two Loot Masters but never both to the same person', async () => {
    mockGetWithCharacters([
      { id: 1, name: 'Fighter Bob', player_name: 'Bob' },
      { id: 2, name: 'Wizard Alice', player_name: 'Alice' },
      { id: 3, name: 'Rogue Cat', player_name: 'Cat' },
      { id: 4, name: 'Cleric Dan', player_name: 'Dan' },
    ]);
    renderComponent();

    // Select all four characters.
    fireEvent.click(await screen.findByText('Fighter Bob'));
    fireEvent.click(screen.getByText('Wizard Alice'));
    fireEvent.click(screen.getByText('Rogue Cat'));
    fireEvent.click(screen.getByText('Cleric Dan'));

    fireEvent.click(
      screen.getByRole('button', { name: /assign tasks and send to discord/i })
    );

    let assignments: { pre: Record<string, string[]>; during: Record<string, string[]>; post: Record<string, string[]> } =
      { pre: {}, during: {}, post: {} };
    await waitFor(() => {
      const call = (api.post as any).mock.calls.find(
        (c: any[]) => c[0] === '/sessions/task-history'
      );
      expect(call).toBeTruthy();
      assignments = call[1].assignments;
    });

    const during = assignments.during;

    // Exactly two Loot Masters total, and no single person holds both.
    const allDuring = Object.values(during).flat();
    expect(allDuring.filter(t => t === 'Loot Master')).toHaveLength(2);
    for (const tasks of Object.values(during)) {
      expect(tasks.filter(t => t === 'Loot Master').length).toBeLessThanOrEqual(1);
    }

    // A task with min_characters 6 stays out of the pool with only 4 selected.
    expect(Object.values(assignments.pre).flat()).not.toContain('Bring in extra chairs if needed');

    // No one should ever receive the same task twice - including Free Space -
    // across any of the three task groups (4 characters is plenty of room).
    for (const group of [assignments.pre, assignments.during, assignments.post]) {
      for (const tasks of Object.values(group)) {
        const counts: Record<string, number> = {};
        for (const t of tasks) counts[t] = (counts[t] || 0) + 1;
        for (const t of Object.keys(counts)) {
          expect(counts[t]).toBe(1);
        }
      }
    }
  });
});
