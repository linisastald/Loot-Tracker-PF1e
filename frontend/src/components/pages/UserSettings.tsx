import React, {useEffect, useState} from 'react';
import api from '../../utils/api';
import {
  Alert,
  Box,
  Button,
  Container,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {Visibility, VisibilityOff} from '@mui/icons-material';
import CharacterTab from './UserSettings/CharacterTab';

function TabPanel(props) {
    const {children, value, index, ...other} = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`simple-tabpanel-${index}`}
            aria-labelledby={`simple-tab-${index}`}
            {...other}
        >
            {value === index && <Box p={3}>{children}</Box>}
        </div>
    );
}

const UserSettings = () => {
    const [user, setUser] = useState(null);
    const [tabValue, setTabValue] = useState(0);
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');
    const [showOldPassword, setShowOldPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // New state for email change form
    const [currentEmail, setCurrentEmail] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [emailPassword, setEmailPassword] = useState('');
    const [showEmailPassword, setShowEmailPassword] = useState(false);
    const [emailError, setEmailError] = useState('');
    const [emailSuccess, setEmailSuccess] = useState('');

    // State for Discord ID
    const [discordId, setDiscordId] = useState('');
    const [discordError, setDiscordError] = useState('');
    const [discordSuccess, setDiscordSuccess] = useState('');

    useEffect(() => {
        fetchUserData();
    }, []);

    const fetchUserData = async () => {
        try {
            const response = await api.get('/auth/status');
            if (response.data && response.data.user) {
                setUser(response.data.user);
                setCurrentEmail(response.data.user.email || '');
                setDiscordId(response.data.user.discord_id || '');
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        }
    };

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (!oldPassword) {
            setPasswordError('Current password is required');
            return;
        }

        if (!newPassword) {
            setPasswordError('New password is required');
            return;
        }

        if (newPassword.length < 8) {
            setPasswordError('New password must be at least 8 characters long');
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordError('New passwords do not match');
            return;
        }

        try {
            await api.put('/user/change-password', {
                oldPassword,
                newPassword
            });

            setPasswordSuccess('Password changed successfully');
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            console.error('Error changing password:', error);
            setPasswordError(error.response?.data?.message || 'Error changing password');
        }
    };

    // New function to handle email change
    const handleChangeEmail = async (e) => {
        e.preventDefault();
        setEmailError('');
        setEmailSuccess('');

        // Validate email format
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!newEmail) {
            setEmailError('New email is required');
            return;
        }

        if (!emailRegex.test(newEmail)) {
            setEmailError('Please enter a valid email address');
            return;
        }

        if (!emailPassword) {
            setEmailError('Password is required to change email');
            return;
        }

        try {
            await api.put('/user/change-email', {
                email: newEmail,
                password: emailPassword
            });

            setEmailSuccess('Email changed successfully');
            setCurrentEmail(newEmail);
            setNewEmail('');
            setEmailPassword('');

            // Refresh user data to get updated email
            fetchUserData();
        } catch (error) {
            console.error('Error changing email:', error);
            setEmailError(error.response?.data?.message || 'Error changing email');
        }
    };

    // Function to handle Discord ID update
    const handleUpdateDiscordId = async (e) => {
        e.preventDefault();
        setDiscordError('');
        setDiscordSuccess('');

        // Validate Discord ID format (17-19 digit number)
        if (discordId && !/^\d{17,19}$/.test(discordId)) {
            setDiscordError('Invalid Discord ID format. It should be a 17-19 digit number.');
            return;
        }

        try {
            await api.put('/user/update-discord-id', {
                discord_id: discordId || null
            });

            setDiscordSuccess(discordId ? 'Discord ID linked successfully' : 'Discord ID unlinked successfully');

            // Refresh user data
            fetchUserData();
        } catch (error) {
            console.error('Error updating Discord ID:', error);
            setDiscordError(error.response?.data?.message || 'Error updating Discord ID');
        }
    };

    return (
        <Container maxWidth={false} component="main">
            <Paper sx={{p: 2, mb: 2}}>
                <Box sx={{borderBottom: 1, borderColor: 'divider', width: '100%'}}>
                    <Tabs value={tabValue} onChange={handleTabChange} aria-label="user settings tabs">
                        <Tab label="Account Settings"/>
                        <Tab label="Characters"/>
                    </Tabs>
                </Box>

                <TabPanel value={tabValue} index={0}>
                    <Grid container spacing={4}>
                        {/* Change Password Section */}
                        <Grid size={{xs: 12, md: 6}}>
                            <Paper elevation={2} sx={{p: 3, height: '100%'}}>
                                <Typography variant="h6" gutterBottom>
                                    Change Password
                                </Typography>
                                {passwordError && <Alert severity="error" sx={{mb: 2}}>{passwordError}</Alert>}
                                {passwordSuccess && <Alert severity="success" sx={{mb: 2}}>{passwordSuccess}</Alert>}
                                <form onSubmit={handleChangePassword}>
                                    <TextField
                                        margin="normal"
                                        required
                                        fullWidth
                                        label="Current Password"
                                        type={showOldPassword ? 'text' : 'password'}
                                        value={oldPassword}
                                        onChange={(e) => setOldPassword(e.target.value)}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <IconButton
                                                        aria-label="toggle old password visibility"
                                                        onClick={() => setShowOldPassword(!showOldPassword)}
                                                        edge="end"
                                                    >
                                                        {showOldPassword ? <VisibilityOff/> : <Visibility/>}
                                                    </IconButton>
                                                </InputAdornment>
                                            ),
                                        }}
                                    />
                                    <TextField
                                        margin="normal"
                                        required
                                        fullWidth
                                        label="New Password"
                                        type={showNewPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <IconButton
                                                        aria-label="toggle new password visibility"
                                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                                        edge="end"
                                                    >
                                                        {showNewPassword ? <VisibilityOff/> : <Visibility/>}
                                                    </IconButton>
                                                </InputAdornment>
                                            ),
                                        }}
                                    />
                                    <TextField
                                        margin="normal"
                                        required
                                        fullWidth
                                        label="Confirm New Password"
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <IconButton
                                                        aria-label="toggle confirm password visibility"
                                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                        edge="end"
                                                    >
                                                        {showConfirmPassword ? <VisibilityOff/> : <Visibility/>}
                                                    </IconButton>
                                                </InputAdornment>
                                            ),
                                        }}
                                    />
                                    <Button
                                        type="submit"
                                        variant="outlined"
                                        color="primary"
                                        sx={{mt: 2}}
                                    >
                                        Change Password
                                    </Button>
                                </form>
                            </Paper>
                        </Grid>

                        {/* Change Email Section */}
                        <Grid size={{xs: 12, md: 6}}>
                            <Paper elevation={2} sx={{p: 3, height: '100%'}}>
                                <Typography variant="h6" gutterBottom>
                                    Change Email
                                </Typography>
                                {emailError && <Alert severity="error" sx={{mb: 2}}>{emailError}</Alert>}
                                {emailSuccess && <Alert severity="success" sx={{mb: 2}}>{emailSuccess}</Alert>}
                                <form onSubmit={handleChangeEmail}>
                                    <TextField
                                        margin="normal"
                                        fullWidth
                                        label="Current Email"
                                        value={currentEmail}
                                        disabled
                                    />
                                    <TextField
                                        margin="normal"
                                        required
                                        fullWidth
                                        label="New Email"
                                        type="email"
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                    />
                                    <TextField
                                        margin="normal"
                                        required
                                        fullWidth
                                        label="Enter Password to Confirm"
                                        type={showEmailPassword ? 'text' : 'password'}
                                        value={emailPassword}
                                        onChange={(e) => setEmailPassword(e.target.value)}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <IconButton
                                                        aria-label="toggle password visibility"
                                                        onClick={() => setShowEmailPassword(!showEmailPassword)}
                                                        edge="end"
                                                    >
                                                        {showEmailPassword ? <VisibilityOff/> : <Visibility/>}
                                                    </IconButton>
                                                </InputAdornment>
                                            ),
                                        }}
                                    />
                                    <Button
                                        type="submit"
                                        variant="outlined"
                                        color="primary"
                                        sx={{mt: 2}}
                                    >
                                        Change Email
                                    </Button>
                                </form>
                            </Paper>
                        </Grid>

                        {/* Discord ID Section */}
                        <Grid size={{xs: 12, md: 6}}>
                            <Paper elevation={2} sx={{p: 3, height: '100%'}}>
                                <Typography variant="h6" gutterBottom>
                                    Discord Integration
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
                                    Link your Discord account to track session attendance via Discord buttons.
                                </Typography>
                                {discordError && <Alert severity="error" sx={{mb: 2}}>{discordError}</Alert>}
                                {discordSuccess && <Alert severity="success" sx={{mb: 2}}>{discordSuccess}</Alert>}
                                <form onSubmit={handleUpdateDiscordId}>
                                    <TextField
                                        margin="normal"
                                        fullWidth
                                        label="Discord ID"
                                        value={discordId}
                                        onChange={(e) => setDiscordId(e.target.value)}
                                        placeholder="Right-click your name in Discord and Copy ID"
                                        helperText="Your Discord ID is a 17-19 digit number. Enable Developer Mode in Discord to copy your ID."
                                    />
                                    <Box sx={{mt: 2, display: 'flex', gap: 1}}>
                                        <Button
                                            type="submit"
                                            variant="outlined"
                                            color="primary"
                                        >
                                            {discordId ? 'Update Discord ID' : 'Link Discord ID'}
                                        </Button>
                                        {discordId && (
                                            <Button
                                                variant="outlined"
                                                color="error"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setDiscordId('');
                                                    handleUpdateDiscordId(e);
                                                }}
                                            >
                                                Unlink
                                            </Button>
                                        )}
                                    </Box>
                                </form>
                            </Paper>
                        </Grid>

                        {/* Account Information Section */}
                        <Grid size={12}>
                            <Paper elevation={2} sx={{p: 3}}>
                                <Typography variant="h6" gutterBottom>
                                    Account Information
                                </Typography>
                                {user && (
                                    <Grid container spacing={2}>
                                        <Grid size={{xs: 12, sm: 6}}>
                                            <Typography variant="subtitle1">Username</Typography>
                                            <Typography variant="body1">{user.username}</Typography>
                                        </Grid>
                                        <Grid size={{xs: 12, sm: 6}}>
                                            <Typography variant="subtitle1">Role</Typography>
                                            <Typography variant="body1">{user.role}</Typography>
                                        </Grid>
                                    </Grid>
                                )}
                            </Paper>
                        </Grid>
                    </Grid>
                </TabPanel>

                <TabPanel value={tabValue} index={1}>
                    <CharacterTab/>
                </TabPanel>
            </Paper>
        </Container>
    );
};

export default UserSettings;