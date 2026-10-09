// frontend/src/components/pages/ResetPassword.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/apiErrors';
import PasswordField from '../common/PasswordField';
import {
    Box,
    Button,
    Container,
    Link,
    Paper,
    Typography,
    Alert
} from '@mui/material';

// Mirrors the server policy (AUTH.PASSWORD_MIN_LENGTH / PASSWORD_MAX_LENGTH)
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;

const ResetPassword: React.FC = () => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keep the token in state: it is removed from the address bar below so it
    // does not linger in browser history or URL logs while it is still valid.
    const [token] = useState(() => searchParams.get('token'));

    useEffect(() => {
        if (!token) {
            setError('Invalid reset link. Please request a new password reset.');
            return;
        }
        window.history.replaceState(window.history.state, '', window.location.pathname);
    }, [token]);

    // Do not yank the user back to /login after they have left the page
    useEffect(() => () => {
        if (redirectTimer.current) clearTimeout(redirectTimer.current);
    }, []);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            setError('');
            setSuccess('');

            if (!newPassword || !confirmPassword) {
                setError('Both password fields are required');
                return;
            }

            if (newPassword !== confirmPassword) {
                setError('Passwords do not match');
                return;
            }

            if (newPassword.length < PASSWORD_MIN_LENGTH) {
                setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
                return;
            }

            if (newPassword.length > PASSWORD_MAX_LENGTH) {
                setError(`Password cannot exceed ${PASSWORD_MAX_LENGTH} characters`);
                return;
            }

            setLoading(true);

            const response = await api.post('/auth/reset-password', {
                token,
                newPassword
            });

            setSuccess(response.data.message);
            
            // Redirect to login after 3 seconds
            redirectTimer.current = setTimeout(() => {
                navigate('/login');
            }, 3000);

        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Failed to reset password'));
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <Container component="main" maxWidth="xs">
                <Paper sx={{ p: 2, mt: 8 }}>
                    <Typography component="h1" variant="h5" gutterBottom>
                        Invalid Reset Link
                    </Typography>
                    <Alert severity="error" sx={{ mt: 2 }}>
                        This password reset link is invalid or has expired.
                    </Alert>
                    <Box
                        sx={{
                            textAlign: "center",
                            mt: 2
                        }}>
                        <Link
                            component="button"
                            variant="body2"
                            onClick={() => navigate('/forgot-password')}
                        >
                            Request a new password reset
                        </Link>
                    </Box>
                </Paper>
            </Container>
        );
    }

    return (
        <Container component="main" maxWidth="xs">
            <Paper sx={{ p: 2, mt: 8 }}>
                <Typography component="h1" variant="h5" gutterBottom>
                    Set New Password
                </Typography>
                <Typography variant="body2" gutterBottom sx={{
                    color: "text.secondary"
                }}>
                    Enter your new password below.
                </Typography>

                <form onSubmit={handleSubmit} noValidate>
                <PasswordField
                    variant="outlined"
                    margin="normal"
                    required
                    fullWidth
                    label="New Password"
                    autoFocus
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={loading}
                />

                <PasswordField
                    variant="outlined"
                    margin="normal"
                    required
                    fullWidth
                    label="Confirm New Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                        <Typography variant="body2" sx={{ mt: 1 }}>
                            Redirecting to login page...
                        </Typography>
                    </Alert>
                )}

                <Button
                    type="submit"
                    fullWidth
                    variant="outlined"
                    color="primary"
                    sx={{ mt: 3, mb: 2 }}
                    disabled={Boolean(loading || success)}
                >
                    {loading ? 'Resetting...' : 'Reset Password'}
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

export default ResetPassword;
