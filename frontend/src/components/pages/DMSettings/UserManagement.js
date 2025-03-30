// frontend/src/components/pages/DMSettings/UserManagement.js
import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';
import {
  Typography,
  Button,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Paper,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  InputAdornment,
  IconButton,
  FormHelperText,
  Alert
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

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

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
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
        { userId: selectedUsers[0], newPassword }
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
            { userId }
          )
        )
      );
      setSelectedUsers([]);
      setSuccess('User(s) deleted successfully');
      setError('');
      setDeleteUserDialogOpen(false);

      // Refresh users list
      fetchUsers();
    } catch (err) {
      setError('Error deleting user(s)');
      setSuccess('');
    }
  };

  return (
    <div>
      <Typography variant="h6" gutterBottom>User Management</Typography>

      {success && <Alert severity="success" sx={{ mt: 2, mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper} sx={{ mt: 2 }}>
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
                    {showNewPassword ? <VisibilityOff /> : <Visibility />}
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
    </div>
  );
};

export default UserManagement;