import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';
import {
  Typography,
  Button,
  Box,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Switch,
  FormControlLabel,
  Card,
  CardContent,
  Divider,
  Alert,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon
} from '@mui/icons-material';
import HeartBrokenIcon from '@mui/icons-material/HeartBroken';

const CharacterTab = () => {
  const [characters, setCharacters] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState('add'); // 'add' or 'edit'
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [characterForm, setCharacterForm] = useState({
    name: '',
    appraisal_bonus: 0,
    birthday: '',
    deathday: '',
    active: false
  });

  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState(null);

  useEffect(() => {
    fetchCharacters();
  }, []);

  const fetchCharacters = async () => {
    try {
      const response = await api.get('/user/characters');
      setCharacters(response.data);
    } catch (error) {
      console.error('Error fetching characters:', error);
      setError('Failed to load characters');
    }
  };

  const handleOpenAddDialog = () => {
    setDialogMode('add');
    setCharacterForm({
      name: '',
      appraisal_bonus: 0,
      birthday: '',
      deathday: '',
      active: false
    });
    setOpenDialog(true);
  };

  const handleOpenEditDialog = (character) => {
    setDialogMode('edit');
    setSelectedCharacter(character);
    setCharacterForm({
      name: character.name,
      appraisal_bonus: character.appraisal_bonus || 0,
      birthday: character.birthday ? new Date(character.birthday).toISOString().split('T')[0] : '',
      deathday: character.deathday ? new Date(character.deathday).toISOString().split('T')[0] : '',
      active: character.active || false
    });
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedCharacter(null);
  };

  const handleFormChange = (e) => {
    const { name, value, checked } = e.target;
    setCharacterForm(prev => ({
      ...prev,
      [name]: name === 'active' ? checked : value
    }));
  };

  const handleSetActive = async (characterId) => {
    try {
      const character = characters.find(c => c.id === characterId);
      if (!character) return;

      // No need to update if already active
      if (character.active) return;

      // Prepare update data
      const updateData = {
        id: characterId,
        active: true
      };

      await api.put('/user/characters', updateData);
      setSuccess(`${character.name} is now your active character`);
      setError('');

      // Refresh character list
      fetchCharacters();
    } catch (error) {
      console.error('Error setting active character:', error);
      setError('Failed to set active character');
      setSuccess('');
    }
  };

  const handleKillCharacter = (character) => {
    setCharacterToDelete(character);
    setDeleteDialogOpen(true);
  };

  const confirmKillCharacter = async () => {
    try {
      // Create today's date in ISO format
      const today = new Date().toISOString().split('T')[0];

      // Update character to mark as deceased
      const updateData = {
        id: characterToDelete.id,
        deathday: today,
        active: false // If they die, they're no longer active
      };

      await api.put('/user/characters', updateData);
      setSuccess(`${characterToDelete.name} has fallen in battle. RIP.`);
      setError('');
      fetchCharacters();
      setDeleteDialogOpen(false);
      setCharacterToDelete(null);
    } catch (error) {
      console.error('Error updating character death:', error);
      setError('Failed to update character death status');
      setSuccess('');
    }
  };

  const handleSubmit = async () => {
    try {
      if (dialogMode === 'add') {
        // Add new character
        await api.post('/user/characters', characterForm);
        setSuccess('Character created successfully');
      } else {
        // Edit existing character
        const updateData = {
          ...characterForm,
          id: selectedCharacter.id
        };
        await api.put('/user/characters', updateData);
        setSuccess('Character updated successfully');
      }

      setError('');
      handleCloseDialog();
      fetchCharacters();
    } catch (error) {
      console.error('Error saving character:', error);
      setError('Failed to save character');
      setSuccess('');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';

    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      return 'Invalid date';
    }
  };

  return (
    <div>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Character Management</Typography>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleOpenAddDialog}
        >
          Add Character
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {characters.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="body1" align="center">
              You don't have any characters yet. Create one to get started!
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Appraisal Bonus</TableCell>
                <TableCell>Birthday</TableCell>
                <TableCell>Deathday</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {characters.map((character) => (
                <TableRow key={character.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {character.name}
                      {character.active && (
                        <Chip
                          size="small"
                          color="primary"
                          label="Active"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {character.deathday ? 'Deceased' : 'Alive'}
                  </TableCell>
                  <TableCell>+{character.appraisal_bonus || 0}</TableCell>
                  <TableCell>{formatDate(character.birthday)}</TableCell>
                  <TableCell>{formatDate(character.deathday)}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex' }}>
                      <Tooltip title="Set as Active Character">
                        <IconButton
                          color="primary"
                          onClick={() => handleSetActive(character.id)}
                          disabled={character.active}
                        >
                          {character.active ? <StarIcon /> : <StarBorderIcon />}
                        </IconButton>
                      </Tooltip>

                      <Tooltip title="Edit Character">
                        <IconButton
                          color="primary"
                          onClick={() => handleOpenEditDialog(character)}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>

                      <Tooltip title="Kill Character">
                        <IconButton
                          color="error"
                          onClick={() => handleKillCharacter(character)}
                          disabled={character.deathday !== null && character.deathday !== ''}
                        >
                          <HeartBrokenIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Character Form Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {dialogMode === 'add' ? 'Create New Character' : `Edit ${selectedCharacter?.name}`}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Character Name"
                name="name"
                fullWidth
                value={characterForm.name}
                onChange={handleFormChange}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Appraisal Bonus"
                name="appraisal_bonus"
                type="number"
                fullWidth
                value={characterForm.appraisal_bonus}
                onChange={handleFormChange}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={characterForm.active}
                    onChange={handleFormChange}
                    name="active"
                    color="primary"
                  />
                }
                label="Set as Active Character"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Birthday"
                name="birthday"
                type="date"
                fullWidth
                value={characterForm.birthday}
                onChange={handleFormChange}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Deathday (if applicable)"
                name="deathday"
                type="date"
                fullWidth
                value={characterForm.deathday}
                onChange={handleFormChange}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            color="primary"
            disabled={!characterForm.name.trim()}
          >
            {dialogMode === 'add' ? 'Create Character' : 'Update Character'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Kill Character Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Character Death</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure {characterToDelete?.name} has fallen in battle? This will mark the character as deceased with today's date.
          </Typography>
          {characterToDelete?.active && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              This character is currently active. Another character will need to be set as active after confirming death.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={confirmKillCharacter}
            variant="contained"
            color="error"
            startIcon={<HeartBrokenIcon />}
          >
            Confirm Death
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default CharacterTab;