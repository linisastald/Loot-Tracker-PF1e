// frontend/src/components/pages/Login.tsx

import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import api from '../../utils/api';
import {getErrorMessage} from '../../utils/apiErrors';
import type {AuthUser} from '../../contexts/AuthContext';
import {Alert, Box, Button, Container, IconButton, InputAdornment, Link, Paper, TextField, Typography} from '@mui/material';
import {Visibility, VisibilityOff} from '@mui/icons-material';

interface LoginProps {
  onLogin: (user: AuthUser) => void;
}

const Login: React.FC<LoginProps> = ({onLogin}) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    // Set by the api utility when a 401 forced a redirect here
    const [sessionExpired] = useState(() => sessionStorage.getItem('loginRedirectReason') === 'expired');
    const navigate = useNavigate();

    const handleLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            if (!username || !password) {
                setError('Username and password are required');
                return;
            }

            const response = await api.post(`/auth/login`, {username, password});
            const userData = response.data.user;

            // Store user data in local storage (but not the password)
            localStorage.setItem('user', JSON.stringify(userData));

            onLogin(userData);

            // Return to the page the user was on before the session expired
            const returnTo = sessionStorage.getItem('loginReturnTo');
            sessionStorage.removeItem('loginReturnTo');
            sessionStorage.removeItem('loginRedirectReason');

            // Only allow same-origin paths to avoid open redirects
            if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') && returnTo !== '/login') {
                navigate(returnTo);
            } else {
                navigate('/loot-entry');
            }
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Login failed. Please check your credentials.'));
        }
    };

    return (
        <Container component="main" maxWidth="xs">
            <Paper sx={{p: 2, mt: 8}}>
                <Typography component="h1" variant="h5" gutterBottom>
                    Pathfinder Loot Tracker
                </Typography>
                <Typography component="h2" variant="h6" gutterBottom>
                    Login
                </Typography>

                {sessionExpired && !error && (
                    <Alert severity="info" sx={{mt: 1}}>
                        Your session expired. Please log in again to continue where you left off.
                    </Alert>
                )}

                <form onSubmit={handleLogin} noValidate>
                    <TextField
                        variant="outlined"
                        margin="normal"
                        required
                        fullWidth
                        label="Username"
                        autoFocus
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        aria-describedby={error ? "login-error" : undefined}
                        error={!!error}
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
                        aria-describedby={error ? "login-error" : undefined}
                        error={!!error}
                        slotProps={{ input: {
                            // Add eye icon to toggle password visibility
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                        onClick={() => setShowPassword(!showPassword)}
                                        edge="end"
                                    >
                                        {showPassword ? <VisibilityOff/> : <Visibility/>}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        } }}
                    />

                    {error && <Typography color="error" sx={{mt: 1}} id="login-error" role="alert">{error}</Typography>}

                    <Button
                        type="submit"
                        fullWidth
                        variant="outlined"
                        color="primary"
                        sx={{mt: 3, mb: 2}}
                    >
                        Login
                    </Button>
                </form>

                <Box
                    sx={{
                        textAlign: "center",
                        mt: 2
                    }}>
                    <Typography variant="body2">
                        <Link
                            component="button"
                            variant="body2"
                            onClick={() => navigate('/forgot-password')}
                        >
                            Forgot Password?
                        </Link>
                    </Typography>
                    <Typography variant="body2" sx={{
                        mt: 1
                    }}>
                        Don't have an account?{' '}
                        <Link
                            component="button"
                            variant="body2"
                            onClick={() => navigate('/register')}
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
