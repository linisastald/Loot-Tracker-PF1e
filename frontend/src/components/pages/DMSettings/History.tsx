// frontend/src/components/pages/DMSettings/History.tsx
// DM Settings > History: who changed what and when (loot status changes,
// edits, identification, consumable use, gold entries, sales), with Undo.
// Backed by GET /audit and POST /audit/:id/undo (backend/src/api/routes/audit.js).
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import UndoIcon from '@mui/icons-material/Undo';
import { useSnackbar } from 'notistack';
import api from '../../../utils/api';
import { getErrorMessage } from '../../../utils/apiErrors';
import ConfirmDialog from '../../common/ConfirmDialog';

export interface HistoryEntry {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  entity_type: 'loot' | 'gold';
  entity_ids: number[];
  before: unknown;
  after: unknown;
  summary: string;
  created_at: string;
  undone_at: string | null;
  undone_by: number | null;
  undone_by_username: string | null;
  undo_of: number | null;
  undoable: boolean;
}

interface HistoryResponse {
  entries: HistoryEntry[];
  total: number;
}

type EntityFilter = 'all' | 'loot' | 'gold';

const ACTION_LABELS: Record<string, string> = {
  'loot.status': 'Status change',
  'loot.restore': 'Restore',
  'loot.update': 'Edit',
  'loot.identify': 'Identify',
  'loot.consume': 'Consumable use',
  'loot.charges': 'Wand charges',
  'gold.create': 'Gold entry',
  'gold.distribute': 'Distribution',
  'gold.balance': 'Balance',
  sale: 'Sale',
  undo: 'Undo',
};

const actionLabel = (action: string): string => ACTION_LABELS[action] ?? action;

const formatWhen = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const unwrap = (response: unknown): HistoryResponse => {
  const body = (response as { data?: unknown })?.data ?? response;
  const payload = (body as { data?: unknown })?.data ?? body;
  const parsed = payload as Partial<HistoryResponse>;
  return { entries: Array.isArray(parsed?.entries) ? parsed.entries : [], total: Number(parsed?.total) || 0 };
};

/** Compact rendering of a snapshot: one line per row or per field. */
const Snapshot: React.FC<{ label: string; value: unknown }> = ({ label, value }) => {
  if (value === null || value === undefined) return null;
  const rows = Array.isArray(value) ? value : [value];
  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{label}</Typography>
      {rows.map((row, index) => (
        <Typography key={index} variant="body2" component="div" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          {typeof row === 'object' && row !== null
            ? Object.entries(row as Record<string, unknown>)
                .map(([key, v]) => `${key}: ${v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                .join('  ·  ')
            : String(row)}
        </Typography>
      ))}
    </Box>
  );
};

const EntryRow: React.FC<{ entry: HistoryEntry; onUndo: (entry: HistoryEntry) => void }> = ({ entry, onUndo }) => {
  const [open, setOpen] = useState(false);
  const undone = Boolean(entry.undone_at);
  return (
    <>
      <TableRow hover sx={{ '& > *': { borderBottom: 'unset' }, opacity: undone ? 0.6 : 1 }}>
        <TableCell sx={{ width: 40 }}>
          <IconButton size="small" aria-label={open ? 'Hide details' : 'Show details'} onClick={() => setOpen((v) => !v)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatWhen(entry.created_at)}</TableCell>
        <TableCell>{entry.username ?? '—'}</TableCell>
        <TableCell>
          <Chip size="small" label={actionLabel(entry.action)} color={entry.action === 'undo' ? 'default' : entry.entity_type === 'gold' ? 'warning' : 'primary'} variant="outlined" />
        </TableCell>
        <TableCell sx={{ textDecoration: undone ? 'line-through' : 'none' }}>
          {entry.summary}
          {undone && (
            <Typography variant="caption" component="div" sx={{ color: 'text.secondary', textDecoration: 'none' }}>
              Undone {entry.undone_by_username ? `by ${entry.undone_by_username} ` : ''}{entry.undone_at ? formatWhen(entry.undone_at) : ''}
            </Typography>
          )}
        </TableCell>
        <TableCell align="right">
          {entry.undoable && (
            <Button size="small" variant="outlined" startIcon={<UndoIcon />} onClick={() => onUndo(entry)}>
              Undo
            </Button>
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={6} sx={{ py: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ py: 1.5, pl: 6 }}>
              <Snapshot label="Before" value={entry.before} />
              <Snapshot label="After" value={entry.after} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {entry.entity_type === 'gold' ? 'Gold rows' : 'Loot ids'}: {entry.entity_ids.join(', ') || '—'}
              </Typography>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const History: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<EntityFilter>('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [undoTarget, setUndoTarget] = useState<HistoryEntry | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string | number> = { limit: rowsPerPage, offset: page * rowsPerPage };
      if (filter !== 'all') params.entityType = filter;
      const response = await api.get('/audit', { params });
      const data = unwrap(response);
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load history'));
    } finally {
      setLoading(false);
    }
  }, [filter, page, rowsPerPage]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmUndo = async () => {
    if (!undoTarget) return;
    try {
      setUndoing(true);
      await api.post(`/audit/${undoTarget.id}/undo`);
      enqueueSnackbar('Change undone', { variant: 'success' });
      setUndoOpen(false);
      await load();
    } catch (err: unknown) {
      enqueueSnackbar(getErrorMessage(err, 'Could not undo this change'), { variant: 'error' });
    } finally {
      setUndoing(false);
    }
  };

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" gutterBottom>History</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        Every change to loot and gold in this campaign, newest first. Undo reverses a change; changes come off newest
        first, so a change to an item that was changed again later has to wait until the later change is undone.
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filter}
          onChange={(_e, value: EntityFilter | null) => {
            if (value) {
              setFilter(value);
              setPage(0);
            }
          }}
          aria-label="Filter history"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="loot">Loot</ToggleButton>
          <ToggleButton value="gold">Gold</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" onClick={() => load()} disabled={loading}>Refresh</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading && entries.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small" aria-label="History">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>When</TableCell>
                <TableCell>Who</TableCell>
                <TableCell>Change</TableCell>
                <TableCell>Summary</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} onUndo={(target) => { setUndoTarget(target); setUndoOpen(true); }} />
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>No changes recorded yet.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </TableContainer>
      )}

      <ConfirmDialog
        open={undoOpen}
        title="Undo this change?"
        confirmLabel="Undo"
        confirmColor="warning"
        busy={undoing}
        onConfirm={confirmUndo}
        onClose={() => setUndoOpen(false)}
      >
        {undoTarget?.summary}
        {undoTarget?.entity_type === 'gold' || undoTarget?.action === 'sale'
          ? ' The gold entry will be removed from the ledger.'
          : ' The items go back to how they were before this change.'}
      </ConfirmDialog>
    </Container>
  );
};

export default History;
