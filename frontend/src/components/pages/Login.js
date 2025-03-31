// frontend/src/components/pages/Login.js

import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import api from '../../utils/api';
import {Box, Button, Container, IconButton, InputAdornment, Link, Paper, TextField, Typography} from '@mui/material';
import {Visibility, VisibilityOff} from '@mui/icons-material';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      if (!username || !password) {
        setError('Username and password are required');
        return;
      }

      const response = await api.post(`/auth/login`, { username, password });
      const userData = response.data.user;

      // Store user data in local storage (but not the password)
      localStorage.setItem('user', JSON.stringify(userData));

      // Call the onLogin callback
      if (onLogin) {
        onLogin(userData);
      }

      // Navigate to the main page
      navigate('/loot-entry');
    } catch (err) {
      // Display error message from API if available
      setError(err.response?.data?.error ||
               err.response?.data?.message ||
               'Login failed. Please check your credentials.');
    }
  };

  // Toggle password visibility
  const handleTogglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // Handle Enter key press for form submission
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  // Handle navigate to register page
  const navigateToRegister = () => {
    navigate('/register');
  };

  return (
    <Container component="main" maxWidth="xs">
      <Paper sx={{ p: 2, mt: 8 }}>
        <Typography component="h1" variant="h5" gutterBottom>
          Pathfinder Loot Tracker
        </Typography>
        <Typography component="h2" variant="h6" gutterBottom>
          Login
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

        {error && <Typography color="error" sx={{ mt: 1 }}>{error}</Typography>}

        <Button
          fullWidth
          variant="outlined"
          color="primary"
          sx={{ mt: 3, mb: 2 }}
          onClick={handleLogin}
        >
          Login
        </Button>

        <Box textAlign="center" mt={2}>
          <Typography variant="body2">
            Don't have an account?{' '}
            <Link
              component="button"
              variant="body2"
              onClick={navigateToRegister}
            >
              Register here
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default Login;