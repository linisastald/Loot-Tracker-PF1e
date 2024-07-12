import React, { useState, useEffect } from 'react';
import axios from 'axios';
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
  TableRow
} from '@mui/material';

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
        const response = await axios.get('http://192.168.0.64:5000/api/user/characters', {
          headers: { Authorization: `Bearer ${token}` },
        });
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
      await axios.put(
        'http://192.168.0.64:5000/api/user/change-password',
        { oldPassword, newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
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
      const token = localStorage.getItem('token');
      const url = character.id ? 'http://192.168.0.64:5000/api/user/characters' : 'http://192.168.0.64:5000/api/user/characters';
      const method = character.id ? 'put' : 'post';
      const payload = {
        ...character,
        birthday: character.birthday || null,
        deathday: character.deathday || null
      };
      if (character.active) {
        // Ensure only one character is active at a time
        await axios.put('http://192.168.0.64:5000/api/user/deactivate-all-characters', {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      await axios[method](
        url,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCharacter({ id: null, name: '', appraisal_bonus: '', birthday: today, deathday: '', active: true });
      alert(`Character ${character.id ? 'updated' : 'added'} successfully`);
      // Refresh the character list
      const response = await axios.get('http://192.168.0.64:5000/api/user/characters', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCharacters(response.data);
    } catch (error) {
      setError('Error saving character');
    }
  };

  const handleEditCharacter = (char) => {
    setCharacter({ ...char });
  };

  const handleCancelEdit = () => {
    setCharacter({ id: null, name: '', appraisal_bonus: '', birthday: today, deathday: '', active: true });
  };

  return (
    <Container component="main">
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
          />
          <TextField
            label="New Password"
            type="password"
            fullWidth
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            margin="normal"
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
              {characters.map((char) => (
                <TableRow key={char.id}>
                  <TableCell>{char.name}</TableCell>
                  <TableCell>{char.appraisal_bonus}</TableCell>
                  <TableCell>{char.birthday}</TableCell>
                  <TableCell>{char.deathday}</TableCell>
                  <TableCell>{char.active ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <Button variant="outlined" onClick={() => handleEditCharacter(char)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
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
                value={character.name}
                onChange={(e) => setCharacter({ ...character, name: e.target.value })}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Appraisal Bonus"
                type="number"
                fullWidth
                value={character.appraisal_bonus}
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
                value={character.birthday}
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
                value={character.deathday}
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
