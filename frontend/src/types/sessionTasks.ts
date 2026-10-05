/**
 * Shared types for session tasks: the DM-defined pre/during/post task pools
 * (DM Settings > Task Management) that the Tasks page deals out.
 * Mirrors the rows served by GET /session-tasks.
 */

export type TaskPhase = 'pre' | 'during' | 'post';

/** 0 normal, 1 high, 2 must deal. */
export type TaskPriority = 0 | 1 | 2;

export interface TaskDefinition {
  id: number;
  phase: TaskPhase;
  name: string;
  quantity: number;
  min_characters: number | null;
  max_characters: number | null;
  /** Only dealt to characters marked "Was at last session" (e.g. Recap). */
  requires_previous_attendance: boolean;
  exclude_late: boolean;
  exclude_early: boolean;
  dm_eligible: boolean;
  /** "<label>: <name>" in the next session announcement. */
  announce_label: string | null;
  sticky: boolean;
  avoid_repeat: boolean;
  priority: TaskPriority;
  is_active: boolean;
  description: string | null;
  fixed_character_id: number | null;
  sort_order: number;
}

/** Phases in display order. */
export const TASK_PHASE_ORDER: readonly TaskPhase[] = ['pre', 'during', 'post'];

/** character (or "DM") name -> task names dealt to them. */
export type TaskMap = Record<string, string[]>;

export type TaskAssignment = Record<TaskPhase, TaskMap>;
