import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Paper,
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
  TableSortLabel,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';

const API_URL = process.env.REACT_APP_API_URL;

const CharacterAndUserManagement = () => {
  const [users, setUsers] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [updateCharacterDialogOpen, setUpdateCharacterDialogOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [updateCharacter, setUpdateCharacter] = useState({
    name: '',
    appraisal_bonus: '',
    birthday: '',
    deathday: '',
    active: true,
    user_id: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const [usersResponse, charactersResponse, settingsResponse] = await Promise.all([
          axios.get(`${API_URL}/user/all`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/user/all-characters`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/user/settings`, {
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

  const handleSort = (columnKey) => {
    let direction = 'asc';
    if (sortConfig.key === columnKey && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: columnKey, direction });
  };

  const sortedCharacters = [...characters].sort((a, b) => {
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const handleRegistrationToggle = async () => {
    try {
      const token = localStorage.getItem('token');
      const newValue = registrationOpen ? 0 : 1;
      await axios.put(
        `${API_URL}/user/update-setting`,
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
        `${API_URL}/user/reset-password`,
        { userId: selectedUsers[0], newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewPassword('');
      setSelectedUsers([]);
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
            `${API_URL}/user/delete-user`,
            { userId },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        )
      );
      setSelectedUsers([]);
      setSuccess('User(s) deleted successfully');
      setError('');
      setDeleteUserDialogOpen(false);
    } catch (err) {
      setError('Error deleting user(s)');
      setSuccess('');
    }
  };

  const handleUserSelect = (userId) => {
    setSelectedUsers((prevSelected) =>
      prevSelected.includes(userId)
        ? prevSelected.filter((id) => id !== userId)
        : [...prevSelected, userId]
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    });
  };

  const handleUpdateCharacter = (char) => {
    setSelectedCharacter(char);
    setUpdateCharacter({
      name: char.name,
      appraisal_bonus: char.appraisal_bonus,
      birthday: char.birthday,
      deathday: char.deathday,
      active: char.active,
      user_id: char.user_id,
    });
    setUpdateCharacterDialogOpen(true);
  };

  const handleCharacterUpdateSubmit = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/user/characters`,
        { ...selectedCharacter, ...updateCharacter },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUpdateCharacterDialogOpen(false);
      setSuccess('Character updated successfully');
      setError('');
      setSelectedCharacter(null);
    } catch (err) {
      setError('Error updating character');
      setSuccess('');
    }
  };

  return (
    <Container maxWidth={false} component="main">
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
          <Button
            variant="contained"
            color="primary"
            onClick={() => setResetPasswordDialogOpen(true)}
            disabled={selectedUsers.length !== 1}
          >
            Reset Password
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={() => setDeleteUserDialogOpen(true)}
            disabled={selectedUsers.length === 0}
          >
            Delete User
          </Button>
        </Box>

        <Dialog open={resetPasswordDialogOpen} onClose={() => setResetPasswordDialogOpen(false)}>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogContent>
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

        <Dialog open={deleteUserDialogOpen} onClose={() => setDeleteUserDialogOpen(false)}>
          <DialogTitle>Confirm Delete</DialogTitle>
          <DialogContent>
            <Typography>Are you sure you want to delete the selected user(s)?</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleDeleteUser} color="primary" variant="contained">
              Delete
            </Button>
            <Button onClick={() => setDeleteUserDialogOpen(false)} color="secondary" variant="contained">
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
                <TableCell>
                  <TableSortLabel
                    active={sortConfig.key === 'name'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('name')}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig.key === 'username'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('username')}
                  >
                    User
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig.key === 'active'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('active')}
                  >
                    Active
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig.key === 'appraisal_bonus'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('appraisal_bonus')}
                  >
                    Appraisal Bonus
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig.key === 'birthday'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('birthday')}
                  >
                    Birthday
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortConfig.key === 'deathday'}
                    direction={sortConfig.direction}
                    onClick={() => handleSort('deathday')}
                  >
                    Deathday
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedCharacters.map((char) => (
                <TableRow key={char.id} onClick={() => handleUpdateCharacter(char)} style={{ cursor: 'pointer' }}>
                  <TableCell>{char.name}</TableCell>
                  <TableCell>{char.username}</TableCell>
                  <TableCell>{char.active ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{char.appraisal_bonus}</TableCell>
                  <TableCell>{formatDate(char.birthday)}</TableCell>
                  <TableCell>{formatDate(char.deathday)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={updateCharacterDialogOpen} onClose={() => setUpdateCharacterDialogOpen(false)}>
          <DialogTitle>Update Character</DialogTitle>
          <DialogContent>
            <TextField
              label="Name"
              fullWidth
              value={updateCharacter.name}
              onChange={(e) => setUpdateCharacter({ ...updateCharacter, name: e.target.value })}
              margin="normal"
            />
            <TextField
              label="Appraisal Bonus"
              type="number"
              fullWidth
              value={updateCharacter.appraisal_bonus}
              onChange={(e) => setUpdateCharacter({ ...updateCharacter, appraisal_bonus: e.target.value })}
              margin="normal"
            />
            <TextField
              label="Birthday"
              type="date"
              fullWidth
              value={updateCharacter.birthday}
              onChange={(e) => setUpdateCharacter({ ...updateCharacter, birthday: e.target.value })}
              margin="normal"
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Deathday"
              type="date"
              fullWidth
              value={updateCharacter.deathday}
              onChange={(e) => setUpdateCharacter({ ...updateCharacter, deathday: e.target.value })}
              margin="normal"
              InputLabelProps={{ shrink: true }}
            />
            <FormControl margin="normal" fullWidth>
              <InputLabel id="user-select-label">User</InputLabel>
              <Select
                labelId="user-select-label"
                value={updateCharacter.user_id}
                onChange={(e) => setUpdateCharacter({ ...updateCharacter, user_id: e.target.value })}
              >
                {users
                  .filter((user) => user.role === 'Player')
                  .map((user) => (
                    <MenuItem key={user.id} value={user.id}>
                      {user.username}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            <FormControl margin="normal">
              <InputLabel htmlFor="active-checkbox">Active</InputLabel>
              <Checkbox
                id="active-checkbox"
                checked={updateCharacter.active}
                onChange={(e) => setUpdateCharacter({ ...updateCharacter, active: e.target.checked })}
              />
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCharacterUpdateSubmit} color="primary" variant="contained">
              Update
            </Button>
            <Button onClick={() => setUpdateCharacterDialogOpen(false)} color="secondary" variant="contained">
              Cancel
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Container>
  );
};

export default CharacterAndUserManagement;