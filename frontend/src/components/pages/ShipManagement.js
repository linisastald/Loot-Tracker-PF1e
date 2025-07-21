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
  Warning as WarningIcon, Build as RepairIcon, LocalHospital as HealIcon,
  Security as ShieldIcon, Speed as InitiativeIcon
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
  const [damageRepairDialogOpen, setDamageRepairDialogOpen] = useState(false);
  const [selectedShip, setSelectedShip] = useState(null);
  const [editingShip, setEditingShip] = useState({
    name: '',
    location: '',
    is_squibbing: false,
    base_ac: 10,
    touch_ac: 10,
    hardness: 0,
    max_hp: 100,
    current_hp: 100,
    cmb: 0,
    cmd: 10,
    saves: 0,
    initiative: 0
  });
  const [damageRepairData, setDamageRepairData] = useState({
    amount: 0,
    type: 'damage' // 'damage' or 'repair'
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
    setEditingShip({
      name: '',
      location: '',
      is_squibbing: false,
      base_ac: 10,
      touch_ac: 10,
      hardness: 0,
      max_hp: 100,
      current_hp: 100,
      cmb: 0,
      cmd: 10,
      saves: 0,
      initiative: 0
    });
    setSelectedShip(null);
    setShipDialogOpen(true);
  };

  const handleEditShip = (ship) => {
    setEditingShip({
      name: ship.name,
      location: ship.location || '',
      is_squibbing: ship.is_squibbing || false,
      base_ac: ship.base_ac || 10,
      touch_ac: ship.touch_ac || 10,
      hardness: ship.hardness || 0,
      max_hp: ship.max_hp || 100,
      current_hp: ship.current_hp || 100,
      cmb: ship.cmb || 0,
      cmd: ship.cmd || 10,
      saves: ship.saves || 0,
      initiative: ship.initiative || 0
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

  const handleDamageRepairShip = (ship, type) => {
    setSelectedShip(ship);
    setDamageRepairData({ amount: 0, type });
    setDamageRepairDialogOpen(true);
  };

  const handleApplyDamageRepair = async () => {
    try {
      if (!damageRepairData.amount || damageRepairData.amount <= 0) {
        setError('Amount must be a positive number');
        return;
      }

      let response;
      if (damageRepairData.type === 'damage') {
        response = await shipService.applyDamage(selectedShip.id, damageRepairData.amount);
      } else {
        response = await shipService.repairShip(selectedShip.id, damageRepairData.amount);
      }

      setSuccess(response.data.message || `${damageRepairData.type === 'damage' ? 'Damage applied' : 'Ship repaired'} successfully`);
      setDamageRepairDialogOpen(false);
      fetchShips();
      setError('');
    } catch (error) {
      setError(`Failed to ${damageRepairData.type === 'damage' ? 'apply damage' : 'repair ship'}`);
      console.error(`Error ${damageRepairData.type === 'damage' ? 'applying damage' : 'repairing ship'}:`, error);
    }
  };

  const getShipStatusColor = (ship) => {
    if (!ship.current_hp || !ship.max_hp) return 'default';
    
    if (ship.current_hp === 0) return 'error';
    
    const hpPercentage = (ship.current_hp / ship.max_hp) * 100;
    
    if (hpPercentage === 100) return 'success';
    if (hpPercentage >= 75) return 'success';
    if (hpPercentage >= 50) return 'warning';
    if (hpPercentage >= 25) return 'warning';
    return 'error';
  };

  const getShipStatusLabel = (ship) => {
    if (!ship.current_hp || !ship.max_hp) return 'Unknown';
    
    if (ship.current_hp === 0) return 'Sunk';
    
    const hpPercentage = (ship.current_hp / ship.max_hp) * 100;
    
    if (hpPercentage === 100) return 'Pristine';
    if (hpPercentage >= 75) return 'Minor Damage';
    if (hpPercentage >= 50) return 'Moderate Damage';
    if (hpPercentage >= 25) return 'Heavy Damage';
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
                  <TableCell>HP</TableCell>
                  <TableCell>Combat Stats</TableCell>
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
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2">
                          {ship.current_hp || 0}/{ship.max_hp || 100}
                        </Typography>
                        <Chip
                          label={getShipStatusLabel(ship)}
                          color={getShipStatusColor(ship)}
                          size="small"
                          icon={ship.current_hp === 0 ? <WarningIcon /> : undefined}
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Chip label={`AC ${ship.base_ac || 10}`} size="small" icon={<ShieldIcon />} />
                        <Chip label={`Init ${ship.initiative >= 0 ? '+' : ''}${ship.initiative || 0}`} size="small" icon={<InitiativeIcon />} />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <IconButton onClick={() => handleViewShipDetails(ship)} title="View Details">
                        <ShipIcon />
                      </IconButton>
                      <IconButton onClick={() => handleEditShip(ship)} title="Edit">
                        <EditIcon />
                      </IconButton>
                      <IconButton 
                        onClick={() => handleDamageRepairShip(ship, 'damage')} 
                        title="Apply Damage"
                        color="warning"
                        disabled={ship.current_hp === 0}
                      >
                        <WarningIcon />
                      </IconButton>
                      <IconButton 
                        onClick={() => handleDamageRepairShip(ship, 'repair')} 
                        title="Repair Ship"
                        color="success"
                        disabled={ship.current_hp >= ship.max_hp}
                      >
                        <HealIcon />
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
                    
                    <Box sx={{ mt: 2, mb: 2 }}>
                      <Chip
                        label={selectedShip.is_squibbing ? 'Squibbing' : 'Active'}
                        color={selectedShip.is_squibbing ? 'warning' : 'success'}
                        sx={{ mr: 1 }}
                      />
                      <Chip
                        label={getShipStatusLabel(selectedShip)}
                        color={getShipStatusColor(selectedShip)}
                      />
                    </Box>

                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Hit Points</Typography>
                        <Typography variant="h6">
                          {selectedShip.current_hp || 0} / {selectedShip.max_hp || 100}
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Armor Class</Typography>
                        <Typography variant="body2">
                          Base AC: {selectedShip.base_ac || 10} | Touch AC: {selectedShip.touch_ac || 10}
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Combat Maneuvers</Typography>
                        <Typography variant="body2">
                          CMB: {selectedShip.cmb >= 0 ? '+' : ''}{selectedShip.cmb || 0} | CMD: {selectedShip.cmd || 10}
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Other Stats</Typography>
                        <Typography variant="body2">
                          Saves: {selectedShip.saves >= 0 ? '+' : ''}{selectedShip.saves || 0} | Initiative: {selectedShip.initiative >= 0 ? '+' : ''}{selectedShip.initiative || 0}
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Hardness</Typography>
                        <Typography variant="body2">{selectedShip.hardness || 0}</Typography>
                      </Grid>
                    </Grid>
                    
                    <Box sx={{ mt: 2 }}>
                      <Button
                        variant="outlined"
                        color="warning"
                        startIcon={<WarningIcon />}
                        onClick={() => handleDamageRepairShip(selectedShip, 'damage')}
                        disabled={selectedShip.current_hp === 0}
                        sx={{ mr: 1 }}
                      >
                        Apply Damage
                      </Button>
                      <Button
                        variant="outlined"
                        color="success"
                        startIcon={<HealIcon />}
                        onClick={() => handleDamageRepairShip(selectedShip, 'repair')}
                        disabled={selectedShip.current_hp >= selectedShip.max_hp}
                      >
                        Repair Ship
                      </Button>
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
            
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Combat Statistics</Typography>
            </Grid>
            
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Max HP"
                type="number"
                inputProps={{ min: 1, max: 9999 }}
                value={editingShip.max_hp}
                onChange={(e) => {
                  const maxHp = parseInt(e.target.value) || 100;
                  setEditingShip({ 
                    ...editingShip, 
                    max_hp: maxHp,
                    current_hp: Math.min(editingShip.current_hp, maxHp)
                  });
                }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Current HP"
                type="number"
                inputProps={{ min: 0, max: editingShip.max_hp }}
                value={editingShip.current_hp}
                onChange={(e) => setEditingShip({ ...editingShip, current_hp: parseInt(e.target.value) || 0 })}
              />
            </Grid>
            
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Base AC"
                type="number"
                inputProps={{ min: 0, max: 50 }}
                value={editingShip.base_ac}
                onChange={(e) => setEditingShip({ ...editingShip, base_ac: parseInt(e.target.value) || 10 })}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Touch AC"
                type="number"
                inputProps={{ min: 0, max: 50 }}
                value={editingShip.touch_ac}
                onChange={(e) => setEditingShip({ ...editingShip, touch_ac: parseInt(e.target.value) || 10 })}
              />
            </Grid>
            
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Hardness"
                type="number"
                inputProps={{ min: 0, max: 50 }}
                value={editingShip.hardness}
                onChange={(e) => setEditingShip({ ...editingShip, hardness: parseInt(e.target.value) || 0 })}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Initiative"
                type="number"
                inputProps={{ min: -20, max: 20 }}
                value={editingShip.initiative}
                onChange={(e) => setEditingShip({ ...editingShip, initiative: parseInt(e.target.value) || 0 })}
              />
            </Grid>
            
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="CMB"
                type="number"
                inputProps={{ min: -20, max: 50 }}
                value={editingShip.cmb}
                onChange={(e) => setEditingShip({ ...editingShip, cmb: parseInt(e.target.value) || 0 })}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="CMD"
                type="number"
                inputProps={{ min: 0, max: 100 }}
                value={editingShip.cmd}
                onChange={(e) => setEditingShip({ ...editingShip, cmd: parseInt(e.target.value) || 10 })}
              />
            </Grid>
            
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Saves"
                type="number"
                inputProps={{ min: -10, max: 30 }}
                value={editingShip.saves}
                onChange={(e) => setEditingShip({ ...editingShip, saves: parseInt(e.target.value) || 0 })}
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

      {/* Damage/Repair Dialog */}
      <Dialog open={damageRepairDialogOpen} onClose={() => setDamageRepairDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {damageRepairData.type === 'damage' ? 'Apply Damage' : 'Repair Ship'} - {selectedShip?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Current HP: {selectedShip?.current_hp || 0} / {selectedShip?.max_hp || 100}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Status: {selectedShip ? getShipStatusLabel(selectedShip) : 'Unknown'}
            </Typography>
            
            <TextField
              fullWidth
              label={damageRepairData.type === 'damage' ? 'Damage Amount' : 'Repair Amount'}
              type="number"
              inputProps={{ 
                min: 1, 
                max: damageRepairData.type === 'damage' 
                  ? selectedShip?.current_hp || 0
                  : (selectedShip?.max_hp || 100) - (selectedShip?.current_hp || 0)
              }}
              value={damageRepairData.amount}
              onChange={(e) => setDamageRepairData({ 
                ...damageRepairData, 
                amount: parseInt(e.target.value) || 0 
              })}
              helperText={
                damageRepairData.type === 'damage' 
                  ? `Maximum damage: ${selectedShip?.current_hp || 0}`
                  : `Maximum repair: ${(selectedShip?.max_hp || 100) - (selectedShip?.current_hp || 0)}`
              }
              sx={{ mt: 2 }}
            />
            
            {damageRepairData.amount > 0 && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="subtitle2">Preview:</Typography>
                <Typography variant="body2">
                  {damageRepairData.type === 'damage' 
                    ? `New HP: ${Math.max(0, (selectedShip?.current_hp || 0) - damageRepairData.amount)}`
                    : `New HP: ${Math.min((selectedShip?.max_hp || 100), (selectedShip?.current_hp || 0) + damageRepairData.amount)}`
                  } / {selectedShip?.max_hp || 100}
                </Typography>
                {damageRepairData.type === 'damage' && (selectedShip?.current_hp || 0) - damageRepairData.amount <= 0 && (
                  <Typography variant="body2" color="error">
                    ⚠️ This will sink the ship!
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDamageRepairDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleApplyDamageRepair} 
            variant="contained"
            color={damageRepairData.type === 'damage' ? 'warning' : 'success'}
            disabled={!damageRepairData.amount || damageRepairData.amount <= 0}
          >
            {damageRepairData.type === 'damage' ? 'Apply Damage' : 'Repair Ship'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ShipManagement;
