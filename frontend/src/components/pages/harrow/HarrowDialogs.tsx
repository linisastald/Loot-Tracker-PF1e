// Dialogs and the history drawer for the Harrow Point Tracker. Each one owns its
// draft state, so typing in a field does not re-render the whole roster page.
import React, { useEffect, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import api from '../../../utils/api';
import { getErrorMessage } from '../../../utils/apiErrors';
import { HARROW_CARDS } from '../../../data/harrow';
import type { LedgerEntry, RosterEntry } from './types';
import { useHarrowApi } from './useHarrowApi';

interface DialogProps {
  target: RosterEntry;
  onClose: () => void;
  /** Called after a successful save: the page closes the dialog and refetches. */
  onDone: () => void;
}

// ---- Spend ------------------------------------------------------------------
interface SpendDialogProps extends DialogProps {
  spendOptions: string[];
}

export const SpendDialog: React.FC<SpendDialogProps> = ({ target, spendOptions, onClose, onDone }) => {
  const { post, enqueueSnackbar } = useHarrowApi();
  const [points, setPoints] = useState('1');
  const [reason, setReason] = useState('');

  const handleSpend = async () => {
    const value = parseInt(points, 10);
    if (!Number.isInteger(value) || value <= 0) {
      enqueueSnackbar('Enter a positive number of points to spend', { variant: 'warning' });
      return;
    }
    const ok = await post(
      '/harrow/spend',
      { characterId: target.character_id, points: value, reason: reason || undefined },
      `Spent points for ${target.name}`,
      'Failed to spend points'
    );
    if (ok) onDone();
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Spend Harrow Points — {target.name}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Available this chapter: {target.balance}
        </Typography>
        <TextField
          label="Points to spend"
          type="number"
          fullWidth
          margin="normal"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          slotProps={{ input: { inputProps: { min: 1, max: target.balance } } }}
        />
        <FormControl fullWidth margin="normal">
          <InputLabel id="spend-reason-label">What for? (optional)</InputLabel>
          <Select
            labelId="spend-reason-label"
            label="What for? (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {spendOptions.map((option, i) => (
              <MenuItem key={i} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSpend}>
          Spend
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ---- Adjust (DM) ------------------------------------------------------------
export const AdjustDialog: React.FC<DialogProps> = ({ target, onClose, onDone }) => {
  const { post, enqueueSnackbar } = useHarrowApi();
  const [delta, setDelta] = useState('1');
  const [reason, setReason] = useState('');

  const handleAdjust = async () => {
    const value = parseInt(delta, 10);
    if (!Number.isInteger(value) || value === 0) {
      enqueueSnackbar('Enter a non-zero adjustment', { variant: 'warning' });
      return;
    }
    const ok = await post(
      '/harrow/adjust',
      { characterId: target.character_id, delta: value, reason },
      `Adjusted points for ${target.name}`,
      'Failed to adjust points'
    );
    if (ok) onDone();
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Adjust Harrow Points — {target.name}</DialogTitle>
      <DialogContent>
        <TextField
          label="Delta (+/-)"
          type="number"
          fullWidth
          margin="normal"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          helperText="Positive adds, negative removes"
        />
        <TextField
          label="Reason"
          fullWidth
          margin="normal"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleAdjust} disabled={!reason.trim()}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ---- Award helper (DM) ------------------------------------------------------
interface AwardDialogProps {
  roster: RosterEntry[];
  chapter: number;
  suit: string;
  onClose: () => void;
  onDone: () => void;
}

export const AwardDialog: React.FC<AwardDialogProps> = ({ roster, chapter, suit, onClose, onDone }) => {
  const { post, enqueueSnackbar } = useHarrowApi();
  const [suitMatchCount, setSuitMatchCount] = useState('0');
  const [choosingHits, setChoosingHits] = useState<Record<number, boolean>>({});

  const previewAward = (entry: RosterEntry): number => {
    const matches = parseInt(suitMatchCount, 10);
    const base = Number.isInteger(matches) ? matches : 0;
    return base + 1 + (choosingHits[entry.character_id] ? 1 : 0);
  };

  const handleAwardBatch = async () => {
    const matches = parseInt(suitMatchCount, 10);
    if (!Number.isInteger(matches) || matches < 0 || matches > 9) {
      enqueueSnackbar('Enter how many spread cards match the suit (0–9)', { variant: 'warning' });
      return;
    }
    const ok = await post(
      '/harrow/award-batch',
      {
        suitMatchCount: matches,
        awards: roster.map((entry) => ({
          characterId: entry.character_id,
          choosingHit: !!choosingHits[entry.character_id],
        })),
      },
      'Awarded Harrow Points from the reading',
      'Failed to award points'
    );
    if (ok) onDone();
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Award from reading — Chapter {chapter}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Each PC earns (spread cards matching the {suit} suit) + 1 guaranteed point (the Choosing),
          plus 1 more if their own Choosing card appeared in the spread.
        </Typography>
        <TextField
          label={`How many of the 9 spread cards match ${suit}?`}
          type="number"
          fullWidth
          margin="normal"
          value={suitMatchCount}
          onChange={(e) => setSuitMatchCount(e.target.value)}
          slotProps={{ input: { inputProps: { min: 0, max: 9 } } }}
        />
        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" gutterBottom>
          Did each PC&apos;s Choosing card appear in the spread?
        </Typography>
        <List dense>
          {roster.map((entry) => (
            <ListItem
              key={entry.character_id}
              secondaryAction={<Chip label={`+${previewAward(entry)}`} color="primary" size="small" />}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={!!choosingHits[entry.character_id]}
                    onChange={(e) =>
                      setChoosingHits((prev) => ({ ...prev, [entry.character_id]: e.target.checked }))
                    }
                  />
                }
                label={
                  entry.choosing?.card_name ? `${entry.name} — ${entry.choosing.card_name}` : entry.name
                }
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleAwardBatch}>
          Award all
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ---- Choosing editor --------------------------------------------------------
export const ChoosingDialog: React.FC<DialogProps> = ({ target, onClose, onDone }) => {
  const { post } = useHarrowApi();
  const [card, setCard] = useState<string | null>(target.choosing?.card_name ?? null);
  const [boon, setBoon] = useState(target.choosing?.is_chosen_boon ?? false);

  const handleSave = async () => {
    const ok = await post(
      '/harrow/choosing',
      { characterId: target.character_id, cardName: card || null, isChosenBoon: boon },
      `Choosing card saved for ${target.name}`,
      'Failed to save Choosing card'
    );
    if (ok) onDone();
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Choosing card — {target.name}</DialogTitle>
      <DialogContent>
        <Autocomplete
          options={HARROW_CARDS}
          value={card}
          onChange={(_, value) => setCard(value)}
          renderInput={(params) => <TextField {...params} label="Choosing card" margin="normal" />}
        />
        <FormControlLabel
          control={<Checkbox checked={boon} onChange={(e) => setBoon(e.target.checked)} />}
          label="Earned The Chosen boon this chapter"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ---- History drawer ---------------------------------------------------------
interface HistoryDrawerProps {
  target: RosterEntry;
  onClose: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ target, onClose }) => {
  const { enqueueSnackbar } = useHarrowApi();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = (await api.get(`/harrow/${target.character_id}/ledger`)) as {
          data?: { ledger?: LedgerEntry[] };
          ledger?: LedgerEntry[];
        };
        const data = response.data || response;
        if (!cancelled) setEntries(data.ledger || []);
      } catch (err) {
        if (!cancelled) {
          enqueueSnackbar(getErrorMessage(err, 'Failed to load history'), { variant: 'error' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // enqueueSnackbar identity is not a reason to refetch the ledger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.character_id]);

  return (
    <Drawer anchor="right" open onClose={onClose}>
      <Box sx={{ width: 360, p: 2 }}>
        <Typography variant="h6" gutterBottom>
          History — {target.name}
        </Typography>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        ) : entries.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No entries yet.
          </Typography>
        ) : (
          <List dense>
            {entries.map((h) => (
              <ListItem key={h.id} divider>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Chip
                        label={`${h.delta > 0 ? '+' : ''}${h.delta}`}
                        size="small"
                        color={h.delta > 0 ? 'success' : 'default'}
                      />
                      <Typography variant="body2">{h.reason || h.entry_type}</Typography>
                    </Stack>
                  }
                  secondary={`Ch. ${h.chapter} · ${new Date(h.created_at).toLocaleString()}${
                    h.created_by_name ? ` · ${h.created_by_name}` : ''
                  }`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Drawer>
  );
};

