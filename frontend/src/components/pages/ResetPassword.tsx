// frontend/src/components/pages/ResetPassword.js

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import {
    Box,
    Button,
    Container,
    IconButton,
    InputAdornment,
    Link,
    Paper,
    TextField,
    Typography,
    Alert
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

const ResetPassword = () => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const token = searchParams.get('token');

    useEffect(() => {
        if (!token) {
            setError('Invalid reset link. Please request a new password reset.');
        }
    }, [token]);

    const handleSubmit = async () => {
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

            if (newPassword.length < 8) {
                setError('Password must be at least 8 characters long');
                return;
            }

            setLoading(true);

            const response = await api.post('/auth/reset-password', {
                token,
                newPassword
            });

            setSuccess(response.data.message);
            
            // Redirect to login after 3 seconds
            setTimeout(() => {
                navigate('/login');
            }, 3000);

        } catch (err) {
            setError(err.response?.data?.error || 
                    err.response?.data?.message || 
                    'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    };

    const togglePasswordVisibility = () => {
        setShowPassword(!showPassword);
    };

    const toggleConfirmPasswordVisibility = () => {
        setShowConfirmPassword(!showConfirmPassword);
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
                    <Box textAlign="center" mt={2}>
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
                <Typography variant="body2" color="text.secondary" gutterBottom>
                    Enter your new password below.
                </Typography>

                <TextField
                    variant="outlined"
                    margin="normal"
                    required
                    fullWidth
                    label="New Password"
                    type={showPassword ? 'text' : 'password'}
                    autoFocus
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <IconButton
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    onClick={togglePasswordVisibility}
                                    edge="end"
                                >
                                    {showPassword ? <VisibilityOff /> : <Visibility />}
                                </IconButton>
                            </InputAdornment>
                        ),
                    }}
                />

                <TextField
                    variant="outlined"
                    margin="normal"
                    required
                    fullWidth
                    label="Confirm New Password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <IconButton
                                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                                    onClick={toggleConfirmPasswordVisibility}
                                    edge="end"
                                >
                                    {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                                </IconButton>
                            </InputAdornment>
                        ),
                    }}
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
                    fullWidth
                    variant="outlined"
                    color="primary"
                    sx={{ mt: 3, mb: 2 }}
                    onClick={handleSubmit}
                    disabled={Boolean(loading || success)}
                >
                    {loading ? 'Resetting...' : 'Reset Password'}
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

export default ResetPassword;
