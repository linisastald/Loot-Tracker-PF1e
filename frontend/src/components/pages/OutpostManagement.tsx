import React, { useEffect, useState } from 'react';
import {
  Container, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Grid, Card, CardContent, CardHeader, Box, Alert, CircularProgress,
  Tabs, Tab, TablePagination
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, 
  Home as OutpostIcon, People as PeopleIcon, LocationOn as LocationIcon,
  DateRange as DateIcon
} from '@mui/icons-material';
import outpostService from '../../services/outpostService';
import crewService from '../../services/crewService';

interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
}

interface Outpost {
  id: number;
  name: string;
  location: string;
  established_date: string;
  description?: string;
  status: string;
}

function TabPanel({ children, value, index, ...other }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const OutpostManagement: React.FC = () => {
  const [outposts, setOutposts] = useState<Outpost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [tabValue, setTabValue] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Dialog states
  const [outpostDialogOpen, setOutpostDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedOutpost, setSelectedOutpost] = useState(null);
  const [editingOutpost, setEditingOutpost] = useState({
    name: '',
    location: '',
    access_date: ''
  });

  // Crew data for detail view
  const [selectedOutpostCrew, setSelectedOutpostCrew] = useState([]);
  const [loadingCrew, setLoadingCrew] = useState(false);

  useEffect(() => {
    fetchOutposts();
  }, []);

  const fetchOutposts = async () => {
    try {
      setLoading(true);
      const response = await outpostService.getAllOutposts();
      setOutposts(response.data.outposts);
      setError('');
    } catch (error) {
      setError('Failed to load outposts');
      console.error('Error fetching outposts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOutpostCrew = async (outpostId) => {
    try {
      setLoadingCrew(true);
      const response = await crewService.getCrewByLocation('outpost', outpostId);
      setSelectedOutpostCrew(response.data.crew);
    } catch (error) {
      console.error('Error fetching outpost crew:', error);
      setSelectedOutpostCrew([]);
    } finally {
      setLoadingCrew(false);
    }
  };

  const handleCreateOutpost = () => {
    setEditingOutpost({ name: '', location: '', access_date: '' });
    setSelectedOutpost(null);
    setOutpostDialogOpen(true);
  };

  const handleEditOutpost = (outpost) => {
    setEditingOutpost({
      name: outpost.name,
      location: outpost.location || '',
      access_date: outpost.access_date ? outpost.access_date.split('T')[0] : ''
    });
    setSelectedOutpost(outpost);
    setOutpostDialogOpen(true);
  };

  const handleSaveOutpost = async () => {
    try {
      if (!editingOutpost.name.trim()) {
        setError('Outpost name is required');
        return;
      }

      const outpostData = {
        ...editingOutpost,
        access_date: editingOutpost.access_date || null
      };

      if (selectedOutpost) {
        await outpostService.updateOutpost(selectedOutpost.id, outpostData);
        setSuccess('Outpost updated successfully');
      } else {
        await outpostService.createOutpost(outpostData);
        setSuccess('Outpost created successfully');
      }

      setOutpostDialogOpen(false);
      fetchOutposts();
      setError('');
    } catch (error) {
      setError('Failed to save outpost');
      console.error('Error saving outpost:', error);
    }
  };

  const handleDeleteOutpost = async () => {
    try {
      await outpostService.deleteOutpost(selectedOutpost.id);
      setSuccess('Outpost deleted successfully');
      setDeleteDialogOpen(false);
      fetchOutposts();
      setError('');
    } catch (error) {
      setError('Failed to delete outpost');
      console.error('Error deleting outpost:', error);
    }
  };

  const handleViewOutpostDetails = async (outpost) => {
    setSelectedOutpost(outpost);
    setTabValue(1);
    await fetchOutpostCrew(outpost.id);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>Loading outposts...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
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

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab label="Outpost List" />
          <Tab label="Outpost Details" disabled={!selectedOutpost} />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <TableContainer>
            <Table>
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
                      <Box display="flex" alignItems="center">
                        <OutpostIcon sx={{ mr: 1 }} />
                        <Typography variant="body1" fontWeight="bold">
                          {outpost.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {outpost.location ? (
                        <Box display="flex" alignItems="center">
                          <LocationIcon sx={{ mr: 1, fontSize: 16 }} />
                          {outpost.location}
                        </Box>
                      ) : (
                        <Typography color="text.secondary">Unknown</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <DateIcon sx={{ mr: 1, fontSize: 16 }} />
                        {formatDate(outpost.access_date)}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <PeopleIcon sx={{ mr: 1, fontSize: 16 }} />
                        {outpost.crew_count || 0}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <IconButton onClick={() => handleViewOutpostDetails(outpost)} title="View Details">
                        <OutpostIcon />
                      </IconButton>
                      <IconButton onClick={() => handleEditOutpost(outpost)} title="Edit">
                        <EditIcon />
                      </IconButton>
                      <IconButton 
                        onClick={() => { setSelectedOutpost(outpost); setDeleteDialogOpen(true); }}
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
            count={outposts.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          {selectedOutpost && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardHeader title="Outpost Information" />
                  <CardContent>
                    <Typography variant="h6">{selectedOutpost.name}</Typography>
                    <Typography color="text.secondary" gutterBottom>
                      Location: {selectedOutpost.location || 'Unknown'}
                    </Typography>
                    <Typography color="text.secondary">
                      Access Date: {formatDate(selectedOutpost.access_date)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
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
                          <Typography variant="body2" fontWeight="bold">
                            {crew.name}
                          </Typography>
                          {crew.race && (
                            <Typography variant="caption" color="text.secondary">
                              {crew.race}
                            </Typography>
                          )}
                        </Box>
                      ))
                    ) : (
                      <Typography color="text.secondary">No crew members stationed</Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </TabPanel>
      </Paper>

      {/* Outpost Dialog */}
      <Dialog open={outpostDialogOpen} onClose={() => setOutpostDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedOutpost ? 'Edit Outpost' : 'Create New Outpost'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Outpost Name"
                value={editingOutpost.name}
                onChange={(e) => setEditingOutpost({ ...editingOutpost, name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Location"
                value={editingOutpost.location}
                onChange={(e) => setEditingOutpost({ ...editingOutpost, location: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Access Date"
                type="date"
                value={editingOutpost.access_date}
                onChange={(e) => setEditingOutpost({ ...editingOutpost, access_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOutpostDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveOutpost} variant="contained">
            {selectedOutpost ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Outpost</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{selectedOutpost?.name}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteOutpost} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default OutpostManagement;
