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
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Divider,
  FormControl,
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
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaign } from '../../contexts/CampaignContext';
import { HARROW_CHAPTERS, getHarrowChapter } from '../../data/harrow';
import type { HarrowState, RosterEntry } from './harrow/types';
import { useHarrowApi } from './harrow/useHarrowApi';
import {
  AdjustDialog,
  AwardDialog,
  ChoosingDialog,
  HistoryDrawer,
  SpendDialog,
} from './harrow/HarrowDialogs';

const HarrowTracker: React.FC = () => {
  const { post } = useHarrowApi();
  const { user } = useAuth();
  const { isDM } = useCampaign();

  const [state, setState] = useState<HarrowState | null>(null);
  // Full-page spinner only for the first load; later refreshes happen silently
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [referenceOpen, setReferenceOpen] = useState(false);

  // Chapter advance control (DM)
  const [chapterDraft, setChapterDraft] = useState<number>(1);

  // Which dialog is open, and for whom
  const [spendTarget, setSpendTarget] = useState<RosterEntry | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<RosterEntry | null>(null);
  const [choosingTarget, setChoosingTarget] = useState<RosterEntry | null>(null);
  const [historyTarget, setHistoryTarget] = useState<RosterEntry | null>(null);
  const [awardOpen, setAwardOpen] = useState(false);

  const currentChapter = state?.currentChapter ?? 1;
  const chapterInfo = useMemo(() => getHarrowChapter(currentChapter), [currentChapter]);

  const fetchState = useCallback(async () => {
    try {
      const response = (await api.get('/harrow')) as { data?: HarrowState } & Partial<HarrowState>;
      const data = (response.data || response) as HarrowState;
      setState(data);
      setChapterDraft(data.currentChapter);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load Harrow data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleAdvanceChapter = async () => {
    const ok = await post(
      '/harrow/chapter',
      { chapter: chapterDraft },
      `Current chapter set to ${chapterDraft}`,
      'Failed to set chapter'
    );
    if (ok) await fetchState();
  };

  const handleAwardOne = async (entry: RosterEntry) => {
    const ok = await post(
      '/harrow/award',
      { characterId: entry.character_id, points: 1 },
      null,
      'Failed to award point'
    );
    if (ok) await fetchState();
  };

  // Close a dialog and refresh the roster after a successful save
  const done = (close: () => void) => () => {
    close();
    fetchState();
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
          <Button
            variant="contained"
            startIcon={<AutoAwesomeIcon />}
            onClick={() => setAwardOpen(true)}
          >
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
                            aria-label={`Award 1 point to ${entry.name}`}
                            onClick={() => handleAwardOne(entry)}
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
                          aria-label={`Spend points for ${entry.name}`}
                          disabled={!canActOn(entry) || entry.balance <= 0}
                          onClick={() => setSpendTarget(entry)}
                        >
                          <RemoveIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    {isDM && (
                      <Tooltip title="Adjust (correction)">
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Adjust points for ${entry.name}`}
                            onClick={() => setAdjustTarget(entry)}
                          >
                            <TuneIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    <Tooltip title="Choosing card">
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`Choosing card for ${entry.name}`}
                          disabled={!canActOn(entry)}
                          onClick={() => setChoosingTarget(entry)}
                        >
                          <StyleIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="History">
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`History for ${entry.name}`}
                          onClick={() => setHistoryTarget(entry)}
                        >
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
      {spendTarget && (
        <SpendDialog
          target={spendTarget}
          spendOptions={chapterInfo.spendOptions}
          onClose={() => setSpendTarget(null)}
          onDone={done(() => setSpendTarget(null))}
        />
      )}
      {adjustTarget && (
        <AdjustDialog
          target={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onDone={done(() => setAdjustTarget(null))}
        />
      )}
      {awardOpen && state && (
        <AwardDialog
          roster={state.balances}
          chapter={currentChapter}
          suit={chapterInfo.suit}
          onClose={() => setAwardOpen(false)}
          onDone={done(() => setAwardOpen(false))}
        />
      )}
      {choosingTarget && (
        <ChoosingDialog
          target={choosingTarget}
          onClose={() => setChoosingTarget(null)}
          onDone={done(() => setChoosingTarget(null))}
        />
      )}
      {historyTarget && (
        <HistoryDrawer target={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}
    </Container>
  );
};

export default HarrowTracker;
