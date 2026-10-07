import React, { useEffect, useState } from 'react';
import {
  Container, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Grid, Card, CardContent, CardHeader, Box, Alert, CircularProgress,
  Tabs, Tab, TablePagination, useMediaQuery, useTheme
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Home as OutpostIcon, People as PeopleIcon, LocationOn as LocationIcon,
  DateRange as DateIcon
} from '@mui/icons-material';
import outpostService from '../../services/outpostService';
import crewService from '../../services/crewService';
import { formatInCampaignTimezone } from '../../utils/timezoneUtils';
import { useIsDM } from '../../contexts/CampaignContext';
import { getErrorMessage } from '../../utils/apiErrors';
import ConfirmDialog from '../common/ConfirmDialog';
import IconCell from '../common/IconCell';
import PageLoading from '../common/PageLoading';
import TabPanel from '../common/TabPanel';

interface Outpost {
  id: number;
  name: string;
  location: string | null;
  access_date?: string | null;
  crew_count?: number | string;
}

interface OutpostCrewMember {
  id: number;
  name: string;
  race?: string | null;
}

interface OutpostForm {
  name: string;
  location: string;
  access_date: string;
}

const EMPTY_FORM: OutpostForm = { name: '', location: '', access_date: '' };
const TAB_PADDING = { xs: 1, md: 3 };

/**
 * access_date is a calendar date (YYYY-MM-DD), not an instant: format its date
 * part in UTC so the campaign timezone cannot shift it to the previous day.
 */
const formatCalendarDate = (value?: string | null): string => {
  const day = value ? value.slice(0, 10) : '';
  return day ? formatInCampaignTimezone(`${day}T00:00:00Z`, 'UTC', 'PP') : 'Unknown';
};

const OutpostManagement: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  // Deleting is DM-only; every member can still create and edit
  const isDM = useIsDM();
  const [outposts, setOutposts] = useState<Outpost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [tabValue, setTabValue] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Dialog target (edit / delete) is separate from the Details tab selection
  const [outpostDialogOpen, setOutpostDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dialogOutpost, setDialogOutpost] = useState<Outpost | null>(null);
  const [editingOutpost, setEditingOutpost] = useState<OutpostForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Details tab: the selection is an id, so edits and deletes show up at once
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [selectedOutpostCrew, setSelectedOutpostCrew] = useState<OutpostCrewMember[]>([]);
  const [loadingCrew, setLoadingCrew] = useState(false);
  const detailsOutpost = outposts.find((o) => o.id === detailsId) ?? null;

  const fetchOutposts = async () => {
    try {
      const response = await outpostService.getAllOutposts();
      setOutposts(response.data.outposts);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load outposts'));
    }
  };

  useEffect(() => {
    const initialLoad = async () => {
      await fetchOutposts();
      setLoading(false);
    };
    initialLoad();
  }, []);

  // The Details tab has nothing to show once its outpost is gone
  useEffect(() => {
    if (tabValue === 1 && !detailsOutpost) setTabValue(0);
  }, [tabValue, detailsOutpost]);

  // Keep the list page valid when the list shrinks
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(outposts.length / rowsPerPage) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [outposts.length, rowsPerPage, page]);

  const fetchOutpostCrew = async (outpostId: number) => {
    setSelectedOutpostCrew([]);
    setLoadingCrew(true);
    try {
      const response = await crewService.getCrewByLocation('outpost', outpostId);
      setSelectedOutpostCrew(response.data.crew);
    } catch {
      setSelectedOutpostCrew([]);
    } finally {
      setLoadingCrew(false);
    }
  };

  const handleCreateOutpost = () => {
    setEditingOutpost(EMPTY_FORM);
    setDialogOutpost(null);
    setError('');
    setSuccess('');
    setOutpostDialogOpen(true);
  };

  const handleEditOutpost = (outpost: Outpost) => {
    setEditingOutpost({
      name: outpost.name,
      location: outpost.location || '',
      access_date: outpost.access_date ? outpost.access_date.split('T')[0] : ''
    });
    setDialogOutpost(outpost);
    setError('');
    setSuccess('');
    setOutpostDialogOpen(true);
  };

  const handleSaveOutpost = async () => {
    setError('');
    setSuccess('');
    if (!editingOutpost.name.trim()) {
      setError('Outpost name is required');
      return;
    }

    const outpostData = {
      ...editingOutpost,
      access_date: editingOutpost.access_date || null
    };

    setSaving(true);
    try {
      if (dialogOutpost) {
        await outpostService.updateOutpost(dialogOutpost.id, outpostData);
        setSuccess('Outpost updated successfully');
      } else {
        await outpostService.createOutpost(outpostData);
        setSuccess('Outpost created successfully');
      }
      setOutpostDialogOpen(false);
      await fetchOutposts();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save outpost'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOutpost = async () => {
    if (!dialogOutpost) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await outpostService.deleteOutpost(dialogOutpost.id);
      setSuccess('Outpost deleted successfully');
      if (detailsId === dialogOutpost.id) {
        setDetailsId(null);
        setSelectedOutpostCrew([]);
      }
      setDeleteDialogOpen(false);
      await fetchOutposts();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete outpost'));
      setDeleteDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleViewOutpostDetails = async (outpost: Outpost) => {
    setDetailsId(outpost.id);
    setTabValue(1);
    await fetchOutpostCrew(outpost.id);
  };

  if (loading) {
    return <PageLoading label="Loading outposts..." />;
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: { xs: 1.5, md: 3 }, mb: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 1, mb: 2 }}>
          <Typography variant="h4" component="h1">
            <OutpostIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Outpost Management
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateOutpost}
          >
            Add Outpost
          </Button>
        </Box>

        {!outpostDialogOpen && error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab label="Outpost List" />
          <Tab label="Outpost Details" disabled={!detailsOutpost} />
        </Tabs>

        <TabPanel value={tabValue} index={0} padding={TAB_PADDING}>
          <TableContainer sx={{ WebkitOverflowScrolling: 'touch' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Access Date</TableCell>
                  <TableCell>Crew</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {outposts
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((outpost) => (
                  <TableRow key={outpost.id}>
                    <TableCell>
                      <IconCell icon={<OutpostIcon sx={{ mr: 1 }} />}>
                        <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                          {outpost.name}
                        </Typography>
                      </IconCell>
                    </TableCell>
                    <TableCell>
                      {outpost.location ? (
                        <IconCell icon={<LocationIcon sx={{ mr: 1, fontSize: 16 }} />}>
                          {outpost.location}
                        </IconCell>
                      ) : (
                        <Typography sx={{ color: "text.secondary" }}>Unknown</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <IconCell icon={<DateIcon sx={{ mr: 1, fontSize: 16 }} />}>
                        {formatCalendarDate(outpost.access_date)}
                      </IconCell>
                    </TableCell>
                    <TableCell>
                      <IconCell icon={<PeopleIcon sx={{ mr: 1, fontSize: 16 }} />}>
                        {outpost.crew_count || 0}
                      </IconCell>
                    </TableCell>
                    <TableCell>
                      <IconButton onClick={() => handleViewOutpostDetails(outpost)} title="View Details">
                        <OutpostIcon />
                      </IconButton>
                      <IconButton onClick={() => handleEditOutpost(outpost)} title="Edit">
                        <EditIcon />
                      </IconButton>
                      {isDM && (
                        <IconButton
                          onClick={() => { setDialogOutpost(outpost); setDeleteDialogOpen(true); }}
                          title="Delete"
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            rowsPerPageOptions={[5, 10, 25]}
            component="div"
            count={outposts.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={1} padding={TAB_PADDING}>
          {detailsOutpost && (
            <Grid container spacing={3}>
              <Grid size={{xs: 12, md: 6}}>
                <Card>
                  <CardHeader title="Outpost Information" />
                  <CardContent>
                    <Typography variant="h6">{detailsOutpost.name}</Typography>
                    <Typography gutterBottom sx={{ color: "text.secondary" }}>
                      Location: {detailsOutpost.location || 'Unknown'}
                    </Typography>
                    <Typography sx={{ color: "text.secondary" }}>
                      Access Date: {formatCalendarDate(detailsOutpost.access_date)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{xs: 12, md: 6}}>
                <Card>
                  <CardHeader
                    title="Crew Members"
                    subheader={`${selectedOutpostCrew.length} crew members stationed`}
                  />
                  <CardContent>
                    {loadingCrew ? (
                      <CircularProgress size={24} />
                    ) : selectedOutpostCrew.length > 0 ? (
                      selectedOutpostCrew.map((crew) => (
                        <Box key={crew.id} sx={{ mb: 1, p: 1, border: '1px solid #eee', borderRadius: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                            {crew.name}
                          </Typography>
                          {crew.race && (
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              {crew.race}
                            </Typography>
                          )}
                        </Box>
                      ))
                    ) : (
                      <Typography sx={{ color: "text.secondary" }}>No crew members stationed</Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </TabPanel>
      </Paper>
      {/* Outpost Dialog */}
      <Dialog open={outpostDialogOpen} onClose={() => !saving && setOutpostDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {dialogOutpost ? 'Edit Outpost' : 'Create New Outpost'}
        </DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Outpost Name"
                value={editingOutpost.name}
                onChange={(e) => setEditingOutpost({ ...editingOutpost, name: e.target.value })}
                required
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Location"
                value={editingOutpost.location}
                onChange={(e) => setEditingOutpost({ ...editingOutpost, location: e.target.value })}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Access Date"
                type="date"
                value={editingOutpost.access_date}
                onChange={(e) => setEditingOutpost({ ...editingOutpost, access_date: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOutpostDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSaveOutpost} variant="contained" disabled={saving}>
            {dialogOutpost ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Outpost"
        confirmLabel="Delete"
        confirmColor="error"
        busy={saving}
        onConfirm={handleDeleteOutpost}
        onClose={() => setDeleteDialogOpen(false)}
      >
        Are you sure you want to delete "{dialogOutpost?.name}"? This action cannot be undone.
      </ConfirmDialog>
    </Container>
  );
};

export default OutpostManagement;
