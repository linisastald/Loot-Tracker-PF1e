// frontend/src/components/pages/DMSettings/TaskFormDialog.tsx
// The add / edit dialog for one session task definition. Owns the form state
// (so typing re-renders only the dialog, not the task list) and turns it into
// the payload the /session-tasks endpoints take.
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import type {
  TaskDefinition,
  TaskPhase,
  TaskPriority,
} from '../../../types/sessionTasks';
import { TASK_PHASE_INFO } from '../../../types/sessionTasks';

export interface CampaignCharacter {
  id: number;
  name: string;
}

export type CharactersStatus = 'loading' | 'ready' | 'error';

/** What the create / update endpoints accept. */
export interface TaskPayload {
  phase: TaskPhase;
  name: string;
  description: string | null;
  quantity: number;
  min_characters: number | null;
  max_characters: number | null;
  is_active: boolean;
  exclude_late: boolean;
  exclude_early: boolean;
  dm_eligible: boolean;
  requires_previous_attendance: boolean;
  fixed_character_id: number | null;
  sticky: boolean;
  avoid_repeat: boolean;
  priority: TaskPriority;
  announce_label: string | null;
}

interface TaskFormState {
  phase: TaskPhase;
  name: string;
  description: string;
  quantity: string;
  min_characters: string;
  max_characters: string;
  is_active: boolean;
  exclude_late: boolean;
  exclude_early: boolean;
  dm_eligible: boolean;
  requires_previous_attendance: boolean;
  fixed_character_id: string; // '' = none
  sticky: boolean;
  avoid_repeat: boolean;
  priority: TaskPriority;
  announce_label: string;
}

type BooleanField = {
  [K in keyof TaskFormState]: TaskFormState[K] extends boolean ? K : never;
}[keyof TaskFormState];

type NumberField = 'quantity' | 'min_characters' | 'max_characters';

const PRIORITY_OPTIONS: Array<{
  value: TaskPriority;
  label: string;
  help: string;
}> = [
  {
    value: 0,
    label: 'Normal',
    help: 'Dealt after higher-priority tasks. Every task is always dealt; when there are more tasks than people, the later ones are the extras someone doubles up on.',
  },
  {
    value: 1,
    label: 'High',
    help: 'Dealt before normal tasks.',
  },
  {
    value: 2,
    label: 'First',
    help: 'Dealt before everything else, to the people with the fewest tasks.',
  },
];

const NUMBER_FIELDS: Array<{
  key: NumberField;
  label: string;
  help: string;
  max: number;
}> = [
  {
    key: 'quantity',
    label: 'Copies',
    help: 'How many people get this task',
    max: 20,
  },
  {
    key: 'min_characters',
    label: 'Minimum characters',
    help: 'Blank = no minimum',
    max: 50,
  },
  {
    key: 'max_characters',
    label: 'Maximum characters',
    help: 'Blank = no maximum',
    max: 50,
  },
];

const WHO_CAN_DRAW: Array<{
  key: BooleanField;
  label: string;
  help?: React.ReactNode;
}> = [
  { key: 'exclude_late', label: 'Skip characters arriving late' },
  { key: 'exclude_early', label: 'Skip characters leaving early' },
  { key: 'dm_eligible', label: 'The DM can draw this task' },
  {
    key: 'requires_previous_attendance',
    label: 'Requires attendance at the last session',
    help: (
      <>
        Only dealt to characters marked &quot;Was at last session&quot; on the
        Tasks page (for example Recap). Skipped when nobody selected was there.
      </>
    ),
  },
];

// New tasks inherit what the phase used to hardcode: pre skips late arrivals,
// post lets the DM draw.
const phaseDefaults = (phase: TaskPhase) => ({
  exclude_late: phase === 'pre',
  dm_eligible: phase === 'post',
});

const emptyForm = (phase: TaskPhase = 'pre'): TaskFormState => ({
  phase,
  name: '',
  description: '',
  quantity: '1',
  min_characters: '',
  max_characters: '',
  is_active: true,
  exclude_early: false,
  requires_previous_attendance: false,
  fixed_character_id: '',
  sticky: false,
  avoid_repeat: false,
  priority: 0,
  announce_label: '',
  ...phaseDefaults(phase),
});

const numberOrBlank = (value: number | null): string =>
  value === null ? '' : String(value);

const formFromTask = (task: TaskDefinition): TaskFormState => ({
  phase: task.phase,
  name: task.name,
  description: task.description ?? '',
  quantity: String(task.quantity),
  min_characters: numberOrBlank(task.min_characters),
  max_characters: numberOrBlank(task.max_characters),
  is_active: task.is_active,
  exclude_late: task.exclude_late,
  exclude_early: task.exclude_early,
  dm_eligible: task.dm_eligible,
  requires_previous_attendance: task.requires_previous_attendance,
  fixed_character_id: numberOrBlank(task.fixed_character_id),
  sticky: task.sticky,
  avoid_repeat: task.avoid_repeat,
  priority: PRIORITY_OPTIONS.some(o => o.value === task.priority)
    ? task.priority
    : 0,
  announce_label: task.announce_label ?? '',
});

/** Blank -> null, a whole number in [min, max] -> that number, anything else -> NaN. */
const parseWhole = (raw: string, min: number, max: number): number | null => {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^\d+$/.test(text)) return NaN;
  const value = Number(text);
  return value >= min && value <= max ? value : NaN;
};

/**
 * Parse and validate the form once: either the first problem to show, or the
 * payload to send.
 */
const buildPayload = (
  form: TaskFormState
): { error: string } | { payload: TaskPayload } => {
  const name = form.name.trim();
  if (!name) return { error: 'Task name is required' };

  const quantity = parseWhole(form.quantity, 1, 20);
  if (quantity === null || Number.isNaN(quantity)) {
    return { error: 'Copies must be a whole number from 1 to 20' };
  }
  const min = parseWhole(form.min_characters, 1, 50);
  if (Number.isNaN(min)) {
    return {
      error: 'Minimum characters must be a whole number from 1 to 50, or blank',
    };
  }
  const max = parseWhole(form.max_characters, 1, 50);
  if (Number.isNaN(max)) {
    return {
      error: 'Maximum characters must be a whole number from 1 to 50, or blank',
    };
  }
  if (min !== null && max !== null && max < min) {
    return { error: 'Maximum characters cannot be below the minimum' };
  }
  if (form.sticky && form.avoid_repeat) {
    return {
      error: "A task cannot both stay with last time's holder and avoid them",
    };
  }
  const announceLabel = form.announce_label.trim();
  if (announceLabel.length > 100) {
    return { error: 'Announce label must be at most 100 characters' };
  }
  const description = form.description.trim();

  return {
    payload: {
      phase: form.phase,
      name,
      description: description === '' ? null : description,
      quantity,
      min_characters: min,
      max_characters: max,
      is_active: form.is_active,
      exclude_late: form.exclude_late,
      exclude_early: form.exclude_early,
      dm_eligible: form.dm_eligible,
      requires_previous_attendance: form.requires_previous_attendance,
      fixed_character_id:
        form.fixed_character_id === '' ? null : Number(form.fixed_character_id),
      sticky: form.sticky,
      avoid_repeat: form.avoid_repeat,
      priority: form.priority,
      announce_label: announceLabel === '' ? null : announceLabel,
    },
  };
};

interface TaskFormDialogProps {
  open: boolean;
  /** The task being edited, or null to add one. */
  task: TaskDefinition | null;
  /** Phase pre-selected when adding. */
  createPhase: TaskPhase;
  characters: CampaignCharacter[];
  charactersStatus: CharactersStatus;
  saving: boolean;
  onClose: () => void;
  /** Persist the payload; resolve with an error message, or null on success. */
  onSave: (payload: TaskPayload) => Promise<string | null>;
}

const TaskFormDialog: React.FC<TaskFormDialogProps> = ({
  open,
  task,
  createPhase,
  characters,
  charactersStatus,
  saving,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState<TaskFormState>(emptyForm());
  const [formError, setFormError] = useState<string>('');
  // Fields the DM has changed by hand: phase defaults must not overwrite them.
  const touched = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setForm(task ? formFromTask(task) : emptyForm(createPhase));
    setFormError('');
    touched.current = new Set();
  }, [open, task, createPhase]);

  const setField = <K extends keyof TaskFormState>(
    key: K,
    value: TaskFormState[K]
  ) => {
    touched.current.add(key);
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const changePhase = (phase: TaskPhase) => {
    setForm(prev => {
      const next = { ...prev, phase };
      if (!task) {
        // Adding: re-apply the new phase's defaults to options not touched yet.
        const defaults = phaseDefaults(phase);
        (Object.keys(defaults) as Array<keyof typeof defaults>).forEach(key => {
          if (!touched.current.has(key)) next[key] = defaults[key];
        });
      }
      return next;
    });
  };

  const handleSave = async () => {
    const built = buildPayload(form);
    if ('error' in built) {
      setFormError(built.error);
      return;
    }
    const error = await onSave(built.payload);
    if (error) setFormError(error);
  };

  const checkbox = (key: BooleanField, label: string, disabled = false) => (
    <FormControlLabel
      key={key}
      control={
        <Checkbox
          checked={form[key]}
          disabled={disabled}
          onChange={e => setField(key, e.target.checked)}
        />
      }
      label={label}
    />
  );

  const fixedId = form.fixed_character_id;
  const fixedMissing =
    fixedId !== '' && !characters.some(c => String(c.id) === fixedId);

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{task ? 'Edit task' : 'Add task'}</DialogTitle>
      <DialogContent>
        {formError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {formError}
          </Alert>
        )}
        <TextField
          autoFocus
          margin="dense"
          label="Task name"
          fullWidth
          value={form.name}
          onChange={e => setField('name', e.target.value)}
          slotProps={{ htmlInput: { maxLength: 255 } }}
        />
        <FormControl fullWidth margin="dense">
          <InputLabel id="task-phase-label">Phase</InputLabel>
          <Select
            labelId="task-phase-label"
            label="Phase"
            value={form.phase}
            onChange={(e: SelectChangeEvent<TaskPhase>) =>
              changePhase(e.target.value as TaskPhase)
            }
          >
            {TASK_PHASE_INFO.map(phase => (
              <MenuItem key={phase.key} value={phase.key}>
                {phase.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          margin="dense"
          label="Description"
          fullWidth
          multiline
          minRows={2}
          value={form.description}
          onChange={e => setField('description', e.target.value)}
          helperText="Shown under the task on the Tasks page and in Discord (keep it short)"
          slotProps={{ htmlInput: { maxLength: 300 } }}
        />
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {NUMBER_FIELDS.map(field => (
            <TextField
              key={field.key}
              margin="dense"
              label={field.label}
              type="number"
              value={form[field.key]}
              onChange={e => setField(field.key, e.target.value)}
              helperText={field.help}
              slotProps={{ htmlInput: { min: 1, max: field.max } }}
              sx={{ flex: 1, minWidth: 140 }}
            />
          ))}
        </Box>
        <FormControlLabel
          sx={{ mt: 1 }}
          control={
            <Switch
              checked={form.is_active}
              onChange={e => setField('is_active', e.target.checked)}
            />
          }
          label="Active"
        />
        <FormHelperText sx={{ ml: 6, mt: -0.5 }}>
          Inactive tasks stay in the list but are never dealt.
        </FormHelperText>

        <Typography variant="subtitle2" sx={{ mt: 2 }}>
          Who can draw it
        </Typography>
        {WHO_CAN_DRAW.map(option => (
          <React.Fragment key={option.key}>
            {checkbox(option.key, option.label)}
            {option.help && (
              <FormHelperText sx={{ ml: 4, mt: -0.5 }}>
                {option.help}
              </FormHelperText>
            )}
          </React.Fragment>
        ))}
        <FormControl fullWidth margin="dense" sx={{ mt: 1 }}>
          <InputLabel id="task-fixed-character-label">
            Always goes to
          </InputLabel>
          <Select
            labelId="task-fixed-character-label"
            label="Always goes to"
            value={form.fixed_character_id}
            onChange={(e: SelectChangeEvent<string>) =>
              setField('fixed_character_id', e.target.value)
            }
          >
            <MenuItem value="">Nobody (deal it normally)</MenuItem>
            {fixedMissing && (
              <MenuItem value={fixedId} disabled>
                {charactersStatus === 'ready'
                  ? `Character #${fixedId} (no longer active)`
                  : charactersStatus === 'loading'
                    ? `Character #${fixedId} (loading characters...)`
                    : `Character #${fixedId} (character list unavailable)`}
              </MenuItem>
            )}
            {characters.map(character => (
              <MenuItem key={character.id} value={String(character.id)}>
                {character.name}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>
            When they are present and eligible they get it every time; otherwise
            it is dealt normally.
          </FormHelperText>
        </FormControl>

        <Typography variant="subtitle2" sx={{ mt: 2 }}>
          Rotation
        </Typography>
        {checkbox(
          'sticky',
          'Stays with whoever had it last session',
          form.avoid_repeat && !form.sticky
        )}
        {checkbox(
          'avoid_repeat',
          'Never the same person two sessions running',
          form.sticky && !form.avoid_repeat
        )}

        <FormControl fullWidth margin="dense" sx={{ mt: 2 }}>
          <InputLabel id="task-priority-label">Priority</InputLabel>
          <Select
            labelId="task-priority-label"
            label="Priority"
            value={String(form.priority)}
            onChange={(e: SelectChangeEvent<string>) =>
              setField('priority', parseInt(e.target.value, 10) as TaskPriority)
            }
          >
            {PRIORITY_OPTIONS.map(option => (
              <MenuItem key={option.value} value={String(option.value)}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>
            {PRIORITY_OPTIONS.find(o => o.value === form.priority)?.help}
          </FormHelperText>
        </FormControl>

        <TextField
          margin="dense"
          label="Announce as"
          fullWidth
          value={form.announce_label}
          onChange={e => setField('announce_label', e.target.value)}
          helperText={
            'Blank = not announced. Otherwise the next session announcement ' +
            'shows "<label>: <name>", e.g. "Snack Master: Bob".'
          }
          slotProps={{ htmlInput: { maxLength: 100 } }}
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {task ? 'Save' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TaskFormDialog;
