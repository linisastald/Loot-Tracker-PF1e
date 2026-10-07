import React, { useCallback, useEffect, useState } from 'react';
import {
  Container, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Chip, Box, Alert, Tabs, Tab, TablePagination,
  useMediaQuery, useTheme
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  DirectionsBoat as ShipIcon, People as PeopleIcon, LocationOn as LocationIcon,
  Warning as WarningIcon, LocalHospital as HealIcon,
  Security as ShieldIcon, Speed as InitiativeIcon
} from '@mui/icons-material';
import shipService from '../../services/shipService';
import crewService from '../../services/crewService';
import { getErrorMessage } from '../../utils/apiErrors';
import ShipDialog from './ShipDialog';
import ConfirmDialog from '../common/ConfirmDialog';
import IconCell from '../common/IconCell';
import PageLoading from '../common/PageLoading';
import TabPanel from '../common/TabPanel';
import { useIsDM } from '../../contexts/CampaignContext';
import DamageRepairDialog, { DamageRepairType } from './ships/DamageRepairDialog';
import ShipDetails from './ships/ShipDetails';
import {
  CrewMember, NEW_SHIP_FORM, Ship, ShipForm, ShipTypeOption,
  formatSigned, getHullStatus, getShipStatusChipColor, toShipForm
} from './ships/shipUtils';

const TAB_PADDING = { xs: 1, md: 3 };

const ShipManagement: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  // Deleting is DM-only; every member can still create and edit
  const isDM = useIsDM();
  const [ships, setShips] = useState<Ship[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Ship types data
  const [shipTypes, setShipTypes] = useState<ShipTypeOption[]>([]);
  const [loadingShipTypes, setLoadingShipTypes] = useState(false);

  // Ships the open dialogs and the details tab point at. Only ids are stored: the
  // ship itself is looked up in the refreshed list, so it never goes stale.
  const [detailsShipId, setDetailsShipId] = useState<number | null>(null);
  const [editShipId, setEditShipId] = useState<number | null>(null); // null = creating
  const [deleteShipId, setDeleteShipId] = useState<number | null>(null);
  const [damageShipId, setDamageShipId] = useState<number | null>(null);

  // Dialog states
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [editingShip, setEditingShip] = useState<ShipForm>(NEW_SHIP_FORM);
  const [damageRepairData, setDamageRepairData] = useState<{ amount: number; type: DamageRepairType }>({
    amount: 0,
    type: 'damage'
  });

  // Crew data for detail view
  const [selectedShipCrew, setSelectedShipCrew] = useState<CrewMember[]>([]);
  const [loadingCrew, setLoadingCrew] = useState(false);

  const shipById = useCallback(
    (id: number | null): Ship | null => (id == null ? null : ships.find((ship) => ship.id === id) || null),
    [ships]
  );
  const detailsShip = shipById(detailsShipId);
  const deleteShip = shipById(deleteShipId);
  const damageShip = shipById(damageShipId);

  const fetchShips = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      const response = await shipService.getAllShips();
      setShips(response.data.ships);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load ships'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShips(true);
    (async () => {
      try {
        setLoadingShipTypes(true);
        const response = await shipService.getShipTypes();
        setShipTypes(response.data.shipTypes);
      } catch {
        // The type picker is optional: a ship can be entered by hand.
        setShipTypes([]);
      } finally {
        setLoadingShipTypes(false);
      }
    })();
  }, [fetchShips]);

  // Load the crew of the ship shown on the details tab
  useEffect(() => {
    if (detailsShipId == null) {
      setSelectedShipCrew([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingCrew(true);
    crewService.getCrewByLocation('ship', detailsShipId)
      .then((response: { data: { crew: CrewMember[] } }) => {
        if (!cancelled) setSelectedShipCrew(response.data.crew);
      })
      .catch(() => {
        if (!cancelled) setSelectedShipCrew([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCrew(false);
      });
    return () => { cancelled = true; };
  }, [detailsShipId]);

  // A deleted ship cannot stay open on the details tab
  useEffect(() => {
    if (!loading && detailsShipId != null && !detailsShip) {
      setDetailsShipId(null);
      setTabValue(0);
    }
  }, [loading, detailsShipId, detailsShip]);

  // Keep the page inside the list after rows are deleted
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(ships.length / rowsPerPage) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [ships.length, rowsPerPage, page]);

  const handleShipTypeChange = async (shipType: ShipTypeOption | null) => {
    if (!shipType) {
      setEditingShip(prev => ({ ...prev, ship_type: null }));
      return;
    }
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
    } catch (err) {
      setDialogError(getErrorMessage(err, 'Failed to load ship type data'));
    }
  };

  const openShipDialog = (shipId: number | null, form: ShipForm) => {
    setEditingShip(form);
    setEditShipId(shipId);
    setDialogError('');
    setShipDialogOpen(true);
  };

  const handleCreateShip = () => openShipDialog(null, NEW_SHIP_FORM);

  const handleEditShip = (ship: Ship) => openShipDialog(ship.id, toShipForm(ship));

  const handleSaveShip = async () => {
    if (!editingShip.name.trim()) {
      setDialogError('Ship name is required');
      return;
    }

    // Current HP can never exceed max HP (the server rejects it)
    const payload: ShipForm = {
      ...editingShip,
      current_hp: Math.min(editingShip.current_hp ?? 0, editingShip.max_hp ?? 0)
    };

    try {
      if (editShipId != null) {
        await shipService.updateShip(editShipId, payload);
        setSuccess('Ship updated successfully');
      } else {
        await shipService.createShip(payload);
        setSuccess('Ship created successfully');
      }

      setShipDialogOpen(false);
      setError('');
      await fetchShips();
    } catch (err) {
      setDialogError(getErrorMessage(err, 'Failed to save ship'));
    }
  };

  const handleDeleteShip = async () => {
    if (deleteShipId == null) return;
    try {
      await shipService.deleteShip(deleteShipId);
      setSuccess('Ship deleted successfully');
      setDeleteShipId(null);
      setError('');
      await fetchShips();
    } catch (err) {
      setDeleteShipId(null);
      setError(getErrorMessage(err, 'Failed to delete ship'));
    }
  };

  const handleViewShipDetails = (ship: Ship) => {
    setDetailsShipId(ship.id);
    setTabValue(1);
  };

  const handleDamageRepairShip = (ship: Ship, type: DamageRepairType) => {
    setDamageShipId(ship.id);
    setDamageRepairData({ amount: 0, type });
  };

  const handleApplyDamageRepair = async () => {
    if (damageShipId == null) return;
    const { amount, type } = damageRepairData;
    if (!amount || amount <= 0) {
      setError('Amount must be a positive number');
      return;
    }

    try {
      const response = type === 'damage'
        ? await shipService.applyDamage(damageShipId, amount)
        : await shipService.repairShip(damageShipId, amount);

      setSuccess(response.data.message || `${type === 'damage' ? 'Damage applied' : 'Ship repaired'} successfully`);
      setDamageShipId(null);
      setError('');
      await fetchShips();
    } catch (err) {
      setDamageShipId(null);
      setError(getErrorMessage(err, `Failed to ${type === 'damage' ? 'apply damage' : 'repair ship'}`));
    }
  };

  if (loading) {
    return <PageLoading label="Loading ships..." />;
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 1.5, md: 3 }, mb: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 1, mb: 2 }}>
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

        <Tabs value={tabValue} onChange={(e, newValue: number) => setTabValue(newValue)}>
          <Tab label="Ship List" />
          <Tab label="Ship Details" disabled={!detailsShip} />
        </Tabs>

        <TabPanel value={tabValue} index={0} padding={TAB_PADDING}>
          <TableContainer sx={{ WebkitOverflowScrolling: 'touch' }}>
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
                  .map((ship) => {
                    const hull = getHullStatus(ship);
                    const initiative = ship.initiative ?? 0;
                    return (
                      <TableRow key={ship.id}>
                        <TableCell>
                          <IconCell icon={<ShipIcon sx={{ mr: 1 }} />}>
                            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                              {ship.name}
                            </Typography>
                          </IconCell>
                        </TableCell>
                        <TableCell>
                          {ship.location ? (
                            <IconCell icon={<LocationIcon sx={{ mr: 1, fontSize: 16 }} />}>
                              {ship.location}
                            </IconCell>
                          ) : (
                            <Typography sx={{ color: 'text.secondary' }}>Unknown</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={ship.status || 'Active'}
                            color={getShipStatusChipColor(ship.status)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <IconCell icon={<PeopleIcon sx={{ mr: 1, fontSize: 16 }} />}>
                            {ship.crew_count || 0}
                          </IconCell>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2">
                              {ship.current_hp ?? 0}/{ship.max_hp ?? 100}
                            </Typography>
                            <Chip
                              label={hull.label}
                              color={hull.color}
                              size="small"
                              icon={ship.current_hp === 0 ? <WarningIcon /> : undefined}
                            />
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip label={`AC ${ship.base_ac ?? 10}`} size="small" icon={<ShieldIcon />} />
                            <Chip label={`Init ${formatSigned(initiative)}`} size="small" icon={<InitiativeIcon />} />
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
                            disabled={(ship.current_hp ?? 0) >= (ship.max_hp ?? 100)}
                          >
                            <HealIcon />
                          </IconButton>
                          {isDM && (
                            <IconButton
                              onClick={() => setDeleteShipId(ship.id)}
                              title="Delete"
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={1} padding={TAB_PADDING}>
          {detailsShip && (
            <ShipDetails
              ship={detailsShip}
              crew={selectedShipCrew}
              loadingCrew={loadingCrew}
              onDamage={(ship) => handleDamageRepairShip(ship, 'damage')}
              onRepair={(ship) => handleDamageRepairShip(ship, 'repair')}
            />
          )}
        </TabPanel>
      </Paper>

      <ShipDialog
        open={shipDialogOpen}
        onClose={() => setShipDialogOpen(false)}
        selectedShip={editShipId != null ? shipById(editShipId) : null}
        editingShip={editingShip}
        setEditingShip={setEditingShip}
        shipTypes={shipTypes}
        loadingShipTypes={loadingShipTypes}
        onShipTypeChange={handleShipTypeChange}
        onSave={handleSaveShip}
        error={dialogError}
        fullScreen={isMobile}
      />

      <ConfirmDialog
        open={deleteShip != null}
        title="Delete Ship"
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDeleteShip}
        onClose={() => setDeleteShipId(null)}
      >
        Are you sure you want to delete &quot;{deleteShip?.name}&quot;? This action cannot be undone.
      </ConfirmDialog>

      <DamageRepairDialog
        open={damageShip != null}
        ship={damageShip}
        type={damageRepairData.type}
        amount={damageRepairData.amount}
        onAmountChange={(amount) => setDamageRepairData({ ...damageRepairData, amount })}
        onClose={() => setDamageShipId(null)}
        onConfirm={handleApplyDamageRepair}
        fullScreen={isMobile}
      />
    </Container>
  );
};

export default ShipManagement;
