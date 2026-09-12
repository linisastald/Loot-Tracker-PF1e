// frontend/src/components/pages/DMSettings/TaskManagement.tsx
// DM editor for the per-campaign session task lists (pre / during / post)
// that the Tasks page deals out to attending characters, and for the per-task
// options that drive the deal (who can draw it, rotation, priority, what gets
// announced). Backed by /session-tasks (see backend/src/api/routes/sessionTasks.js).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import FastfoodIcon from '@mui/icons-material/Fastfood';
import HistoryIcon from '@mui/icons-material/History';
import CampaignIcon from '@mui/icons-material/Campaign';
import PushPinIcon from '@mui/icons-material/PushPin';
import LoopIcon from '@mui/icons-material/Loop';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import PersonPinIcon from '@mui/icons-material/PersonPin';
import { useSnackbar } from 'notistack';
import api from '../../../utils/api';

type TaskPhase = 'pre' | 'during' | 'post';

type TaskPriority = 0 | 1 | 2;

interface TaskDefinition {
  id: number;
  phase: TaskPhase;
  name: string;
  quantity: number;
  min_characters: number | null;
  max_characters: number | null;
  is_snack_master: boolean;
  requires_previous_attendance: boolean;
  exclude_late: boolean;
  exclude_early: boolean;
  dm_eligible: boolean;
  announce_label: string | null;
  sticky: boolean;
  avoid_repeat: boolean;
  priority: TaskPriority;
  is_active: boolean;
  description: string | null;
  fixed_character_id: number | null;
  sort_order: number;
}

interface CampaignCharacter {
  id: number;
  name: string;
  player_name?: string;
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

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string; help: string }> = [
  { value: 0, label: 'Normal', help: 'Dealt after high-priority tasks; may be left out if everyone is full.' },
  { value: 1, label: 'High', help: 'Dealt before normal tasks, so it is never the one squeezed out.' },
  { value: 2, label: 'Must deal', help: 'Always dealt, even if someone ends up with an extra task.' },
];

const PHASES: Array<{ key: TaskPhase; label: string; description: string }> = [
  {
    key: 'pre',
    label: 'Pre-Session',
    description: 'Dealt before play starts.',
  },
  {
    key: 'during',
    label: 'During Session',
    description: 'Dealt for the session itself.',
  },
  {
    key: 'post',
    label: 'Post-Session',
    description: 'Dealt at the end of the night.',
  },
];

// New tasks inherit what the phase used to hardcode: pre skips late arrivals,
// post lets the DM draw.
const emptyForm = (phase: TaskPhase = 'pre'): TaskFormState => ({
  phase,
  name: '',
  description: '',
  quantity: '1',
  min_characters: '',
  max_characters: '',
  is_active: true,
  exclude_late: phase === 'pre',
  exclude_early: false,
  dm_eligible: phase === 'post',
  requires_previous_attendance: false,
  fixed_character_id: '',
  sticky: false,
  avoid_repeat: false,
  priority: 0,
  announce_label: '',
});

const numberOrBlank = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

const formFromTask = (task: TaskDefinition): TaskFormState => ({
  phase: task.phase,
  name: task.name,
  description: task.description ?? '',
  quantity: String(task.quantity),
  min_characters: numberOrBlank(task.min_characters),
  max_characters: numberOrBlank(task.max_characters),
  is_active: task.is_active !== false,
  exclude_late: task.exclude_late === true,
  exclude_early: task.exclude_early === true,
  dm_eligible: task.dm_eligible === true,
  requires_previous_attendance: task.requires_previous_attendance === true,
  fixed_character_id: numberOrBlank(task.fixed_character_id),
  sticky: task.sticky === true,
  avoid_repeat: task.avoid_repeat === true,
  priority: ([0, 1, 2] as TaskPriority[]).includes(task.priority) ? task.priority : 0,
  // Older rows carry only the legacy flag
  announce_label:
    task.announce_label ?? (task.is_snack_master ? 'Snack Master' : ''),
});

const unwrapList = (response: any): TaskDefinition[] => {
  const payload = response?.data?.data ?? response?.data ?? response;
  return Array.isArray(payload) ? payload : [];
};

const errorMessage = (err: any, fallback: string): string =>
  err?.response?.data?.message || err?.message || fallback;

const TaskManagement: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<TaskDefinition | null>(null);
  const [form, setForm] = useState<TaskFormState>(emptyForm());
  const [formError, setFormError] = useState<string>('');

  const [deleteTarget, setDeleteTarget] = useState<TaskDefinition | null>(null);
  const [resetOpen, setResetOpen] = useState<boolean>(false);
  const [characters, setCharacters] = useState<CampaignCharacter[]>([]);

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');
      const response = await api.get('/session-tasks');
      setTasks(unwrapList(response));
    } catch (err: any) {
      setLoadError(errorMessage(err, 'Failed to load session tasks'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Active characters for the "always goes to" picker. Non-fatal: without
  // them the picker just offers "Nobody".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await api.get('/user/active-characters');
        const payload = response?.data?.data ?? response?.data ?? response;
        if (!cancelled && Array.isArray(payload)) {
          setCharacters(payload);
        }
      } catch {
        /* picker falls back to "Nobody" */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const characterName = (id: number | null) => {
    if (id === null) return null;
    return characters.find(c => c.id === id)?.name ?? `#${id}`;
  };

  const tasksByPhase = useMemo(() => {
    const grouped: Record<TaskPhase, TaskDefinition[]> = {
      pre: [],
      during: [],
      post: [],
    };
    tasks.forEach(task => {
      if (grouped[task.phase]) {
        grouped[task.phase].push(task);
      }
    });
    (Object.keys(grouped) as TaskPhase[]).forEach(phase => {
      grouped[phase].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    });
    return grouped;
  }, [tasks]);

  const openCreate = (phase: TaskPhase) => {
    setEditingTask(null);
    setForm(emptyForm(phase));
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (task: TaskDefinition) => {
    setEditingTask(task);
    setForm(formFromTask(task));
    setFormError('');
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setDialogOpen(false);
  };

  const validateForm = (): string => {
    if (!form.name.trim()) return 'Task name is required';
    const quantity = parseInt(form.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return 'Copies must be a whole number from 1 to 20';
    }
    const parseLimit = (raw: string): number | null => {
      if (raw.trim() === '') return null;
      const value = parseInt(raw, 10);
      return Number.isInteger(value) && value >= 1 && value <= 50 ? value : NaN;
    };
    const min = parseLimit(form.min_characters);
    const max = parseLimit(form.max_characters);
    if (Number.isNaN(min)) {
      return 'Minimum characters must be a whole number from 1 to 50, or blank';
    }
    if (Number.isNaN(max)) {
      return 'Maximum characters must be a whole number from 1 to 50, or blank';
    }
    if (min !== null && max !== null && max < min) {
      return 'Maximum characters cannot be below the minimum';
    }
    if (form.sticky && form.avoid_repeat) {
      return 'A task cannot both stay with last time\'s holder and avoid them';
    }
    if (form.announce_label.length > 100) {
      return 'Announce label must be at most 100 characters';
    }
    return '';
  };

  const handleSave = async () => {
    const validation = validateForm();
    if (validation) {
      setFormError(validation);
      return;
    }
    const optionalInt = (raw: string): number | null =>
      raw.trim() === '' ? null : parseInt(raw, 10);
    const optionalText = (raw: string): string | null =>
      raw.trim() === '' ? null : raw.trim();
    const payload = {
      phase: form.phase,
      name: form.name.trim(),
      description: optionalText(form.description),
      quantity: parseInt(form.quantity, 10),
      min_characters: optionalInt(form.min_characters),
      max_characters: optionalInt(form.max_characters),
      is_active: form.is_active,
      exclude_late: form.exclude_late,
      exclude_early: form.exclude_early,
      dm_eligible: form.dm_eligible,
      requires_previous_attendance: form.requires_previous_attendance,
      fixed_character_id: optionalInt(form.fixed_character_id),
      sticky: form.sticky,
      avoid_repeat: form.avoid_repeat,
      priority: form.priority,
      announce_label: optionalText(form.announce_label),
    };

    try {
      setSaving(true);
      if (editingTask) {
        await api.put(`/session-tasks/${editingTask.id}`, payload);
        enqueueSnackbar('Task updated', { variant: 'success' });
      } else {
        await api.post('/session-tasks', payload);
        enqueueSnackbar('Task added', { variant: 'success' });
      }
      setDialogOpen(false);
      await loadTasks();
    } catch (err: any) {
      setFormError(errorMessage(err, 'Failed to save task'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setSaving(true);
      await api.delete(`/session-tasks/${deleteTarget.id}`);
      setTasks(prev => prev.filter(task => task.id !== deleteTarget.id));
      enqueueSnackbar('Task deleted', { variant: 'success' });
      setDeleteTarget(null);
    } catch (err: any) {
      enqueueSnackbar(errorMessage(err, 'Failed to delete task'), {
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const moveTask = async (
    phase: TaskPhase,
    index: number,
    direction: -1 | 1
  ) => {
    const list = tasksByPhase[phase];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const reordered = [...list];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    const ids = reordered.map(task => task.id);

    // Optimistic update, then persist.
    setTasks(prev =>
      prev.map(task => {
        const position = ids.indexOf(task.id);
        return position === -1 ? task : { ...task, sort_order: position + 1 };
      })
    );
    try {
      setSaving(true);
      const response = await api.put('/session-tasks/reorder', { phase, ids });
      const fresh = unwrapList(response);
      if (fresh.length > 0) setTasks(fresh);
    } catch (err: any) {
      enqueueSnackbar(errorMessage(err, 'Failed to reorder tasks'), {
        variant: 'error',
      });
      await loadTasks();
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      const response = await api.post('/session-tasks/reset-defaults', {});
      const fresh = unwrapList(response);
      setTasks(fresh);
      enqueueSnackbar('Default task list restored', { variant: 'success' });
      setResetOpen(false);
      if (fresh.length === 0) await loadTasks();
    } catch (err: any) {
      enqueueSnackbar(errorMessage(err, 'Failed to restore defaults'), {
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const renderTaskMeta = (task: TaskDefinition) => {
    const label = task.announce_label ?? (task.is_snack_master ? 'Snack Master' : null);
    const isSnack = label !== null && /snack/i.test(label);
    return (
      <Box>
        {task.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {task.description}
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
          {task.is_active === false && (
            <Chip size="small" color="default" variant="outlined" label="Inactive" />
          )}
          {task.quantity > 1 && (
            <Chip size="small" label={`${task.quantity} copies`} />
          )}
          {task.min_characters !== null && task.min_characters !== undefined && (
            <Chip size="small" variant="outlined" label={`${task.min_characters}+ characters`} />
          )}
          {task.max_characters !== null && task.max_characters !== undefined && (
            <Chip size="small" variant="outlined" label={`up to ${task.max_characters} characters`} />
          )}
          {task.exclude_late && (
            <Chip size="small" variant="outlined" color="warning" label="Not late arrivals" />
          )}
          {task.exclude_early && (
            <Chip size="small" variant="outlined" color="warning" label="Not early leavers" />
          )}
          {task.dm_eligible && (
            <Chip size="small" variant="outlined" label="DM can draw" />
          )}
          {task.requires_previous_attendance && (
            <Tooltip title="Only dealt to characters who were at the last session">
              <Chip
                size="small"
                color="info"
                variant="outlined"
                icon={<HistoryIcon />}
                label="Was at last session"
              />
            </Tooltip>
          )}
          {task.fixed_character_id !== null && task.fixed_character_id !== undefined && (
            <Tooltip title="Always goes to this character when they are present and eligible">
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                icon={<PersonPinIcon />}
                label={`Always ${characterName(task.fixed_character_id)}`}
              />
            </Tooltip>
          )}
          {task.sticky && (
            <Tooltip title="Whoever drew it last session keeps it while they are present">
              <Chip size="small" variant="outlined" icon={<PushPinIcon />} label="Sticky" />
            </Tooltip>
          )}
          {task.avoid_repeat && (
            <Tooltip title="Never dealt to whoever had it last session">
              <Chip size="small" variant="outlined" icon={<LoopIcon />} label="Rotates" />
            </Tooltip>
          )}
          {task.priority === 1 && (
            <Chip size="small" variant="outlined" icon={<PriorityHighIcon />} label="High priority" />
          )}
          {task.priority === 2 && (
            <Chip size="small" color="error" variant="outlined" icon={<PriorityHighIcon />} label="Must deal" />
          )}
          {label && (
            <Tooltip title={`Whoever draws this task is announced as "${label}" for the next session`}>
              <Chip
                size="small"
                color="secondary"
                icon={isSnack ? <FastfoodIcon /> : <CampaignIcon />}
                label={`Announces ${label}`}
              />
            </Tooltip>
          )}
        </Box>
      </Box>
    );
  };

  const renderPhase = (
    phase: TaskPhase,
    label: string,
    description: string
  ) => {
    const list = tasksByPhase[phase];
    return (
      <Card key={phase} sx={{ mb: 3 }}>
        <CardHeader
          title={label}
          subheader={description}
          action={
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => openCreate(phase)}
              disabled={saving}
            >
              Add task
            </Button>
          }
        />
        <CardContent sx={{ pt: 0 }}>
          {list.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No {label.toLowerCase()} tasks yet.
            </Typography>
          ) : (
            <List dense disablePadding>
              {list.map((task, index) => (
                <ListItem
                  key={task.id}
                  divider={index < list.length - 1}
                  secondaryAction={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <IconButton
                        size="small"
                        aria-label={`Move ${task.name} up`}
                        onClick={() => moveTask(phase, index, -1)}
                        disabled={saving || index === 0}
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={`Move ${task.name} down`}
                        onClick={() => moveTask(phase, index, 1)}
                        disabled={saving || index === list.length - 1}
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={`Edit ${task.name}`}
                        onClick={() => openEdit(task)}
                        disabled={saving}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={`Delete ${task.name}`}
                        onClick={() => setDeleteTarget(task)}
                        disabled={saving}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  }
                  sx={{ pr: 20 }}
                >
                  <ListItemText
                    primary={task.name}
                    secondary={renderTaskMeta(task)}
                    slotProps={{
                      primary: {
                        sx: task.is_active === false ? { color: 'text.disabled' } : undefined,
                      },
                      secondary: { component: 'div' },
                    }}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Container maxWidth="md" component="main">
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box>
          <Typography variant="h5">Task Management</Typography>
          <Typography variant="body2" color="text.secondary">
            These tasks are shuffled and dealt out on the Tasks page. Each task
            carries its own options: who can draw it, whether it stays with or
            rotates away from last session&apos;s holder, how hard the deal
            tries to hand it out, and what gets announced before the next
            session.
          </Typography>
        </Box>
        <Button
          variant="text"
          color="warning"
          startIcon={<RestartAltIcon />}
          onClick={() => setResetOpen(true)}
          disabled={saving || loading}
        >
          Restore defaults
        </Button>
      </Box>

      {loadError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={loadTasks}>
              Retry
            </Button>
          }
        >
          {loadError}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        PHASES.map(phase =>
          renderPhase(phase.key, phase.label, phase.description)
        )
      )}

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editingTask ? 'Edit task' : 'Add task'}</DialogTitle>
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
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            slotProps={{ htmlInput: { maxLength: 255 } }}
          />
          <FormControl fullWidth margin="dense">
            <InputLabel id="task-phase-label">Phase</InputLabel>
            <Select
              labelId="task-phase-label"
              label="Phase"
              value={form.phase}
              onChange={(e: SelectChangeEvent<TaskPhase>) =>
                setForm(prev => ({
                  ...prev,
                  phase: e.target.value as TaskPhase,
                }))
              }
            >
              {PHASES.map(phase => (
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
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            helperText="Shown under the task on the Tasks page and in Discord (keep it short)"
            slotProps={{ htmlInput: { maxLength: 300 } }}
          />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              margin="dense"
              label="Copies"
              type="number"
              value={form.quantity}
              onChange={e =>
                setForm(prev => ({ ...prev, quantity: e.target.value }))
              }
              helperText="How many people get this task"
              slotProps={{ htmlInput: { min: 1, max: 20 } }}
              sx={{ flex: 1, minWidth: 140 }}
            />
            <TextField
              margin="dense"
              label="Minimum characters"
              type="number"
              value={form.min_characters}
              onChange={e =>
                setForm(prev => ({ ...prev, min_characters: e.target.value }))
              }
              helperText="Blank = no minimum"
              slotProps={{ htmlInput: { min: 1, max: 50 } }}
              sx={{ flex: 1, minWidth: 140 }}
            />
            <TextField
              margin="dense"
              label="Maximum characters"
              type="number"
              value={form.max_characters}
              onChange={e =>
                setForm(prev => ({ ...prev, max_characters: e.target.value }))
              }
              helperText="Blank = no maximum"
              slotProps={{ htmlInput: { min: 1, max: 50 } }}
              sx={{ flex: 1, minWidth: 140 }}
            />
          </Box>
          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Switch
                checked={form.is_active}
                onChange={e =>
                  setForm(prev => ({ ...prev, is_active: e.target.checked }))
                }
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
          <FormControlLabel
            control={
              <Checkbox
                checked={form.exclude_late}
                onChange={e =>
                  setForm(prev => ({ ...prev, exclude_late: e.target.checked }))
                }
              />
            }
            label="Skip characters arriving late"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={form.exclude_early}
                onChange={e =>
                  setForm(prev => ({ ...prev, exclude_early: e.target.checked }))
                }
              />
            }
            label="Skip characters leaving early"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={form.dm_eligible}
                onChange={e =>
                  setForm(prev => ({ ...prev, dm_eligible: e.target.checked }))
                }
              />
            }
            label="The DM can draw this task"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={form.requires_previous_attendance}
                onChange={e =>
                  setForm(prev => ({
                    ...prev,
                    requires_previous_attendance: e.target.checked,
                  }))
                }
              />
            }
            label="Requires attendance at the last session"
          />
          <FormHelperText sx={{ ml: 4, mt: -0.5 }}>
            Only dealt to characters marked &quot;Was at last session&quot; on
            the Tasks page (for example Recap). Skipped when nobody selected
            was there.
          </FormHelperText>
          <FormControl fullWidth margin="dense" sx={{ mt: 1 }}>
            <InputLabel id="task-fixed-character-label">Always goes to</InputLabel>
            <Select
              labelId="task-fixed-character-label"
              label="Always goes to"
              value={form.fixed_character_id}
              onChange={(e: SelectChangeEvent<string>) =>
                setForm(prev => ({ ...prev, fixed_character_id: e.target.value }))
              }
            >
              <MenuItem value="">Nobody (deal it normally)</MenuItem>
              {form.fixed_character_id !== '' &&
                !characters.some(c => String(c.id) === form.fixed_character_id) && (
                  <MenuItem value={form.fixed_character_id} disabled>
                    Character #{form.fixed_character_id} (no longer active)
                  </MenuItem>
                )}
              {characters.map(character => (
                <MenuItem key={character.id} value={String(character.id)}>
                  {character.name}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              When they are present and eligible they get it every time;
              otherwise it is dealt normally.
            </FormHelperText>
          </FormControl>

          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Rotation
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={form.sticky}
                disabled={form.avoid_repeat && !form.sticky}
                onChange={e =>
                  setForm(prev => ({ ...prev, sticky: e.target.checked }))
                }
              />
            }
            label="Stays with whoever had it last session"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={form.avoid_repeat}
                disabled={form.sticky && !form.avoid_repeat}
                onChange={e =>
                  setForm(prev => ({ ...prev, avoid_repeat: e.target.checked }))
                }
              />
            }
            label="Never the same person two sessions running"
          />

          <FormControl fullWidth margin="dense" sx={{ mt: 2 }}>
            <InputLabel id="task-priority-label">Priority</InputLabel>
            <Select
              labelId="task-priority-label"
              label="Priority"
              value={String(form.priority)}
              onChange={(e: SelectChangeEvent<string>) =>
                setForm(prev => ({
                  ...prev,
                  priority: parseInt(e.target.value, 10) as TaskPriority,
                }))
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
            onChange={e =>
              setForm(prev => ({ ...prev, announce_label: e.target.value }))
            }
            helperText={
              'Blank = not announced. Otherwise the next session announcement ' +
              'shows "<label>: <name>", e.g. "Snack Master: Bob".'
            }
            slotProps={{ htmlInput: { maxLength: 100 } }}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {editingTask ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => !saving && setDeleteTarget(null)}
      >
        <DialogTitle>Delete task?</DialogTitle>
        <DialogContent>
          <Typography>
            Remove &quot;{deleteTarget?.name}&quot; from the{' '}
            {deleteTarget
              ? PHASES.find(
                  p => p.key === deleteTarget.phase
                )?.label.toLowerCase()
              : ''}{' '}
            list? Past assignments in history are not affected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={saving}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restore defaults confirmation */}
      <Dialog open={resetOpen} onClose={() => !saving && setResetOpen(false)}>
        <DialogTitle>Restore default tasks?</DialogTitle>
        <DialogContent>
          <Typography>
            This replaces every task in this campaign with the stock pre,
            during, and post-session lists. Your custom tasks will be removed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleReset}
            color="warning"
            variant="contained"
            disabled={saving}
          >
            Restore defaults
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default TaskManagement;
