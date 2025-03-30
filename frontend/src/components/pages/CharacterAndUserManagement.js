import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
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
  FormControlLabel,
  InputLabel,
  InputAdornment,
  FormHelperText,
  IconButton,
  Tabs,
  Tab,
  Alert,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

// Tab panel component
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`management-tabpanel-${index}`}
      aria-labelledby={`management-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

// Tab props
function a11yProps(index) {
  return {
    id: `management-tab-${index}`,
    'aria-controls': `management-tabpanel-${index}`,
  };
}

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
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [updateCharacter, setUpdateCharacter] = useState({
    name: '',
    appraisal_bonus: '',
    birthday: '',
    deathday: '',
    active: true,
    user_id: '',
  });
  const [tabValue, setTabValue] = useState(0); // For tabs

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersResponse, charactersResponse, settingsResponse, campaignResponse] = await Promise.all([
          api.get(`/user/all`),
          api.get(`/user/all-characters`),
          api.get(`/user/settings`),
          api.get('/settings/campaign-name')
        ]);
        setUsers(usersResponse.data);
        setCharacters(charactersResponse.data);
        const registrationSetting = settingsResponse.data.find(setting => setting.name === 'registrations open');
        setRegistrationOpen(registrationSetting?.value === 1);

        // Set campaign name if available
        if (campaignResponse.data && campaignResponse.data.value) {
          setCampaignName(campaignResponse.data.value);
        }
      } catch (error) {
        console.error('Error fetching data', error);
      }
    };

    fetchData();
  }, []);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleSort = (columnKey) => {
    let direction = 'asc';
    if (sortConfig.key === columnKey && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: columnKey, direction });
  };

  const handleRegistrationToggle = async () => {
    try {
      const newValue = registrationOpen ? 0 : 1;
      await api.put(
        `/user/update-setting`,
        { name: 'registrations open', value: newValue }
      );
      setRegistrationOpen(!registrationOpen);
      setSuccess(`Registration ${!registrationOpen ? 'opened' : 'closed'} successfully`);
      setError('');
    } catch (error) {
      console.error('Error updating registration setting', error);
      setError('Error updating registration setting');
      setSuccess('');
    }
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
            { userId }
          )
        )
      );
      setSelectedUsers([]);
      setSuccess('User(s) deleted successfully');
      setError('');
      setDeleteUserDialogOpen(false);

      // Refresh users list
      const usersResponse = await api.get(`/user/all`);
      setUsers(usersResponse.data);
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
      await api.put(
        `/user/characters`,
        { ...selectedCharacter, ...updateCharacter }
      );
      setUpdateCharacterDialogOpen(false);
      setSuccess('Character updated successfully');
      setError('');
      setSelectedCharacter(null);

      // Refresh characters list
      const charactersResponse = await api.get(`/user/all-characters`);
      setCharacters(charactersResponse.data);
    } catch (err) {
      setError('Error updating character');
      setSuccess('');
    }
  };

  const handleCampaignNameChange = async () => {
    try {
      await api.put('/user/update-setting', {
        name: 'campaign_name',
        value: campaignName
      });
      setSuccess('Campaign name updated successfully');
      setError('');
    } catch (err) {
      setError('Error updating campaign name');
      setSuccess('');
    }
  };

  // Sort characters based on current sort configuration
  const sortedCharacters = [...characters].sort((a, b) => {
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    // Handle special cases
    if (sortConfig.key === 'username') {
      aValue = a.username || '';
      bValue = b.username || '';
    } else if (sortConfig.key === 'active') {
      return sortConfig.direction === 'asc'
        ? (a.active === b.active ? 0 : a.active ? -1 : 1)
        : (a.active === b.active ? 0 : a.active ? 1 : -1);
    }

    // Null checks
    if (aValue === null) aValue = '';
    if (bValue === null) bValue = '';

    // Compare the values
    if (aValue < bValue) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Character and User Management</Typography>

        {success && <Alert severity="success" sx={{ mt: 2, mb: 2 }}>{success}</Alert>}
        {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>}

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 2 }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label="management tabs"
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="System Settings" {...a11yProps(0)} />
            <Tab label="User Management" {...a11yProps(1)} />
            <Tab label="Character Management" {...a11yProps(2)} />
            <Tab label="Campaign Settings" {...a11yProps(3)} />
          </Tabs>
        </Box>

        {/* System Settings Tab */}
        <TabPanel value={tabValue} index={0}>
          <Typography variant="h6" gutterBottom>System Settings</Typography>

          <Box mt={2} mb={2}>
            <Typography variant="body1" gutterBottom>Registration Status: {registrationOpen ? 'Open' : 'Closed'}</Typography>
            <Button
              variant="outlined"
              color={registrationOpen ? "secondary" : "primary"}
              onClick={handleRegistrationToggle}
            >
              {registrationOpen ? 'Close Registration' : 'Open Registration'}
            </Button>
          </Box>

          {/* Additional system settings can be added here */}
        </TabPanel>

        {/* User Management Tab */}
        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" gutterBottom>User Management</Typography>

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
        </TabPanel>

        {/* Character Management Tab */}
        <TabPanel value={tabValue} index={2}>
          <Typography variant="h6" gutterBottom>Character Management</Typography>

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
                  <TableRow
                    key={char.id}
                    onClick={() => handleUpdateCharacter(char)}
                    style={{
                      cursor: 'pointer',
                      ...(char.active && {
                        outline: '2px solid #4caf50', // Green outline for active characters
                        boxShadow: '0 0 10px rgba(76, 175, 80, 0.3)',
                        backgroundColor: 'rgba(76, 175, 80, 0.05)'
                      })
                    }}
                  >
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
          <Typography variant="body2" sx={{ mt: 2 }}>Click on a character to edit</Typography>
        </TabPanel>

        {/* Campaign Settings Tab */}
        <TabPanel value={tabValue} index={3}>
          <Typography variant="h6" gutterBottom>Campaign Settings</Typography>

          <Box mt={2} mb={2} sx={{ maxWidth: 500 }}>
            <TextField
              fullWidth
              label="Campaign Name"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              margin="normal"
            />
            <Button
              variant="outlined"
              color="primary"
              onClick={handleCampaignNameChange}
              sx={{ mt: 2 }}
            >
              Update Campaign Name
            </Button>
          </Box>

          {/* Additional campaign settings can be added here */}
        </TabPanel>
      </Paper>

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

      {/* Edit Character Dialog */}
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
            value={updateCharacter.birthday || ''}
            onChange={(e) => setUpdateCharacter({ ...updateCharacter, birthday: e.target.value })}
            margin="normal"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Deathday"
            type="date"
            fullWidth
            value={updateCharacter.deathday || ''}
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
          <FormControlLabel
            control={
              <Checkbox
                checked={updateCharacter.active}
                onChange={(e) => setUpdateCharacter({ ...updateCharacter, active: e.target.checked })}
              />
            }
            label="Active Character"
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUpdateCharacterDialogOpen(false)} color="secondary" variant="outlined">
            Cancel
          </Button>
          <Button onClick={handleCharacterUpdateSubmit} color="primary" variant="outlined">
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default CharacterAndUserManagement;