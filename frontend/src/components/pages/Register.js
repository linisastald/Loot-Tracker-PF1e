// frontend/src/components/pages/Register.js

import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import api from '../../utils/api';
import {
  Box,
  Button,
  Container,
  FormHelperText,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  TextField,
  Typography
} from '@mui/material';
import {Visibility, VisibilityOff} from '@mui/icons-material';

const Register = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('Player');
  const [error, setError] = useState('');
  const [dmExists, setDmExists] = useState(false);
  const [registrationsOpen, setRegistrationsOpen] = useState(false);
  const [inviteRequired, setInviteRequired] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkForDm = async () => {
      try {
        const response = await api.get(`/auth/check-dm`);
        setDmExists(response.data.dmExists);
      } catch (error) {
        console.error('Error checking for DM', error);
      }
    };

    const checkRegistrationStatus = async () => {
      try {
        const response = await api.get(`/auth/check-registration-status`);
        setRegistrationsOpen(response.data.isOpen);
      } catch (error) {
        console.error('Error checking registration status', error);
      }
    };

    const checkInviteRequired = async () => {
      try {
        const response = await api.get(`/auth/check-invite-required`);
        setInviteRequired(response.data.isRequired);
      } catch (error) {
        console.error('Error checking invite requirement', error);
      }
    };

    checkForDm();
    checkRegistrationStatus();
    checkInviteRequired();
  }, []);

  // Email validation function
  const validateEmail = (email) => {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(email);
  };

  const handleRegister = async () => {
    try {
      // Basic validation
      if (!username) {
        setError('Username is required');
        return;
      }

      if (!email) {
        setError('Email is required');
        return;
      }

      if (!validateEmail(email)) {
        setError('Please enter a valid email address');
        return;
      }

      if (!password) {
        setError('Password is required');
        return;
      }

      if (password.length < 8) {
        setError('Password must be at least 8 characters long');
        return;
      }

      if (password.length > 64) {
        setError('Password cannot exceed 64 characters');
        return;
      }

      // Check for invite code if required
      if (inviteRequired && !inviteCode) {
        setError('Invitation code is required for registration');
        return;
      }

      const response = await api.post(`/auth/register`, {
        username,
        email,
        password,
        role,
        inviteCode: inviteCode || undefined
      });

      localStorage.setItem('token', response.data.token);
      navigate('/user-settings');
    } catch (err) {
      // Enhanced error handling for invite codes
      if (err.response?.data?.message?.includes('Invalid or used invite code')) {
        setError('The invite code is invalid, has already been used, or has expired');
      } else if (err.response?.data?.message?.includes('expired')) {
        setError('This invitation code has expired');
      } else {
      setError(err.response?.data?.error || err.response?.data?.message || 'Registration failed');
    }
    }
  };

  // Handle toggle password visibility
  const handleTogglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // Handle Enter key press for form submission
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleRegister();
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
          onKeyDown={handleKeyDown}
        />
        <TextField
          variant="outlined"
          margin="normal"
          required
          fullWidth
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <TextField
          variant="outlined"
          margin="normal"
          required
          fullWidth
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          InputProps={{
            // Add eye icon to toggle password visibility
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label="toggle password visibility"
                  onClick={handleTogglePasswordVisibility}
                  edge="end"
                >
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <FormHelperText>
          Password must be at least 8 characters long. Use a mix of words, numbers,
          or symbols for increased security.
        </FormHelperText>

        {inviteRequired && (
          <TextField
            variant="outlined"
            margin="normal"
            required
            fullWidth
            label="Invitation Code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}

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
          variant="outlined"
          color="primary"
          sx={{ mt: 3, mb: 2 }}
          onClick={handleRegister}
        >
          Register
        </Button>

        <Box mt={2}>
          <Typography variant="body2" color="textSecondary">
            Strong password tips:
            <ul>
              <li>Use longer phrases that are easy for you to remember</li>
              <li>Include a mix of words, spaces, and characters</li>
              <li>Avoid reusing passwords from other sites</li>
            </ul>
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default Register;