// frontend/src/components/pages/DMSettings/UserManagement.js
import React, {useEffect, useState} from 'react';
import api from '../../../utils/api';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormHelperText,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import {Visibility, VisibilityOff} from '@mui/icons-material';
import InviteManagement from './InviteManagement';

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
    const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [passwordError, setPasswordError] = useState('');

    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    // Manual password reset states
    const [manualResetDialogOpen, setManualResetDialogOpen] = useState(false);
    const [resetUsername, setResetUsername] = useState('');
    const [generatedResetLink, setGeneratedResetLink] = useState('');
    const [resetLinkDialogOpen, setResetLinkDialogOpen] = useState(false);
    const [isGeneratingResetLink, setIsGeneratingResetLink] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const response = await api.get(`/user/all`);
            setUsers(response.data);
        } catch (error) {
            console.error('Error fetching users', error);
            setError('Error loading users. Please try again.');
        }
    };

    const handleUserSelect = (userId) => {
        setSelectedUsers((prevSelected) =>
            prevSelected.includes(userId)
                ? prevSelected.filter((id) => id !== userId)
                : [...prevSelected, userId]
        );
    };

    const handlePasswordReset = async () => {
        try {
            // Validate password length
            if (!newPassword) {
                setPasswordError('Password is required');
                return;
            }

            if (newPassword.length < 8) {
                setPasswordError('Password must be at least 8 characters long');
                return;
            }

            if (newPassword.length > 64) {
                setPasswordError('Password cannot exceed 64 characters');
                return;
            }

            await api.put(
                `/user/reset-password`,
                {userId: selectedUsers[0], newPassword}
            );
            setNewPassword('');
            setSelectedUsers([]);
            setSuccess('Password reset successfully');
            setError('');
            setPasswordError('');
            setResetPasswordDialogOpen(false);
        } catch (err) {
            setPasswordError(err.response?.data?.error || err.response?.data?.message || 'Error resetting password');
            setSuccess('');
        }
    };

    const handleDeleteUser = async () => {
        try {
            await Promise.all(
                selectedUsers.map(userId =>
                    api.put(
                        `/user/delete-user`,
                        {userId}
                    )
                )
            );
            setSelectedUsers([]);
            setSuccess('User(s) deleted successfully');
            setError('');
            setDeleteUserDialogOpen(false);

            // Refresh users list
            fetchData();
        } catch (err) {
            setError('Error deleting user(s)');
            setSuccess('');
        }
    };

    const handleSnackbarClose = () => {
        setSnackbarOpen(false);
    };

    // Manual password reset functions
    const handleGenerateManualResetLink = async () => {
        if (!resetUsername.trim()) {
            setError('Username is required');
            return;
        }

        try {
            setIsGeneratingResetLink(true);
            setError('');

            const response = await api.post('/auth/generate-manual-reset-link', {
                username: resetUsername.trim()
            });

            if (response && response.data) {
                setGeneratedResetLink(response.data.resetUrl);
                setResetLinkDialogOpen(true);
                setManualResetDialogOpen(false);
                setResetUsername('');
            }
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || 'Error generating reset link');
        } finally {
            setIsGeneratingResetLink(false);
        }
    };

    const handleCopyResetLink = () => {
        navigator.clipboard.writeText(generatedResetLink).then(() => {
            setSnackbarMessage('Reset link copied to clipboard');
            setSnackbarOpen(true);
        }).catch(() => {
            setSnackbarMessage('Failed to copy reset link');
            setSnackbarOpen(true);
        });
    };

    return (
        <div>
            <Typography variant="h6" gutterBottom>User Management</Typography>

            {success && <Alert severity="success" sx={{mt: 2, mb: 2}}>{success}</Alert>}
            {error && <Alert severity="error" sx={{mt: 2, mb: 2}}>{error}</Alert>}

            <TableContainer component={Paper} sx={{mt: 2}}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Select</TableCell>
                            <TableCell>Username</TableCell>
                            <TableCell>Role</TableCell>
                            <TableCell>Email</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell>
                                    <Checkbox
                                        checked={selectedUsers.includes(user.id)}
                                        onChange={() => handleUserSelect(user.id)}
                                    />
                                </TableCell>
                                <TableCell>{user.username}</TableCell>
                                <TableCell>{user.role}</TableCell>
                                <TableCell>{user.email}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Box mt={2} display="flex" gap={2}>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={() => setResetPasswordDialogOpen(true)}
                    disabled={selectedUsers.length !== 1}
                >
                    Reset Password
                </Button>
                <Button
                    variant="outlined"
                    color="secondary"
                    onClick={() => setDeleteUserDialogOpen(true)}
                    disabled={selectedUsers.length === 0}
                >
                    Delete User
                </Button>
                <Button
                    variant="outlined"
                    color="info"
                    onClick={() => setManualResetDialogOpen(true)}
                >
                    Generate Reset Link
                </Button>
            </Box>

            {/* Invite Management Section */}
            <Box sx={{mt: 4}}>
                <InviteManagement/>
            </Box>

            {/* Password Reset Dialog */}
            <Dialog open={resetPasswordDialogOpen} onClose={() => setResetPasswordDialogOpen(false)}>
                <DialogTitle>Reset Password</DialogTitle>
                <DialogContent>
                    <TextField
                        label="New Password"
                        type={showNewPassword ? 'text' : 'password'}
                        fullWidth
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        margin="normal"
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label="toggle password visibility"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        edge="end"
                                    >
                                        {showNewPassword ? <VisibilityOff/> : <Visibility/>}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />
                    <FormHelperText>
                        Password must be at least 8 characters long. For better security, use longer phrases
                        that are easy to remember.
                    </FormHelperText>
                    {passwordError && <Typography color="error">{passwordError}</Typography>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setResetPasswordDialogOpen(false)} color="secondary" variant="outlined">
                        Cancel
                    </Button>
                    <Button onClick={handlePasswordReset} color="primary" variant="outlined">
                        Reset Password
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete User Dialog */}
            <Dialog open={deleteUserDialogOpen} onClose={() => setDeleteUserDialogOpen(false)}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <Typography>Are you sure you want to delete the selected user(s)?</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteUserDialogOpen(false)} color="secondary" variant="outlined">
                        Cancel
                    </Button>
                    <Button onClick={handleDeleteUser} color="primary" variant="outlined">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar for notifications */}
            <Snackbar
                open={snackbarOpen}
                autoHideDuration={3000}
                onClose={handleSnackbarClose}
                message={snackbarMessage}
            />

            {/* Manual Reset Link Dialog */}
            <Dialog open={manualResetDialogOpen} onClose={() => setManualResetDialogOpen(false)}>
                <DialogTitle>Generate Manual Password Reset Link</DialogTitle>
                <DialogContent>
                    <Typography sx={{ mb: 2 }}>
                        Generate a password reset link for any user that you can provide manually.
                    </Typography>
                    <TextField
                        label="Username"
                        fullWidth
                        value={resetUsername}
                        onChange={(e) => setResetUsername(e.target.value)}
                        margin="normal"
                        placeholder="Enter username"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setManualResetDialogOpen(false)} color="secondary" variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleGenerateManualResetLink}
                        color="primary"
                        variant="outlined"
                        disabled={isGeneratingResetLink || !resetUsername.trim()}
                    >
                        {isGeneratingResetLink ? <CircularProgress size={24} /> : 'Generate Link'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Reset Link Display Dialog */}
            <Dialog open={resetLinkDialogOpen} onClose={() => setResetLinkDialogOpen(false)} maxWidth="md">
                <DialogTitle>Password Reset Link Generated</DialogTitle>
                <DialogContent>
                    <Typography sx={{ mb: 2 }}>
                        The password reset link has been generated. You can copy and provide this link to the user:
                    </Typography>
                    <Box sx={{ 
                        p: 2, 
                        backgroundColor: 'grey.900', 
                        color: 'white',
                        borderRadius: 1, 
                        fontFamily: 'monospace',
                        wordBreak: 'break-all',
                        mb: 2
                    }}>
                        {generatedResetLink}
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                        This link will expire in 1 hour.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCopyResetLink} color="primary" variant="outlined">
                        Copy Link
                    </Button>
                    <Button onClick={() => setResetLinkDialogOpen(false)} color="secondary" variant="outlined">
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default UserManagement;