import { describe, it, expect } from 'vitest';
import { dealTasks, FREE_SPACE } from '../taskDealer';
import type { TaskDefinition } from '../../types/sessionTasks';
import { unwrapList } from '../apiResponse';

let nextId = 1;
const def = (
  phase: TaskDefinition['phase'],
  name: string,
  over: Partial<TaskDefinition> = {}
): TaskDefinition => ({
  id: nextId++,
  phase,
  name,
  quantity: 1,
  min_characters: null,
  max_characters: null,
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
  sort_order: nextId,
  ...over,
});

const base = {
  lateArrivals: {},
  earlyLeavers: {},
  attendedLastSession: {},
};

describe('dealTasks', () => {
  it('keeps two characters with the same name apart (F-1464)', () => {
    const { assignments } = dealTasks({
      ...base,
      definitions: [
        def('during', 'Lore Master'),
        def('during', 'Calendar Master'),
      ],
      characters: [
        { id: 1, name: 'Sam' },
        { id: 2, name: 'Sam' },
      ],
    });

    // Before the fix both shared one bucket: one entry holding both tasks.
    const entries = Object.entries(assignments.during);
    expect(entries).toHaveLength(2);
    expect(entries.map(([name]) => name).sort()).toEqual([
      'Sam (#1)',
      'Sam (#2)',
    ]);
    for (const [, tasks] of entries) expect(tasks).toHaveLength(1);
    expect(Object.values(assignments.during).flat().sort()).toEqual([
      'Calendar Master',
      'Lore Master',
    ]);
  });

  it('does not merge a character called DM with the DM dealee (F-1464)', () => {
    const { assignments } = dealTasks({
      ...base,
      definitions: [
        def('post', 'Wipe TV', { dm_eligible: true }),
        def('post', 'Trash', { dm_eligible: true }),
      ],
      characters: [{ id: 9, name: 'DM' }],
    });

    expect(Object.keys(assignments.post).sort()).toEqual(['DM', 'DM (#9)']);
    expect(Object.values(assignments.post).flat().sort()).toEqual([
      'Trash',
      'Wipe TV',
    ]);
  });

  it('plain names are used as they are when nothing clashes', () => {
    const { assignments } = dealTasks({
      ...base,
      definitions: [def('pre', 'Get Dice Trays')],
      characters: [
        { id: 1, name: 'Bob' },
        { id: 2, name: 'Alice' },
      ],
    });
    expect(Object.keys(assignments.pre).sort()).toEqual(['Alice', 'Bob']);
    expect(Object.values(assignments.pre).flat().sort()).toEqual([
      FREE_SPACE,
      'Get Dice Trays',
    ]);
  });

  it('matches last session holders by display name for sticky tasks', () => {
    for (let i = 0; i < 10; i++) {
      const { assignments } = dealTasks({
        ...base,
        definitions: [def('during', 'Loot Master', { sticky: true })],
        characters: [
          { id: 1, name: 'Bob' },
          { id: 2, name: 'Alice' },
          { id: 3, name: 'Cat' },
        ],
        lastAssignments: {
          pre: {},
          during: { Cat: ['Loot Master'] },
          post: {},
        },
      });
      expect(
        Object.entries(assignments.during).find(([, t]) =>
          t.includes('Loot Master')
        )?.[0]
      ).toBe('Cat');
    }
  });

  it('is deterministic for a fixed random source', () => {
    const run = () =>
      dealTasks({
        ...base,
        definitions: [
          def('during', 'A'),
          def('during', 'B'),
          def('during', 'C'),
        ],
        characters: [
          { id: 1, name: 'Bob' },
          { id: 2, name: 'Alice' },
          { id: 3, name: 'Cat' },
        ],
        random: () => 0.3,
      });
    expect(run()).toEqual(run());
  });
});

// The page tests deal twice each; the randomised rules are repeated here, cheaply.
describe('dealTasks rules over many random deals', () => {
  const FOUR = [
    { id: 1, name: 'Fighter Bob' },
    { id: 2, name: 'Wizard Alice' },
    { id: 3, name: 'Rogue Cat' },
    { id: 4, name: 'Cleric Dan' },
  ];
  const ROUNDS = 100;
  const holdersOf = (group: Record<string, string[]>, taskName: string) =>
    Object.entries(group)
      .filter(([, tasks]) => tasks.includes(taskName))
      .map(([name]) => name);

  it('only deals a previous-attendance task to people who were there, with equal slots', () => {
    for (let i = 0; i < ROUNDS; i++) {
      const { assignments } = dealTasks({
        ...base,
        attendedLastSession: { 1: true, 2: true },
        definitions: [
          def('pre', 'Get Dice Trays', { exclude_late: true }),
          def('pre', 'Recap', {
            exclude_late: true,
            requires_previous_attendance: true,
          }),
          def('pre', 'Wipe TV'),
        ],
        characters: FOUR,
      });
      const holders = holdersOf(assignments.pre, 'Recap');
      expect(holders).toHaveLength(1);
      expect(['Fighter Bob', 'Wizard Alice']).toContain(holders[0]);
      expect(
        new Set(Object.values(assignments.pre).map(t => t.length)).size
      ).toBe(1);
    }
  });

  it('gives a fixed-assignee task to that character and keeps sticky tasks with last holders', () => {
    for (let i = 0; i < ROUNDS; i++) {
      const { assignments } = dealTasks({
        ...base,
        definitions: [
          def('during', 'Calendar Master', { fixed_character_id: 3 }),
          def('during', 'Loot Master', { quantity: 2, sticky: true }),
          def('during', 'Lore Master'),
        ],
        characters: FOUR,
        lastAssignments: {
          pre: {},
          during: {
            'Wizard Alice': ['Loot Master'],
            'Cleric Dan': ['Loot Master', 'Lore Master'],
          },
          post: {},
        },
      });
      expect(holdersOf(assignments.during, 'Calendar Master')).toEqual([
        'Rogue Cat',
      ]);
      expect(holdersOf(assignments.during, 'Loot Master').sort()).toEqual([
        'Cleric Dan',
        'Wizard Alice',
      ]);
      for (const tasks of Object.values(assignments.during))
        expect(tasks).toHaveLength(1);
    }
  });

  it('never repeats a rotating task on last holder while someone else can take it', () => {
    for (let i = 0; i < ROUNDS; i++) {
      const { assignments } = dealTasks({
        ...base,
        definitions: [
          def('post', 'Trash run', { avoid_repeat: true }),
          def('post', 'Wipe TV'),
        ],
        characters: FOUR,
        lastAssignments: {
          pre: {},
          during: {},
          post: { 'Fighter Bob': ['Trash run'] },
        },
      });
      expect(holdersOf(assignments.post, 'Trash run')).not.toContain(
        'Fighter Bob'
      );
      expect(assignments.post.DM).toBeUndefined();
    }
  });

  it('skips inactive tasks, tasks over their maximum and early leavers for tasks that exclude them', () => {
    for (let i = 0; i < ROUNDS; i++) {
      const { assignments } = dealTasks({
        ...base,
        earlyLeavers: { 1: true },
        definitions: [
          def('during', 'Retired job', { is_active: false }),
          def('during', 'Small table only', { max_characters: 3 }),
          def('during', 'Lock up', { exclude_early: true }),
          def('during', 'Lore Master'),
        ],
        characters: FOUR,
      });
      const all = Object.values(assignments.during).flat();
      expect(all).not.toContain('Retired job');
      expect(all).not.toContain('Small table only');
      expect(holdersOf(assignments.during, 'Lock up')).toHaveLength(1);
      expect(holdersOf(assignments.during, 'Lock up')).not.toContain(
        'Fighter Bob'
      );
    }
  });

  it('never crowds out a constrained task while someone else still has a free slot', () => {
    for (let i = 0; i < ROUNDS; i++) {
      const { assignments, notes } = dealTasks({
        ...base,
        attendedLastSession: { 1: true },
        definitions: [
          def('pre', 'Get Dice Trays'),
          def('pre', 'Wipe TV'),
          def('pre', 'Recap', { requires_previous_attendance: true }),
          def('pre', 'Name tags'),
        ],
        characters: FOUR,
      });
      expect(assignments.pre['Fighter Bob']).toEqual(['Recap']);
      expect(Object.values(assignments.pre).flat()).not.toContain(FREE_SPACE);
      expect(notes).toEqual([]);
    }
  });

  it('always deals every task that has an eligible person, even past the even share', () => {
    for (let i = 0; i < ROUNDS; i++) {
      const { assignments, notes } = dealTasks({
        ...base,
        attendedLastSession: { 1: true },
        definitions: [
          def('pre', 'Get Dice Trays'),
          def('pre', 'Recap', {
            requires_previous_attendance: true,
            priority: 2,
          }),
          def('pre', 'Continue the cliffhanger', {
            requires_previous_attendance: true,
            priority: 2,
          }),
          def('pre', 'Remind everyone of the NPC names', {
            requires_previous_attendance: true,
          }),
        ],
        characters: FOUR,
      });
      // Only Bob can take three of the four tasks, so he holds all three;
      // nothing is left out and nothing is reported as not dealt.
      expect(assignments.pre['Fighter Bob']).toEqual(
        expect.arrayContaining([
          'Recap',
          'Continue the cliffhanger',
          'Remind everyone of the NPC names',
        ])
      );
      expect(Object.values(assignments.pre).flat()).toContain('Get Dice Trays');
      expect(notes).toEqual([]);
      // Everyone shows the same number of slots; Free Space fills the gaps,
      // so a player can hold more than one Free Space.
      Object.values(assignments.pre).forEach(tasks =>
        expect(tasks).toHaveLength(3)
      );
      expect(
        Object.values(assignments.pre).some(
          tasks => tasks.filter(t => t === FREE_SPACE).length > 1
        )
      ).toBe(true);
    }
  });

  it('deals two copies of a task to two different people', () => {
    for (let i = 0; i < ROUNDS; i++) {
      const { assignments } = dealTasks({
        ...base,
        definitions: [
          def('during', 'Loot Master', { quantity: 2 }),
          def('during', 'Lore Master'),
        ],
        characters: FOUR,
      });
      expect(holdersOf(assignments.during, 'Loot Master')).toHaveLength(2);
      for (const tasks of Object.values(assignments.during))
        expect(new Set(tasks).size).toBe(tasks.length);
    }
  });
});

describe('dealTasks free space for the ineligible (round 4)', () => {
  const THREE = [
    { id: 1, name: 'Fighter Bob' },
    { id: 2, name: 'Wizard Alice' },
    { id: 3, name: 'Rogue Cat' },
  ];

  it('lists a character who is ineligible for every task in a phase and pads them with Free Space', () => {
    for (let i = 0; i < 50; i++) {
      const { assignments } = dealTasks({
        ...base,
        attendedLastSession: { 1: true, 2: true },
        definitions: [
          def('pre', 'Recap', { requires_previous_attendance: true }),
          def('pre', 'Briefing', { requires_previous_attendance: true }),
          def('pre', 'Maps', { requires_previous_attendance: true }),
        ],
        characters: THREE,
      });
      const cat = assignments.pre['Rogue Cat'];
      expect(cat).toBeDefined();
      expect(cat.every(task => task === FREE_SPACE)).toBe(true);
      // padded up to the busiest person's slot count
      const busiest = Math.max(...Object.values(assignments.pre).map(t => t.length));
      expect(cat).toHaveLength(busiest);
      // every task is still dealt
      const real = Object.values(assignments.pre).flat().filter(t => t !== FREE_SPACE);
      expect(real.sort()).toEqual(['Briefing', 'Maps', 'Recap']);
    }
  });

  it('adds nobody to a phase with nothing to deal', () => {
    const { assignments } = dealTasks({
      ...base,
      definitions: [def('pre', 'Recap')],
      characters: THREE,
    });
    expect(assignments.during).toEqual({});
    expect(assignments.post).toEqual({});
  });
});

describe('unwrapList', () => {
  it('accepts the envelope, a data-only wrapper, a bare array and junk', () => {
    expect(unwrapList({ data: { data: [1] } })).toEqual([1]);
    expect(unwrapList({ data: [2] })).toEqual([2]);
    expect(unwrapList([3])).toEqual([3]);
    expect(unwrapList(null)).toEqual([]);
    expect(unwrapList({ data: { data: 'x' } })).toEqual([]);
  });
});
