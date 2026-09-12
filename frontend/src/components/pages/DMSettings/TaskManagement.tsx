// frontend/src/components/pages/DMSettings/TaskManagement.tsx
// DM editor for the per-campaign session task lists (pre / during / post)
// that the Tasks page deals out to attending characters. Backed by
// /session-tasks (see backend/src/api/routes/sessionTasks.js).
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
import { useSnackbar } from 'notistack';
import api from '../../../utils/api';

type TaskPhase = 'pre' | 'during' | 'post';

interface TaskDefinition {
  id: number;
  phase: TaskPhase;
  name: string;
  quantity: number;
  min_characters: number | null;
  is_snack_master: boolean;
  sort_order: number;
}

interface TaskFormState {
  phase: TaskPhase;
  name: string;
  quantity: string;
  min_characters: string;
  is_snack_master: boolean;
}

const PHASES: Array<{ key: TaskPhase; label: string; description: string }> = [
  {
    key: 'pre',
    label: 'Pre-Session',
    description:
      'Dealt to on-time characters before play starts. Late arrivals are skipped.',
  },
  {
    key: 'during',
    label: 'During Session',
    description: 'Dealt to every selected character for the session itself.',
  },
  {
    key: 'post',
    label: 'Post-Session',
    description:
      'Dealt to every selected character plus the DM at the end of the night.',
  },
];

const emptyForm = (phase: TaskPhase = 'pre'): TaskFormState => ({
  phase,
  name: '',
  quantity: '1',
  min_characters: '',
  is_snack_master: false,
});

const formFromTask = (task: TaskDefinition): TaskFormState => ({
  phase: task.phase,
  name: task.name,
  quantity: String(task.quantity),
  min_characters:
    task.min_characters === null ? '' : String(task.min_characters),
  is_snack_master: task.is_snack_master,
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
    if (form.min_characters.trim() !== '') {
      const min = parseInt(form.min_characters, 10);
      if (!Number.isInteger(min) || min < 1 || min > 50) {
        return 'Minimum characters must be a whole number from 1 to 50, or blank';
      }
    }
    return '';
  };

  const handleSave = async () => {
    const validation = validateForm();
    if (validation) {
      setFormError(validation);
      return;
    }
    const payload = {
      phase: form.phase,
      name: form.name.trim(),
      quantity: parseInt(form.quantity, 10),
      min_characters:
        form.min_characters.trim() === ''
          ? null
          : parseInt(form.min_characters, 10),
      is_snack_master: form.is_snack_master,
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
      // Reload so a snack-master flag moved off another task is reflected.
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

  const renderTaskMeta = (task: TaskDefinition) => (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
      {task.quantity > 1 && (
        <Chip size="small" label={`${task.quantity} copies`} />
      )}
      {task.min_characters !== null && (
        <Chip
          size="small"
          variant="outlined"
          label={`${task.min_characters}+ characters`}
        />
      )}
      {task.is_snack_master && (
        <Tooltip title="Whoever draws this task is announced as Snack Master for the next session">
          <Chip
            size="small"
            color="secondary"
            icon={<FastfoodIcon />}
            label="Snack Master"
          />
        </Tooltip>
      )}
    </Box>
  );

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
                    slotProps={{ secondary: { component: 'div' } }}
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
            These tasks are shuffled and dealt out on the Tasks page. Copies add
            the same task more than once so several people share it; a minimum
            character count keeps a task out of the pool for small groups.
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
              helperText="Blank = always included"
              slotProps={{ htmlInput: { min: 1, max: 50 } }}
              sx={{ flex: 1, minWidth: 140 }}
            />
          </Box>
          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Checkbox
                checked={form.is_snack_master}
                onChange={e =>
                  setForm(prev => ({
                    ...prev,
                    is_snack_master: e.target.checked,
                  }))
                }
              />
            }
            label="Designates the Snack Master"
          />
          <FormHelperText sx={{ ml: 4, mt: -0.5 }}>
            Whoever draws this task is named Snack Master in the next
            session&apos;s Discord announcement. Only one task can carry this
            flag.
          </FormHelperText>
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
