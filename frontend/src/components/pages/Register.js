// Register.js

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button, TextField, Typography, Container, Paper, MenuItem } from '@mui/material';
const API_URL = process.env.REACT_APP_API_URL;
const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Player');
  const [error, setError] = useState('');
  const [dmExists, setDmExists] = useState(false);
  const [registrationsOpen, setRegistrationsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkForDm = async () => {
      try {
        const response = await axios.get(`${API_URL}/auth/check-dm`);
        setDmExists(response.data.dmExists);
      } catch (error) {
        console.error('Error checking for DM', error);
      }
    };

    const checkRegistrationStatus = async () => {
      try {
        const response = await axios.get(`${API_URL}/auth/check-registration-status`);
        setRegistrationsOpen(response.data.isOpen);
      } catch (error) {
        console.error('Error checking registration status', error);
      }
    };

    checkForDm();
    checkRegistrationStatus();
  }, []);

  const handleRegister = async () => {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, { username, password, role });
      localStorage.setItem('token', response.data.token);
      navigate('/user-settings');
    } catch (err) {
      setError(err.response.data.error || 'Registration failed');
    }
  };

  if (!registrationsOpen) {
    return (
      <Container component="main" maxWidth="xs">
        <Paper sx={{ p: 2, mt: 8 }}>
          <Typography component="h1" variant="h5">
            Registrations are currently closed.
          </Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <Container component="main" maxWidth="xs">
      <Paper sx={{ p: 2, mt: 8 }}>
        <Typography component="h1" variant="h5">
          Register
        </Typography>
        <TextField
          variant="outlined"
          margin="normal"
          required
          fullWidth
          label="Username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <TextField
          variant="outlined"
          margin="normal"
          required
          fullWidth
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          select
          variant="outlined"
          margin="normal"
          required
          fullWidth
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={dmExists}
        >
          <MenuItem value="Player">Player</MenuItem>
          <MenuItem value="DM">DM</MenuItem>
        </TextField>
        {error && <Typography color="error">{error}</Typography>}
        <Button
          fullWidth
          variant="contained"
          color="primary"
          sx={{ mt: 3, mb: 2 }}
          onClick={handleRegister}
        >
          Register
        </Button>
      </Paper>
    </Container>
  );
};

export default Register;
