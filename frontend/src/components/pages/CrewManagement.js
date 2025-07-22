import React, { useEffect, useState } from 'react';
import {
  Container, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Grid, Card, CardContent, CardHeader, Box, Alert, CircularProgress,
  Tabs, Tab, TablePagination, FormControl, InputLabel, Select, MenuItem, Chip,
  Autocomplete
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, 
  Person as PersonIcon, DirectionsBoat as ShipIcon, Home as OutpostIcon,
  LocationOn as LocationIcon, Warning as WarningIcon, MoveUp as MoveIcon,
  Group as RecruitIcon
} from '@mui/icons-material';
import crewService from '../../services/crewService';
import shipService from '../../services/shipService';
import outpostService from '../../services/outpostService';
import { STANDARD_RACES, generateRandomName, generateRandomRace, generateRandomAge } from '../../data/raceData';
import { getTodayInInputFormat, golarionToInputFormat, inputFormatToGolarion } from '../../utils/golarionDate';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const CrewManagement = () => {
  const [crew, setCrew] = useState([]);
  const [deceasedCrew, setDeceasedCrew] = useState([]);
  const [ships, setShips] = useState([]);
  const [outposts, setOutposts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Dialog states
  const [crewDialogOpen, setCrewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [recruitmentDialogOpen, setRecruitmentDialogOpen] = useState(false);
  const [selectedCrew, setSelectedCrew] = useState(null);
  const [currentGolarionDate, setCurrentGolarionDate] = useState('');
  const [allLocations, setAllLocations] = useState([]);
  
  const [editingCrew, setEditingCrew] = useState({
    name: '',
    race: '',
    customRace: '',
    age: '',
    description: '',
    location_id: '',
    ship_position: '',
    hire_date: ''
  });

  const [moveData, setMoveData] = useState({
    location_id: '',
    ship_position: ''
  });

  const [statusData, setStatusData] = useState({
    type: 'dead',
    date: '',
    reason: ''
  });

  const [recruitmentData, setRecruitmentData] = useState({
    numberOfCrew: 1,
    location_id: '',
    ship_position: ''
  });

  const shipPositions = [
    'Captain', 'First Mate', 'Quartermaster', 'Boatswain', 'Navigator',
    'Cook', 'Gunner', 'Rigger', 'Lookout', 'Crew'
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
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
      
      // Combine all locations for the dropdown
      const locations = [
        ...shipsResponse.data.ships.map(ship => ({ ...ship, type: 'ship' })),
        ...outpostsResponse.data.outposts.map(outpost => ({ ...outpost, type: 'outpost' }))
      ];
      setAllLocations(locations);
      
      // Get current Golarion date
      const todayDate = await getTodayInInputFormat();
      setCurrentGolarionDate(todayDate);
      
      setError('');
    } catch (error) {
      setError('Failed to load data');
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCrew = () => {
    setEditingCrew({
      name: '',
      race: '',
      customRace: '',
      age: '',
      description: '',
      location_id: '',
      ship_position: '',
      hire_date: currentGolarionDate
    });
    setSelectedCrew(null);
    setCrewDialogOpen(true);
  };

  const handleEditCrew = (crewMember) => {
    const isCustomRace = !STANDARD_RACES.includes(crewMember.race);
    setEditingCrew({
      name: crewMember.name,
      race: isCustomRace ? 'Other' : (crewMember.race || ''),
      customRace: isCustomRace ? crewMember.race : '',
      age: crewMember.age || '',
      description: crewMember.description || '',
      location_id: crewMember.location_id,
      ship_position: crewMember.ship_position || '',
      hire_date: crewMember.hire_date ? golarionToInputFormat(
        crewMember.hire_date.year || new Date(crewMember.hire_date).getFullYear(),
        crewMember.hire_date.month || new Date(crewMember.hire_date).getMonth() + 1,
        crewMember.hire_date.day || new Date(crewMember.hire_date).getDate()
      ) : currentGolarionDate
    });
    setSelectedCrew(crewMember);
    setCrewDialogOpen(true);
  };

  const handleSaveCrew = async () => {
    try {
      if (!editingCrew.name.trim()) {
        setError('Crew member name is required');
        return;
      }
      if (!editingCrew.location_id) {
        setError('Location is required');
        return;
      }

      // Determine location type from the selected location
      const selectedLocation = allLocations.find(loc => loc.id === editingCrew.location_id);
      if (!selectedLocation) {
        setError('Invalid location selected');
        return;
      }

      // Determine final race (custom or standard)
      const finalRace = editingCrew.race === 'Other' ? editingCrew.customRace : editingCrew.race;
      
      // Parse the hire date
      const hireDateParsed = inputFormatToGolarion(editingCrew.hire_date);

      const crewData = {
        name: editingCrew.name,
        race: finalRace,
        age: editingCrew.age ? parseInt(editingCrew.age) : null,
        description: editingCrew.description,
        location_type: selectedLocation.type,
        location_id: editingCrew.location_id,
        ship_position: selectedLocation.type === 'ship' ? editingCrew.ship_position : null,
        hire_date: hireDateParsed
      };

      if (selectedCrew) {
        await crewService.updateCrew(selectedCrew.id, crewData);
        setSuccess('Crew member updated successfully');
      } else {
        await crewService.createCrew(crewData);
        setSuccess('Crew member created successfully');
      }

      setCrewDialogOpen(false);
      fetchData();
      setError('');
    } catch (error) {
      setError('Failed to save crew member');
      console.error('Error saving crew:', error);
    }
  };

  const handleMoveCrew = async () => {
    try {
      // Determine location type from the selected location
      const selectedLocation = allLocations.find(loc => loc.id === moveData.location_id);
      if (!selectedLocation) {
        setError('Invalid location selected');
        return;
      }

      await crewService.moveCrewToLocation(
        selectedCrew.id,
        selectedLocation.type,
        moveData.location_id,
        selectedLocation.type === 'ship' ? moveData.ship_position : null
      );
      setSuccess('Crew member moved successfully');
      setMoveDialogOpen(false);
      fetchData();
    } catch (error) {
      setError('Failed to move crew member');
      console.error('Error moving crew:', error);
    }
  };

  const handleRecruitment = async () => {
    try {
      if (!recruitmentData.location_id) {
        setError('Location is required for recruitment');
        return;
      }

      const selectedLocation = allLocations.find(loc => loc.id === recruitmentData.location_id);
      if (!selectedLocation) {
        setError('Invalid location selected');
        return;
      }

      const numberOfCrew = parseInt(recruitmentData.numberOfCrew);
      if (numberOfCrew < 1 || numberOfCrew > 20) {
        setError('Number of crew must be between 1 and 20');
        return;
      }

      // Generate random crew members
      for (let i = 0; i < numberOfCrew; i++) {
        const randomName = generateRandomName();
        const randomRace = generateRandomRace();
        const randomAge = generateRandomAge(randomRace);
        const hireDateParsed = inputFormatToGolarion(currentGolarionDate);

        const crewData = {
          name: randomName,
          race: randomRace,
          age: randomAge,
          description: 'Recruited crew member',
          location_type: selectedLocation.type,
          location_id: recruitmentData.location_id,
          ship_position: selectedLocation.type === 'ship' ? (recruitmentData.ship_position || 'Crew') : null,
          hire_date: hireDateParsed
        };

        await crewService.createCrew(crewData);
      }

      setSuccess(`Successfully recruited ${numberOfCrew} crew member${numberOfCrew > 1 ? 's' : ''}`);
      setRecruitmentDialogOpen(false);
      fetchData();
      setError('');
    } catch (error) {
      setError('Failed to recruit crew members');
      console.error('Error recruiting crew:', error);
    }
  };

  const handleUpdateStatus = async () => {
    try {
      if (statusData.type === 'dead') {
        await crewService.markCrewDead(selectedCrew.id, statusData.date || new Date());
        setSuccess('Crew member marked as deceased');
      } else {
        await crewService.markCrewDeparted(selectedCrew.id, statusData.date || new Date(), statusData.reason);
        setSuccess('Crew member marked as departed');
      }
      setStatusDialogOpen(false);
      fetchData();
    } catch (error) {
      setError('Failed to update crew status');
      console.error('Error updating status:', error);
    }
  };

  const handleDeleteCrew = async () => {
    try {
      await crewService.deleteCrew(selectedCrew.id);
      setSuccess('Crew member deleted successfully');
      setDeleteDialogOpen(false);
      fetchData();
    } catch (error) {
      setError('Failed to delete crew member');
      console.error('Error deleting crew:', error);
    }
  };

  const getLocationName = (crewMember) => {
    if (crewMember.location_type === 'ship') {
      const ship = ships.find(s => s.id === crewMember.location_id);
      return ship ? ship.name : 'Unknown Ship';
    } else {
      const outpost = outposts.find(o => o.id === crewMember.location_id);
      return outpost ? outpost.name : 'Unknown Outpost';
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>Loading crew...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h4" component="h1">
            <PersonIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Crew Management
          </Typography>
          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<RecruitIcon />}
              onClick={() => {
                setRecruitmentData({ numberOfCrew: 1, location_id: '', ship_position: '' });
                setRecruitmentDialogOpen(true);
              }}
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

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab label="Active Crew" />
          <Tab label="Deceased/Departed" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <TableContainer>
            <Table>
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
                {crew
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((crewMember) => (
                  <TableRow key={crewMember.id}>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <PersonIcon sx={{ mr: 1 }} />
                        <Box>
                          <Typography variant="body1" fontWeight="bold">
                            {crewMember.name}
                          </Typography>
                          {crewMember.age && (
                            <Typography variant="caption" color="text.secondary">
                              Age: {crewMember.age}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>{crewMember.race || 'Unknown'}</TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        {crewMember.location_type === 'ship' ? <ShipIcon sx={{ mr: 1, fontSize: 16 }} /> : <OutpostIcon sx={{ mr: 1, fontSize: 16 }} />}
                        {getLocationName(crewMember)}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {crewMember.ship_position ? (
                        <Chip label={crewMember.ship_position} size="small" />
                      ) : (
                        <Typography color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <IconButton 
                        onClick={() => { 
                          setSelectedCrew(crewMember); 
                          setMoveData({ location_id: '', ship_position: '' });
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
                          setSelectedCrew(crewMember); 
                          setStatusData({ type: 'dead', date: '', reason: '' });
                          setStatusDialogOpen(true); 
                        }}
                        title="Update Status"
                        color="warning"
                      >
                        <WarningIcon />
                      </IconButton>
                      <IconButton 
                        onClick={() => { setSelectedCrew(crewMember); setDeleteDialogOpen(true); }}
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
            onPageChange={(e, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <TableContainer>
            <Table>
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
                      {crewMember.death_date && new Date(crewMember.death_date).toLocaleDateString()}
                      {crewMember.departure_date && new Date(crewMember.departure_date).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>
      </Paper>

      {/* Crew Dialog */}
      <Dialog open={crewDialogOpen} onClose={() => setCrewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedCrew ? 'Edit Crew Member' : 'Add New Crew Member'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Name"
                value={editingCrew.name}
                onChange={(e) => setEditingCrew({ ...editingCrew, name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Autocomplete
                fullWidth
                options={[...STANDARD_RACES, 'Other']}
                value={editingCrew.race}
                onChange={(event, newValue) => {
                  setEditingCrew({ ...editingCrew, race: newValue || '', customRace: newValue === 'Other' ? editingCrew.customRace : '' });
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Race" required />
                )}
              />
            </Grid>
            {editingCrew.race === 'Other' && (
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Custom Race"
                  value={editingCrew.customRace}
                  onChange={(e) => setEditingCrew({ ...editingCrew, customRace: e.target.value })}
                  required
                />
              </Grid>
            )}
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="Age"
                type="number"
                value={editingCrew.age}
                onChange={(e) => setEditingCrew({ ...editingCrew, age: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="Hire Date"
                type="date"
                value={editingCrew.hire_date}
                onChange={(e) => setEditingCrew({ ...editingCrew, hire_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                fullWidth
                options={allLocations}
                getOptionLabel={(option) => `${option.name} (${option.type === 'ship' ? 'Ship' : 'Outpost'})`}
                value={allLocations.find(loc => loc.id === editingCrew.location_id) || null}
                onChange={(event, newValue) => {
                  setEditingCrew({ 
                    ...editingCrew, 
                    location_id: newValue ? newValue.id : '',
                    ship_position: newValue?.type !== 'ship' ? '' : editingCrew.ship_position
                  });
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Location" required />
                )}
                sx={{ '& .MuiAutocomplete-input': { minWidth: '200px' } }}
              />
            </Grid>
            {allLocations.find(loc => loc.id === editingCrew.location_id)?.type === 'ship' && (
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Ship Position</InputLabel>
                  <Select
                    value={editingCrew.ship_position}
                    label="Ship Position"
                    onChange={(e) => setEditingCrew({ ...editingCrew, ship_position: e.target.value })}
                    sx={{ minWidth: '150px' }}
                  >
                    {shipPositions.map((position) => (
                      <MenuItem key={position} value={position}>{position}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid item xs={12}>
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
      <Dialog open={moveDialogOpen} onClose={() => setMoveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Move Crew Member</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <Autocomplete
                fullWidth
                options={allLocations}
                getOptionLabel={(option) => `${option.name} (${option.type === 'ship' ? 'Ship' : 'Outpost'})`}
                value={allLocations.find(loc => loc.id === moveData.location_id) || null}
                onChange={(event, newValue) => {
                  setMoveData({ 
                    ...moveData, 
                    location_id: newValue ? newValue.id : '',
                    ship_position: newValue?.type !== 'ship' ? '' : moveData.ship_position
                  });
                }}
                renderInput={(params) => (
                  <TextField {...params} label="New Location" required />
                )}
              />
            </Grid>
            {allLocations.find(loc => loc.id === moveData.location_id)?.type === 'ship' && (
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Ship Position</InputLabel>
                  <Select
                    value={moveData.ship_position}
                    label="Ship Position"
                    onChange={(e) => setMoveData({ ...moveData, ship_position: e.target.value })}
                  >
                    {shipPositions.map((position) => (
                      <MenuItem key={position} value={position}>{position}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
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
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusData.type}
                  label="Status"
                  onChange={(e) => setStatusData({ ...statusData, type: e.target.value })}
                >
                  <MenuItem value="dead">Deceased</MenuItem>
                  <MenuItem value="departed">Departed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Date"
                type="date"
                value={statusData.date}
                onChange={(e) => setStatusData({ ...statusData, date: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            {statusData.type === 'departed' && (
              <Grid item xs={12}>
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
      <Dialog open={recruitmentDialogOpen} onClose={() => setRecruitmentDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Recruit Crew Members</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Use the Skull & Shackles recruitment rules to add random crew members to your fleet.
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Number of Crew"
                type="number"
                value={recruitmentData.numberOfCrew}
                onChange={(e) => setRecruitmentData({ ...recruitmentData, numberOfCrew: e.target.value })}
                inputProps={{ min: 1, max: 20 }}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                fullWidth
                options={allLocations}
                getOptionLabel={(option) => `${option.name} (${option.type === 'ship' ? 'Ship' : 'Outpost'})`}
                value={allLocations.find(loc => loc.id === recruitmentData.location_id) || null}
                onChange={(event, newValue) => {
                  setRecruitmentData({ 
                    ...recruitmentData, 
                    location_id: newValue ? newValue.id : '',
                    ship_position: newValue?.type !== 'ship' ? '' : recruitmentData.ship_position
                  });
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Recruitment Location" required />
                )}
              />
            </Grid>
            {allLocations.find(loc => loc.id === recruitmentData.location_id)?.type === 'ship' && (
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Default Ship Position</InputLabel>
                  <Select
                    value={recruitmentData.ship_position}
                    label="Default Ship Position"
                    onChange={(e) => setRecruitmentData({ ...recruitmentData, ship_position: e.target.value })}
                  >
                    {shipPositions.map((position) => (
                      <MenuItem key={position} value={position}>{position}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecruitmentDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRecruitment} variant="contained" color="primary">
            Recruit Crew
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default CrewManagement;
