import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, TextField, Typography, Container, Paper, Alert } from '@mui/material';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api';

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
      console.log('Sending login request to:', `${API_URL}/auth/login`);
      console.log('Login request payload:', {username, password: '***'});

      // Use raw axios for login to avoid CSRF/token requirements
      const response = await axios.post(`${API_URL}/auth/login`,
          {username, password},
          {withCredentials: true}
      );

      console.log('Login response:', response);

      // Axios puts the actual response in the data property
      const responseData = response.data;

      // Extract the token and user from the response
      if (responseData && responseData.success && responseData.data) {
        const userData = responseData.data;

        if (userData && userData.user) {
          // Make sure token exists
          if (!userData.token) {
            console.error('Token missing in response:', responseData);
            setError('Login failed: Authentication token missing');
            return;
          }

          console.log('Login successful, token received');

          // Perform login with the token and user object
          onLogin(userData.token, userData.user);
          navigate('/loot-entry');
        } else {
          console.error('User data missing in response:', responseData);
          setError('Login failed: User data missing in response');
        }
      } else {
        console.error('Invalid response format:', responseData);
        setError('Login failed: Invalid server response');
      }

    } catch (err) {
      console.error('Login Error:', err);

      // Extract error message
      const errorMessage = err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          'Login failed';

      setError(errorMessage);
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