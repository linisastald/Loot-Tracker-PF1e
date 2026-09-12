// backend/src/constants/sessionTaskDefaults.js
//
// The stock pre/during/post-session task lists. Seeded into
// session_task_definition for every new campaign (Campaign.create) and used
// by the DM "Restore defaults" action. Existing campaigns were seeded by
// migration 058 - keep that VALUES list and this array in sync.

const TASK_PHASES = ['pre', 'during', 'post'];

const DEFAULT_SESSION_TASKS = [
  { phase: 'pre', name: 'Get Dice Trays', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 1 },
  { phase: 'pre', name: 'Put Initiative name tags on tracker', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 2 },
  { phase: 'pre', name: 'Wipe TV', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 3 },
  { phase: 'pre', name: 'Recap', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 4 },
  { phase: 'pre', name: 'Bring in extra chairs if needed', quantity: 1, min_characters: 6, is_snack_master: false, sort_order: 5 },

  { phase: 'during', name: 'Calendar Master', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 1 },
  { phase: 'during', name: 'Loot Master', quantity: 2, min_characters: null, is_snack_master: false, sort_order: 2 },
  { phase: 'during', name: 'Lore Master', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 3 },
  { phase: 'during', name: 'Rule & Battle Master', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 4 },
  { phase: 'during', name: 'Inspiration Master', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 5 },

  { phase: 'post', name: 'Food, Drink, and Trash Clear Check', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 1 },
  { phase: 'post', name: 'TV(s) wiped and turned off', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 2 },
  { phase: 'post', name: 'Dice Trays and Books put away', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 3 },
  { phase: 'post', name: 'Clean Initiative tracker and put away name labels', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 4 },
  { phase: 'post', name: 'Chairs pushed in and extra chairs put back', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 5 },
  { phase: 'post', name: 'Windows shut and locked and Post Discord Reminders', quantity: 1, min_characters: null, is_snack_master: false, sort_order: 6 },
  { phase: 'post', name: 'Ensure no duplicate snacks for next session', quantity: 1, min_characters: null, is_snack_master: true, sort_order: 7 },
];

// Legacy label used before task definitions were editable; kept as the
// fallback for snack-master detection when no definition carries the flag.
const LEGACY_SNACK_MASTER_TASK = 'Ensure no duplicate snacks for next session';

module.exports = { TASK_PHASES, DEFAULT_SESSION_TASKS, LEGACY_SNACK_MASTER_TASK };
