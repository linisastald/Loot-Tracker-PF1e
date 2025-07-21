import React, { useEffect, useState } from 'react';
import {
  Container, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Grid, Card, CardContent, CardHeader, Chip, Box, Alert, CircularProgress,
  Switch, FormControlLabel, Tabs, Tab, TablePagination
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, 
  DirectionsBoat as ShipIcon, People as PeopleIcon, LocationOn as LocationIcon,
  Warning as WarningIcon, Build as RepairIcon
} from '@mui/icons-material';
import shipService from '../../services/shipService';
import crewService from '../../services/crewService';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const ShipManagement = () => {
  const [ships, setShips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Dialog states
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedShip, setSelectedShip] = useState(null);
  const [editingShip, setEditingShip] = useState({
    name: '',
    location: '',
    is_squibbing: false,
    damage: 0
  });

  // Crew data for detail view
  const [selectedShipCrew, setSelectedShipCrew] = useState([]);
  const [loadingCrew, setLoadingCrew] = useState(false);

  useEffect(() => {
    fetchShips();
  }, []);

  const fetchShips = async () => {
    try {
      setLoading(true);
      const response = await shipService.getAllShips();
      setShips(response.data.ships);
      setError('');
    } catch (error) {
      setError('Failed to load ships');
      console.error('Error fetching ships:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchShipCrew = async (shipId) => {
    try {
      setLoadingCrew(true);
      const response = await crewService.getCrewByLocation('ship', shipId);
      setSelectedShipCrew(response.data.crew);
    } catch (error) {
      console.error('Error fetching ship crew:', error);
      setSelectedShipCrew([]);
    } finally {
      setLoadingCrew(false);
    }
  };

  const handleCreateShip = () => {
    setEditingShip({ name: '', location: '', is_squibbing: false, damage: 0 });
    setSelectedShip(null);
    setShipDialogOpen(true);
  };

  const handleEditShip = (ship) => {
    setEditingShip({
      name: ship.name,
      location: ship.location || '',
      is_squibbing: ship.is_squibbing || false,
      damage: ship.damage || 0
    });
    setSelectedShip(ship);
    setShipDialogOpen(true);
  };

  const handleSaveShip = async () => {
    try {
      if (!editingShip.name.trim()) {
        setError('Ship name is required');
        return;
      }

      if (selectedShip) {
        await shipService.updateShip(selectedShip.id, editingShip);
        setSuccess('Ship updated successfully');
      } else {
        await shipService.createShip(editingShip);
        setSuccess('Ship created successfully');
      }

      setShipDialogOpen(false);
      fetchShips();
      setError('');
    } catch (error) {
      setError('Failed to save ship');
      console.error('Error saving ship:', error);
    }
  };

  const handleDeleteShip = async () => {
    try {
      await shipService.deleteShip(selectedShip.id);
      setSuccess('Ship deleted successfully');
      setDeleteDialogOpen(false);
      fetchShips();
      setError('');
    } catch (error) {
      setError('Failed to delete ship');
      console.error('Error deleting ship:', error);
    }
  };

  const handleViewShipDetails = async (ship) => {
    setSelectedShip(ship);
    setTabValue(1);
    await fetchShipCrew(ship.id);
  };

  const getDamageColor = (damage) => {
    if (damage === 0) return 'success';
    if (damage <= 25) return 'warning';
    return 'error';
  };

  const getDamageLabel = (damage) => {
    if (damage === 0) return 'No Damage';
    if (damage <= 25) return 'Light Damage';
    if (damage <= 50) return 'Moderate Damage';
    if (damage <= 75) return 'Heavy Damage';
    return 'Critical Damage';
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>Loading ships...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h4" component="h1">
            <ShipIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Ship Management
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateShip}
          >
            Add Ship
          </Button>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab label="Ship List" />
          <Tab label="Ship Details" disabled={!selectedShip} />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Crew</TableCell>
                  <TableCell>Damage</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ships
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((ship) => (
                  <TableRow key={ship.id}>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <ShipIcon sx={{ mr: 1 }} />
                        <Typography variant="body1" fontWeight="bold">
                          {ship.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {ship.location ? (
                        <Box display="flex" alignItems="center">
                          <LocationIcon sx={{ mr: 1, fontSize: 16 }} />
                          {ship.location}
                        </Box>
                      ) : (
                        <Typography color="text.secondary">Unknown</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={ship.is_squibbing ? 'Squibbing' : 'Active'}
                        color={ship.is_squibbing ? 'warning' : 'success'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <PeopleIcon sx={{ mr: 1, fontSize: 16 }} />
                        {ship.crew_count || 0}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getDamageLabel(ship.damage)}
                        color={getDamageColor(ship.damage)}
                        size="small"
                        icon={ship.damage > 0 ? <RepairIcon /> : undefined}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton onClick={() => handleViewShipDetails(ship)} title="View Details">
                        <ShipIcon />
                      </IconButton>
                      <IconButton onClick={() => handleEditShip(ship)} title="Edit">
                        <EditIcon />
                      </IconButton>
                      <IconButton 
                        onClick={() => { setSelectedShip(ship); setDeleteDialogOpen(true); }}
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
            count={ships.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          {selectedShip && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardHeader title="Ship Information" />
                  <CardContent>
                    <Typography variant="h6">{selectedShip.name}</Typography>
                    <Typography color="text.secondary" gutterBottom>
                      Location: {selectedShip.location || 'Unknown'}
                    </Typography>
                    <Box sx={{ mt: 2 }}>
                      <Chip
                        label={selectedShip.is_squibbing ? 'Squibbing' : 'Active'}
                        color={selectedShip.is_squibbing ? 'warning' : 'success'}
                        sx={{ mr: 1 }}
                      />
                      <Chip
                        label={getDamageLabel(selectedShip.damage)}
                        color={getDamageColor(selectedShip.damage)}
                      />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card>
                  <CardHeader 
                    title="Crew Members" 
                    subheader={`${selectedShipCrew.length} crew members aboard`}
                  />
                  <CardContent>
                    {loadingCrew ? (
                      <CircularProgress size={24} />
                    ) : selectedShipCrew.length > 0 ? (
                      selectedShipCrew.map((crew) => (
                        <Box key={crew.id} sx={{ mb: 1, p: 1, border: '1px solid #eee', borderRadius: 1 }}>
                          <Typography variant="body2" fontWeight="bold">
                            {crew.name}
                            {crew.ship_position && (
                              <Chip label={crew.ship_position} size="small" sx={{ ml: 1 }} />
                            )}
                          </Typography>
                          {crew.race && (
                            <Typography variant="caption" color="text.secondary">
                              {crew.race}
                            </Typography>
                          )}
                        </Box>
                      ))
                    ) : (
                      <Typography color="text.secondary">No crew members assigned</Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </TabPanel>
      </Paper>

      {/* Ship Dialog */}
      <Dialog open={shipDialogOpen} onClose={() => setShipDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedShip ? 'Edit Ship' : 'Create New Ship'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Ship Name"
                value={editingShip.name}
                onChange={(e) => setEditingShip({ ...editingShip, name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Location"
                value={editingShip.location}
                onChange={(e) => setEditingShip({ ...editingShip, location: e.target.value })}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Damage"
                type="number"
                inputProps={{ min: 0, max: 100 }}
                value={editingShip.damage}
                onChange={(e) => setEditingShip({ ...editingShip, damage: parseInt(e.target.value) || 0 })}
              />
            </Grid>
            <Grid item xs={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={editingShip.is_squibbing}
                    onChange={(e) => setEditingShip({ ...editingShip, is_squibbing: e.target.checked })}
                  />
                }
                label="Squibbing"
                sx={{ mt: 2 }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShipDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveShip} variant="contained">
            {selectedShip ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Ship</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{selectedShip?.name}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteShip} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ShipManagement;
