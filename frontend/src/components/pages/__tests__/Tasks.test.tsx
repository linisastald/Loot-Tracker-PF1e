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

// Every task option at its default, as served by GET /session-tasks
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

let nextId = 1;
const def = (phase: string, name: string, over: Record<string, unknown> = {}) => ({
  id: nextId++,
  phase,
  name,
  sort_order: nextId,
  ...OPTION_DEFAULTS,
  ...over,
});

// Stock task definitions: pre tasks skip late arrivals, post tasks let the DM draw.
const TASK_DEFINITIONS = [
  def('pre', 'Get Dice Trays', { exclude_late: true }),
  def('pre', 'Recap', { exclude_late: true, requires_previous_attendance: true }),
  def('pre', 'Bring in extra chairs if needed', { exclude_late: true, min_characters: 6 }),
  def('during', 'Calendar Master'),
  def('during', 'Loot Master', { quantity: 2 }),
  def('during', 'Lore Master'),
  def('post', 'TV(s) wiped and turned off', { dm_eligible: true }),
  def('post', 'Ensure no duplicate snacks for next session', { dm_eligible: true, announce_label: 'Snack Master' }),
];

// Route api.get by URL: task definitions, characters, optionally who was at
// the last session, and everything else empty.
const mockGetWithCharacters = (
  characters: Array<{ id: number; name: string; player_name: string }>,
  lastSessionCharacterIds: number[] | null = null,
  definitions: unknown[] = TASK_DEFINITIONS,
  lastAssignments: Record<string, Record<string, string[]>> | null = null
) => {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === '/session-tasks') return Promise.resolve({ data: { data: definitions } });
    if (url === '/user/active-characters') return Promise.resolve({ data: characters });
    if (url === '/sessions/last-session-attendees') {
      return Promise.resolve({
        data: {
          data: lastSessionCharacterIds === null
            ? null
            : {
              source: 'task_history',
              session_title: 'Session 12',
              recorded_at: '2026-09-04T00:00:00Z',
              character_ids: lastSessionCharacterIds,
              assignments: lastAssignments,
            },
        },
      });
    }
    return Promise.resolve({ data: [] });
  });
};

const selectAll = async () => {
  fireEvent.click(await screen.findByText('Fighter Bob'));
  fireEvent.click(screen.getByText('Wizard Alice'));
  fireEvent.click(screen.getByText('Rogue Cat'));
  fireEvent.click(screen.getByText('Cleric Dan'));
};

const holdersOf = (group: Record<string, string[]>, taskName: string) =>
  Object.entries(group).filter(([, tasks]) => tasks.includes(taskName)).map(([name]) => name);

const FOUR_CHARACTERS = [
  { id: 1, name: 'Fighter Bob', player_name: 'Bob' },
  { id: 2, name: 'Wizard Alice', player_name: 'Alice' },
  { id: 3, name: 'Rogue Cat', player_name: 'Cat' },
  { id: 4, name: 'Cleric Dan', player_name: 'Dan' },
];

type Assignments = { pre: Record<string, string[]>; during: Record<string, string[]>; post: Record<string, string[]> };

// Click Assign and return what was saved to history.
const assignAndReadHistory = async (): Promise<Assignments> => {
  fireEvent.click(
    screen.getByRole('button', { name: /assign tasks and send to discord/i })
  );

  let assignments: Assignments = { pre: {}, during: {}, post: {} };
  await waitFor(() => {
    const call = (api.post as any).mock.calls.find(
      (c: any[]) => c[0] === '/sessions/task-history'
    );
    expect(call).toBeTruthy();
    assignments = call[1].assignments;
  });
  return assignments;
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

    // Nobody is marked as having been at the last session, so Recap is skipped.
    expect(Object.values(assignments.pre).flat()).not.toContain('Recap');

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

  it('only deals a task that requires previous attendance to characters who were at the last session', async () => {
    // Only Bob and Alice were at the last session.
    mockGetWithCharacters(FOUR_CHARACTERS, [1, 2]);
    renderComponent();

    await screen.findByText('Fighter Bob');
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/sessions/last-session-attendees');
    });

    fireEvent.click(screen.getByText('Fighter Bob'));
    fireEvent.click(screen.getByText('Wizard Alice'));
    fireEvent.click(screen.getByText('Rogue Cat'));
    fireEvent.click(screen.getByText('Cleric Dan'));

    // Run the deal several times: the Recap must always land on Bob or Alice
    // and each person must still end up with the same number of pre-session slots.
    for (let round = 0; round < 8; round++) {
      vi.mocked(api.post).mockClear();
      const assignments = await assignAndReadHistory();

      const holders = Object.entries(assignments.pre)
        .filter(([, tasks]) => tasks.includes('Recap'))
        .map(([name]) => name);
      expect(holders).toHaveLength(1);
      expect(['Fighter Bob', 'Wizard Alice']).toContain(holders[0]);

      const slotCounts = Object.values(assignments.pre).map(tasks => tasks.length);
      expect(new Set(slotCounts).size).toBe(1);
      for (const tasks of Object.values(assignments.pre)) {
        expect(new Set(tasks).size).toBe(tasks.length);
      }
    }
  });

  it('lets the DM override who was at the last session and explains a skipped task', async () => {
    mockGetWithCharacters(FOUR_CHARACTERS, [1]);
    renderComponent();

    fireEvent.click(await screen.findByText('Fighter Bob'));
    // Bob is pre-marked from the last session; untick him. (The accessible
    // name comes from the wrapping tooltip.)
    const attendedBoxes = await screen.findAllByRole('checkbox', { name: /was at the last session/i });
    expect(attendedBoxes).toHaveLength(1);
    expect(attendedBoxes[0]).toBeChecked();
    fireEvent.click(attendedBoxes[0]);
    expect(attendedBoxes[0]).not.toBeChecked();

    fireEvent.click(
      screen.getByRole('button', { name: /assign tasks and send to discord/i })
    );

    await waitFor(() => {
      const call = (api.post as any).mock.calls.find(
        (c: any[]) => c[0] === '/sessions/task-history'
      );
      expect(call).toBeTruthy();
      expect(Object.values(call[1].assignments.pre).flat()).not.toContain('Recap');
    });
    expect(
      await screen.findByText(/not dealt: recap \(nobody selected can take it\)/i)
    ).toBeInTheDocument();
  });

  it('gives a fixed-assignee task to that character and keeps a sticky task with last session\'s holder', async () => {
    mockGetWithCharacters(
      FOUR_CHARACTERS,
      [1, 2, 3, 4],
      [
        def('during', 'Calendar Master', { fixed_character_id: 3 }),
        def('during', 'Loot Master', { quantity: 2, sticky: true }),
        def('during', 'Lore Master'),
      ],
      { pre: {}, during: { 'Wizard Alice': ['Loot Master'], 'Cleric Dan': ['Loot Master', 'Lore Master'] }, post: {} }
    );
    renderComponent();
    await selectAll();

    for (let round = 0; round < 6; round++) {
      vi.mocked(api.post).mockClear();
      const assignments = await assignAndReadHistory();
      expect(holdersOf(assignments.during, 'Calendar Master')).toEqual(['Rogue Cat']);
      expect(holdersOf(assignments.during, 'Loot Master').sort()).toEqual(['Cleric Dan', 'Wizard Alice']);
      // Everyone still has exactly one task and nobody has a duplicate.
      for (const tasks of Object.values(assignments.during)) {
        expect(tasks).toHaveLength(1);
      }
    }
  });

  it('never repeats a rotating task on last session\'s holder while someone else can take it', async () => {
    mockGetWithCharacters(
      FOUR_CHARACTERS,
      [1, 2, 3, 4],
      [def('post', 'Trash run', { avoid_repeat: true, dm_eligible: false }), def('post', 'Wipe TV')],
      { pre: {}, during: {}, post: { 'Fighter Bob': ['Trash run'] } }
    );
    renderComponent();
    await selectAll();

    for (let round = 0; round < 8; round++) {
      vi.mocked(api.post).mockClear();
      const assignments = await assignAndReadHistory();
      expect(holdersOf(assignments.post, 'Trash run')).not.toContain('Fighter Bob');
      // No task lets the DM draw, so the DM is not in the post deal.
      expect(assignments.post.DM).toBeUndefined();
    }
  });

  it('skips inactive tasks, tasks over their maximum, and early leavers for tasks that exclude them', async () => {
    mockGetWithCharacters(
      FOUR_CHARACTERS,
      null,
      [
        def('during', 'Retired job', { is_active: false }),
        def('during', 'Small table only', { max_characters: 3 }),
        def('during', 'Lock up', { exclude_early: true }),
        def('during', 'Lore Master'),
      ]
    );
    renderComponent();
    await selectAll();

    // Mark Bob as leaving early (the toggle only appears because a task excludes early leavers).
    const earlyBoxes = await screen.findAllByRole('checkbox', { name: /mark as leaving early/i });
    fireEvent.click(earlyBoxes[0]);
    expect(screen.getByText(/1 leaving early/)).toBeInTheDocument();

    for (let round = 0; round < 6; round++) {
      vi.mocked(api.post).mockClear();
      const assignments = await assignAndReadHistory();
      const all = Object.values(assignments.during).flat();
      expect(all).not.toContain('Retired job');
      expect(all).not.toContain('Small table only');
      expect(holdersOf(assignments.during, 'Lock up')).toHaveLength(1);
      expect(holdersOf(assignments.during, 'Lock up')).not.toContain('Fighter Bob');
    }
  });

  it('never crowds out a constrained task while someone else still has a free slot', async () => {
    // Four people, four pre tasks (one slot each); only Bob was at the last
    // session, so Recap can only go to him. Dealing the other tasks first
    // could fill Bob's slot and leave Recap undealt - it must go first.
    mockGetWithCharacters(
      FOUR_CHARACTERS,
      [1],
      [
        def('pre', 'Get Dice Trays'),
        def('pre', 'Wipe TV'),
        def('pre', 'Recap', { requires_previous_attendance: true }),
        def('pre', 'Name tags'),
      ]
    );
    renderComponent();
    await selectAll();

    for (let round = 0; round < 12; round++) {
      vi.mocked(api.post).mockClear();
      const assignments = await assignAndReadHistory();
      expect(assignments.pre['Fighter Bob']).toEqual(['Recap']);
      expect(Object.values(assignments.pre).flat()).not.toContain('Free Space');
    }
    expect(screen.queryByText(/not dealt/i)).not.toBeInTheDocument();
  });

  it('always deals a must-deal task even when the only eligible person is already full', async () => {
    // Only Bob attended last session. Four tasks for four people means one
    // slot each; three of the tasks can only go to Bob. The two must-deal
    // ones still go out (Bob ends up with three), the normal one is reported
    // as not dealt.
    mockGetWithCharacters(
      FOUR_CHARACTERS,
      [1],
      [
        def('pre', 'Get Dice Trays'),
        def('pre', 'Recap', { requires_previous_attendance: true, priority: 2 }),
        def('pre', 'Continue the cliffhanger', { requires_previous_attendance: true, priority: 2 }),
        def('pre', 'Remind everyone of the NPC names', { requires_previous_attendance: true }),
      ]
    );
    renderComponent();
    await selectAll();

    const assignments = await assignAndReadHistory();
    expect(assignments.pre['Fighter Bob']).toEqual(
      expect.arrayContaining(['Recap', 'Continue the cliffhanger'])
    );
    expect(Object.values(assignments.pre).flat()).not.toContain('Remind everyone of the NPC names');
    expect(
      await screen.findByText(/remind everyone of the npc names \(everyone is full/i)
    ).toBeInTheDocument();
  });
});
