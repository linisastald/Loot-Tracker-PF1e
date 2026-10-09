// src/components/pages/Consumables.tsx
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { useIsDM } from '../../contexts/CampaignContext';
import {
  Alert,
  Button,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
  InputAdornment,
  Box,
  Tooltip
} from '@mui/material';
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  Search as SearchIcon
} from '@mui/icons-material';

interface Wand {
  id: number;
  name: string;
  quantity: number;
  charges?: number | null;
}

interface PotionScroll {
  itemid: number;
  name: string;
  quantity: number;
}

interface ConsumablesResponse {
  wands: Wand[];
  potionsScrolls: PotionScroll[];
}

type ConsumableType = 'wand' | 'potion' | 'scroll';

interface OpenSections {
  wands: boolean;
  potions: boolean;
  scrolls: boolean;
}

type SortDirection = 'asc' | 'desc';

interface SortState<T> {
  key: keyof T;
  direction: SortDirection;
}

// Maximum charges for wands
interface UseConsumableResponse {
  data?: { status?: string };
  message?: string;
}

const MAX_WAND_CHARGES = 50;

// Sort a copy of the list by the given key. Numbers sort numerically, strings
// case-insensitively, and null/undefined values (e.g. wands with unset charges)
// always sink to the bottom regardless of direction.
const sortItems = <T,>(items: T[], key: keyof T, direction: SortDirection): T[] => {
  const factor = direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    return String(av).localeCompare(String(bv)) * factor;
  });
};

const renderChargeProgress = (charges: number | null | undefined): React.ReactElement | null => {
  if (charges === null || charges === undefined) return null;

  const percentage = (charges / MAX_WAND_CHARGES) * 100;
  const color = !charges || percentage <= 25 ? 'error' : percentage <= 75 ? 'warning' : 'success';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
      <Box sx={{ width: '100%', mr: 1 }}>
        <LinearProgress
          variant="determinate"
          value={percentage}
          color={color}
          sx={{ height: 10, borderRadius: 5 }}
        />
      </Box>
      <Box sx={{ minWidth: 35 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {charges}/{MAX_WAND_CHARGES}
        </Typography>
      </Box>
    </Box>
  );
};

interface ColumnDef<T> {
  label: string;
  /** Property to sort on; omitted for non-sortable columns. */
  sortKey?: keyof T & string;
  width?: Record<string, string>;
  render: (row: T) => React.ReactNode;
}

interface ConsumableSectionProps<T extends { name: string }> {
  title: string;
  /** Singular lower-case noun pair used in the empty-state text, e.g. "wands". */
  noun: string;
  open: boolean;
  onToggle: () => void;
  items: T[];
  rowKey: (row: T) => number;
  columns: ColumnDef<T>[];
  sort: SortState<T>;
  onSort: (key: keyof T) => void;
  searching: boolean;
  renderAction: (row: T) => React.ReactNode;
}

const ConsumableSection = <T extends { name: string }>({
  title, noun, open, onToggle, items, rowKey, columns, sort, onSort, searching, renderAction,
}: ConsumableSectionProps<T>): React.ReactElement => (
  <Paper sx={{ p: { xs: 1, md: 2 }, mb: 2 }}>
    <Typography variant="h6" onClick={onToggle} style={{ cursor: 'pointer' }}>
      {title}
      <IconButton>
        {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
      </IconButton>
    </Typography>
    <Collapse in={open}>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              {columns.map((col) => {
                const sortKey = col.sortKey;
                const active = sortKey !== undefined && sort.key === sortKey;
                return (
                  <TableCell key={col.label} sortDirection={active ? sort.direction : false}>
                    {sortKey === undefined ? col.label : (
                      <TableSortLabel
                        active={active}
                        direction={active ? sort.direction : 'asc'}
                        onClick={() => onSort(sortKey)}
                      >
                        {col.label}
                      </TableSortLabel>
                    )}
                  </TableCell>
                );
              })}
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} align="center">
                  {searching ? `No matching ${noun} found` : `No ${noun} available`}
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={rowKey(row)}>
                  {columns.map((col) => (
                    <TableCell key={col.label} sx={col.width ? { width: col.width } : undefined}>
                      {col.render(row)}
                    </TableCell>
                  ))}
                  <TableCell>{renderAction(row)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Collapse>
  </Paper>
);

// Toggle sort: clicking the active column flips direction, a new column starts ascending
const nextSort = <T,>(prev: SortState<T>, key: keyof T): SortState<T> => ({
  key,
  direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
});

const quantityColumn = <T extends { quantity: number }>(): ColumnDef<T> =>
  ({ label: 'Quantity', sortKey: 'quantity' as keyof T & string, render: (row) => row.quantity });

const nameColumn = <T extends { name: string }>(): ColumnDef<T> =>
  ({ label: 'Name', sortKey: 'name' as keyof T & string, render: (row) => row.name });

const Consumables: React.FC = () => {
  // Owner decision (2026-10-06): charges change through use, or by a DM.
  const isDM = useIsDM();
  const [wands, setWands] = useState<Wand[]>([]);
  const [potions, setPotions] = useState<PotionScroll[]>([]);
  const [scrolls, setScrolls] = useState<PotionScroll[]>([]);
  const [openChargesDialog, setOpenChargesDialog] = useState<boolean>(false);
  const [selectedWand, setSelectedWand] = useState<Wand | null>(null);
  const [newCharges, setNewCharges] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [dialogError, setDialogError] = useState<string>('');
  const [openSections, setOpenSections] = useState<OpenSections>({wands: true, potions: true, scrolls: true});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [wandSort, setWandSort] = useState<SortState<Wand>>({key: 'name', direction: 'asc'});
  const [potionSort, setPotionSort] = useState<SortState<PotionScroll>>({key: 'name', direction: 'asc'});
  const [scrollSort, setScrollSort] = useState<SortState<PotionScroll>>({key: 'name', direction: 'asc'});

  const fetchConsumables = useCallback(async (isCancelled: () => boolean = () => false): Promise<void> => {
    try {
      const response = await api.get('/consumables') as unknown as { data: ConsumablesResponse };
      if (isCancelled()) return;
      const { wands: wandRows, potionsScrolls } = response.data;
      setWands(wandRows);
      setPotions(potionsScrolls.filter(item => item.name.toLowerCase().includes('potion of')));
      setScrolls(potionsScrolls.filter(item => item.name.toLowerCase().includes('scroll of')));
    } catch (err) {
      if (!isCancelled()) setError(getErrorMessage(err, 'Failed to load consumables'));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchConsumables(() => cancelled);
    return () => { cancelled = true; };
  }, [fetchConsumables]);

  // The type comes from the section the row is rendered in, never from its name.
  const handleUseConsumable = async (itemid: number, type: ConsumableType): Promise<void> => {
    setError('');
    setNotice('');
    try {
      const response = await api.post('/consumables/use', {itemid, type}) as unknown as UseConsumableResponse;
      if (type === 'wand' && response?.data?.status === 'Trashed') {
        setNotice(response.message || 'The wand is now empty and was moved to trash.');
      }
      // Refresh after server processes the update
      await fetchConsumables();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to use consumable'));
    }
  };

  const handleOpenChargesDialog = (wand: Wand): void => {
    setSelectedWand(wand);
    setNewCharges(wand.charges?.toString() || '');
    setDialogError('');
    setOpenChargesDialog(true);
  };

  const handleCloseChargesDialog = () => {
    setOpenChargesDialog(false);
    setSelectedWand(null);
    setNewCharges('');
    setDialogError('');
  };

  const handleUpdateCharges = async (): Promise<void> => {
    if (!selectedWand) return;
    try {
      await api.put('/consumables/wandcharges', {
        id: selectedWand.id,
        charges: parseInt(newCharges),
      });
      handleCloseChargesDialog();
      await fetchConsumables();
    } catch (err) {
      setDialogError(getErrorMessage(err, 'Failed to update wand charges'));
    }
  };

  const toggleSection = (section: keyof OpenSections): void => {
    setOpenSections(prev => ({...prev, [section]: !prev[section]}));
  };

  // Filter consumables based on search query
  const filterItems = <T extends { name: string }>(items: T[]): T[] => {
    if (!searchQuery) return items;
    return items.filter(item =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  // Filter then sort each section
  const filteredWands = sortItems(filterItems(wands), wandSort.key, wandSort.direction);
  const filteredPotions = sortItems(filterItems(potions), potionSort.key, potionSort.direction);
  const filteredScrolls = sortItems(filterItems(scrolls), scrollSort.key, scrollSort.direction);

  const wandColumns: ColumnDef<Wand>[] = [
    quantityColumn<Wand>(),
    nameColumn<Wand>(),
    {
      label: 'Charges',
      sortKey: 'charges',
      width: { xs: '35%', md: '30%' },
      render: (wand) => wand.charges !== null ? (
        <Tooltip title={`${wand.charges} out of ${MAX_WAND_CHARGES} charges remaining`}>
          <Box>{renderChargeProgress(wand.charges)}</Box>
        </Tooltip>
      ) : (
        isDM ? <Button onClick={() => handleOpenChargesDialog(wand)}>Enter Charges</Button> : null
      ),
    },
  ];

  const renderUseButton = (disabled: boolean, onClick: () => void): React.ReactNode => (
    <Button onClick={onClick} variant="outlined" color="primary" disabled={disabled}>
      Use
    </Button>
  );

  return (
    <Container maxWidth={false} component="main">
      {notice && (
        <Alert severity="info" onClose={() => setNotice('')} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{p: { xs: 1, md: 2 }, mb: 2}}>
        {/* Search Bar */}
        <TextField
          fullWidth
          margin="normal"
          variant="outlined"
          placeholder="Search consumables..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
          sx={{ mb: 2 }}
        />
      </Paper>

      <ConsumableSection<Wand>
        title="Wands"
        noun="wands"
        open={openSections.wands}
        onToggle={() => toggleSection('wands')}
        items={filteredWands}
        rowKey={(wand) => wand.id}
        columns={wandColumns}
        sort={wandSort}
        onSort={(key) => setWandSort(prev => nextSort(prev, key))}
        searching={!!searchQuery}
        renderAction={(wand) => renderUseButton(
          !wand.charges || wand.charges < 1,
          () => handleUseConsumable(wand.id, 'wand'),
        )}
      />

      <ConsumableSection<PotionScroll>
        title="Potions"
        noun="potions"
        open={openSections.potions}
        onToggle={() => toggleSection('potions')}
        items={filteredPotions}
        rowKey={(potion) => potion.itemid}
        columns={[quantityColumn<PotionScroll>(), nameColumn<PotionScroll>()]}
        sort={potionSort}
        onSort={(key) => setPotionSort(prev => nextSort(prev, key))}
        searching={!!searchQuery}
        renderAction={(potion) => renderUseButton(
          potion.quantity < 1,
          () => handleUseConsumable(potion.itemid, 'potion'),
        )}
      />

      <ConsumableSection<PotionScroll>
        title="Scrolls"
        noun="scrolls"
        open={openSections.scrolls}
        onToggle={() => toggleSection('scrolls')}
        items={filteredScrolls}
        rowKey={(scroll) => scroll.itemid}
        columns={[quantityColumn<PotionScroll>(), nameColumn<PotionScroll>()]}
        sort={scrollSort}
        onSort={(key) => setScrollSort(prev => nextSort(prev, key))}
        searching={!!searchQuery}
        renderAction={(scroll) => renderUseButton(
          scroll.quantity < 1,
          () => handleUseConsumable(scroll.itemid, 'scroll'),
        )}
      />

      {/* Charges Dialog */}
      <Dialog open={openChargesDialog} onClose={handleCloseChargesDialog}>
        <DialogTitle>Enter Charges</DialogTitle>
        <DialogContent>
          {dialogError && <Alert severity="error" sx={{ mb: 1 }}>{dialogError}</Alert>}
          <TextField
            autoFocus
            margin="dense"
            label="Charges"
            type="number"
            fullWidth
            value={newCharges}
            onChange={(e) => setNewCharges(e.target.value)}
            slotProps={{ htmlInput: {min: 0, max: MAX_WAND_CHARGES} }}
            helperText={`0 to ${MAX_WAND_CHARGES} charges; 0 trashes the wand`}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseChargesDialog}>Cancel</Button>
          <Button
            onClick={handleUpdateCharges}
            disabled={!/^[0-9]+$/.test(newCharges) || parseInt(newCharges) > MAX_WAND_CHARGES}
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Consumables;
