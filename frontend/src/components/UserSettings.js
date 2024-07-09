import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { TextField, Button, Typography, Container, Paper, Checkbox, FormControlLabel, Grid } from '@mui/material';

const UserSettings = () => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [characters, setCharacters] = useState([]);
  const [character, setCharacter] = useState({ name: '', appraisal_bonus: '', birthday: '', deathday: '', active: true });
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

  const handlePasswordChange = async () => {
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

  const handleCharacterSubmit = async () => {
    try {
      const token = localStorage.getItem('token');
      const url = character.id ? 'http://192.168.0.64:5000/api/user/characters' : 'http://192.168.0.64:5000/api/user/characters';
      const method = character.id ? 'put' : 'post';
      await axios[method](
        url,
        character,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCharacter({ name: '', appraisal_bonus: '', birthday: '', deathday: '', active: true });
      alert(`Character ${character.id ? 'updated' : 'added'} successfully`);
    } catch (error) {
      setError('Error saving character');
    }
  };

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Change Password</Typography>
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
        <Button variant="contained" color="primary" onClick={handlePasswordChange} sx={{ mt: 2 }}>
          Change Password
        </Button>
        {error && <Typography color="error">{error}</Typography>}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">Manage Characters</Typography>
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
        <Button variant="contained" color="primary" onClick={handleCharacterSubmit} sx={{ mt: 2 }}>
          {character.id ? 'Update Character' : 'Add Character'}
        </Button>
        {error && <Typography color="error">{error}</Typography>}
      </Paper>
    </Container>
  );
};

export default UserSettings;
