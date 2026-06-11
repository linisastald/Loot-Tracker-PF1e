// frontend/src/components/pages/Register.tsx

import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import api from '../../utils/api';
import {
  Box,
  Button,
  CircularProgress,
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

type RegistrationMode = 'open' | 'invite-only' | 'closed';

interface RegistrationStatusData {
    mode: RegistrationMode;
    registrationsOpen: boolean;
}

interface CheckDmData {
    dmExists: boolean;
}

// Invite codes are 8 alphanumeric characters (legacy codes were 6)
const INVITE_CODE_PATTERN = /^[A-Z0-9]{6,8}$/;

const Register: React.FC = () => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [role, setRole] = useState('Player');
    const [error, setError] = useState('');
    const [dmExists, setDmExists] = useState(false);
    const [mode, setMode] = useState<RegistrationMode | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const checkForDm = async () => {
            try {
                const response = await api.get('/auth/check-dm');
                const data = response.data as CheckDmData;
                setDmExists(Boolean(data?.dmExists));
            } catch {
                // Non-fatal: role selector simply stays enabled
            }
        };

        const checkRegistrationStatus = async () => {
            try {
                const response = await api.get('/auth/check-registration-status');
                const data = response.data as RegistrationStatusData;
                setMode(data?.mode || 'closed');
            } catch {
                // Fail safe: treat unknown status as closed
                setMode('closed');
            } finally {
                setStatusLoading(false);
            }
        };

        checkForDm();
        checkRegistrationStatus();
    }, []);

    // Email validation function
    const validateEmail = (value: string): boolean => {
        const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return re.test(value);
    };

    const handleInviteCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInviteCode(e.target.value.toUpperCase());
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

            // Invite code handling: required when invite-only, optional when open
            if (mode === 'invite-only' && !inviteCode) {
                setError('An invite code is required for registration');
                return;
            }

            if (inviteCode && !INVITE_CODE_PATTERN.test(inviteCode)) {
                setError('Invite codes are 6-8 letters and numbers');
                return;
            }

            await api.post('/auth/register', {
                username,
                email,
                password,
                role,
                inviteCode: inviteCode || undefined
            });

            // Auth token arrives as an HTTP-only cookie; nothing to store here
            navigate('/user-settings');
        } catch (err: any) {
            // Surface the backend's validation message when available
            setError(
                err.response?.data?.message ||
                err.response?.data?.error ||
                'Registration failed'
            );
        }
    };

    // Handle toggle password visibility
    const handleTogglePasswordVisibility = () => {
        setShowPassword(!showPassword);
    };

    // Handle Enter key press for form submission
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleRegister();
        }
    };

    if (statusLoading) {
        return (
            <Container component="main" maxWidth="xs">
                <Box display="flex" justifyContent="center" mt={8}>
                    <CircularProgress/>
                </Box>
            </Container>
        );
    }

    if (mode === 'closed') {
        return (
            <Container component="main" maxWidth="xs">
                <Paper sx={{p: 2, mt: 8}}>
                    <Typography component="h1" variant="h5" gutterBottom>
                        Registration is currently closed
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                        New registrations are not being accepted right now. Please check
                        back later or contact your DM.
                    </Typography>
                </Paper>
            </Container>
        );
    }

    return (
        <Container component="main" maxWidth="xs">
            <Paper sx={{p: 2, mt: 8}}>
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
                                    {showPassword ? <VisibilityOff/> : <Visibility/>}
                                </IconButton>
                            </InputAdornment>
                        ),
                    }}
                />
                <FormHelperText>
                    Password must be at least 8 characters long. Use a mix of words, numbers,
                    or symbols for increased security.
                </FormHelperText>

                {mode === 'invite-only' && (
                    <TextField
                        variant="outlined"
                        margin="normal"
                        required
                        fullWidth
                        label="Invite code (required)"
                        value={inviteCode}
                        onChange={handleInviteCodeChange}
                        onKeyDown={handleKeyDown}
                        inputProps={{maxLength: 8}}
                        helperText="Registration requires an invite code from your DM"
                    />
                )}

                {mode === 'open' && (
                    <TextField
                        variant="outlined"
                        margin="normal"
                        fullWidth
                        label="Invite code (optional — joins you to your group's campaign)"
                        value={inviteCode}
                        onChange={handleInviteCodeChange}
                        onKeyDown={handleKeyDown}
                        inputProps={{maxLength: 8}}
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
                    sx={{mt: 3, mb: 2}}
                    onClick={handleRegister}
                    disabled={mode === 'invite-only' && !inviteCode}
                >
                    Register
                </Button>

                <Box mt={2}>
                    <Typography component="div" variant="body2" color="textSecondary">
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
