// frontend/src/components/pages/HarrowTracker.tsx
// Harrow Point Tracker (Curse of the Crimson Throne flavor module).
//
// Tracks each PC's Harrow Point balance for the current chapter. The DM owns a
// physical Harrow deck and runs the reading at the table; this page only stores
// the resulting points, advances the chapter, and shows the spend-options
// reference. DMs award/adjust/advance and spend on anyone; players spend on and
// record the Choosing card for their own character.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import TuneIcon from '@mui/icons-material/Tune';
import HistoryIcon from '@mui/icons-material/History';
import StyleIcon from '@mui/icons-material/Style';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useSnackbar } from 'notistack';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaign } from '../../contexts/CampaignContext';
import { HARROW_CARDS, HARROW_CHAPTERS, getHarrowChapter } from '../../data/harrow';

interface Choosing {
  card_name: string | null;
  is_chosen_boon: boolean;
}

interface RosterEntry {
  character_id: number;
  name: string;
  user_id: number | null;
  balance: number;
  choosing: Choosing | null;
}

interface HarrowState {
  currentChapter: number;
  enabled: boolean;
  balances: RosterEntry[];
}

interface LedgerEntry {
  id: number;
  chapter: number;
  delta: number;
  reason: string | null;
  entry_type: string;
  created_at: string;
  created_by_name: string | null;
}

const HarrowTracker: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const { campaignRole, isSuperadmin } = useCampaign();
  const isDM = campaignRole === 'DM' || isSuperadmin;

  const [state, setState] = useState<HarrowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [referenceOpen, setReferenceOpen] = useState(false);

  // Chapter advance control (DM)
  const [chapterDraft, setChapterDraft] = useState<number>(1);

  // Spend dialog
  const [spendTarget, setSpendTarget] = useState<RosterEntry | null>(null);
  const [spendPoints, setSpendPoints] = useState('1');
  const [spendReason, setSpendReason] = useState('');

  // Adjust dialog (DM)
  const [adjustTarget, setAdjustTarget] = useState<RosterEntry | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('1');
  const [adjustReason, setAdjustReason] = useState('');

  // Award helper dialog (DM)
  const [awardOpen, setAwardOpen] = useState(false);
  const [suitMatchCount, setSuitMatchCount] = useState('0');
  const [choosingHits, setChoosingHits] = useState<Record<number, boolean>>({});

  // Choosing editor dialog
  const [choosingTarget, setChoosingTarget] = useState<RosterEntry | null>(null);
  const [choosingCard, setChoosingCard] = useState<string | null>(null);
  const [choosingBoon, setChoosingBoon] = useState(false);

  // History drawer
  const [historyTarget, setHistoryTarget] = useState<RosterEntry | null>(null);
  const [historyEntries, setHistoryEntries] = useState<LedgerEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const currentChapter = state?.currentChapter ?? 1;
  const chapterInfo = useMemo(() => getHarrowChapter(currentChapter), [currentChapter]);

  const fetchState = useCallback(async () => {
    setLoading(true);
    try {
      const response: any = await api.get('/harrow');
      const data: HarrowState = response.data || response;
      setState(data);
      setChapterDraft(data.currentChapter);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load Harrow data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleApiError = (err: any, fallback: string) => {
    enqueueSnackbar(err.response?.data?.message || fallback, { variant: 'error' });
  };

  // ---- Chapter advance (DM) ------------------------------------------------
  const handleAdvanceChapter = async () => {
    try {
      await api.post('/harrow/chapter', { chapter: chapterDraft });
      enqueueSnackbar(`Current chapter set to ${chapterDraft}`, { variant: 'success' });
      await fetchState();
    } catch (err: any) {
      handleApiError(err, 'Failed to set chapter');
    }
  };

  // ---- Spend ---------------------------------------------------------------
  const openSpend = (entry: RosterEntry) => {
    setSpendTarget(entry);
    setSpendPoints('1');
    setSpendReason('');
  };

  const handleSpend = async () => {
    if (!spendTarget) return;
    const points = parseInt(spendPoints, 10);
    if (!Number.isInteger(points) || points <= 0) {
      enqueueSnackbar('Enter a positive number of points to spend', { variant: 'warning' });
      return;
    }
    try {
      await api.post('/harrow/spend', {
        characterId: spendTarget.character_id,
        points,
        reason: spendReason || undefined,
      });
      enqueueSnackbar(`Spent points for ${spendTarget.name}`, { variant: 'success' });
      setSpendTarget(null);
      await fetchState();
    } catch (err: any) {
      handleApiError(err, 'Failed to spend points');
    }
  };

  // ---- Adjust (DM) ---------------------------------------------------------
  const openAdjust = (entry: RosterEntry) => {
    setAdjustTarget(entry);
    setAdjustDelta('1');
    setAdjustReason('');
  };

  const handleAdjust = async () => {
    if (!adjustTarget) return;
    const delta = parseInt(adjustDelta, 10);
    if (!Number.isInteger(delta) || delta === 0) {
      enqueueSnackbar('Enter a non-zero adjustment', { variant: 'warning' });
      return;
    }
    try {
      await api.post('/harrow/adjust', {
        characterId: adjustTarget.character_id,
        delta,
        reason: adjustReason,
      });
      enqueueSnackbar(`Adjusted points for ${adjustTarget.name}`, { variant: 'success' });
      setAdjustTarget(null);
      await fetchState();
    } catch (err: any) {
      handleApiError(err, 'Failed to adjust points');
    }
  };

  // ---- Award helper (DM) ---------------------------------------------------
  const openAward = () => {
    setSuitMatchCount('0');
    setChoosingHits({});
    setAwardOpen(true);
  };

  const previewAward = (entry: RosterEntry): number => {
    const matches = parseInt(suitMatchCount, 10);
    const base = Number.isInteger(matches) ? matches : 0;
    return base + 1 + (choosingHits[entry.character_id] ? 1 : 0);
  };

  const handleAwardBatch = async () => {
    if (!state) return;
    const matches = parseInt(suitMatchCount, 10);
    if (!Number.isInteger(matches) || matches < 0 || matches > 9) {
      enqueueSnackbar('Enter how many spread cards match the suit (0–9)', { variant: 'warning' });
      return;
    }
    try {
      await api.post('/harrow/award-batch', {
        suitMatchCount: matches,
        awards: state.balances.map((entry) => ({
          characterId: entry.character_id,
          choosingHit: !!choosingHits[entry.character_id],
        })),
      });
      enqueueSnackbar('Awarded Harrow Points from the reading', { variant: 'success' });
      setAwardOpen(false);
      await fetchState();
    } catch (err: any) {
      handleApiError(err, 'Failed to award points');
    }
  };

  // ---- Choosing editor -----------------------------------------------------
  const openChoosing = (entry: RosterEntry) => {
    setChoosingTarget(entry);
    setChoosingCard(entry.choosing?.card_name ?? null);
    setChoosingBoon(entry.choosing?.is_chosen_boon ?? false);
  };

  const handleSaveChoosing = async () => {
    if (!choosingTarget) return;
    try {
      await api.post('/harrow/choosing', {
        characterId: choosingTarget.character_id,
        cardName: choosingCard || null,
        isChosenBoon: choosingBoon,
      });
      enqueueSnackbar(`Choosing card saved for ${choosingTarget.name}`, { variant: 'success' });
      setChoosingTarget(null);
      await fetchState();
    } catch (err: any) {
      handleApiError(err, 'Failed to save Choosing card');
    }
  };

  // ---- History drawer ------------------------------------------------------
  const openHistory = async (entry: RosterEntry) => {
    setHistoryTarget(entry);
    setHistoryEntries([]);
    setHistoryLoading(true);
    try {
      const response: any = await api.get(`/harrow/${entry.character_id}/ledger`);
      const data = response.data || response;
      setHistoryEntries(data.ledger || []);
    } catch (err: any) {
      handleApiError(err, 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const canActOn = (entry: RosterEntry): boolean =>
    isDM || (entry.user_id != null && entry.user_id === user?.id);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 2, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <StyleIcon color="primary" />
        <Typography variant="h4">Harrow Point Tracker</Typography>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {state && !state.enabled && (
        <Alert severity="info" sx={{ mb: 2 }}>
          The Harrow Point Tracker is currently disabled for this campaign. A DM can enable it in
          Campaign Settings.
        </Alert>
      )}
      {/* Chapter header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} sx={{
          alignItems: "center"
        }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Typography variant="overline" sx={{
              color: "text.secondary"
            }}>
              Chapter {chapterInfo.chapter}
            </Typography>
            <Typography variant="h5">{chapterInfo.name}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Chip label={`Suit: ${chapterInfo.suit}`} size="small" />
              <Chip label={`Ability: ${chapterInfo.ability} (${chapterInfo.abilityAbbr})`} size="small" color="primary" />
            </Stack>
          </Grid>

          {isDM && (
            <Grid size={{ xs: 12, md: 5 }}>
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: "center",
                  justifyContent: { md: 'flex-end' }
                }}>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id="harrow-chapter-label">Set chapter</InputLabel>
                  <Select
                    labelId="harrow-chapter-label"
                    label="Set chapter"
                    value={chapterDraft}
                    onChange={(e) => setChapterDraft(Number(e.target.value))}
                  >
                    {HARROW_CHAPTERS.map((c) => (
                      <MenuItem key={c.chapter} value={c.chapter}>
                        {c.chapter}. {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  onClick={handleAdvanceChapter}
                  disabled={chapterDraft === currentChapter}
                >
                  Advance
                </Button>
              </Stack>
              {chapterDraft !== currentChapter && (
                <Typography
                  variant="caption"
                  sx={{
                    color: "warning.main",
                    display: 'block',
                    mt: 1,
                    textAlign: { md: 'right' }
                  }}>
                  Points from chapter {currentChapter} will no longer count once you advance.
                </Typography>
              )}
            </Grid>
          )}
        </Grid>
      </Paper>
      {/* Spend-options reference panel */}
      <Paper sx={{ mb: 3 }}>
        <Box
          sx={{ p: 2, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setReferenceOpen((o) => !o)}
        >
          <AutoAwesomeIcon sx={{ mr: 1 }} color="action" />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Spend options — {chapterInfo.ability} ({chapterInfo.abilityAbbr})
          </Typography>
          <ExpandMoreIcon
            sx={{ transform: referenceOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
          />
        </Box>
        <Collapse in={referenceOpen}>
          <Divider />
          <List dense>
            {chapterInfo.spendOptions.map((option, i) => (
              <ListItem key={i}>
                <ListItemText primary={option} />
              </ListItem>
            ))}
          </List>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              display: 'block',
              px: 2,
              pb: 2
            }}>
            Spending is a free action with no per-round limit. Unspent points are lost at the end of
            the chapter.
          </Typography>
        </Collapse>
      </Paper>
      {/* Roster */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Roster
        </Typography>
        {isDM && (
          <Button variant="contained" startIcon={<AutoAwesomeIcon />} onClick={openAward}>
            Award from reading
          </Button>
        )}
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Character</TableCell>
              <TableCell align="center">Points (Ch. {currentChapter})</TableCell>
              <TableCell>Choosing card</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {state?.balances.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      py: 2
                    }}>
                    No active characters in this campaign yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {state?.balances.map((entry) => (
              <TableRow key={entry.character_id} hover>
                <TableCell>{entry.name}</TableCell>
                <TableCell align="center">
                  <Chip label={entry.balance} color={entry.balance > 0 ? 'primary' : 'default'} />
                </TableCell>
                <TableCell>
                  {entry.choosing?.card_name ? (
                    <Stack direction="row" spacing={0.5} sx={{
                      alignItems: "center"
                    }}>
                      <Typography variant="body2">{entry.choosing.card_name}</Typography>
                      {entry.choosing.is_chosen_boon && (
                        <Tooltip title="Earned The Chosen boon this chapter">
                          <Chip label="Chosen" size="small" color="success" />
                        </Tooltip>
                      )}
                    </Stack>
                  ) : (
                    <Typography variant="body2" sx={{
                      color: "text.secondary"
                    }}>
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} sx={{
                    justifyContent: "flex-end"
                  }}>
                    {isDM && (
                      <Tooltip title="Award (1 point)">
                        <span>
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={async () => {
                              try {
                                await api.post('/harrow/award', {
                                  characterId: entry.character_id,
                                  points: 1,
                                });
                                await fetchState();
                              } catch (err: any) {
                                handleApiError(err, 'Failed to award point');
                              }
                            }}
                          >
                            <AddIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    <Tooltip title="Spend points">
                      <span>
                        <IconButton
                          size="small"
                          disabled={!canActOn(entry) || entry.balance <= 0}
                          onClick={() => openSpend(entry)}
                        >
                          <RemoveIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    {isDM && (
                      <Tooltip title="Adjust (correction)">
                        <span>
                          <IconButton size="small" onClick={() => openAdjust(entry)}>
                            <TuneIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    <Tooltip title="Choosing card">
                      <span>
                        <IconButton
                          size="small"
                          disabled={!canActOn(entry)}
                          onClick={() => openChoosing(entry)}
                        >
                          <StyleIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="History">
                      <span>
                        <IconButton size="small" onClick={() => openHistory(entry)}>
                          <HistoryIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {/* Spend dialog */}
      <Dialog open={!!spendTarget} onClose={() => setSpendTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Spend Harrow Points — {spendTarget?.name}</DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 2
            }}>
            Available this chapter: {spendTarget?.balance ?? 0}
          </Typography>
          <TextField
            label="Points to spend"
            type="number"
            fullWidth
            margin="normal"
            value={spendPoints}
            onChange={(e) => setSpendPoints(e.target.value)}
            slotProps={{ input: { inputProps: { min: 1, max: spendTarget?.balance ?? 1 } } }}
          />
          <FormControl fullWidth margin="normal">
            <InputLabel id="spend-reason-label">What for? (optional)</InputLabel>
            <Select
              labelId="spend-reason-label"
              label="What for? (optional)"
              value={spendReason}
              onChange={(e) => setSpendReason(e.target.value)}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {chapterInfo.spendOptions.map((option, i) => (
                <MenuItem key={i} value={option}>
                  {option}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSpendTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleSpend}>
            Spend
          </Button>
        </DialogActions>
      </Dialog>
      {/* Adjust dialog */}
      <Dialog open={!!adjustTarget} onClose={() => setAdjustTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Adjust Harrow Points — {adjustTarget?.name}</DialogTitle>
        <DialogContent>
          <TextField
            label="Delta (+/-)"
            type="number"
            fullWidth
            margin="normal"
            value={adjustDelta}
            onChange={(e) => setAdjustDelta(e.target.value)}
            helperText="Positive adds, negative removes"
          />
          <TextField
            label="Reason"
            fullWidth
            margin="normal"
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdjust} disabled={!adjustReason.trim()}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>
      {/* Award helper dialog */}
      <Dialog open={awardOpen} onClose={() => setAwardOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Award from reading — Chapter {currentChapter}</DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 2
            }}>
            Each PC earns (spread cards matching the {chapterInfo.suit} suit) + 1 guaranteed point
            (the Choosing), plus 1 more if their own Choosing card appeared in the spread.
          </Typography>
          <TextField
            label={`How many of the 9 spread cards match ${chapterInfo.suit}?`}
            type="number"
            fullWidth
            margin="normal"
            value={suitMatchCount}
            onChange={(e) => setSuitMatchCount(e.target.value)}
            slotProps={{ input: { inputProps: { min: 0, max: 9 } } }}
          />
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>
            Did each PC's Choosing card appear in the spread?
          </Typography>
          <List dense>
            {state?.balances.map((entry) => (
              <ListItem
                key={entry.character_id}
                secondaryAction={<Chip label={`+${previewAward(entry)}`} color="primary" size="small" />}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={!!choosingHits[entry.character_id]}
                      onChange={(e) =>
                        setChoosingHits((prev) => ({
                          ...prev,
                          [entry.character_id]: e.target.checked,
                        }))
                      }
                    />
                  }
                  label={
                    entry.choosing?.card_name
                      ? `${entry.name} — ${entry.choosing.card_name}`
                      : entry.name
                  }
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAwardOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAwardBatch}>
            Award all
          </Button>
        </DialogActions>
      </Dialog>
      {/* Choosing editor dialog */}
      <Dialog open={!!choosingTarget} onClose={() => setChoosingTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Choosing card — {choosingTarget?.name}</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={HARROW_CARDS}
            value={choosingCard}
            onChange={(_, value) => setChoosingCard(value)}
            renderInput={(params) => (
              <TextField {...params} label="Choosing card" margin="normal" />
            )}
          />
          <FormControlLabel
            control={
              <Checkbox checked={choosingBoon} onChange={(e) => setChoosingBoon(e.target.checked)} />
            }
            label="Earned The Chosen boon this chapter"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChoosingTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveChoosing}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
      {/* History drawer */}
      <Drawer anchor="right" open={!!historyTarget} onClose={() => setHistoryTarget(null)}>
        <Box sx={{ width: 360, p: 2 }}>
          <Typography variant="h6" gutterBottom>
            History — {historyTarget?.name}
          </Typography>
          {historyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <CircularProgress />
            </Box>
          ) : historyEntries.length === 0 ? (
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
              No entries yet.
            </Typography>
          ) : (
            <List dense>
              {historyEntries.map((h) => (
                <ListItem key={h.id} divider>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} sx={{
                        alignItems: "center"
                      }}>
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
    </Container>
  );
};

export default HarrowTracker;
