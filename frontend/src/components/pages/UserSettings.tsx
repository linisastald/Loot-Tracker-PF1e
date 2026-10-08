// Account & Settings: the user's own pages, independent of the campaign that
// is open (the layout renders them under the default theme). Tabs are URL
// addressed (/user-settings, /user-settings/characters,
// /user-settings/system-admin) so the account menu can link straight to one.
import React, {useEffect, useState} from 'react';
import {Link as RouterLink, useLocation} from 'react-router-dom';
import api from '../../utils/api';
import {getErrorMessage} from '../../utils/apiErrors';
import {isValidEmail} from '../../utils/validation';
import {
  Alert,
  Box,
  Button,
  Container,
  Grid,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import PasswordField from '../common/PasswordField';
import CharacterTab from './UserSettings/CharacterTab';
import SystemAdmin from './SystemAdmin';
import {useCampaign} from '../../contexts/CampaignContext';

const TAB_PATHS = ['/user-settings', '/user-settings/characters', '/user-settings/system-admin'] as const;

/** Tab index for a pathname (unknown sub-paths fall back to Account). */
const tabForPath = (pathname: string, allowSystemAdmin: boolean): number => {
    const trimmed = pathname.replace(/\/+$/, '');
    if (trimmed === TAB_PATHS[1]) return 1;
    if (trimmed === TAB_PATHS[2] && allowSystemAdmin) return 2;
    return 0;
};

interface TabPanelProps {
    children?: React.ReactNode;
    value: number;
    index: number;
}

function TabPanel({children, value, index, ...other}: TabPanelProps) {
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`simple-tabpanel-${index}`}
            aria-labelledby={`simple-tab-${index}`}
            {...other}
        >
            {value === index && <Box sx={{
                p: 3
            }}>{children}</Box>}
        </div>
    );
}

interface AccountUser {
    id: number;
    username: string;
    role: string;
    email?: string | null;
    discord_id?: string | null;
}

interface FormStatus {
    error: string;
    success: string;
}

const NO_STATUS: FormStatus = {error: '', success: ''};

interface SettingsSectionProps {
    title: string;
    status: FormStatus;
    children: React.ReactNode;
}

/** Card with a title and the error/success alerts shared by every account form. */
const SettingsSection: React.FC<SettingsSectionProps> = ({title, status, children}) => (
    <Grid size={{xs: 12, md: 6}}>
        <Paper elevation={2} sx={{p: 3, height: '100%'}}>
            <Typography variant="h6" gutterBottom>
                {title}
            </Typography>
            {status.error && <Alert severity="error" sx={{mb: 2}}>{status.error}</Alert>}
            {status.success && <Alert severity="success" sx={{mb: 2}}>{status.success}</Alert>}
            {children}
        </Paper>
    </Grid>
);

const UserSettings: React.FC = () => {
    const [user, setUser] = useState<AccountUser | null>(null);
    const {isSuperadmin} = useCampaign();
    const location = useLocation();
    const tabValue = tabForPath(location.pathname, isSuperadmin);

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordStatus, setPasswordStatus] = useState<FormStatus>(NO_STATUS);

    const [currentEmail, setCurrentEmail] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [emailPassword, setEmailPassword] = useState('');
    const [emailStatus, setEmailStatus] = useState<FormStatus>(NO_STATUS);

    const [discordId, setDiscordId] = useState('');
    const [discordStatus, setDiscordStatus] = useState<FormStatus>(NO_STATUS);

    useEffect(() => {
        fetchUserData();
    }, []);

    const fetchUserData = async () => {
        try {
            const response = await api.get('/auth/status');
            const loaded: AccountUser | undefined = response.data?.user;
            if (loaded) {
                setUser(loaded);
                setCurrentEmail(loaded.email || '');
                // Only trust the field when the server sent it, so a response
                // without it can never blank an id the user just saved.
                if ('discord_id' in loaded) {
                    setDiscordId(loaded.discord_id || '');
                }
            }
        } catch {
            // The account details stay empty; every form still works.
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordStatus(NO_STATUS);

        const fail = (error: string) => setPasswordStatus({error, success: ''});

        if (!oldPassword) {
            fail('Current password is required');
            return;
        }

        if (!newPassword) {
            fail('New password is required');
            return;
        }

        if (newPassword.length < 8) {
            fail('New password must be at least 8 characters long');
            return;
        }

        if (newPassword !== confirmPassword) {
            fail('New passwords do not match');
            return;
        }

        try {
            await api.put('/user/change-password', {
                oldPassword,
                newPassword
            });

            setPasswordStatus({error: '', success: 'Password changed successfully'});
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            fail(getErrorMessage(error, 'Error changing password'));
        }
    };

    const handleChangeEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailStatus(NO_STATUS);

        const fail = (error: string) => setEmailStatus({error, success: ''});

        if (!newEmail) {
            fail('New email is required');
            return;
        }

        if (!isValidEmail(newEmail)) {
            fail('Please enter a valid email address');
            return;
        }

        if (!emailPassword) {
            fail('Password is required to change email');
            return;
        }

        try {
            await api.put('/user/change-email', {
                email: newEmail,
                password: emailPassword
            });

            setEmailStatus({error: '', success: 'Email changed successfully'});
            setCurrentEmail(newEmail);
            setNewEmail('');
            setEmailPassword('');

            // Refresh user data to get updated email
            fetchUserData();
        } catch (error) {
            fail(getErrorMessage(error, 'Error changing email'));
        }
    };

    // Takes the id explicitly so Unlink can send null without waiting for state to update
    const submitDiscordId = async (value: string) => {
        setDiscordStatus(NO_STATUS);

        // Validate Discord ID format (17-19 digit number)
        if (value && !/^\d{17,19}$/.test(value)) {
            setDiscordStatus({error: 'Invalid Discord ID format. It should be a 17-19 digit number.', success: ''});
            return;
        }

        try {
            await api.put('/user/update-discord-id', {
                discord_id: value || null
            });

            setDiscordStatus({
                error: '',
                success: value ? 'Discord ID linked successfully' : 'Discord ID unlinked successfully'
            });

            // Refresh user data
            fetchUserData();
        } catch (error) {
            setDiscordStatus({error: getErrorMessage(error, 'Error updating Discord ID'), success: ''});
        }
    };

    const handleUpdateDiscordId = (e: React.FormEvent) => {
        e.preventDefault();
        return submitDiscordId(discordId);
    };

    const handleUnlinkDiscordId = () => {
        setDiscordId('');
        return submitDiscordId('');
    };

    return (
        <Container maxWidth={false} component="main">
            <Box sx={{mb: 2}}>
                <Typography variant="h5" gutterBottom>Account &amp; Settings</Typography>
                <Typography variant="body2" sx={{color: 'text.secondary'}}>
                    These settings belong to your account and apply in every campaign you are part of.
                </Typography>
            </Box>
            <Paper sx={{p: 2, mb: 2}}>
                <Box sx={{borderBottom: 1, borderColor: 'divider', width: '100%'}}>
                    <Tabs value={tabValue} aria-label="account settings tabs" variant="scrollable" allowScrollButtonsMobile>
                        <Tab label="Account" component={RouterLink} to={TAB_PATHS[0]}/>
                        <Tab label="Characters" component={RouterLink} to={TAB_PATHS[1]}/>
                        {isSuperadmin && <Tab label="System Admin" component={RouterLink} to={TAB_PATHS[2]}/>}
                    </Tabs>
                </Box>

                <TabPanel value={tabValue} index={0}>
                    <Grid container spacing={4}>
                        <SettingsSection title="Change Password" status={passwordStatus}>
                            <form onSubmit={handleChangePassword}>
                                <PasswordField
                                    margin="normal"
                                    required
                                    fullWidth
                                    label="Current Password"
                                    value={oldPassword}
                                    onChange={(e) => setOldPassword(e.target.value)}
                                />
                                <PasswordField
                                    margin="normal"
                                    required
                                    fullWidth
                                    label="New Password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                />
                                <PasswordField
                                    margin="normal"
                                    required
                                    fullWidth
                                    label="Confirm New Password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                        </SettingsSection>

                        <SettingsSection title="Change Email" status={emailStatus}>
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
                                <PasswordField
                                    margin="normal"
                                    required
                                    fullWidth
                                    label="Enter Password to Confirm"
                                    value={emailPassword}
                                    onChange={(e) => setEmailPassword(e.target.value)}
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
                        </SettingsSection>

                        <SettingsSection title="Discord Integration" status={discordStatus}>
                            <Typography
                                variant="body2"
                                sx={{
                                    color: "text.secondary",
                                    mb: 2
                                }}>
                                Link your Discord account to track session attendance via Discord buttons.
                            </Typography>
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
                                            onClick={handleUnlinkDiscordId}
                                        >
                                            Unlink
                                        </Button>
                                    )}
                                </Box>
                            </form>
                        </SettingsSection>

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

                {isSuperadmin && (
                    <TabPanel value={tabValue} index={2}>
                        <SystemAdmin/>
                    </TabPanel>
                )}
            </Paper>
        </Container>
    );
};

export default UserSettings;
