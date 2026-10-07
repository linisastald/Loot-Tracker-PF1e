import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Collapse,
  Container,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  SelectChangeEvent,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { availabilityItemLabel } from '../../utils/availabilityPricing';
import lootService from '../../services/lootService';
import { useActiveCharacterId } from '../../contexts/CampaignContext';

interface City {
  id: number;
  name: string;
  size: string;
  base_value: number;
  purchase_limit: number;
  max_spell_level: number;
  population?: number;
}

interface Item {
  id: number;
  name: string;
  value: number;
  type: string;
}

interface Mod {
  id: number;
  name: string;
}

interface Spell {
  id: number;
  name: string;
  spelllevel: number;
}

interface ItemSearchResult {
  found: boolean;
  too_expensive?: boolean;
  message?: string;
  roll_result: number;
  availability: {
    threshold: number;
    percentage: number;
    description: string;
    base_percentage?: number;
    caster_level_penalty?: number;
  };
  item_value: number;
  item_name: string;
  item_caster_level?: number;
  settlement_caster_level?: number;
  city: City;
}

interface SpellcastingResult {
  available: boolean;
  cost?: number;
  formula?: string;
  spell_name: string;
  spell_level: number;
  caster_level: number;
  settlement_caster_level?: number;
  caster_level_check?: {
    threshold: number;
    roll?: number;
  };
  city: City;
  message?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
};

interface Settlement {
  size: string;
  baseValue: string;
  purchaseLimit: string;
  /** Highest spell level of services in this app (house rule, see the reference note). */
  maxSpell: string;
  maxSpellNote?: string;
  /** House-rule effective caster level (mirrors the backend City model). */
  casterLevel: number;
  population: string;
}

// One table drives the size dropdown, the effective caster level lookup and the
// quick reference. Base value, purchase limit and population follow the
// GameMastery Guide; maxSpell and casterLevel are this app's house rules.
const SETTLEMENTS: Settlement[] = [
  { size: 'Thorp', baseValue: '50', purchaseLimit: '500', maxSpell: 'None', casterLevel: 1, population: '1-20' },
  { size: 'Hamlet', baseValue: '200', purchaseLimit: '1,000', maxSpell: 'None', casterLevel: 2, population: '21-60' },
  {
    size: 'Village', baseValue: '500', purchaseLimit: '2,500', maxSpell: 'None', maxSpellNote: '(1st: 5% chance)',
    casterLevel: 3, population: '61-200',
  },
  { size: 'Small Town', baseValue: '1,000', purchaseLimit: '5,000', maxSpell: '1st', casterLevel: 5, population: '201-2,000' },
  { size: 'Large Town', baseValue: '2,000', purchaseLimit: '10,000', maxSpell: '2nd', casterLevel: 7, population: '2,001-5,000' },
  { size: 'Small City', baseValue: '4,000', purchaseLimit: '25,000', maxSpell: '3rd-4th', casterLevel: 9, population: '5,001-10,000' },
  { size: 'Large City', baseValue: '8,000', purchaseLimit: '50,000', maxSpell: '5th-6th', casterLevel: 12, population: '10,001-25,000' },
  {
    size: 'Metropolis', baseValue: '16,000', purchaseLimit: '100,000', maxSpell: '7th-8th', maxSpellNote: '(9th: 1% chance)',
    casterLevel: 15, population: '25,001+',
  },
];

const SETTLEMENT_SIZES = SETTLEMENTS.map((s) => s.size);

// Gates availability of high-caster-level items and high-CL spellcasting services.
const SETTLEMENT_CASTER_LEVELS: Record<string, number> = Object.fromEntries(
  SETTLEMENTS.map((s) => [s.size, s.casterLevel])
);

const SEARCH_DEBOUNCE_MS = 250;

// Minimum caster level for a spell of the given level (2 x level - 1, at least 1).
const getMinCasterLevel = (spellLevel: number): number => (spellLevel <= 1 ? 1 : spellLevel * 2 - 1);

/** Unwrap an api response that may or may not still carry the axios envelope. */
const bodyOf = <T,>(response: unknown): T => {
  const wrapped = response as { data?: T } | null | undefined;
  return (wrapped?.data ?? response) as T;
};

const modsFrom = (response: unknown): Mod[] => {
  const body = bodyOf<{ mods?: unknown } | unknown[]>(response);
  const list = Array.isArray(body) ? body : (body as { mods?: unknown } | undefined)?.mods;
  return Array.isArray(list) ? (list as Mod[]) : [];
};

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <TableRow>
    <TableCell>
      <strong>{label}:</strong>
    </TableCell>
    <TableCell>{children}</TableCell>
  </TableRow>
);

const CityStat: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Grid size={{ xs: 6, md: 3 }}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body1">{children}</Typography>
  </Grid>
);

const CityServices: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const activeCharacterId = useActiveCharacterId();

  // Item Availability States
  const [cities, setCities] = useState<City[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [itemInputValue, setItemInputValue] = useState('');
  const [itemsLoading, setItemsLoading] = useState(false);
  const [mods, setMods] = useState<Mod[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [cityName, setCityName] = useState('');
  const [citySize, setCitySize] = useState('Small City');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedMods, setSelectedMods] = useState<Mod[]>([]);
  const [itemSearchResult, setItemSearchResult] = useState<ItemSearchResult | null>(null);
  const [itemSearchLoading, setItemSearchLoading] = useState(false);

  // Spellcasting States
  const [spells, setSpells] = useState<Spell[]>([]);
  const [selectedSpell, setSelectedSpell] = useState<Spell | null>(null);
  const [casterLevel, setCasterLevel] = useState<number>(1);
  const [spellcastingResult, setSpellcastingResult] = useState<SpellcastingResult | null>(null);
  const [spellcastingLoading, setSpellcastingLoading] = useState(false);

  // Messages
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Debounce timers and request counters so a slow earlier search can never
  // overwrite the results of a newer one.
  const itemTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRequest = useRef(0);
  const spellRequest = useRef(0);

  const fetchCities = useCallback(async () => {
    try {
      const response = await api.get('/cities');
      setCities(bodyOf<City[]>(response));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load cities'));
    }
  }, []);

  const fetchMods = useCallback(async () => {
    try {
      setMods(modsFrom(await lootService.getMods()));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load item modifications'));
    }
  }, []);

  useEffect(() => {
    fetchCities();
    fetchMods();
    return () => {
      if (itemTimer.current) clearTimeout(itemTimer.current);
      if (spellTimer.current) clearTimeout(spellTimer.current);
    };
  }, [fetchCities, fetchMods]);

  const runItemSearch = async (searchText: string) => {
    const request = ++itemRequest.current;
    if (!searchText || searchText.length < 2) {
      setItems([]);
      setItemsLoading(false);
      return;
    }

    setItemsLoading(true);
    try {
      const response = await lootService.suggestItems({ query: searchText });
      if (request !== itemRequest.current) return;
      // API returns { suggestions: [...], count: number }
      setItems(response.data.suggestions || []);
    } catch (err) {
      if (request !== itemRequest.current) return;
      setItems([]);
      setError(getErrorMessage(err, 'Failed to search items'));
    } finally {
      if (request === itemRequest.current) setItemsLoading(false);
    }
  };

  const runSpellSearch = async (searchTerm: string) => {
    const request = ++spellRequest.current;
    if (!searchTerm || searchTerm.length < 2) {
      setSpells([]);
      return;
    }

    try {
      const response = await api.get('/spellcasting/spells', {
        params: { search: searchTerm },
      });
      if (request !== spellRequest.current) return;
      setSpells(bodyOf<Spell[]>(response));
    } catch (err) {
      if (request !== spellRequest.current) return;
      setError(getErrorMessage(err, 'Failed to search spells'));
    }
  };

  const scheduleSearch = (timer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>, run: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, SEARCH_DEBOUNCE_MS);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setError('');
    setSuccess('');
  };

  /**
   * Shared start of both checks: clears messages and the previous result, then
   * validates the city name. Returns false (with the error set) when the check
   * must not run.
   */
  const beginCheck = (clearResult: () => void): boolean => {
    setError('');
    setSuccess('');
    clearResult();

    if (!cityName.trim()) {
      setError('Please enter a city name');
      return false;
    }
    return true;
  };

  /** POST a city check; the response always carries the resolved city. */
  const postCityCheck = async <T extends { city: City }>(url: string, body: Record<string, unknown>): Promise<T> => {
    const response = await api.post(url, { ...body, city_name: cityName.trim(), city_size: citySize });
    const data = bodyOf<T>(response);
    setSelectedCity(data.city);
    return data;
  };

  const handleItemAvailabilityCheck = async () => {
    if (!beginCheck(() => setItemSearchResult(null))) return;

    if (!selectedItem) {
      setError('Please select an item');
      return;
    }

    setItemSearchLoading(true);

    try {
      const data = await postCityCheck<ItemSearchResult>('/item-search/check', {
        item_id: selectedItem.id,
        mod_ids: selectedMods.map((m) => m.id),
        character_id: activeCharacterId ?? undefined,
      });
      setItemSearchResult(data);

      if (data.found) {
        setSuccess(`Success! ${data.item_name} was found in ${data.city.name}!`);
      } else if (data.too_expensive) {
        // Item can never be found in this settlement
        setError(data.message || `${data.item_name} is too expensive to be found in ${data.city.name}.`);
      } else {
        // Item wasn't found this time, but could be found with another roll
        setError(`${data.item_name} was not found in ${data.city.name}. Try again in 1 week.`);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to check item availability'));
    } finally {
      setItemSearchLoading(false);
    }
  };

  const handleSpellcastingCheck = async () => {
    if (!beginCheck(() => setSpellcastingResult(null))) return;

    if (!selectedSpell) {
      setError('Please select a spell');
      return;
    }

    if (casterLevel < 1) {
      setError('Caster level must be at least 1');
      return;
    }

    setSpellcastingLoading(true);

    try {
      // Lookup only: nothing is purchased or recorded from this page.
      const data = await postCityCheck<SpellcastingResult>('/spellcasting/check', {
        spell_id: selectedSpell.id,
        spell_name: selectedSpell.name,
        spell_level: selectedSpell.spelllevel,
        caster_level: casterLevel,
      });
      setSpellcastingResult(data);

      if (data.available) {
        // Show special message for level 9 spells if provided by backend
        setSuccess(data.message || `${data.spell_name} is available for ${data.cost} gp`);
      } else {
        setError(data.message || 'Spell not available');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to check spellcasting service'));
    } finally {
      setSpellcastingLoading(false);
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ mb: 4, mt: 4 }}>
        <Typography variant="h4" gutterBottom>
          <LocationCityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          City Services
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Check item availability and spellcasting services in settlements
        </Typography>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab icon={<SearchIcon />} label="Item Availability" />
          <Tab icon={<AutoAwesomeIcon />} label="Spellcasting Services" />
        </Tabs>
      </Paper>
      {/* City Selection - Common to both tabs */}
      <Paper sx={{ p: 3, mb: 3 }} data-testid="settlement-information">
        <Typography variant="h6" gutterBottom>
          Settlement Information
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{xs: 12, md: 6}}>
            <Autocomplete
              freeSolo
              options={cities}
              getOptionLabel={(option) =>
                typeof option === 'string' ? option : `${option.name} (${option.size})`
              }
              value={selectedCity}
              // The text box shows exactly what was typed or picked: after a
              // check the selected city changes and MUI would otherwise reset
              // the text to "Name (Size)".
              inputValue={cityName}
              onInputChange={(event, newValue, reason) => {
                if (reason === 'input' || reason === 'clear') {
                  setCityName(newValue);
                }
                // Clear selected city when user types manually (not when selecting from list)
                if (reason === 'input') {
                  setSelectedCity(null);
                }
              }}
              onChange={(event, newValue) => {
                if (newValue && typeof newValue !== 'string') {
                  setSelectedCity(newValue);
                  setCityName(newValue.name);
                  setCitySize(newValue.size);
                } else if (!newValue) {
                  setSelectedCity(null);
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="City Name"
                  required
                  helperText="Start typing to search existing cities, or enter a new city name"
                />
              )}
            />
          </Grid>
          <Grid size={{xs: 12, md: 4}}>
            <FormControl fullWidth required>
              <InputLabel>Settlement Size</InputLabel>
              <Select
                value={citySize}
                label="Settlement Size"
                disabled={selectedCity !== null}
                onChange={(e: SelectChangeEvent) => setCitySize(e.target.value)}
              >
                {SETTLEMENT_SIZES.map((size) => (
                  <MenuItem key={size} value={size}>
                    {size}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {selectedCity && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            <Grid container spacing={2}>
              <CityStat label="Base Value">{selectedCity.base_value.toLocaleString()} gp</CityStat>
              <CityStat label="Purchase Limit">{selectedCity.purchase_limit.toLocaleString()} gp</CityStat>
              <CityStat label="Max Spell Level">{selectedCity.max_spell_level}</CityStat>
              <CityStat label="Effective Caster Level">{SETTLEMENT_CASTER_LEVELS[selectedCity.size] ?? '—'}</CityStat>
              <CityStat label="Population">{selectedCity.population?.toLocaleString() || 'Unknown'}</CityStat>
            </Grid>
          </Box>
        )}
      </Paper>
      {/* Item Availability Tab */}
      <TabPanel value={tabValue} index={0}>
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Item Search
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{xs: 12, md: 8}}>
              <Autocomplete
                options={items}
                getOptionLabel={(option) => {
                  if (typeof option === 'string') return option;
                  return availabilityItemLabel(option);
                }}
                value={selectedItem}
                inputValue={itemInputValue}
                onInputChange={(_, newInputValue, reason) => {
                  setItemInputValue(newInputValue);
                  // Search only on typing/clearing, not when MUI resets the text
                  // to the label of the option just chosen.
                  if (reason === 'input' || reason === 'clear') {
                    scheduleSearch(itemTimer, () => runItemSearch(newInputValue));
                  }
                }}
                onChange={(_, newValue) => {
                  if (newValue && typeof newValue === 'object') {
                    setSelectedItem(newValue);
                  } else {
                    setSelectedItem(null);
                  }
                }}
                loading={itemsLoading}
                filterOptions={(x) => x} // Disable built-in filtering - API does it
                noOptionsText="Type at least 2 characters to search items"
                renderInput={(params) => (
                  <TextField {...params} label="Item" required helperText="Start typing to search for items" />
                )}
              />
            </Grid>
            <Grid size={{xs: 12, md: 4}}>
              <Autocomplete
                multiple
                options={mods}
                getOptionLabel={(option) => option.name}
                value={selectedMods}
                onChange={(_, newValue) => setSelectedMods(newValue)}
                renderInput={(params) => (
                  <TextField {...params} label="Modifications" helperText="Optional enhancements" />
                )}
              />
            </Grid>
            <Grid size={{xs: 12}}>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={handleItemAvailabilityCheck}
                disabled={itemSearchLoading}
                startIcon={<SearchIcon />}
              >
                {itemSearchLoading ? 'Searching...' : 'Check Availability'}
              </Button>
            </Grid>
          </Grid>
        </Paper>

        {itemSearchResult && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Search Results
              </Typography>
              <TableContainer>
                <Table>
                  <TableBody>
                    <DetailRow label="Item">{itemSearchResult.item_name}</DetailRow>
                    <DetailRow label="Value">{itemSearchResult.item_value.toLocaleString()} gp</DetailRow>
                    <DetailRow label="City">
                      {itemSearchResult.city.name} ({itemSearchResult.city.size})
                    </DetailRow>
                    {(itemSearchResult.item_caster_level ?? 0) > 0 && (
                      <DetailRow label="Caster Level">
                        Item CL {itemSearchResult.item_caster_level} vs. settlement CL{' '}
                        {itemSearchResult.settlement_caster_level}
                        {(itemSearchResult.availability.caster_level_penalty ?? 0) > 0 && (
                          <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                            −{itemSearchResult.availability.caster_level_penalty}% caster-level penalty
                            {' '}(base {itemSearchResult.availability.base_percentage}%)
                          </Typography>
                        )}
                      </DetailRow>
                    )}
                    <DetailRow label="Availability">
                      {itemSearchResult.availability.percentage}% ({itemSearchResult.availability.description})
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        House rule. The GameMastery Guide gives a flat 75% for items at or below the
                        settlement's base value, nothing above it, and no caster-level penalty.
                      </Typography>
                    </DetailRow>
                    <DetailRow label="Roll">
                      {itemSearchResult.roll_result} / {itemSearchResult.availability.threshold}
                    </DetailRow>
                    <DetailRow label="Result">
                      <Chip
                        label={itemSearchResult.found ? 'FOUND' : 'NOT FOUND'}
                        color={itemSearchResult.found ? 'success' : 'error'}
                      />
                    </DetailRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}
      </TabPanel>
      {/* Spellcasting Services Tab */}
      <TabPanel value={tabValue} index={1}>
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Spellcasting Service Request
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{xs: 12, md: 8}}>
              <Autocomplete
                options={spells}
                getOptionLabel={(option) => `${option.name} (Level ${option.spelllevel})`}
                value={selectedSpell}
                onChange={(event, newValue) => {
                  setSelectedSpell(newValue);
                  // Set default caster level to minimum for the spell
                  if (newValue) {
                    setCasterLevel(getMinCasterLevel(newValue.spelllevel));
                  }
                }}
                onInputChange={(event, value, reason) => {
                  if (reason === 'input' || reason === 'clear') {
                    scheduleSearch(spellTimer, () => runSpellSearch(value));
                  }
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Spell"
                    required
                    helperText="Start typing to search for spells"
                  />
                )}
              />
            </Grid>
            <Grid size={{xs: 12, md: 4}}>
              <TextField
                fullWidth
                label="Caster Level"
                type="number"
                value={casterLevel}
                onChange={(e) => setCasterLevel(parseInt(e.target.value) || 1)}
                required
                slotProps={{ htmlInput: { min: 1, max: 20 } }}
                helperText={
                  selectedSpell
                    ? `Min CL ${getMinCasterLevel(selectedSpell.spelllevel)} always available; higher CLs roll a find chance`
                    : 'Required caster level'
                }
              />
            </Grid>
            <Grid size={{xs: 12}}>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={handleSpellcastingCheck}
                disabled={spellcastingLoading}
                startIcon={<SearchIcon />}
              >
                {spellcastingLoading ? 'Checking...' : 'Check Availability & Cost'}
              </Button>
            </Grid>
          </Grid>
        </Paper>

        {spellcastingResult && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Spellcasting Service Details
              </Typography>
              <TableContainer>
                <Table>
                  <TableBody>
                    <DetailRow label="Spell">
                      {spellcastingResult.spell_name} (Level {spellcastingResult.spell_level})
                    </DetailRow>
                    <DetailRow label="Caster Level">{spellcastingResult.caster_level}</DetailRow>
                    <DetailRow label="City">
                      {spellcastingResult.city.name} ({spellcastingResult.city.size})
                    </DetailRow>
                    <DetailRow label="Max Spell Level">{spellcastingResult.city.max_spell_level}</DetailRow>
                    {spellcastingResult.settlement_caster_level !== undefined && (
                      <DetailRow label="Settlement Caster Level">
                        {spellcastingResult.settlement_caster_level}
                        {spellcastingResult.caster_level_check?.roll !== undefined && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Higher-CL find roll: {spellcastingResult.caster_level_check.roll}/100
                            {' '}(needed {spellcastingResult.caster_level_check.threshold} or less)
                          </Typography>
                        )}
                      </DetailRow>
                    )}
                    {spellcastingResult.available && (
                      <>
                        <DetailRow label="Cost">
                          <Typography variant="h6" color="primary">
                            {spellcastingResult.cost} gp
                          </Typography>
                        </DetailRow>
                        <DetailRow label="Formula">
                          <Typography variant="caption" color="text.secondary">
                            {spellcastingResult.formula}
                          </Typography>
                          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
                            Note: Material costs not included
                          </Typography>
                        </DetailRow>
                      </>
                    )}
                    <DetailRow label="Status">
                      <Chip
                        label={spellcastingResult.available ? 'AVAILABLE' : 'NOT AVAILABLE'}
                        color={spellcastingResult.available ? 'success' : 'error'}
                      />
                    </DetailRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}
      </TabPanel>
      {/* Settlement Availability Reference Table */}
      <Paper sx={{ p: { xs: 1.5, md: 3 }, mt: 4 }}>
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setReferenceOpen(!referenceOpen)}
        >
          <Box>
            <Typography variant="h6" gutterBottom={referenceOpen}>
              Settlement Quick Reference
            </Typography>
            {referenceOpen && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Base value, purchase limit and population follow the Pathfinder 1st Edition GameMastery Guide.
                Max spell level and effective caster level are this app&apos;s house rules (the GameMastery Guide
                lists 1st-level spellcasting for a thorp up to 8th for a metropolis).
              </Typography>
            )}
          </Box>
          <IconButton size="small">
            {referenceOpen ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
          </IconButton>
        </Box>
        <Collapse in={referenceOpen}>
        <TableContainer sx={{ WebkitOverflowScrolling: 'touch' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Settlement</strong></TableCell>
                <TableCell align="right"><strong>Base Value</strong></TableCell>
                <TableCell align="right"><strong>Purchase Limit</strong></TableCell>
                <TableCell align="center"><strong>Max Spell Level (house rule)</strong></TableCell>
                <TableCell align="center"><strong>Eff. Caster Level (house rule)</strong></TableCell>
                <TableCell align="right"><strong>Typical Population</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {SETTLEMENTS.map((s) => (
                <TableRow key={s.size}>
                  <TableCell>{s.size}</TableCell>
                  <TableCell align="right">{s.baseValue} gp</TableCell>
                  <TableCell align="right">{s.purchaseLimit} gp</TableCell>
                  <TableCell align="center">
                    {s.maxSpell}
                    {s.maxSpellNote && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {s.maxSpellNote}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">{s.casterLevel}</TableCell>
                  <TableCell align="right">{s.population}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        </Collapse>
      </Paper>
    </Container>
  );
};

export default CityServices;
