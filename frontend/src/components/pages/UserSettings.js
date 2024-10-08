import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  TextField,
  Button,
  Typography,
  Container,
  Paper,
  Checkbox,
  FormControlLabel,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { styled } from '@mui/system';

const UserSettings = () => {
  const today = new Date().toISOString().split('T')[0];
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [characters, setCharacters] = useState([]);
  const [character, setCharacter] = useState({
    id: null,
    name: '',
    appraisal_bonus: '',
    birthday: today,
    deathday: '',
    active: true
  });
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCharacters = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await api.get(`/user/characters`);
        setCharacters(response.data);
      } catch (error) {
        console.error('Error fetching characters', error);
      }
    };

    fetchCharacters();
  }, []);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await api.put(
          `/user/change-password`,
          {oldPassword, newPassword}
      );
      setOldPassword('');
      setNewPassword('');
      alert('Password changed successfully');
    } catch (err) {
      setError('Error changing password');
    }
  };

  const handleCharacterSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...character,
        birthday: character.birthday || null,
        deathday: character.deathday || null
      };
      if (character.active) {
        // Ensure only one character is active at a time
        await api.put('/user/deactivate-all-characters', {});
      }
      const method = character.id ? 'put' : 'post';
      await api[method]('/user/characters', payload);
      setCharacter({id: null, name: '', appraisal_bonus: '', birthday: today, deathday: '', active: true});
      alert(`Character ${character.id ? 'updated' : 'added'} successfully`);
      // Refresh the character list
      const response = await api.get('/user/characters');
      setCharacters(response.data);
    } catch (error) {
      setError('Error saving character');
    }
  };

  const handleEditCharacter = (char) => {
    setCharacter({
      ...char,
      birthday: char.birthday ? formatDate(char.birthday) : '',
      deathday: char.deathday ? formatDate(char.deathday) : ''
    });
  };

  const handleCancelEdit = () => {
    setCharacter({ id: null, name: '', appraisal_bonus: '', birthday: today, deathday: '', active: true });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  const StyledTableRow = styled(TableRow)(({ theme, active }) => ({
    backgroundColor: active ? theme.palette.action.hover : 'inherit',
  }));

  // Sort characters with the active character on top
  const sortedCharacters = [...characters].sort((a, b) => b.active - a.active);

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Change Password</Typography>
        <form onSubmit={handlePasswordChange}>
          <TextField
            label="Old Password"
            type="password"
            fullWidth
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            margin="normal"
            autoComplete="current-password"
          />
          <TextField
            label="New Password"
            type="password"
            fullWidth
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            margin="normal"
            autoComplete="new-password"
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            sx={{ mt: 2 }}
          >
            Change Password
          </Button>
        </form>
        {error && <Typography color="error">{error}</Typography>}
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Your Characters</Typography>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Appraisal Bonus</TableCell>
                <TableCell>Birthday</TableCell>
                <TableCell>Deathday</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>Edit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedCharacters.map((char) => (
                <StyledTableRow key={char.id} active={char.active ? 1 : 0}>
                  <TableCell>{char.name}</TableCell>
                  <TableCell>{char.appraisal_bonus}</TableCell>
                  <TableCell>{formatDate(char.birthday)}</TableCell>
                  <TableCell>{formatDate(char.deathday)}</TableCell>
                  <TableCell>{char.active ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <Button variant="outlined" onClick={() => handleEditCharacter(char)}>
                      Edit
                    </Button>
                  </TableCell>
                </StyledTableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">{character.id ? 'Edit Character' : 'Add Character'}</Typography>
        <form onSubmit={handleCharacterSubmit}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label="Character Name"
                fullWidth
                value={character.name || ''}
                onChange={(e) => setCharacter({ ...character, name: e.target.value })}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Appraisal Bonus"
                type="number"
                fullWidth
                value={character.appraisal_bonus || ''}
                onChange={(e) => setCharacter({ ...character, appraisal_bonus: e.target.value })}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Birthday"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={character.birthday || ''}
                onChange={(e) => setCharacter({ ...character, birthday: e.target.value })}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Deathday"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={character.deathday || ''}
                onChange={(e) => setCharacter({ ...character, deathday: e.target.value })}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={character.active}
                    onChange={(e) => setCharacter({ ...character, active: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Grid>
          </Grid>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            sx={{ mt: 2 }}
          >
            {character.id ? 'Update Character' : 'Add Character'}
          </Button>
          {character.id && (
            <Button
              variant="contained"
              color="secondary"
              sx={{ mt: 2, ml: 2 }}
              onClick={handleCancelEdit}
            >
              Cancel
            </Button>
          )}
        </form>
        {error && <Typography color="error">{error}</Typography>}
      </Paper>
    </Container>
  );
};

export default UserSettings;
