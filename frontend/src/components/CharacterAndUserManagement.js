import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';

const CharacterAndUserManagement = () => {
  const [users, setUsers] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const [usersResponse, charactersResponse, settingsResponse] = await Promise.all([
          axios.get('http://192.168.0.64:5000/api/user/all', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get('http://192.168.0.64:5000/api/user/all-characters', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get('http://192.168.0.64:5000/api/user/settings', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        setUsers(usersResponse.data);
        setCharacters(charactersResponse.data);
        const registrationSetting = settingsResponse.data.find(setting => setting.name === 'registrations open');
        setRegistrationOpen(registrationSetting?.value === 1);
      } catch (error) {
        console.error('Error fetching data', error);
      }
    };

    fetchData();
  }, []);

  const handleRegistrationToggle = async () => {
    try {
      const token = localStorage.getItem('token');
      const newValue = registrationOpen ? 0 : 1;
      await axios.put(
        'http://192.168.0.64:5000/api/user/update-setting',
        { name: 'registrations open', value: newValue },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRegistrationOpen(!registrationOpen);
    } catch (error) {
      console.error('Error updating registration setting', error);
    }
  };

  const handlePasswordReset = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        'http://192.168.0.64:5000/api/user/reset-password',
        { userId: selectedUser, newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewPassword('');
      setSelectedUser('');
      setSuccess('Password reset successfully');
      setError('');
      setResetPasswordDialogOpen(false);
    } catch (err) {
      setError('Error resetting password');
      setSuccess('');
    }
  };

  const handleDeleteUser = async () => {
    try {
      const token = localStorage.getItem('token');
      await Promise.all(
        selectedUsers.map(userId =>
          axios.put(
            'http://192.168.0.64:5000/api/user/delete-user',
            { userId },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        )
      );
      setSelectedUsers([]);
      setSuccess('User(s) deleted successfully');
      setError('');
    } catch (err) {
      setError('Error deleting user(s)');
      setSuccess('');
    }
  };

  const handleUserSelect = (userId) => {
    const userIdInt = parseInt(userId, 10);
    setSelectedUsers((prevSelected) =>
        prevSelected.includes(userIdInt)
            ? prevSelected.filter((id) => id !== userIdInt)
            : [...prevSelected, userIdInt]
    );
  };


  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Character and User Management</Typography>

        {/* Registration Toggle */}
        <Box mt={2} mb={2}>
          <Button variant="contained" color="primary" onClick={handleRegistrationToggle}>
            {registrationOpen ? 'Close Registration' : 'Open Registration'}
          </Button>
        </Box>

        {/* Reset Password Section */}
        <Typography variant="h6">User Management</Typography>
        <TableContainer component={Paper} sx={{ mt: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Select</TableCell>
                <TableCell>Username</TableCell>
                <TableCell>Role</TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box mt={2} display="flex" justifyContent="space-between">
          <Button variant="contained" color="primary" onClick={() => setResetPasswordDialogOpen(true)}>
            Reset Password
          </Button>
          <Button variant="contained" color="secondary" onClick={handleDeleteUser}>
            Delete User
          </Button>
        </Box>

        <Dialog open={resetPasswordDialogOpen} onClose={() => setResetPasswordDialogOpen(false)}>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogContent>
            <FormControl fullWidth margin="normal">
              <InputLabel id="user-select-label">User</InputLabel>
              <Select
                labelId="user-select-label"
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
              >
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.username}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="New Password"
              type="password"
              fullWidth
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              margin="normal"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handlePasswordReset} color="primary" variant="contained">
              Reset Password
            </Button>
            <Button onClick={() => setResetPasswordDialogOpen(false)} color="secondary" variant="contained">
              Cancel
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>

      {/* Character Management Section */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">Character Management</Typography>
        <TableContainer component={Paper} sx={{ mt: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Select</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Appraisal Bonus</TableCell>
                <TableCell>Birthday</TableCell>
                <TableCell>Deathday</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>User</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {characters.map((char) => (
                <TableRow key={char.id}>
                  <TableCell>
                    <Checkbox />
                  </TableCell>
                  <TableCell>{char.name}</TableCell>
                  <TableCell>{char.appraisal_bonus}</TableCell>
                  <TableCell>{char.birthday}</TableCell>
                  <TableCell>{char.deathday}</TableCell>
                  <TableCell>{char.active ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{char.username}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box mt={2}>
          <Button variant="contained" color="primary">
            Update Characters
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default CharacterAndUserManagement;
