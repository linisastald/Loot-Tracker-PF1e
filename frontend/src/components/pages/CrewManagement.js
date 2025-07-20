import React, { useEffect, useState } from 'react';
import {
  Container, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Grid, Card, CardContent, CardHeader, Box, Alert, CircularProgress,
  Tabs, Tab, TablePagination, FormControl, InputLabel, Select, MenuItem, Chip
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, 
  Person as PersonIcon, DirectionsBoat as ShipIcon, Home as OutpostIcon,
  LocationOn as LocationIcon, Warning as WarningIcon, MoveUp as MoveIcon
} from '@mui/icons-material';
import crewService from '../services/crewService';
import shipService from '../services/shipService';
import outpostService from '../services/outpostService';

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
  const [selectedCrew, setSelectedCrew] = useState(null);
  
  const [editingCrew, setEditingCrew] = useState({
    name: '',
    race: '',
    age: '',
    description: '',
    location_type: 'ship',
    location_id: '',
    ship_position: ''
  });

  const [moveData, setMoveData] = useState({
    location_type: 'ship',
    location_id: '',
    ship_position: ''
  });

  const [statusData, setStatusData] = useState({
    type: 'dead',
    date: '',
    reason: ''
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
      age: '',
      description: '',
      location_type: 'ship',
      location_id: '',
      ship_position: ''
    });
    setSelectedCrew(null);
    setCrewDialogOpen(true);
  };

  const handleEditCrew = (crewMember) => {
    setEditingCrew({
      name: crewMember.name,
      race: crewMember.race || '',
      age: crewMember.age || '',
      description: crewMember.description || '',
      location_type: crewMember.location_type,
      location_id: crewMember.location_id,
      ship_position: crewMember.ship_position || ''
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

      const crewData = {
        ...editingCrew,
        age: editingCrew.age ? parseInt(editingCrew.age) : null
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
      await crewService.moveCrewToLocation(
        selectedCrew.id,
        moveData.location_type,
        moveData.location_id,
        moveData.ship_position
      );
      setSuccess('Crew member moved successfully');
      setMoveDialogOpen(false);
      fetchData();
    } catch (error) {
      setError('Failed to move crew member');
      console.error('Error moving crew:', error);
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
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateCrew}
          >
            Add Crew Member
          </Button>
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
                          setMoveData({ location_type: 'ship', location_id: '', ship_position: '' });
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
              <TextField
                fullWidth
                label="Race"
                value={editingCrew.race}
                onChange={(e) => setEditingCrew({ ...editingCrew, race: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Age"
                type="number"
                value={editingCrew.age}
                onChange={(e) => setEditingCrew({ ...editingCrew, age: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Location Type</InputLabel>
                <Select
                  value={editingCrew.location_type}
                  label="Location Type"
                  onChange={(e) => setEditingCrew({ ...editingCrew, location_type: e.target.value, location_id: '' })}
                >
                  <MenuItem value="ship">Ship</MenuItem>
                  <MenuItem value="outpost">Outpost</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>
                  {editingCrew.location_type === 'ship' ? 'Ship' : 'Outpost'}
                </InputLabel>
                <Select
                  value={editingCrew.location_id}
                  label={editingCrew.location_type === 'ship' ? 'Ship' : 'Outpost'}
                  onChange={(e) => setEditingCrew({ ...editingCrew, location_id: e.target.value })}
                >
                  {editingCrew.location_type === 'ship' 
                    ? ships.map((ship) => (
                        <MenuItem key={ship.id} value={ship.id}>{ship.name}</MenuItem>
                      ))
                    : outposts.map((outpost) => (
                        <MenuItem key={outpost.id} value={outpost.id}>{outpost.name}</MenuItem>
                      ))
                  }
                </Select>
              </FormControl>
            </Grid>
            {editingCrew.location_type === 'ship' && (
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Position</InputLabel>
                  <Select
                    value={editingCrew.ship_position}
                    label="Position"
                    onChange={(e) => setEditingCrew({ ...editingCrew, ship_position: e.target.value })}
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
              <FormControl fullWidth>
                <InputLabel>Location Type</InputLabel>
                <Select
                  value={moveData.location_type}
                  label="Location Type"
                  onChange={(e) => setMoveData({ ...moveData, location_type: e.target.value, location_id: '' })}
                >
                  <MenuItem value="ship">Ship</MenuItem>
                  <MenuItem value="outpost">Outpost</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>
                  {moveData.location_type === 'ship' ? 'Ship' : 'Outpost'}
                </InputLabel>
                <Select
                  value={moveData.location_id}
                  label={moveData.location_type === 'ship' ? 'Ship' : 'Outpost'}
                  onChange={(e) => setMoveData({ ...moveData, location_id: e.target.value })}
                >
                  {moveData.location_type === 'ship' 
                    ? ships.map((ship) => (
                        <MenuItem key={ship.id} value={ship.id}>{ship.name}</MenuItem>
                      ))
                    : outposts.map((outpost) => (
                        <MenuItem key={outpost.id} value={outpost.id}>{outpost.name}</MenuItem>
                      ))
                  }
                </Select>
              </FormControl>
            </Grid>
            {moveData.location_type === 'ship' && (
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Position</InputLabel>
                  <Select
                    value={moveData.ship_position}
                    label="Position"
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
    </Container>
  );
};

export default CrewManagement;
