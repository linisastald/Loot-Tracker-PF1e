import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Container, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Box, Alert,
  Tabs, Tab, TablePagination, FormControl, InputLabel, Select, MenuItem, Chip,
  Autocomplete
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import Grid from '@mui/material/Grid';
import TableSkeleton from '../common/TableSkeleton';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Person as PersonIcon, DirectionsBoat as ShipIcon, Home as OutpostIcon,
  Warning as WarningIcon, MoveUp as MoveIcon,
  Group as RecruitIcon
} from '@mui/icons-material';
import crewService from '../../services/crewService';
import shipService from '../../services/shipService';
import outpostService from '../../services/outpostService';
import { STANDARD_RACES, generateRandomName, generateRandomRace, generateRandomAge } from '../../data/raceData';
import { getTodayInInputFormat, golarionToInputFormat, inputFormatToGolarion } from '../../utils/golarionDate';
import { getErrorMessage } from '../../utils/apiErrors';
import { useIsMobile } from '../../hooks/useIsMobile';

interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
}

interface CrewMember {
  id: number;
  name: string;
  race: string;
  age?: number;
  description?: string;
  location_id: number;
  location_type: 'ship' | 'outpost';
  ship_position?: string;
  hire_date?: any;
  death_date?: string;
  departure_date?: string;
  last_known_location?: string;
  location_name?: string;
}

interface Ship {
  id: number;
  name: string;
  status: string;
  type: 'ship';
}

interface Outpost {
  id: number;
  name: string;
  type: 'outpost';
}

type Location = Ship | Outpost;

// Ships and outposts live in separate tables with independent id sequences, so
// an id alone is ambiguous. Locations are identified inside this component by a
// composite key such as "ship:1" / "outpost:1".
const locationKey = (type: 'ship' | 'outpost', id: number): string => `${type}:${id}`;
const keyOf = (loc: Location): string => locationKey(loc.type, loc.id);
const locationLabel = (loc: Location): string => `${loc.name} (${loc.type === 'ship' ? 'Ship' : 'Outpost'})`;

interface EditingCrew {
  name: string;
  race: string;
  customRace: string;
  age: string;
  description: string;
  location_id: string;
  ship_position: string;
  hire_date: string;
}

interface MoveData {
  location_id: string;
  ship_position: string;
}

interface StatusData {
  type: 'dead' | 'departed';
  date: string;
  reason: string;
}

type SkillType = 'bluff' | 'diplomacy' | 'intimidate';

interface RecruitmentData {
  skillType: SkillType;
  rollResult: string;
  location_id: string;
}

const EMPTY_CREW: EditingCrew = {
  name: '',
  race: '',
  customRace: '',
  age: '',
  description: '',
  location_id: '',
  ship_position: '',
  hire_date: ''
};

const EMPTY_MOVE: MoveData = { location_id: '', ship_position: '' };

const SHIP_POSITIONS: string[] = [
  'Captain', 'First Mate', 'Quartermaster', 'Boatswain', 'Navigator',
  'Cook', 'Gunner', 'Rigger', 'Lookout', 'Crew'
];

// One entry per recruitment skill: the label used in messages, the description
// stamped on recruited crew, and the text of the dropdown item.
const RECRUIT_METHODS: Record<SkillType, { label: string; description: string; menuText: string }> = {
  bluff: { label: 'Bluff', description: 'Tricked into joining', menuText: 'Bluff (trick sailors aboard)' },
  diplomacy: { label: 'Diplomacy', description: 'Convinced to join', menuText: 'Diplomacy (convince to join)' },
  intimidate: { label: 'Intimidate', description: 'Press-ganged', menuText: 'Intimidate (press-gang)' }
};

const RECRUITMENT_DC = 20;

// Stored dates are DATE columns serialised as ISO strings. Show the calendar
// date part verbatim so a negative-UTC timezone cannot shift it by a day.
const formatStoredDate = (value?: string): string => {
  if (!value) return '';
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : value;
};

const TabPanel = React.memo(({ children, value, index, ...other }: TabPanelProps) => {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
});

interface LocationPickerProps {
  label: string;
  options: Location[];
  value: Location | undefined;
  onChange: (location: Location | null) => void;
  sx?: object;
}

const LocationPicker: React.FC<LocationPickerProps> = ({ label, options, value, onChange, sx }) => (
  <Autocomplete
    fullWidth
    options={options}
    getOptionLabel={locationLabel}
    isOptionEqualToValue={(option, selected) => keyOf(option) === keyOf(selected)}
    value={value || null}
    onChange={(_event, newValue: Location | null) => onChange(newValue)}
    renderInput={(params) => <TextField {...params} label={label} required />}
    sx={sx}
  />
);

interface ShipPositionSelectProps {
  value: string;
  onChange: (position: string) => void;
}

const ShipPositionSelect: React.FC<ShipPositionSelectProps> = ({ value, onChange }) => (
  <FormControl fullWidth>
    <InputLabel>Ship Position</InputLabel>
    <Select
      value={value}
      label="Ship Position"
      onChange={(e: SelectChangeEvent<string>) => onChange(e.target.value)}
    >
      {SHIP_POSITIONS.map((position) => (
        <MenuItem key={position} value={position}>{position}</MenuItem>
      ))}
    </Select>
  </FormControl>
);

const CrewManagement: React.FC = () => {
  const isMobile = useIsMobile();
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [deceasedCrew, setDeceasedCrew] = useState<CrewMember[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [outposts, setOutposts] = useState<Outpost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [tabValue, setTabValue] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);

  // Dialog states
  const [crewDialogOpen, setCrewDialogOpen] = useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState<boolean>(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState<boolean>(false);
  const [recruitmentDialogOpen, setRecruitmentDialogOpen] = useState<boolean>(false);
  const [selectedCrew, setSelectedCrew] = useState<CrewMember | null>(null);
  const [currentGolarionDate, setCurrentGolarionDate] = useState<string>('');

  const [editingCrew, setEditingCrew] = useState<EditingCrew>(EMPTY_CREW);
  const [moveData, setMoveData] = useState<MoveData>(EMPTY_MOVE);
  const [statusData, setStatusData] = useState<StatusData>({ type: 'dead', date: '', reason: '' });
  const [recruitmentData, setRecruitmentData] = useState<RecruitmentData>({
    skillType: 'diplomacy',
    rollResult: '',
    location_id: ''
  });

  // Every ship and outpost, as one selectable list
  const allLocations = useMemo((): Location[] => [
    ...ships.map((ship) => ({ ...ship, type: 'ship' as const })),
    ...outposts.map((outpost) => ({ ...outpost, type: 'outpost' as const }))
  ], [ships, outposts]);

  const anyDialogOpen = crewDialogOpen || deleteDialogOpen || moveDialogOpen
    || statusDialogOpen || recruitmentDialogOpen;

  // Memoized computed values for performance
  const paginatedCrew = useMemo((): CrewMember[] => {
    return crew.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [crew, page, rowsPerPage]);

  const availableLocationsForMove = useMemo((): Location[] => {
    if (!selectedCrew) return allLocations;
    const currentKey = locationKey(selectedCrew.location_type, selectedCrew.location_id);
    return allLocations.filter(loc => keyOf(loc) !== currentKey);
  }, [allLocations, selectedCrew]);

  const findLocation = useCallback((key: string): Location | undefined => {
    return allLocations.find(loc => keyOf(loc) === key);
  }, [allLocations]);

  // Keep the table on a page that exists after deletes, moves or a page-size change
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(crew.length / rowsPerPage) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [crew.length, rowsPerPage, page]);

  const fetchData = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const [crewResponse, shipsResponse, outpostsResponse, deceasedResponse] = await Promise.all([
        crewService.getAllCrew(),
        shipService.getAllShips(),
        outpostService.getAllOutposts(),
        crewService.getDeceasedCrew()
      ]);

      setCrew(crewResponse.data.crew);
      setShips(shipsResponse.data.ships);
      setOutposts(outpostsResponse.data.outposts);
      setDeceasedCrew(deceasedResponse.data.crew);

      // Get current Golarion date
      const todayDate = await getTodayInInputFormat();
      setCurrentGolarionDate(todayDate);

      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Run a mutation: clear stale alerts, call the service, report the outcome,
   * close the dialog and refresh. Failures show the server's message.
   */
  const runAction = async (
    action: () => Promise<unknown>,
    successMessage: string,
    failureMessage: string,
    closeDialog?: () => void
  ): Promise<void> => {
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(successMessage);
      closeDialog?.();
      fetchData();
    } catch (err) {
      setError(getErrorMessage(err, failureMessage));
    }
  };

  const handleCreateCrew = useCallback(() => {
    setError('');
    setEditingCrew({ ...EMPTY_CREW, hire_date: currentGolarionDate });
    setSelectedCrew(null);
    setCrewDialogOpen(true);
  }, [currentGolarionDate]);

  const handleEditCrew = useCallback((crewMember: CrewMember): void => {
    setError('');
    const isCustomRace = !STANDARD_RACES.includes(crewMember.race);
    setEditingCrew({
      name: crewMember.name,
      race: isCustomRace ? 'Other' : (crewMember.race || ''),
      customRace: isCustomRace ? crewMember.race : '',
      age: crewMember.age?.toString() || '',
      description: crewMember.description || '',
      location_id: locationKey(crewMember.location_type, crewMember.location_id),
      ship_position: crewMember.ship_position || '',
      hire_date: crewMember.hire_date ? golarionToInputFormat(
        crewMember.hire_date.year || new Date(crewMember.hire_date).getFullYear(),
        crewMember.hire_date.month || new Date(crewMember.hire_date).getMonth() + 1,
        crewMember.hire_date.day || new Date(crewMember.hire_date).getDate()
      ) : currentGolarionDate
    });
    setSelectedCrew(crewMember);
    setCrewDialogOpen(true);
  }, [currentGolarionDate]);

  const handleSaveCrew = async (): Promise<void> => {
    setError('');
    if (!editingCrew.name.trim()) {
      setError('Crew member name is required');
      return;
    }
    if (!editingCrew.location_id) {
      setError('Location is required');
      return;
    }

    // Determine location type from the selected location
    const selectedLocation = findLocation(editingCrew.location_id);
    if (!selectedLocation) {
      setError('Invalid location selected');
      return;
    }

    // Determine final race (custom or standard)
    const finalRace = editingCrew.race === 'Other' ? editingCrew.customRace : editingCrew.race;

    const crewData = {
      name: editingCrew.name,
      race: finalRace,
      age: editingCrew.age ? parseInt(editingCrew.age) : null,
      description: editingCrew.description,
      location_type: selectedLocation.type,
      location_id: selectedLocation.id,
      ship_position: selectedLocation.type === 'ship' ? editingCrew.ship_position : null,
      hire_date: inputFormatToGolarion(editingCrew.hire_date)
    };

    await runAction(
      () => (selectedCrew ? crewService.updateCrew(selectedCrew.id, crewData) : crewService.createCrew(crewData)),
      selectedCrew ? 'Crew member updated successfully' : 'Crew member created successfully',
      'Failed to save crew member',
      () => setCrewDialogOpen(false)
    );
  };

  const handleMoveCrew = async (): Promise<void> => {
    setError('');
    const selectedLocation = findLocation(moveData.location_id);
    if (!selectedLocation) {
      setError('Invalid location selected');
      return;
    }

    await runAction(
      () => crewService.moveCrewToLocation(
        selectedCrew!.id,
        selectedLocation.type,
        selectedLocation.id,
        selectedLocation.type === 'ship' ? moveData.ship_position : null
      ),
      'Crew member moved successfully',
      'Failed to move crew member',
      () => setMoveDialogOpen(false)
    );
  };

  const handleRecruitment = async (): Promise<void> => {
    setError('');
    setSuccess('');
    if (!recruitmentData.location_id) {
      setError('Location is required for recruitment');
      return;
    }

    const rollResult = parseInt(recruitmentData.rollResult);
    if (isNaN(rollResult)) {
      setError('Please enter a valid roll result');
      return;
    }

    const selectedLocation = findLocation(recruitmentData.location_id);
    if (!selectedLocation) {
      setError('Invalid location selected');
      return;
    }

    const method = RECRUIT_METHODS[recruitmentData.skillType];

    if (rollResult < RECRUITMENT_DC) {
      setError(`Recruitment failed! Your ${method.label} check (${rollResult}) did not meet DC ${RECRUITMENT_DC}. No crew members were recruited. (Each attempt takes 1 full day)`);
      return;
    }

    // Success! Roll 1d4+2 for number of crew (3-6 crew members)
    const baseCrewRoll = Math.floor(Math.random() * 4) + 1; // 1d4
    const numberOfCrew = baseCrewRoll + 2; // +2 for final result of 3-6

    const hireDate = inputFormatToGolarion(currentGolarionDate);
    const description = `${method.description} via ${method.label} check`;

    // One request per recruit; remember how many landed so a mid-way failure is reportable
    let created = 0;
    try {
      for (let i = 0; i < numberOfCrew; i++) {
        const randomRace = generateRandomRace();
        await crewService.createCrew({
          name: generateRandomName(),
          race: randomRace,
          age: generateRandomAge(randomRace),
          description,
          location_type: selectedLocation.type,
          location_id: selectedLocation.id,
          ship_position: selectedLocation.type === 'ship' ? 'Crew' : null,
          hire_date: hireDate
        });
        created += 1;
      }
    } catch (err) {
      const failure = getErrorMessage(err, 'Failed to recruit crew members');
      if (created > 0) {
        // Some recruits already exist: show them, and say so, rather than inviting a duplicate retry
        setRecruitmentDialogOpen(false);
        await fetchData();
        setError(`Only ${created} of ${numberOfCrew} recruits were added before an error occurred: ${failure}`);
      } else {
        setError(failure);
      }
      return;
    }

    setSuccess(`Recruitment successful! Your ${method.label} check (${rollResult}) beat DC ${RECRUITMENT_DC}. You recruited ${numberOfCrew} crew members (rolled ${baseCrewRoll}+2). Remember: this took 1 full day and crew expects plunder shares!`);
    setRecruitmentDialogOpen(false);
    fetchData();
  };

  const handleUpdateStatus = async (): Promise<void> => {
    // A blank date means "today" in the campaign calendar, not the real-world date
    const date = statusData.date || currentGolarionDate || undefined;
    const isDead = statusData.type === 'dead';
    await runAction(
      () => (isDead
        ? crewService.markCrewDead(selectedCrew!.id, date)
        : crewService.markCrewDeparted(selectedCrew!.id, date, statusData.reason)),
      isDead ? 'Crew member marked as deceased' : 'Crew member marked as departed',
      'Failed to update crew status',
      () => setStatusDialogOpen(false)
    );
  };

  const handleDeleteCrew = async (): Promise<void> => {
    await runAction(
      () => crewService.deleteCrew(selectedCrew!.id),
      'Crew member deleted successfully',
      'Failed to delete crew member',
      () => setDeleteDialogOpen(false)
    );
  };

  const getLocationName = (crewMember: CrewMember): string => {
    const location = findLocation(locationKey(crewMember.location_type, crewMember.location_id));
    if (location) return location.name;
    return crewMember.location_type === 'ship' ? 'Unknown Ship' : 'Unknown Outpost';
  };

  const openRecruitmentDialog = (): void => {
    setError('');
    const pcActiveShip = ships.find(ship => ship.status === 'PC Active');
    setRecruitmentData({
      skillType: 'diplomacy',
      rollResult: '',
      location_id: pcActiveShip ? locationKey('ship', pcActiveShip.id) : ''
    });
    setRecruitmentDialogOpen(true);
  };

  const dialogError = error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null;

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Paper sx={{ p: { xs: 1.5, md: 3 }, mb: 3 }}>
          <TableSkeleton rows={6} columns={5} />
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 1.5, md: 3 }, mb: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 1, mb: 2 }}>
          <Typography variant="h4" component="h1">
            <PersonIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Crew Management
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
            <Button
              variant="outlined"
              startIcon={<RecruitIcon />}
              onClick={openRecruitmentDialog}
            >
              Recruit Crew
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreateCrew}
            >
              Add Crew Member
            </Button>
          </Box>
        </Box>

        {/* While a dialog is open the error is shown inside it (the page alert would sit behind the modal) */}
        {!anyDialogOpen && error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Tabs value={tabValue} onChange={(e: React.SyntheticEvent, newValue: number) => setTabValue(newValue)}>
          <Tab label="Active Crew" />
          <Tab label="Deceased/Departed" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <TableContainer sx={{ WebkitOverflowScrolling: 'touch' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Race</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Position</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedCrew.map((crewMember) => (
                  <TableRow key={crewMember.id}>
                    <TableCell>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center"
                        }}>
                        <PersonIcon sx={{ mr: 1 }} />
                        <Box>
                          <Typography variant="body1" sx={{
                            fontWeight: "bold"
                          }}>
                            {crewMember.name}
                          </Typography>
                          {crewMember.age && (
                            <Typography variant="caption" sx={{
                              color: "text.secondary"
                            }}>
                              Age: {crewMember.age}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>{crewMember.race || 'Unknown'}</TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center"
                        }}>
                        {crewMember.location_type === 'ship' ? <ShipIcon sx={{ mr: 1, fontSize: 16 }} /> : <OutpostIcon sx={{ mr: 1, fontSize: 16 }} />}
                        {getLocationName(crewMember)}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {crewMember.ship_position ? (
                        <Chip label={crewMember.ship_position} size="small" />
                      ) : (
                        <Typography sx={{
                          color: "text.secondary"
                        }}>-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <IconButton
                        onClick={() => {
                          setError('');
                          setSelectedCrew(crewMember);
                          setMoveData(EMPTY_MOVE);
                          setMoveDialogOpen(true);
                        }}
                        title="Move"
                      >
                        <MoveIcon />
                      </IconButton>
                      <IconButton onClick={() => handleEditCrew(crewMember)} title="Edit">
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        onClick={() => {
                          setError('');
                          setSelectedCrew(crewMember);
                          setStatusData({ type: 'dead', date: currentGolarionDate, reason: '' });
                          setStatusDialogOpen(true);
                        }}
                        title="Update Status"
                        color="warning"
                      >
                        <WarningIcon />
                      </IconButton>
                      <IconButton
                        onClick={() => { setError(''); setSelectedCrew(crewMember); setDeleteDialogOpen(true); }}
                        title="Delete"
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            rowsPerPageOptions={[5, 10, 25]}
            component="div"
            count={crew.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(e: unknown, newPage: number) => setPage(newPage)}
            onRowsPerPageChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <TableContainer sx={{ WebkitOverflowScrolling: 'touch' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Race</TableCell>
                  <TableCell>Last Location</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {deceasedCrew.map((crewMember) => (
                  <TableRow key={crewMember.id}>
                    <TableCell>
                      <Typography variant="body1">{crewMember.name}</Typography>
                    </TableCell>
                    <TableCell>{crewMember.race || 'Unknown'}</TableCell>
                    <TableCell>{crewMember.last_known_location || 'Unknown'}</TableCell>
                    <TableCell>
                      <Chip
                        label={crewMember.death_date ? 'Deceased' : 'Departed'}
                        color={crewMember.death_date ? 'error' : 'warning'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {formatStoredDate(crewMember.death_date || crewMember.departure_date)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>
      </Paper>
      {/* Crew Dialog */}
      <Dialog open={crewDialogOpen} onClose={() => setCrewDialogOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {selectedCrew ? 'Edit Crew Member' : 'Add New Crew Member'}
        </DialogTitle>
        <DialogContent>
          {dialogError}
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid size={{xs: 12, md: 6}}>
              <TextField
                fullWidth
                label="Name"
                value={editingCrew.name}
                onChange={(e) => setEditingCrew({ ...editingCrew, name: e.target.value })}
                required
              />
            </Grid>

            <Grid size={{xs: 12, md: 6}}>
              <Autocomplete
                fullWidth
                options={[...STANDARD_RACES, 'Other']}
                value={editingCrew.race}
                onChange={(_event, newValue: string | null) => {
                  setEditingCrew({ ...editingCrew, race: newValue || '', customRace: newValue === 'Other' ? editingCrew.customRace : '' });
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Race" required />
                )}
              />
            </Grid>

            {editingCrew.race === 'Other' && (
              <Grid size={{xs: 12, md: 6}}>
                <TextField
                  fullWidth
                  label="Custom Race"
                  value={editingCrew.customRace}
                  onChange={(e) => setEditingCrew({ ...editingCrew, customRace: e.target.value })}
                  required
                />
              </Grid>
            )}

            <Grid size={{xs: 12, md: 3}}>
              <TextField
                fullWidth
                label="Age"
                type="number"
                value={editingCrew.age}
                onChange={(e) => setEditingCrew({ ...editingCrew, age: e.target.value })}
              />
            </Grid>

            <Grid size={{xs: 12, md: 3}}>
              <TextField
                fullWidth
                label="Hire Date"
                type="date"
                value={editingCrew.hire_date}
                onChange={(e) => setEditingCrew({ ...editingCrew, hire_date: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>

            <Grid size={12}>
              <LocationPicker
                label="Location"
                options={allLocations}
                value={findLocation(editingCrew.location_id)}
                onChange={(newValue) => setEditingCrew({
                  ...editingCrew,
                  location_id: newValue ? keyOf(newValue) : '',
                  ship_position: newValue?.type !== 'ship' ? '' : editingCrew.ship_position
                })}
              />
            </Grid>

            {findLocation(editingCrew.location_id)?.type === 'ship' && (
              <Grid size={12}>
                <ShipPositionSelect
                  value={editingCrew.ship_position}
                  onChange={(position) => setEditingCrew({ ...editingCrew, ship_position: position })}
                />
              </Grid>
            )}

            <Grid size={12}>
              <TextField
                fullWidth
                label="Description"
                multiline
                rows={3}
                value={editingCrew.description}
                onChange={(e) => setEditingCrew({ ...editingCrew, description: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCrewDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveCrew} variant="contained">
            {selectedCrew ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Move Dialog */}
      <Dialog open={moveDialogOpen} onClose={() => setMoveDialogOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>Move Crew Member</DialogTitle>
        <DialogContent>
          {dialogError}
          {selectedCrew && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Moving <strong>{selectedCrew.name}</strong> from <strong>{selectedCrew.location_name}</strong>
              {selectedCrew.ship_position && ` (${selectedCrew.ship_position})`}
            </Alert>
          )}
          {availableLocationsForMove.length === 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              No other locations available. Please create a ship or outpost first.
            </Alert>
          )}
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid size={12}>
              <LocationPicker
                label="New Location"
                options={availableLocationsForMove}
                value={findLocation(moveData.location_id)}
                onChange={(newValue) => setMoveData({
                  ...moveData,
                  location_id: newValue ? keyOf(newValue) : '',
                  ship_position: newValue?.type !== 'ship' ? '' : moveData.ship_position
                })}
                sx={{ '& .MuiAutocomplete-listbox': { maxHeight: 200 } }}
              />
            </Grid>
            {findLocation(moveData.location_id)?.type === 'ship' && (
              <Grid size={12}>
                <ShipPositionSelect
                  value={moveData.ship_position}
                  onChange={(position) => setMoveData({ ...moveData, ship_position: position })}
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleMoveCrew} variant="contained">Move</Button>
        </DialogActions>
      </Dialog>
      {/* Status Dialog */}
      <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Update Crew Status</DialogTitle>
        <DialogContent>
          {dialogError}
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid size={12}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusData.type}
                  label="Status"
                  onChange={(e: SelectChangeEvent<'dead' | 'departed'>) => setStatusData({ ...statusData, type: e.target.value as 'dead' | 'departed' })}
                >
                  <MenuItem value="dead">Deceased</MenuItem>
                  <MenuItem value="departed">Departed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Date"
                type="date"
                value={statusData.date}
                onChange={(e) => setStatusData({ ...statusData, date: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            {statusData.type === 'departed' && (
              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Reason for Departure"
                  value={statusData.reason}
                  onChange={(e) => setStatusData({ ...statusData, reason: e.target.value })}
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleUpdateStatus} variant="contained" color="warning">
            Update Status
          </Button>
        </DialogActions>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Crew Member</DialogTitle>
        <DialogContent>
          {dialogError}
          <Typography>
            Are you sure you want to permanently delete "{selectedCrew?.name}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteCrew} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      {/* Recruitment Dialog */}
      <Dialog open={recruitmentDialogOpen} onClose={() => setRecruitmentDialogOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>Recruit Crew Members - Skull & Shackles Rules</DialogTitle>
        <DialogContent>
          {dialogError}
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Official Recruitment Rules
            </Typography>
            <Typography variant="body2" sx={{
              color: "text.secondary",
              mb: 2
            }}>
              Make a DC {RECRUITMENT_DC} skill check. Success recruits 1d4+2 crew members (3-6 total). Each attempt takes 1 full day.
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "warning.main",
                fontWeight: 'bold'
              }}>
              Remember: Crew expect plunder shares, not daily wages. Deduct 1 plunder point when selling.
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{xs: 12, md: 6}}>
              <FormControl fullWidth>
                <InputLabel>Recruitment Method</InputLabel>
                <Select
                  value={recruitmentData.skillType}
                  label="Recruitment Method"
                  onChange={(e: SelectChangeEvent<SkillType>) => setRecruitmentData({ ...recruitmentData, skillType: e.target.value as SkillType })}
                >
                  {(Object.keys(RECRUIT_METHODS) as SkillType[]).map((skill) => (
                    <MenuItem key={skill} value={skill}>{RECRUIT_METHODS[skill].menuText}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{xs: 12, md: 6}}>
              <TextField
                fullWidth
                label="Total Roll Result"
                type="number"
                value={recruitmentData.rollResult}
                onChange={(e) => setRecruitmentData({ ...recruitmentData, rollResult: e.target.value })}
                helperText={`Include all modifiers (DC ${RECRUITMENT_DC} needed)`}
                required
              />
            </Grid>

            <Grid size={12}>
              <LocationPicker
                label="Recruitment Location"
                options={allLocations}
                value={findLocation(recruitmentData.location_id)}
                onChange={(newValue) => setRecruitmentData({
                  ...recruitmentData,
                  location_id: newValue ? keyOf(newValue) : ''
                })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecruitmentDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRecruitment} variant="contained" color="primary">
            Make Recruitment Check
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default CrewManagement;
