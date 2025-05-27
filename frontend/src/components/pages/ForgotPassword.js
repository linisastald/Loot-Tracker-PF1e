// frontend/src/components/pages/ForgotPassword.js

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import {
    Box,
    Button,
    Container,
    Link,
    Paper,
    TextField,
    Typography,
    Alert
} from '@mui/material';

const ForgotPassword = () => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async () => {
        try {
            setError('');
            setSuccess('');

            if (!username || !email) {
                setError('Username and email are required');
                return;
            }

            setLoading(true);

            const response = await api.post('/auth/forgot-password', {
                username,
                email
            });

            setSuccess(response.data.message);
            setUsername('');
            setEmail('');

        } catch (err) {
            setError(err.response?.data?.error || 
                    err.response?.data?.message || 
                    'Failed to process password reset request');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    };

    return (
        <Container component="main" maxWidth="xs">
            <Paper sx={{ p: 2, mt: 8 }}>
                <Typography component="h1" variant="h5" gutterBottom>
                    Reset Password
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                    Enter your username and email address to receive a password reset link.
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
                    disabled={loading}
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
                    disabled={loading}
                />

                {error && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {error}
                    </Alert>
                )}

                {success && (
                    <Alert severity="success" sx={{ mt: 2 }}>
                        {success}
                    </Alert>
                )}

                <Button
                    fullWidth
                    variant="outlined"
                    color="primary"
                    sx={{ mt: 3, mb: 2 }}
                    onClick={handleSubmit}
                    disabled={loading}
                >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>

                <Box textAlign="center" mt={2}>
                    <Typography variant="body2">
                        <Link
                            component="button"
                            variant="body2"
                            onClick={() => navigate('/login')}
                        >
                            Back to Login
                        </Link>
                    </Typography>
                </Box>
            </Paper>
        </Container>
    );
};

export default ForgotPassword;
