import React from 'react';
import { useHistory } from 'react-router-dom';
import axios from 'axios';
import { Container, TextField, Button, Typography, Box } from '@mui/material';

const Login = () => {
  const history = useHistory();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Ensure the URL points to the backend server
      const response = await axios.post('http://192.168.0.64:5000/api/auth/login', {
        character_name: 'dummy_character',
        password: 'dummy_password',
      });
      localStorage.setItem('token', response.data.token);
      history.push('/loot-entry');
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography component="h1" variant="h5">
          Login
        </Typography>
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="characterName"
            label="Character Name"
            name="characterName"
            autoComplete="characterName"
            autoFocus
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type="password"
            id="password"
            autoComplete="current-password"
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
          >
            Login
          </Button>
        </Box>
      </Box>
    </Container>
  );
};

export default Login;
