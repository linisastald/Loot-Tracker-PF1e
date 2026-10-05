/**
 * The session-task deal: hands each selected character (and the DM, for tasks
 * that allow it) their tasks for the pre / during / post phases.
 *
 * Every rule comes from the options on each task definition (eligibility,
 * copies, rotation, priority, fixed assignee); nothing about a phase is
 * hardcoded. Pure apart from the random source, so it can be tested without
 * rendering the Tasks page.
 */
import type {
  TaskAssignment,
  TaskDefinition,
  TaskMap,
  TaskPhase,
} from '../types/sessionTasks';
import { TASK_PHASE_ORDER } from '../types/sessionTasks';

export const FREE_SPACE = 'Free Space';

export interface DealCharacter {
  id: number;
  name: string;
}

export interface DealInput {
  /** Every task definition for the campaign. */
  definitions: TaskDefinition[];
  /** The characters present, i.e. the ones ticked on the page. */
  characters: DealCharacter[];
  lateArrivals: Record<number, boolean>;
  earlyLeavers: Record<number, boolean>;
  attendedLastSession: Record<number, boolean>;
  /** Last session's deal (names -> tasks), for sticky / avoid-repeat. */
  lastAssignments?: TaskAssignment | null;
  /** Random source in [0, 1); injectable for tests. */
  random?: () => number;
}

export interface DealResult {
  assignments: TaskAssignment;
  /** Why a task could not be dealt, shown to the DM afterwards. */
  notes: string[];
}

// Someone who can be dealt a task: a character, or the DM
interface Dealee {
  id: number | 'DM';
  name: string;
}

// One copy of a task in a phase's deal pool
interface PoolTask {
  def: TaskDefinition;
  name: string;
}

export const shuffle = <T>(
  array: T[],
  random: () => number = Math.random
): T[] => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const priorityOf = (def: TaskDefinition): 0 | 1 | 2 =>
  def.priority === 1 || def.priority === 2 ? def.priority : 0;

export function dealTasks(input: DealInput): DealResult {
  const {
    definitions,
    characters,
    lateArrivals,
    earlyLeavers,
    attendedLastSession,
    lastAssignments,
  } = input;
  const random = input.random ?? Math.random;

  const dm: Dealee = { id: 'DM', name: 'DM' };
  const notes: string[] = [];

  // Inactive tasks and ones outside their character-count range stay out.
  const activeDefs = definitions.filter(
    def =>
      def.is_active !== false &&
      (!def.min_characters || characters.length >= def.min_characters) &&
      (!def.max_characters || characters.length <= def.max_characters)
  );

  const isEligible = (def: TaskDefinition, person: Dealee): boolean => {
    if (person.id === 'DM') return def.dm_eligible === true;
    if (def.exclude_late && lateArrivals[person.id]) return false;
    if (def.exclude_early && earlyLeavers[person.id]) return false;
    if (def.requires_previous_attendance && !attendedLastSession[person.id])
      return false;
    return true;
  };

  // Who held each task last session, per phase (task names are only unique
  // within a phase). History stores display names, so this stays name-based.
  const lastHolders: Record<TaskPhase, Record<string, string[]>> = {
    pre: {},
    during: {},
    post: {},
  };
  if (lastAssignments) {
    TASK_PHASE_ORDER.forEach(phase => {
      Object.entries(lastAssignments[phase] ?? {}).forEach(
        ([holder, tasks]) => {
          (tasks || []).forEach(taskName => {
            (lastHolders[phase][taskName] =
              lastHolders[phase][taskName] || []).push(holder);
          });
        }
      );
    });
  }

  const dealPhase = (phase: TaskPhase): TaskMap => {
    const defs = activeDefs.filter(def => def.phase === phase);

    // People in this phase: every selected character who can take at
    // least one of its tasks, plus the DM when a task allows it.
    const candidates: Dealee[] = defs.some(def => def.dm_eligible)
      ? [...characters, dm]
      : [...characters];
    const people = candidates.filter(person =>
      defs.some(def => isEligible(def, person))
    );
    if (people.length === 0) return {};

    // The working maps are keyed by person id, so two characters with the
    // same name (or one called "DM") cannot share a bucket. Names only
    // matter for the result, where a clash gets the character id appended.
    const nameCounts: Record<string, number> = {};
    people.forEach(person => {
      nameCounts[person.name] = (nameCounts[person.name] || 0) + 1;
    });
    const displayName = (person: Dealee): string => {
      if (person.id === 'DM') return 'DM';
      const clash =
        nameCounts[person.name] > 1 ||
        (person.name === 'DM' && people.includes(dm));
      return clash ? `${person.name} (#${person.id})` : person.name;
    };

    // Pool: one entry per copy, clamped to how many people can take the
    // task so nobody draws the same task twice.
    const pool: PoolTask[] = [];
    defs.forEach(def => {
      const eligibleCount = people.filter(person =>
        isEligible(def, person)
      ).length;
      if (eligibleCount === 0) {
        notes.push(`${def.name} (nobody selected can take it)`);
        return;
      }
      const copies = Math.max(1, Math.min(def.quantity, eligibleCount));
      for (let i = 0; i < copies; i++) {
        pool.push({ def, name: def.name });
      }
    });

    const order: Dealee[] = shuffle([...people], random);
    const assigned = new Map<number | 'DM', string[]>();
    order.forEach(person => assigned.set(person.id, []));
    const tasksOf = (person: Dealee): string[] =>
      assigned.get(person.id) as string[];
    const count = (person: Dealee) => tasksOf(person).length;
    const holds = (person: Dealee, taskName: string) =>
      tasksOf(person).includes(taskName);

    // Everyone gets the same number of slots: 1, or 2 once there are more
    // tasks than people, and so on. Free Space fills the gaps at the end.
    const cap = Math.max(1, Math.ceil(pool.length / people.length));

    // Pass 1: a fixed assignee, or last session's holder for a sticky
    // task, keeps the task when present and eligible.
    const remaining: PoolTask[] = [];
    pool.forEach(item => {
      const { def } = item;
      let keeper: Dealee | undefined;
      if (def.fixed_character_id) {
        keeper = order.find(
          person =>
            person.id === def.fixed_character_id &&
            isEligible(def, person) &&
            !holds(person, def.name)
        );
      }
      if (!keeper && def.sticky) {
        const previous = lastHolders[phase][def.name] || [];
        keeper = order.find(
          person =>
            previous.includes(displayName(person)) &&
            isEligible(def, person) &&
            !holds(person, def.name)
        );
      }
      if (keeper) {
        tasksOf(keeper).push(def.name);
      } else {
        remaining.push(item);
      }
    });

    // Pass 2: deal the rest to whoever holds the fewest tasks. "Must
    // deal" first, then "High", then normal, so the ones squeezed out (if
    // any) are always normal-priority. Within a priority the most
    // constrained tasks (fewest eligible people, e.g. Recap) go first so
    // they are never crowded out while someone else still has a free
    // slot; ties are shuffled so the order isn't always alphabetical.
    // Copies of one task are dealt together and never to the same person.
    const eligibleCountFor = (def: TaskDefinition) =>
      people.filter(person => isEligible(def, person)).length;
    const groupByName = (items: PoolTask[]): PoolTask[] => {
      const groups: Record<string, PoolTask[]> = {};
      items.forEach(item => {
        (groups[item.name] = groups[item.name] || []).push(item);
      });
      return shuffle(Object.keys(groups), random)
        .sort(
          (a, b) =>
            eligibleCountFor(groups[a][0].def) -
            eligibleCountFor(groups[b][0].def)
        )
        .flatMap(key => groups[key]);
    };
    const ordered = [2, 1, 0].flatMap(priority =>
      groupByName(remaining.filter(item => priorityOf(item.def) === priority))
    );

    ordered.forEach(({ def }) => {
      let candidatesFor = order.filter(
        person => isEligible(def, person) && !holds(person, def.name)
      );
      if (def.avoid_repeat) {
        const previous = lastHolders[phase][def.name] || [];
        const fresh = candidatesFor.filter(
          person => !previous.includes(displayName(person))
        );
        if (fresh.length > 0) candidatesFor = fresh;
      }
      if (candidatesFor.length === 0) {
        notes.push(`${def.name} (nobody left who can take it)`);
        return;
      }
      let open = candidatesFor.filter(person => count(person) < cap);
      if (open.length === 0) {
        if (priorityOf(def) === 2) {
          open = candidatesFor;
        } else {
          notes.push(
            `${def.name} (everyone is full - set it to "Must deal" to force it)`
          );
          return;
        }
      }
      const target = open.reduce(
        (best, person) => (count(person) < count(best) ? person : best),
        open[0]
      );
      tasksOf(target).push(def.name);
    });

    // Free Space padding up to the slot count
    order.forEach(person => {
      while (count(person) < cap) tasksOf(person).push(FREE_SPACE);
    });

    const result: TaskMap = {};
    order.forEach(person => {
      result[displayName(person)] = tasksOf(person);
    });
    return result;
  };

  return {
    assignments: {
      pre: dealPhase('pre'),
      during: dealPhase('during'),
      post: dealPhase('post'),
    },
    notes,
  };
}
