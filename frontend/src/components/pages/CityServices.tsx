import React, { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  FormControl,
  Grid,
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
import LocationCityIcon from '@mui/icons-material/LocationCity';
import api from '../../utils/api';
import { fetchActiveUser } from '../../utils/utils';

interface City {
  id: number;
  name: string;
  size: string;
  base_value: number;
  purchase_limit: number;
  max_spell_level: number;
  population?: number;
  region?: string;
  alignment?: string;
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
  plus?: number;
}

interface Spell {
  id: number;
  name: string;
  spelllevel: number;
  school?: string;
  class?: any;
}

interface ItemSearchResult {
  found: boolean;
  roll_result: number;
  availability: {
    threshold: number;
    percentage: number;
    description: string;
  };
  item_value: number;
  item_name: string;
  city: City;
}

interface SpellcastingResult {
  available: boolean;
  cost?: number;
  formula?: string;
  spell_name: string;
  spell_level: number;
  caster_level: number;
  city: City;
  message?: string;
}

interface User {
  id: number;
  activeCharacterId?: number;
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

const SETTLEMENT_SIZES = [
  'Village',
  'Small Town',
  'Large Town',
  'Small City',
  'Large City',
  'Metropolis',
];

const CityServices: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [activeUser, setActiveUser] = useState<User | null>(null);

  // Item Availability States
  const [cities, setCities] = useState<City[]>([]);
  const [items, setItems] = useState<Item[]>([]);
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
  const [purchaseSpell, setPurchaseSpell] = useState(false);


  // Messages
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchActiveUserDetails();
    fetchCities();
    fetchItems();
    fetchMods();
  }, []);

  const fetchActiveUserDetails = async () => {
    try {
      const user = await fetchActiveUser();
      setActiveUser(user);
    } catch (err) {
      console.error('Failed to fetch active user:', err);
    }
  };

  const fetchCities = async () => {
    try {
      const response: any = await api.get('/cities');
      setCities(response.data || response);
    } catch (err) {
      console.error('Failed to fetch cities:', err);
    }
  };

  const fetchItems = async () => {
    try {
      const response: any = await api.get('/items');
      setItems(response.data?.items || response.items || []);
    } catch (err) {
      console.error('Failed to fetch items:', err);
    }
  };

  const fetchMods = async () => {
    try {
      const response: any = await api.get('/items/mods');
      setMods(response.data || response || []);
    } catch (err) {
      console.error('Failed to fetch mods:', err);
    }
  };

  const searchSpells = async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) {
      setSpells([]);
      return;
    }

    try {
      const response: any = await api.get('/spellcasting/spells', {
        params: { search: searchTerm },
      });
      setSpells(response.data || response);
    } catch (err) {
      console.error('Failed to search spells:', err);
    }
  };

  // Calculate minimum caster level for a spell
  const getMinCasterLevel = (spellLevel: number): number => {
    if (spellLevel <= 1) return 1;
    return spellLevel * 2 - 1;
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setError('');
    setSuccess('');
  };

  const handleItemAvailabilityCheck = async () => {
    setError('');
    setSuccess('');
    setItemSearchResult(null);

    if (!cityName.trim()) {
      setError('Please enter a city name');
      return;
    }

    if (!selectedItem) {
      setError('Please select an item');
      return;
    }

    setItemSearchLoading(true);

    try {
      const response: any = await api.post('/item-search/check', {
        item_id: selectedItem.id,
        mod_ids: selectedMods.map((m) => m.id),
        city_name: cityName.trim(),
        city_size: citySize,
        character_id: activeUser?.activeCharacterId,
      });

      const data = response.data || response;
      setItemSearchResult(data);
      setSelectedCity(data.city);

      if (data.found) {
        setSuccess(`Success! ${data.item_name} was found in ${data.city.name}!`);
      } else {
        setError(`${data.item_name} was not found in ${data.city.name}. Try again in 1 week.`);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to check item availability');
    } finally {
      setItemSearchLoading(false);
    }
  };

  const handleSpellcastingCheck = async (purchase = false) => {
    setError('');
    setSuccess('');
    setSpellcastingResult(null);

    if (!cityName.trim()) {
      setError('Please enter a city name');
      return;
    }

    if (!selectedSpell) {
      setError('Please select a spell');
      return;
    }

    if (casterLevel < 1) {
      setError('Caster level must be at least 1');
      return;
    }

    setSpellcastingLoading(true);
    setPurchaseSpell(purchase);

    try {
      const response: any = await api.post('/spellcasting/check', {
        spell_id: selectedSpell.id,
        spell_name: selectedSpell.name,
        spell_level: selectedSpell.spelllevel,
        caster_level: casterLevel,
        city_name: cityName.trim(),
        city_size: citySize,
        character_id: activeUser?.activeCharacterId,
        purchase: purchase,
      });

      const data = response.data || response;
      setSpellcastingResult(data);
      setSelectedCity(data.city);

      if (data.available) {
        if (purchase) {
          setSuccess(
            `Purchased ${data.spell_name} (CL ${data.caster_level}) in ${data.city.name} for ${data.cost} gp`
          );
        } else {
          setSuccess(`${data.spell_name} is available for ${data.cost} gp`);
        }
      } else {
        setError(data.message || 'Spell not available');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to check spellcasting service');
    } finally {
      setSpellcastingLoading(false);
      setPurchaseSpell(false);
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
      <Paper sx={{ p: 3, mb: 3 }}>
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
              onInputChange={(event, newValue) => {
                setCityName(newValue);
              }}
              onChange={(event, newValue) => {
                if (newValue && typeof newValue !== 'string') {
                  setSelectedCity(newValue);
                  setCityName(newValue.name);
                  setCitySize(newValue.size);
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
              <Grid size={{xs: 6, md: 3}}>
                <Typography variant="caption" color="text.secondary">
                  Base Value
                </Typography>
                <Typography variant="body1">{selectedCity.base_value.toLocaleString()} gp</Typography>
              </Grid>
              <Grid size={{xs: 6, md: 3}}>
                <Typography variant="caption" color="text.secondary">
                  Purchase Limit
                </Typography>
                <Typography variant="body1">{selectedCity.purchase_limit.toLocaleString()} gp</Typography>
              </Grid>
              <Grid size={{xs: 6, md: 3}}>
                <Typography variant="caption" color="text.secondary">
                  Max Spell Level
                </Typography>
                <Typography variant="body1">{selectedCity.max_spell_level}</Typography>
              </Grid>
              <Grid size={{xs: 6, md: 3}}>
                <Typography variant="caption" color="text.secondary">
                  Population
                </Typography>
                <Typography variant="body1">
                  {selectedCity.population?.toLocaleString() || 'Unknown'}
                </Typography>
              </Grid>
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
                getOptionLabel={(option) => `${option.name} (${option.value} gp)`}
                value={selectedItem}
                onChange={(event, newValue) => setSelectedItem(newValue)}
                renderInput={(params) => (
                  <TextField {...params} label="Item" required helperText="Select the base item" />
                )}
              />
            </Grid>
            <Grid size={{xs: 12, md: 4}}>
              <Autocomplete
                multiple
                options={mods}
                getOptionLabel={(option) => option.name}
                value={selectedMods}
                onChange={(event, newValue) => setSelectedMods(newValue)}
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
                    <TableRow>
                      <TableCell>
                        <strong>Item:</strong>
                      </TableCell>
                      <TableCell>{itemSearchResult.item_name}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>Value:</strong>
                      </TableCell>
                      <TableCell>{itemSearchResult.item_value.toLocaleString()} gp</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>City:</strong>
                      </TableCell>
                      <TableCell>
                        {itemSearchResult.city.name} ({itemSearchResult.city.size})
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>Availability:</strong>
                      </TableCell>
                      <TableCell>
                        {itemSearchResult.availability.percentage}% ({itemSearchResult.availability.description})
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>Roll:</strong>
                      </TableCell>
                      <TableCell>
                        {itemSearchResult.roll_result} / {itemSearchResult.availability.threshold}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>Result:</strong>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={itemSearchResult.found ? 'FOUND' : 'NOT FOUND'}
                          color={itemSearchResult.found ? 'success' : 'error'}
                        />
                      </TableCell>
                    </TableRow>
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
                    const minCL = getMinCasterLevel(newValue.spelllevel);
                    setCasterLevel(minCL);
                  }
                }}
                onInputChange={(event, value) => {
                  searchSpells(value);
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
                inputProps={{ min: 1, max: 20 }}
                helperText="Required caster level"
              />
            </Grid>
            <Grid size={{xs: 12, md: 6}}>
              <Button
                variant="outlined"
                color="primary"
                fullWidth
                onClick={() => handleSpellcastingCheck(false)}
                disabled={spellcastingLoading}
                startIcon={<SearchIcon />}
              >
                Check Availability & Cost
              </Button>
            </Grid>
            <Grid size={{xs: 12, md: 6}}>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={() => handleSpellcastingCheck(true)}
                disabled={spellcastingLoading || purchaseSpell}
                startIcon={<AutoAwesomeIcon />}
              >
                {purchaseSpell ? 'Purchasing...' : 'Purchase Service'}
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
                    <TableRow>
                      <TableCell>
                        <strong>Spell:</strong>
                      </TableCell>
                      <TableCell>
                        {spellcastingResult.spell_name} (Level {spellcastingResult.spell_level})
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>Caster Level:</strong>
                      </TableCell>
                      <TableCell>{spellcastingResult.caster_level}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>City:</strong>
                      </TableCell>
                      <TableCell>
                        {spellcastingResult.city.name} ({spellcastingResult.city.size})
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>Max Spell Level:</strong>
                      </TableCell>
                      <TableCell>{spellcastingResult.city.max_spell_level}</TableCell>
                    </TableRow>
                    {spellcastingResult.available ? (
                      <>
                        <TableRow>
                          <TableCell>
                            <strong>Cost:</strong>
                          </TableCell>
                          <TableCell>
                            <Typography variant="h6" color="primary">
                              {spellcastingResult.cost} gp
                            </Typography>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>
                            <strong>Formula:</strong>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {spellcastingResult.formula}
                            </Typography>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>
                            <strong>Status:</strong>
                          </TableCell>
                          <TableCell>
                            <Chip label="AVAILABLE" color="success" />
                          </TableCell>
                        </TableRow>
                      </>
                    ) : (
                      <TableRow>
                        <TableCell>
                          <strong>Status:</strong>
                        </TableCell>
                        <TableCell>
                          <Chip label="NOT AVAILABLE" color="error" />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}
      </TabPanel>

      {/* Settlement Availability Reference Table */}
      <Paper sx={{ p: 3, mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          Settlement Quick Reference
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Based on Pathfinder 1st Edition settlement rules
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <strong>Settlement</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>Base Value</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>Purchase Limit</strong>
                </TableCell>
                <TableCell align="center">
                  <strong>Max Spell Level</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>Typical Population</strong>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>Village</TableCell>
                <TableCell align="right">500 gp</TableCell>
                <TableCell align="right">2,500 gp</TableCell>
                <TableCell align="center">1st</TableCell>
                <TableCell align="right">20-200</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Small Town</TableCell>
                <TableCell align="right">1,000 gp</TableCell>
                <TableCell align="right">5,000 gp</TableCell>
                <TableCell align="center">2nd</TableCell>
                <TableCell align="right">201-2,000</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Large Town</TableCell>
                <TableCell align="right">2,000 gp</TableCell>
                <TableCell align="right">10,000 gp</TableCell>
                <TableCell align="center">3rd-4th</TableCell>
                <TableCell align="right">2,001-5,000</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Small City</TableCell>
                <TableCell align="right">4,000 gp</TableCell>
                <TableCell align="right">25,000 gp</TableCell>
                <TableCell align="center">4th-5th</TableCell>
                <TableCell align="right">5,001-10,000</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Large City</TableCell>
                <TableCell align="right">12,800 gp</TableCell>
                <TableCell align="right">75,000 gp</TableCell>
                <TableCell align="center">6th-7th</TableCell>
                <TableCell align="right">10,001-25,000</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Metropolis</TableCell>
                <TableCell align="right">16,000 gp</TableCell>
                <TableCell align="right">100,000 gp</TableCell>
                <TableCell align="center">8th-9th</TableCell>
                <TableCell align="right">25,001+</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Container>
  );
};

export default CityServices;
