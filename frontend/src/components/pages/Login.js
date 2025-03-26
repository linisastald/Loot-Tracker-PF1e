import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, TextField, Typography, Container, Paper, Alert } from '@mui/material';
import api from '../../utils/api';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/loot-entry');
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // Log full request details for debugging
      console.log('Login Request:', { username });

      const response = await api.post('/auth/login', { username, password });

      // Log full raw response for detailed inspection
      console.log('Raw Login Response:', response);

      // Very verbose error checking and logging
      if (!response) {
        console.error('No response received from server');
        setError('No response from server');
        return;
      }

      // Check for expected response structure
      if (response.success === false) {
        console.error('Server returned a failure response:', response);
        setError(response.message || 'Login failed');
        return;
      }

      // Extract token and user from the response
      const { token, user } = response.data;

      if (!token || !user) {
        console.error('Missing token or user in response:', response);
        setError('Invalid server response');
        return;
      }

      // Perform login
      onLogin(token, user);
      navigate('/loot-entry');

    } catch (err) {
      // Comprehensive error logging
      console.error('Login Error:', err);

      // Check for different possible error formats
      if (err.response) {
        // Server responded with an error
        console.error('Server Error Response:', err.response);
        const errorMessage = err.response.data?.message ||
                             err.response.data?.error ||
                             'Login failed';
        setError(errorMessage);
      } else if (err.message) {
        // Network error or other client-side error
        console.error('Client Error:', err.message);
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Paper sx={{ p: 2, mt: 8 }}>
        <Typography component="h1" variant="h5">
          Sign in
        </Typography>
        {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>}
        <form onSubmit={handleLogin}>
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
          <Button
            type="submit"
            fullWidth
            variant="contained"
            color="primary"
            sx={{ mt: 3, mb: 2 }}
          >
            Sign In
          </Button>
        </form>
      </Paper>
    </Container>
  );
};

export default Login;