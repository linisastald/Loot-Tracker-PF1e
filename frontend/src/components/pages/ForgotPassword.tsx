// frontend/src/components/pages/ForgotPassword.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/apiErrors';
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

const ForgotPassword: React.FC = () => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
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

            // The api interceptor already unwraps the axios response, so the body
            // ({ success, message, data: null }) is the response itself.
            const body = response as { message?: string; data?: { message?: string } | null };
            setSuccess(
                body?.message ??
                body?.data?.message ??
                'If an account matches those details, a password reset link has been sent.'
            );
            setUsername('');
            setEmail('');

        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Failed to process password reset request'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container component="main" maxWidth="xs">
            <Paper sx={{ p: 2, mt: 8 }}>
                <Typography component="h1" variant="h5" gutterBottom>
                    Reset Password
                </Typography>
                <Typography variant="body2" gutterBottom sx={{
                    color: "text.secondary"
                }}>
                    Enter your username and email address to receive a password reset link.
                </Typography>

                <form onSubmit={handleSubmit} noValidate>
                <TextField
                    variant="outlined"
                    margin="normal"
                    required
                    fullWidth
                    label="Username"
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
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
                    type="submit"
                    fullWidth
                    variant="outlined"
                    color="primary"
                    sx={{ mt: 3, mb: 2 }}
                    disabled={loading}
                >
                    {loading ? 'Sending...' : 'Send Reset Link'}
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
