import React, { useEffect, useState } from 'react';
import {
  Container, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Grid, Card, CardContent, CardHeader, Chip, Box, Alert, CircularProgress,
  Switch, FormControlLabel, Tabs, Tab, TablePagination, Autocomplete, Divider,
  Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, 
  DirectionsBoat as ShipIcon, People as PeopleIcon, LocationOn as LocationIcon,
  Warning as WarningIcon, Build as RepairIcon, LocalHospital as HealIcon,
  Security as ShieldIcon, Speed as InitiativeIcon, ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import shipService from '../../services/shipService';
import crewService from '../../services/crewService';
import ShipDialog from './ShipDialog';
import { SHIP_IMPROVEMENTS } from '../../data/shipData';

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

  // Ship types data
  const [shipTypes, setShipTypes] = useState([]);
  const [loadingShipTypes, setLoadingShipTypes] = useState(false);

  // Dialog states
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [damageRepairDialogOpen, setDamageRepairDialogOpen] = useState(false);
  const [selectedShip, setSelectedShip] = useState(null);
  const [editingShip, setEditingShip] = useState({
    name: '',
    location: '',
    is_squibbing: false,
    ship_type: null,
    size: 'Colossal',
    cost: 0,
    max_speed: 30,
    acceleration: 15,
    propulsion: '',
    min_crew: 1,
    max_crew: 10,
    cargo_capacity: 10000,
    max_passengers: 10,
    decks: 1,
    weapons: [],
    ramming_damage: '1d8',
    base_ac: 10,
    touch_ac: 10,
    hardness: 0,
    max_hp: 100,
    current_hp: 100,
    cmb: 0,
    cmd: 10,
    saves: 0,
    initiative: 0,
    // Pirate campaign fields
    plunder: 0,
    infamy: 0,
    disrepute: 0,
    // Additional ship details
    sails_oars: '',
    sailing_check_bonus: 0,
    officers: [],
    improvements: [],
    cargo_manifest: { items: [], passengers: [], impositions: [] },
    ship_notes: '',
    captain_name: '',
    flag_description: ''
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
    fetchShipTypes();
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

  const fetchShipTypes = async () => {
    try {
      setLoadingShipTypes(true);
      const response = await shipService.getShipTypes();
      setShipTypes(response.data.shipTypes);
    } catch (error) {
      console.error('Error fetching ship types:', error);
    } finally {
      setLoadingShipTypes(false);
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

  const handleShipTypeChange = async (shipType) => {
    if (shipType) {
      try {
        const response = await shipService.getShipTypeData(shipType.key);
        const typeData = response.data;
        
        // Auto-fill ship data with type defaults
        setEditingShip(prev => ({
          ...prev,
          ship_type: shipType.key,
          size: typeData.size,
          cost: typeData.cost,
          max_speed: typeData.max_speed,
          acceleration: typeData.acceleration,
          propulsion: typeData.propulsion,
          min_crew: typeData.min_crew,
          max_crew: typeData.max_crew,
          cargo_capacity: typeData.cargo_capacity,
          max_passengers: typeData.max_passengers,
          decks: typeData.decks,
          weapons: typeData.typical_weapons || [],
          ramming_damage: typeData.ramming_damage,
          base_ac: typeData.base_ac,
          touch_ac: typeData.touch_ac,
          hardness: typeData.hardness,
          max_hp: typeData.max_hp,
          current_hp: typeData.max_hp, // Set current HP to max when creating
          cmb: typeData.cmb,
          cmd: typeData.cmd,
          saves: typeData.saves,
          initiative: typeData.initiative,
          sails_oars: typeData.sails_oars || '',
          sailing_check_bonus: typeData.sailing_check_bonus || 0,
          improvements: typeData.typical_improvements || []
        }));
        
        setSuccess(`Auto-filled ship stats for ${typeData.name}`);
      } catch (error) {
        setError('Failed to load ship type data');
        console.error('Error fetching ship type data:', error);
      }
    } else {
      // Clear ship type
      setEditingShip(prev => ({ ...prev, ship_type: null }));
    }
  };

  const handleCreateShip = () => {
    setEditingShip({
      name: '',
      location: '',
      is_squibbing: false,
      ship_type: null,
      size: 'Colossal',
      cost: 0,
      max_speed: 30,
      acceleration: 15,
      propulsion: '',
      min_crew: 1,
      max_crew: 10,
      cargo_capacity: 10000,
      max_passengers: 10,
      decks: 1,
      weapons: [],
      ramming_damage: '1d8',
      base_ac: 10,
      touch_ac: 10,
      hardness: 0,
      max_hp: 100,
      current_hp: 100,
      cmb: 0,
      cmd: 10,
      saves: 0,
      initiative: 0,
      plunder: 0,
      infamy: 0,
      disrepute: 0,
      sails_oars: '',
      sailing_check_bonus: 0,
      officers: [],
      improvements: [],
      cargo_manifest: { items: [], passengers: [], impositions: [] },
      ship_notes: '',
      captain_name: '',
      flag_description: ''
    });
    setSelectedShip(null);
    setShipDialogOpen(true);
  };

  const handleEditShip = (ship) => {
    const currentShipType = shipTypes.find(type => type.key === ship.ship_type);
    
    setEditingShip({
      name: ship.name,
      location: ship.location || '',
      is_squibbing: ship.is_squibbing || false,
      ship_type: ship.ship_type || null,
      size: ship.size || 'Colossal',
      cost: ship.cost || 0,
      max_speed: ship.max_speed || 30,
      acceleration: ship.acceleration || 15,
      propulsion: ship.propulsion || '',
      min_crew: ship.min_crew || 1,
      max_crew: ship.max_crew || 10,
      cargo_capacity: ship.cargo_capacity || 10000,
      max_passengers: ship.max_passengers || 10,
      decks: ship.decks || 1,
      weapons: ship.weapons || [],
      ramming_damage: ship.ramming_damage || '1d8',
      base_ac: ship.base_ac || 10,
      touch_ac: ship.touch_ac || 10,
      hardness: ship.hardness || 0,
      max_hp: ship.max_hp || 100,
      current_hp: ship.current_hp || 100,
      cmb: ship.cmb || 0,
      cmd: ship.cmd || 10,
      saves: ship.saves || 0,
      initiative: ship.initiative || 0,
      plunder: ship.plunder || 0,
      infamy: ship.infamy || 0,
      disrepute: ship.disrepute || 0,
      sails_oars: ship.sails_oars || '',
      sailing_check_bonus: ship.sailing_check_bonus || 0,
      officers: ship.officers || [],
      improvements: ship.improvements || [],
      cargo_manifest: ship.cargo_manifest || { items: [], passengers: [], impositions: [] },
      ship_notes: ship.ship_notes || '',
      captain_name: ship.captain_name || '',
      flag_description: ship.flag_description || ''
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

  const handleAddWeapon = () => {
    if (editingShip.weapons.length >= 4) {
      setError('Maximum of 4 weapons allowed per ship');
      return;
    }
    
    const newWeapon = {
      name: '',
      type: 'direct-fire',
      range: '',
      crew: 1,
      aim: 2,
      load: 3,
      damage: '',
      ammunition: '',
      critical: 'x2',
      attack_bonus: '+0',
      mount: 'port'
    };
    
    setEditingShip(prev => ({
      ...prev,
      weapons: [...prev.weapons, newWeapon]
    }));
  };

  const handleRemoveWeapon = (index) => {
    setEditingShip(prev => ({
      ...prev,
      weapons: prev.weapons.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateWeapon = (index, field, value) => {
    setEditingShip(prev => ({
      ...prev,
      weapons: prev.weapons.map((weapon, i) => 
        i === index ? { ...weapon, [field]: value } : weapon
      )
    }));
  };

  const handleAddOfficer = () => {
    const newOfficer = { position: '', name: '' };
    setEditingShip(prev => ({
      ...prev,
      officers: [...prev.officers, newOfficer]
    }));
  };

  const handleRemoveOfficer = (index) => {
    setEditingShip(prev => ({
      ...prev,
      officers: prev.officers.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateOfficer = (index, field, value) => {
    setEditingShip(prev => ({
      ...prev,
      officers: prev.officers.map((officer, i) => 
        i === index ? { ...officer, [field]: value } : officer
      )
    }));
  };

  const handleAddImprovement = () => {
    const improvement = prompt('Enter ship improvement:');
    if (improvement && improvement.trim()) {
      setEditingShip(prev => ({
        ...prev,
        improvements: [...prev.improvements, improvement.trim()]
      }));
    }
  };

  const handleRemoveImprovement = (index) => {
    setEditingShip(prev => ({
      ...prev,
      improvements: prev.improvements.filter((_, i) => i !== index)
    }));
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
              {/* Basic Ship Information */}
              <Grid item xs={12} md={6}>
                <Card>
                  <CardHeader title="Ship Information" />
                  <CardContent>
                    <Typography variant="h6">{selectedShip.name}</Typography>
                    
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" color="primary">Ship Type</Typography>
                        <Typography variant="body2">
                          {selectedShip.ship_type || 'Not specified'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Size</Typography>
                        <Typography variant="body2">{selectedShip.size || 'Colossal'}</Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Cost</Typography>
                        <Typography variant="body2">{selectedShip.cost || 0} gp</Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Location</Typography>
                        <Typography variant="body2">{selectedShip.location || 'Unknown'}</Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Status</Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          <Chip
                            label={selectedShip.is_squibbing ? 'Squibbing' : 'Active'}
                            color={selectedShip.is_squibbing ? 'warning' : 'success'}
                            size="small"
                          />
                          <Chip
                            label={getShipStatusLabel(selectedShip)}
                            color={getShipStatusColor(selectedShip)}
                            size="small"
                          />
                        </Box>
                      </Grid>
                      
                      {selectedShip.captain_name && (
                        <Grid item xs={12}>
                          <Typography variant="subtitle2" color="primary">Captain</Typography>
                          <Typography variant="body2">{selectedShip.captain_name}</Typography>
                        </Grid>
                      )}
                      
                      {selectedShip.ship_notes && (
                        <Grid item xs={12}>
                          <Typography variant="subtitle2" color="primary">Notes</Typography>
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                            {selectedShip.ship_notes}
                          </Typography>
                        </Grid>
                      )}
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>

              {/* Physical Characteristics */}
              <Grid item xs={12} md={6}>
                <Card>
                  <CardHeader title="Physical Characteristics" />
                  <CardContent>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Max Speed</Typography>
                        <Typography variant="body2">{selectedShip.max_speed || 30} ft.</Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Acceleration</Typography>
                        <Typography variant="body2">{selectedShip.acceleration || 15} ft.</Typography>
                      </Grid>
                      
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" color="primary">Propulsion</Typography>
                        <Typography variant="body2">{selectedShip.propulsion || 'Not specified'}</Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Crew Requirements</Typography>
                        <Typography variant="body2">
                          {selectedShip.min_crew || 1} - {selectedShip.max_crew || 10}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Decks</Typography>
                        <Typography variant="body2">{selectedShip.decks || 1}</Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Cargo Capacity</Typography>
                        <Typography variant="body2">{selectedShip.cargo_capacity || 10000} lbs</Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Max Passengers</Typography>
                        <Typography variant="body2">{selectedShip.max_passengers || 10}</Typography>
                      </Grid>
                      
                      {selectedShip.sails_oars && (
                        <Grid item xs={12}>
                          <Typography variant="subtitle2" color="primary">Sails/Oars</Typography>
                          <Typography variant="body2">{selectedShip.sails_oars}</Typography>
                        </Grid>
                      )}
                      
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" color="primary">Sailing Check Bonus</Typography>
                        <Typography variant="body2">
                          {selectedShip.sailing_check_bonus >= 0 ? '+' : ''}{selectedShip.sailing_check_bonus || 0}
                        </Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>

              {/* Combat Statistics */}
              <Grid item xs={12} md={6}>
                <Card>
                  <CardHeader title="Combat Statistics" />
                  <CardContent>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Hit Points</Typography>
                        <Typography variant="h6">
                          {selectedShip.current_hp || 0} / {selectedShip.max_hp || 100}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Hardness</Typography>
                        <Typography variant="body2">{selectedShip.hardness || 0}</Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Base AC</Typography>
                        <Typography variant="body2">{selectedShip.base_ac || 10}</Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Touch AC</Typography>
                        <Typography variant="body2">{selectedShip.touch_ac || 10}</Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">CMB</Typography>
                        <Typography variant="body2">
                          {selectedShip.cmb >= 0 ? '+' : ''}{selectedShip.cmb || 0}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">CMD</Typography>
                        <Typography variant="body2">{selectedShip.cmd || 10}</Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Saves</Typography>
                        <Typography variant="body2">
                          {selectedShip.saves >= 0 ? '+' : ''}{selectedShip.saves || 0}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6}>
                        <Typography variant="subtitle2" color="primary">Initiative</Typography>
                        <Typography variant="body2">
                          {selectedShip.initiative >= 0 ? '+' : ''}{selectedShip.initiative || 0}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" color="primary">Ramming Damage</Typography>
                        <Typography variant="body2">{selectedShip.ramming_damage || '1d8'}</Typography>
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
                        size="small"
                      >
                        Apply Damage
                      </Button>
                      <Button
                        variant="outlined"
                        color="success"
                        startIcon={<HealIcon />}
                        onClick={() => handleDamageRepairShip(selectedShip, 'repair')}
                        disabled={selectedShip.current_hp >= selectedShip.max_hp}
                        size="small"
                      >
                        Repair Ship
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              {/* Weapons */}
              <Grid item xs={12} md={6}>
                <Card>
                  <CardHeader title="Ship Weapons" />
                  <CardContent>
                    {/* New weapon_types format */}
                    {selectedShip.weapon_types && selectedShip.weapon_types.length > 0 ? (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>Weapon Types</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {selectedShip.weapon_types.map((weaponType, index) => (
                            <Chip
                              key={index}
                              label={`${weaponType.type} (${weaponType.quantity})`}
                              variant="outlined"
                              size="small"
                            />
                          ))}
                        </Box>
                      </Box>
                    ) : null}
                    
                    {/* Legacy weapons format */}
                    {selectedShip.weapons && selectedShip.weapons.length > 0 ? (
                      <Box>
                        <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>Detailed Weapons</Typography>
                        {selectedShip.weapons.map((weapon, index) => (
                          <Box key={index} sx={{ mb: 1, p: 1, border: '1px solid #eee', borderRadius: 1 }}>
                            <Typography variant="body2" fontWeight="bold">
                              {weapon.name || `Weapon ${index + 1}`}
                            </Typography>
                            {weapon.type && (
                              <Typography variant="caption" color="text.secondary">
                                {weapon.type} | {weapon.damage} | {weapon.range}
                              </Typography>
                            )}
                          </Box>
                        ))}
                      </Box>
                    ) : null}
                    
                    {(!selectedShip.weapon_types || selectedShip.weapon_types.length === 0) && 
                     (!selectedShip.weapons || selectedShip.weapons.length === 0) && (
                      <Typography color="text.secondary">No weapons installed</Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Ship Improvements */}
              <Grid item xs={12}>
                <Card>
                  <CardHeader title="Ship Improvements" />
                  <CardContent>
                    {selectedShip.improvements && selectedShip.improvements.length > 0 ? (
                      <Box>
                        {selectedShip.improvements.map((improvementName, index) => {
                          const improvement = SHIP_IMPROVEMENTS[improvementName];
                          if (!improvement) {
                            // Fallback for custom improvements not in our data
                            return (
                              <Chip
                                key={index}
                                label={improvementName}
                                color="primary"
                                variant="outlined"
                                sx={{ mr: 1, mb: 1 }}
                              />
                            );
                          }
                          
                          return (
                            <Accordion key={improvementName} sx={{ mb: 1 }}>
                              <AccordionSummary
                                expandIcon={<ExpandMoreIcon />}
                                aria-controls={`improvement-${index}-content`}
                                id={`improvement-${index}-header`}
                              >
                                <Typography variant="h6" color="primary">
                                  {improvement.name}
                                </Typography>
                              </AccordionSummary>
                              <AccordionDetails>
                                <Box>
                                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    {improvement.description}
                                  </Typography>
                                  {Object.keys(improvement.effects).length > 0 && (
                                    <Box>
                                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>Effects:</Typography>
                                      <Box display="flex" flexWrap="wrap" gap={1}>
                                        {Object.entries(improvement.effects).map(([effect, value]) => (
                                          <Chip
                                            key={effect}
                                            label={`${effect.replace(/_/g, ' ')}: ${value}`}
                                            size="small"
                                            color="primary"
                                            variant="outlined"
                                          />
                                        ))}
                                      </Box>
                                    </Box>
                                  )}
                                </Box>
                              </AccordionDetails>
                            </Accordion>
                          );
                        })}
                      </Box>
                    ) : (
                      <Typography color="text.secondary">No improvements installed</Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Officers */}
              {selectedShip.officers && selectedShip.officers.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardHeader title="Officers" />
                    <CardContent>
                      {selectedShip.officers.map((officer, index) => (
                        <Box key={index} sx={{ mb: 1, p: 1, border: '1px solid #eee', borderRadius: 1 }}>
                          <Typography variant="body2" fontWeight="bold">
                            {officer.position}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {officer.name}
                          </Typography>
                        </Box>
                      ))}
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Pirate Campaign Stats */}
              {(selectedShip.plunder > 0 || selectedShip.infamy > 0 || selectedShip.disrepute > 0) && (
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardHeader title="Pirate Campaign Stats" />
                    <CardContent>
                      <Grid container spacing={2}>
                        <Grid item xs={4}>
                          <Typography variant="subtitle2" color="primary">Plunder</Typography>
                          <Typography variant="h6">{selectedShip.plunder || 0}</Typography>
                        </Grid>
                        
                        <Grid item xs={4}>
                          <Typography variant="subtitle2" color="primary">Infamy</Typography>
                          <Typography variant="h6">{selectedShip.infamy || 0}</Typography>
                        </Grid>
                        
                        <Grid item xs={4}>
                          <Typography variant="subtitle2" color="primary">Disrepute</Typography>
                          <Typography variant="h6">{selectedShip.disrepute || 0}</Typography>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Flag Description */}
              {selectedShip.flag_description && (
                <Grid item xs={12}>
                  <Card>
                    <CardHeader title="Ship's Flag" />
                    <CardContent>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {selectedShip.flag_description}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Crew Members */}
              <Grid item xs={12}>
                <Card>
                  <CardHeader 
                    title="Crew Members" 
                    subheader={`${selectedShipCrew.length} crew members aboard`}
                  />
                  <CardContent>
                    {loadingCrew ? (
                      <CircularProgress size={24} />
                    ) : selectedShipCrew.length > 0 ? (
                      <Grid container spacing={2}>
                        {selectedShipCrew.map((crew) => (
                          <Grid item xs={12} sm={6} md={4} key={crew.id}>
                            <Box sx={{ p: 2, border: '1px solid #eee', borderRadius: 1 }}>
                              <Typography variant="body2" fontWeight="bold">
                                {crew.name}
                                {crew.ship_position && (
                                  <Chip 
                                    label={crew.ship_position} 
                                    size="small" 
                                    sx={{ ml: 1 }} 
                                    color={crew.ship_position === 'captain' ? 'primary' : 'default'}
                                  />
                                )}
                              </Typography>
                              {crew.race && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  {crew.race}
                                </Typography>
                              )}
                              {crew.age && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Age: {crew.age}
                                </Typography>
                              )}
                              {crew.description && (
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                  {crew.description}
                                </Typography>
                              )}
                            </Box>
                          </Grid>
                        ))}
                      </Grid>
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
      <ShipDialog
        open={shipDialogOpen}
        onClose={() => setShipDialogOpen(false)}
        selectedShip={selectedShip}
        editingShip={editingShip}
        setEditingShip={setEditingShip}
        shipTypes={shipTypes}
        loadingShipTypes={loadingShipTypes}
        onShipTypeChange={handleShipTypeChange}
        onSave={handleSaveShip}
        onAddWeapon={handleAddWeapon}
        onRemoveWeapon={handleRemoveWeapon}
        onUpdateWeapon={handleUpdateWeapon}
        onAddOfficer={handleAddOfficer}
        onRemoveOfficer={handleRemoveOfficer}
        onUpdateOfficer={handleUpdateOfficer}
        onAddImprovement={handleAddImprovement}
        onRemoveImprovement={handleRemoveImprovement}
      />

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
