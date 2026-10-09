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
  CircularProgress,
  Container,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useSnackbar } from 'notistack';
import api from '../../../utils/api';
import { getErrorMessage } from '../../../utils/apiErrors';
import { unwrapList } from '../../../utils/apiResponse';
import type { TaskDefinition, TaskPhase } from '../../../types/sessionTasks';
import { TASK_PHASE_INFO, TASK_PHASE_ORDER } from '../../../types/sessionTasks';
import ConfirmDialog from '../../common/ConfirmDialog';
import TaskFormDialog from './TaskFormDialog';
import type {
  CampaignCharacter,
  CharactersStatus,
  TaskPayload,
} from './TaskFormDialog';
import TaskMetaChips from './TaskMetaChips';

const PHASE_LABEL: Record<TaskPhase, string> = Object.fromEntries(
  TASK_PHASE_INFO.map(phase => [phase.key, phase.label])
) as Record<TaskPhase, string>;

const TaskManagement: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<TaskDefinition | null>(null);
  const [createPhase, setCreatePhase] = useState<TaskPhase>('pre');

  // The delete target is kept while the dialog fades out, so its text does
  // not collapse to an empty name; `deleteOpen` drives visibility.
  const [deleteTarget, setDeleteTarget] = useState<TaskDefinition | null>(null);
  const [deleteOpen, setDeleteOpen] = useState<boolean>(false);
  const [resetOpen, setResetOpen] = useState<boolean>(false);
  const [characters, setCharacters] = useState<CampaignCharacter[]>([]);
  const [charactersStatus, setCharactersStatus] =
    useState<CharactersStatus>('loading');

  // `silent` refreshes the list in place (no full-page spinner).
  const loadTasks = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setLoadError('');
      const response = await api.get('/session-tasks');
      setTasks(unwrapList<TaskDefinition>(response));
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err, 'Failed to load session tasks'));
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
        if (!cancelled) {
          setCharacters(unwrapList<CampaignCharacter>(response));
          setCharactersStatus('ready');
        }
      } catch {
        if (!cancelled) setCharactersStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const characterName = (id: number): string =>
    characters.find(c => c.id === id)?.name ?? `#${id}`;

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
    TASK_PHASE_ORDER.forEach(phase => {
      grouped[phase].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    });
    return grouped;
  }, [tasks]);

  const openCreate = (phase: TaskPhase) => {
    setEditingTask(null);
    setCreatePhase(phase);
    setDialogOpen(true);
  };

  const openEdit = (task: TaskDefinition) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  // Resolves with an error message for the form, or null once saved.
  const handleSave = async (payload: TaskPayload): Promise<string | null> => {
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
      await loadTasks(true);
      return null;
    } catch (err: unknown) {
      return getErrorMessage(err, 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (task: TaskDefinition) => {
    setDeleteTarget(task);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setSaving(true);
      await api.delete(`/session-tasks/${deleteTarget.id}`);
      setTasks(prev => prev.filter(task => task.id !== deleteTarget.id));
      enqueueSnackbar('Task deleted', { variant: 'success' });
      setDeleteOpen(false);
    } catch (err: unknown) {
      enqueueSnackbar(getErrorMessage(err, 'Failed to delete task'), {
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
      const fresh = unwrapList<TaskDefinition>(response);
      if (fresh.length > 0) setTasks(fresh);
    } catch (err: unknown) {
      enqueueSnackbar(getErrorMessage(err, 'Failed to reorder tasks'), {
        variant: 'error',
      });
      await loadTasks(true);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      const response = await api.post('/session-tasks/reset-defaults', {});
      const fresh = unwrapList<TaskDefinition>(response);
      setTasks(fresh);
      enqueueSnackbar('Default task list restored', { variant: 'success' });
      setResetOpen(false);
      if (fresh.length === 0) await loadTasks(true);
    } catch (err: unknown) {
      enqueueSnackbar(getErrorMessage(err, 'Failed to restore defaults'), {
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const renderPhase = (phase: (typeof TASK_PHASE_INFO)[number]) => {
    const list = tasksByPhase[phase.key];
    return (
      <Card key={phase.key} sx={{ mb: 3 }}>
        <CardHeader
          title={phase.label}
          subheader={phase.description}
          action={
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => openCreate(phase.key)}
              disabled={saving}
            >
              Add task
            </Button>
          }
        />
        <CardContent sx={{ pt: 0 }}>
          {list.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No {phase.label.toLowerCase()} tasks yet.
            </Typography>
          ) : (
            <List dense disablePadding>
              {list.map((task, index) => {
                const actions = [
                  {
                    label: `Move ${task.name} up`,
                    icon: <ArrowUpwardIcon fontSize="small" />,
                    onClick: () => moveTask(phase.key, index, -1),
                    disabled: saving || index === 0,
                  },
                  {
                    label: `Move ${task.name} down`,
                    icon: <ArrowDownwardIcon fontSize="small" />,
                    onClick: () => moveTask(phase.key, index, 1),
                    disabled: saving || index === list.length - 1,
                  },
                  {
                    label: `Edit ${task.name}`,
                    icon: <EditIcon fontSize="small" />,
                    onClick: () => openEdit(task),
                    disabled: saving,
                  },
                  {
                    label: `Delete ${task.name}`,
                    icon: <DeleteIcon fontSize="small" />,
                    onClick: () => askDelete(task),
                    disabled: saving,
                    color: 'error' as const,
                  },
                ];
                return (
                  <ListItem
                    key={task.id}
                    divider={index < list.length - 1}
                    secondaryAction={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {actions.map(action => (
                          <IconButton
                            key={action.label}
                            size="small"
                            aria-label={action.label}
                            onClick={action.onClick}
                            disabled={action.disabled}
                            color={action.color}
                          >
                            {action.icon}
                          </IconButton>
                        ))}
                      </Box>
                    }
                    sx={{ pr: 20 }}
                  >
                    <ListItemText
                      primary={task.name}
                      secondary={
                        <TaskMetaChips
                          task={task}
                          characterName={characterName}
                        />
                      }
                      slotProps={{
                        primary: {
                          sx: task.is_active
                            ? undefined
                            : { color: 'text.disabled' },
                        },
                        secondary: { component: 'div' },
                      }}
                    />
                  </ListItem>
                );
              })}
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
            <Button color="inherit" size="small" onClick={() => loadTasks()}>
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
        TASK_PHASE_INFO.map(renderPhase)
      )}

      <TaskFormDialog
        open={dialogOpen}
        task={editingTask}
        createPhase={createPhase}
        characters={characters}
        charactersStatus={charactersStatus}
        saving={saving}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete task?"
        confirmLabel="Delete"
        confirmColor="error"
        busy={saving}
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      >
        Remove &quot;{deleteTarget?.name}&quot; from the{' '}
        {deleteTarget ? PHASE_LABEL[deleteTarget.phase].toLowerCase() : ''}{' '}
        list? Past assignments in history are not affected.
      </ConfirmDialog>

      <ConfirmDialog
        open={resetOpen}
        title="Restore default tasks?"
        confirmLabel="Restore defaults"
        confirmColor="warning"
        busy={saving}
        onConfirm={handleReset}
        onClose={() => setResetOpen(false)}
      >
        This replaces every task in this campaign with the stock pre, during,
        and post-session lists. Your custom tasks will be removed.
      </ConfirmDialog>
    </Container>
  );
};

export default TaskManagement;
