// frontend/src/components/pages/Register.tsx

import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import api from '../../utils/api';
import {getErrorMessage} from '../../utils/apiErrors';
import {isValidEmail} from '../../utils/validation';
import {INVITE_CODE_FORMAT_MESSAGE, INVITE_CODE_LENGTH, isValidInviteCode} from '../../utils/inviteCode';
import type {AuthUser} from '../../contexts/AuthContext';
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
}

interface CheckDmData {
    dmExists: boolean;
}

interface RegisterProps {
    /** Signs the freshly registered user in (App state + cached user) */
    onLogin?: (user: AuthUser) => void;
}

const Register: React.FC<RegisterProps> = ({onLogin}) => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [role, setRole] = useState('Player');
    const [error, setError] = useState('');
    // Fail safe: the Role selector stays locked until the server confirms that
    // no account exists yet (the server only honours DM on an empty install)
    const [dmExists, setDmExists] = useState(true);
    const [mode, setMode] = useState<RegistrationMode | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const checkForDm = async () => {
            try {
                const response = await api.get('/auth/check-dm');
                const data = response.data as CheckDmData;
                setDmExists(data?.dmExists !== false);
            } catch {
                // Non-fatal: the role selector simply stays locked
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

    // First failing rule wins; null means the form is valid
    const validate = (): string | null => {
        const rules: Array<[boolean, string]> = [
            [!username, 'Username is required'],
            [!email, 'Email is required'],
            [!!email && !isValidEmail(email), 'Please enter a valid email address'],
            [!password, 'Password is required'],
            [!!password && password.length < 8, 'Password must be at least 8 characters long'],
            [password.length > 64, 'Password cannot exceed 64 characters'],
            // Invite code handling: required when invite-only, optional when open
            [mode === 'invite-only' && !inviteCode, 'An invite code is required for registration'],
            [!!inviteCode && !isValidInviteCode(inviteCode), INVITE_CODE_FORMAT_MESSAGE],
        ];
        return rules.find(([failed]) => failed)?.[1] ?? null;
    };

    const handleRegister = async (event: React.FormEvent) => {
        event.preventDefault();
        const problem = validate();
        if (problem) {
            setError(problem);
            return;
        }

        try {
            const response = await api.post('/auth/register', {
                username,
                email,
                password,
                role,
                inviteCode: inviteCode || undefined
            });

            // The auth token arrives as an HTTP-only cookie. Sign the user in
            // locally too, otherwise App still considers them logged out and
            // the protected /user-settings route bounces them to /login.
            const newUser = response.data?.user;
            if (newUser) {
                localStorage.setItem('user', JSON.stringify(newUser));
                onLogin?.(newUser);
            }
            navigate('/user-settings');
        } catch (err: unknown) {
            // Surface the backend's validation message when available
            setError(getErrorMessage(err, 'Registration failed'));
        }
    };

    if (statusLoading) {
        return (
            <Container component="main" maxWidth="xs">
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "center",
                        mt: 8
                    }}>
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

    const inviteRequired = mode === 'invite-only';

    return (
        <Container component="main" maxWidth="xs">
            <Paper sx={{p: 2, mt: 8}}>
                <Typography component="h1" variant="h5">
                    Register
                </Typography>
                <form onSubmit={handleRegister} noValidate>
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
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
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
                        slotProps={{ input: {
                            // Add eye icon to toggle password visibility
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label="toggle password visibility"
                                        onClick={() => setShowPassword(!showPassword)}
                                        edge="end"
                                    >
                                        {showPassword ? <VisibilityOff/> : <Visibility/>}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        } }}
                    />
                    <FormHelperText>
                        Password must be at least 8 characters long. Use a mix of words, numbers,
                        or symbols for increased security.
                    </FormHelperText>

                    <TextField
                        variant="outlined"
                        margin="normal"
                        required={inviteRequired}
                        fullWidth
                        label={inviteRequired
                            ? 'Invite code (required)'
                            : "Invite code (optional — joins you to your group's campaign)"}
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        slotProps={{ htmlInput: {maxLength: INVITE_CODE_LENGTH} }}
                        helperText={inviteRequired ? 'Registration requires an invite code from your DM' : undefined}
                    />

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
                        type="submit"
                        fullWidth
                        variant="outlined"
                        color="primary"
                        sx={{mt: 3, mb: 2}}
                        disabled={inviteRequired && !inviteCode}
                    >
                        Register
                    </Button>
                </form>

                <Box sx={{
                    mt: 2
                }}>
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
