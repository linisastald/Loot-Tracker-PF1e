// src/components/Consumables.tsx
import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import {
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
  Search as SearchIcon,
  BatteryFull as BatteryFullIcon,
  BatteryAlert as BatteryAlertIcon
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

interface SortableHeaderCellProps {
  label: string;
  columnKey: string;
  activeKey: string;
  direction: SortDirection;
  onSort: (key: string) => void;
}

const SortableHeaderCell: React.FC<SortableHeaderCellProps> = ({
  label, columnKey, activeKey, direction, onSort,
}) => {
  const active = activeKey === columnKey;
  return (
    <TableCell sortDirection={active ? direction : false}>
      <TableSortLabel
        active={active}
        direction={active ? direction : 'asc'}
        onClick={() => onSort(columnKey)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
};

const Consumables: React.FC = () => {
  const [wands, setWands] = useState<Wand[]>([]);
  const [potions, setPotions] = useState<PotionScroll[]>([]);
  const [scrolls, setScrolls] = useState<PotionScroll[]>([]);
  const [openChargesDialog, setOpenChargesDialog] = useState<boolean>(false);
  const [selectedWand, setSelectedWand] = useState<Wand | null>(null);
  const [newCharges, setNewCharges] = useState<string>('');
  const [openSections, setOpenSections] = useState<OpenSections>({wands: true, potions: true, scrolls: true});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [wandSort, setWandSort] = useState<SortState<Wand>>({key: 'name', direction: 'asc'});
  const [potionSort, setPotionSort] = useState<SortState<PotionScroll>>({key: 'name', direction: 'asc'});
  const [scrollSort, setScrollSort] = useState<SortState<PotionScroll>>({key: 'name', direction: 'asc'});

  // Maximum charges for wands
  const MAX_WAND_CHARGES = 50;

  useEffect(() => {
    let cancelled = false;

    const loadConsumables = async () => {
      try {
        const response = await api.get(`/consumables`);
        if (cancelled) return;
        setWands(response.data.wands);
        const potionItems = response.data.potionsScrolls.filter(item => item.name.toLowerCase().includes('potion of'));
        const scrollItems = response.data.potionsScrolls.filter(item => item.name.toLowerCase().includes('scroll of'));
        setPotions(potionItems);
        setScrolls(scrollItems);
      } catch (error) {
        if (!cancelled) console.error('Error fetching consumables:', error);
      }
    };

    loadConsumables();
    return () => { cancelled = true; };
  }, []);

  const fetchConsumables = async () => {
    try {
      const response = await api.get(`/consumables`);
      setWands(response.data.wands);
      const potionItems = response.data.potionsScrolls.filter(item => item.name.toLowerCase().includes('potion of'));
      const scrollItems = response.data.potionsScrolls.filter(item => item.name.toLowerCase().includes('scroll of'));
      setPotions(potionItems);
      setScrolls(scrollItems);
    } catch (error) {
      console.error('Error fetching consumables:', error);
    }
  };

  const handleUseConsumable = async (itemid: number, name: string): Promise<void> => {
    try {
      const type = name.toLowerCase().includes('potion of') ? 'potion' :
        name.toLowerCase().includes('scroll of') ? 'scroll' : 'wand';
      await api.post(`/consumables/use`, {itemid, type});
      // Refresh after server processes the update
      await fetchConsumables();
    } catch (error) {
      console.error('Error using consumable:', error);
    }
  };

  const handleOpenChargesDialog = (wand: Wand): void => {
    setSelectedWand(wand);
    setNewCharges(wand.charges?.toString() || '');
    setOpenChargesDialog(true);
  };

  const handleCloseChargesDialog = () => {
    setOpenChargesDialog(false);
    setSelectedWand(null);
    setNewCharges('');
  };

  const handleUpdateCharges = async (): Promise<void> => {
    try {
      await api.put(`/consumables/wandcharges`, {
        id: selectedWand!.id,
        charges: parseInt(newCharges),
      });
      handleCloseChargesDialog();
      fetchConsumables();
    } catch (error) {
      console.error('Error updating wand charges:', error);
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

  // Calculate progress color based on charges percentage
  const getChargeProgressColor = (charges: number | null | undefined): 'success' | 'warning' | 'error' => {
    if (!charges) return 'error';
    const percentage = (charges / MAX_WAND_CHARGES) * 100;
    if (percentage > 75) return 'success';
    if (percentage > 25) return 'warning';
    return 'error';
  };

  // Render charge progress bar
  const renderChargeProgress = (charges: number | null | undefined): React.ReactElement | null => {
    if (charges === null || charges === undefined) return null;

    const percentage = (charges / MAX_WAND_CHARGES) * 100;
    const color = getChargeProgressColor(charges);

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
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {charges}/{MAX_WAND_CHARGES}
          </Typography>
        </Box>
      </Box>
    );
  };

  // Toggle sort: clicking the active column flips direction, a new column starts ascending
  const handleSort = <T,>(
    setter: React.Dispatch<React.SetStateAction<SortState<T>>>,
    key: string,
  ): void => {
    setter(prev => ({
      key: key as keyof T,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Filter then sort each section
  const filteredWands = sortItems(filterItems(wands), wandSort.key, wandSort.direction);
  const filteredPotions = sortItems(filterItems(potions), potionSort.key, potionSort.direction);
  const filteredScrolls = sortItems(filterItems(scrolls), scrollSort.key, scrollSort.direction);

  return (
    <Container maxWidth={false} component="main">
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

      {/* Wands Section */}
      <Paper sx={{p: { xs: 1, md: 2 }, mb: 2}}>
        <Typography variant="h6" onClick={() => toggleSection('wands')} style={{cursor: 'pointer'}}>
          Wands
          <IconButton>
            {openSections.wands ? <KeyboardArrowUp/> : <KeyboardArrowDown/>}
          </IconButton>
        </Typography>
        <Collapse in={openSections.wands}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <SortableHeaderCell label="Quantity" columnKey="quantity" activeKey={wandSort.key} direction={wandSort.direction} onSort={(k) => handleSort(setWandSort, k)} />
                  <SortableHeaderCell label="Name" columnKey="name" activeKey={wandSort.key} direction={wandSort.direction} onSort={(k) => handleSort(setWandSort, k)} />
                  <SortableHeaderCell label="Charges" columnKey="charges" activeKey={wandSort.key} direction={wandSort.direction} onSort={(k) => handleSort(setWandSort, k)} />
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredWands.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      {searchQuery ? "No matching wands found" : "No wands available"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredWands.map((wand) => (
                    <TableRow key={wand.id}>
                      <TableCell>{wand.quantity}</TableCell>
                      <TableCell>{wand.name}</TableCell>
                      <TableCell sx={{ width: { xs: '35%', md: '30%' } }}>
                        {wand.charges !== null ? (
                          <Tooltip title={`${wand.charges} out of ${MAX_WAND_CHARGES} charges remaining`}>
                            <Box>
                              {renderChargeProgress(wand.charges)}
                            </Box>
                          </Tooltip>
                        ) : (
                          <Button onClick={() => handleOpenChargesDialog(wand)}>
                            Enter Charges
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => handleUseConsumable(wand.id, wand.name)}
                          variant="outlined"
                          color="primary"
                          disabled={!wand.charges || wand.charges < 1}
                        >
                          Use
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Collapse>
      </Paper>

      {/* Potions Section */}
      <Paper sx={{p: { xs: 1, md: 2 }, mb: 2}}>
        <Typography variant="h6" onClick={() => toggleSection('potions')} style={{cursor: 'pointer'}}>
          Potions
          <IconButton>
            {openSections.potions ? <KeyboardArrowUp/> : <KeyboardArrowDown/>}
          </IconButton>
        </Typography>
        <Collapse in={openSections.potions}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <SortableHeaderCell label="Quantity" columnKey="quantity" activeKey={potionSort.key} direction={potionSort.direction} onSort={(k) => handleSort(setPotionSort, k)} />
                  <SortableHeaderCell label="Name" columnKey="name" activeKey={potionSort.key} direction={potionSort.direction} onSort={(k) => handleSort(setPotionSort, k)} />
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredPotions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      {searchQuery ? "No matching potions found" : "No potions available"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPotions.map((potion) => (
                    <TableRow key={potion.itemid}>
                      <TableCell>{potion.quantity}</TableCell>
                      <TableCell>{potion.name}</TableCell>
                      <TableCell>
                        <Button
                          onClick={() => handleUseConsumable(potion.itemid, potion.name)}
                          variant="outlined"
                          color="primary"
                          disabled={potion.quantity < 1}
                        >
                          Use
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Collapse>
      </Paper>

      {/* Scrolls Section */}
      <Paper sx={{p: { xs: 1, md: 2 }, mb: 2}}>
        <Typography variant="h6" onClick={() => toggleSection('scrolls')} style={{cursor: 'pointer'}}>
          Scrolls
          <IconButton>
            {openSections.scrolls ? <KeyboardArrowUp/> : <KeyboardArrowDown/>}
          </IconButton>
        </Typography>
        <Collapse in={openSections.scrolls}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <SortableHeaderCell label="Quantity" columnKey="quantity" activeKey={scrollSort.key} direction={scrollSort.direction} onSort={(k) => handleSort(setScrollSort, k)} />
                  <SortableHeaderCell label="Name" columnKey="name" activeKey={scrollSort.key} direction={scrollSort.direction} onSort={(k) => handleSort(setScrollSort, k)} />
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredScrolls.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      {searchQuery ? "No matching scrolls found" : "No scrolls available"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredScrolls.map((scroll) => (
                    <TableRow key={scroll.itemid}>
                      <TableCell>{scroll.quantity}</TableCell>
                      <TableCell>{scroll.name}</TableCell>
                      <TableCell>
                        <Button
                          onClick={() => handleUseConsumable(scroll.itemid, scroll.name)}
                          variant="outlined"
                          color="primary"
                          disabled={scroll.quantity < 1}
                        >
                          Use
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Collapse>
      </Paper>

      {/* Charges Dialog */}
      <Dialog open={openChargesDialog} onClose={handleCloseChargesDialog}>
        <DialogTitle>Enter Charges</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Charges"
            type="number"
            fullWidth
            value={newCharges}
            onChange={(e) => setNewCharges(e.target.value)}
            slotProps={{ htmlInput: {min: 1, max: MAX_WAND_CHARGES} }}
            helperText={`Max ${MAX_WAND_CHARGES} charges`}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseChargesDialog}>Cancel</Button>
          <Button
            onClick={handleUpdateCharges}
            disabled={!newCharges || parseInt(newCharges) < 1 || parseInt(newCharges) > MAX_WAND_CHARGES}
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Consumables;