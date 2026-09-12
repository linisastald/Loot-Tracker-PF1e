// backend/src/constants/sessionTaskDefaults.js
//
// The stock pre/during/post-session task lists. Seeded into
// session_task_definition for every new campaign (Campaign.create) and used
// by the DM "Restore defaults" action. Existing campaigns were seeded by
// migration 058 and had the option columns back-filled by migrations 059 and
// 060 - keep those migrations and this list in sync.
//
// Every option a task can carry (see migration 060) with its default value.
// The Tasks page deals tasks purely from these options; nothing about a phase
// is hardcoded any more.

const TASK_PHASES = ['pre', 'during', 'post'];

const TASK_OPTION_DEFAULTS = Object.freeze({
  quantity: 1,                       // copies dealt (e.g. two Loot Masters)
  min_characters: null,              // only when at least this many selected
  max_characters: null,              // only when at most this many selected
  is_snack_master: false,            // legacy flag; derived from announce_label
  requires_previous_attendance: false, // only to people who were at the last session
  exclude_late: false,               // skip characters marked Late
  exclude_early: false,              // skip characters marked Leaving early
  dm_eligible: false,                // the DM can draw it
  announce_label: null,              // "<label>: <name>" in the next announcement
  sticky: false,                     // last session's holder keeps it
  avoid_repeat: false,               // never last session's holder
  priority: 0,                       // 0 normal, 1 high, 2 must deal
  is_active: true,                   // inactive tasks are never dealt
  description: null,                 // instructions shown with the task
  fixed_character_id: null,          // always this character when present
});

/** Field names the DM can edit, in the order the model writes them. */
const TASK_OPTION_FIELDS = Object.keys(TASK_OPTION_DEFAULTS);

const task = (phase, name, sort_order, overrides = {}) => ({
  phase,
  name,
  sort_order,
  ...TASK_OPTION_DEFAULTS,
  ...overrides,
});

const DEFAULT_SESSION_TASKS = [
  task('pre', 'Get Dice Trays', 1, { exclude_late: true }),
  task('pre', 'Put Initiative name tags on tracker', 2, { exclude_late: true }),
  task('pre', 'Wipe TV', 3, { exclude_late: true }),
  task('pre', 'Recap', 4, { exclude_late: true, requires_previous_attendance: true }),
  task('pre', 'Bring in extra chairs if needed', 5, { exclude_late: true, min_characters: 6 }),

  task('during', 'Calendar Master', 1),
  task('during', 'Loot Master', 2, { quantity: 2 }),
  task('during', 'Lore Master', 3),
  task('during', 'Rule & Battle Master', 4),
  task('during', 'Inspiration Master', 5),

  task('post', 'Food, Drink, and Trash Clear Check', 1, { dm_eligible: true }),
  task('post', 'TV(s) wiped and turned off', 2, { dm_eligible: true }),
  task('post', 'Dice Trays and Books put away', 3, { dm_eligible: true }),
  task('post', 'Clean Initiative tracker and put away name labels', 4, { dm_eligible: true }),
  task('post', 'Chairs pushed in and extra chairs put back', 5, { dm_eligible: true }),
  task('post', 'Windows shut and locked and Post Discord Reminders', 6, { dm_eligible: true }),
  task('post', 'Ensure no duplicate snacks for next session', 7, {
    dm_eligible: true,
    is_snack_master: true,
    announce_label: 'Snack Master',
  }),
];

/** Announce label that also feeds the legacy snack_master_name column. */
const SNACK_MASTER_LABEL = 'Snack Master';

module.exports = {
  TASK_PHASES,
  TASK_OPTION_DEFAULTS,
  TASK_OPTION_FIELDS,
  DEFAULT_SESSION_TASKS,
  SNACK_MASTER_LABEL,
};
