// frontend/src/components/pages/DMSettings/CharacterManagement.js
import React, {useEffect, useState} from 'react';
import api from '../../../utils/api';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography
} from '@mui/material';

const CharacterManagement = () => {
    const [characters, setCharacters] = useState([]);
    const [users, setUsers] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [updateCharacterDialogOpen, setUpdateCharacterDialogOpen] = useState(false);
    const [selectedCharacter, setSelectedCharacter] = useState(null);
    const [updateCharacter, setUpdateCharacter] = useState({
        name: '',
        appraisal_bonus: '',
        birthday: '',
        deathday: '',
        active: true,
        user_id: '',
    });
    const [sortConfig, setSortConfig] = useState({key: 'name', direction: 'asc'});

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [charactersResponse, usersResponse] = await Promise.all([
                api.get(`/user/all-characters`),
                api.get(`/user/all`)
            ]);
            setCharacters(charactersResponse.data);
            setUsers(usersResponse.data);
        } catch (error) {
            console.error('Error fetching data', error);
            setError('Error loading data. Please try again.');
        }
    };

    const handleSort = (columnKey) => {
        let direction = 'asc';
        if (sortConfig.key === columnKey && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({key: columnKey, direction});
    };

    const handleUpdateCharacter = (char) => {
        setSelectedCharacter(char);
        setUpdateCharacter({
            name: char.name,
            appraisal_bonus: char.appraisal_bonus,
            birthday: formatDateForInput(char.birthday),
            deathday: formatDateForInput(char.deathday),
            active: char.active,
            user_id: char.user_id,
        });
        setUpdateCharacterDialogOpen(true);
    };

    const handleCharacterUpdateSubmit = async () => {
        try {
            // Use the DM-specific endpoint for updating any character
            await api.put(
                `/user/update-any-character`,
                {...selectedCharacter, ...updateCharacter}
            );
            setUpdateCharacterDialogOpen(false);
            setSuccess('Character updated successfully');
            setError('');
            setSelectedCharacter(null);

            // Refresh characters list
            fetchData();
        } catch (err) {
            setError('Error updating character');
            setSuccess('');
        }
    };

    const formatDateForInput = (dateString) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '';

            // Convert to YYYY-MM-DD format for HTML date input
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        } catch (error) {
            console.error('Error formatting date for input:', error);
            return '';
        }
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
        <div>
            <Typography variant="h6" gutterBottom>Character Management</Typography>

            {success && <Alert severity="success" sx={{mt: 2, mb: 2}}>{success}</Alert>}
            {error && <Alert severity="error" sx={{mt: 2, mb: 2}}>{error}</Alert>}

            <TableContainer component={Paper} sx={{mt: 2}}>
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
            <Typography variant="body2" sx={{mt: 2}}>Click on a character to edit</Typography>

            {/* Edit Character Dialog */}
            <Dialog open={updateCharacterDialogOpen} onClose={() => setUpdateCharacterDialogOpen(false)}>
                <DialogTitle>Update Character</DialogTitle>
                <DialogContent>
                    <TextField
                        label="Name"
                        fullWidth
                        value={updateCharacter.name}
                        onChange={(e) => setUpdateCharacter({...updateCharacter, name: e.target.value})}
                        margin="normal"
                    />
                    <TextField
                        label="Appraisal Bonus"
                        type="number"
                        fullWidth
                        value={updateCharacter.appraisal_bonus}
                        onChange={(e) => setUpdateCharacter({...updateCharacter, appraisal_bonus: e.target.value})}
                        margin="normal"
                    />
                    <TextField
                        label="Birthday"
                        type="date"
                        fullWidth
                        value={updateCharacter.birthday || ''}
                        onChange={(e) => setUpdateCharacter({...updateCharacter, birthday: e.target.value})}
                        margin="normal"
                        InputLabelProps={{shrink: true}}
                    />
                    <TextField
                        label="Deathday"
                        type="date"
                        fullWidth
                        value={updateCharacter.deathday || ''}
                        onChange={(e) => setUpdateCharacter({...updateCharacter, deathday: e.target.value})}
                        margin="normal"
                        InputLabelProps={{shrink: true}}
                    />
                    <FormControl margin="normal" fullWidth>
                        <InputLabel id="user-select-label">User</InputLabel>
                        <Select
                            labelId="user-select-label"
                            value={updateCharacter.user_id}
                            onChange={(e) => setUpdateCharacter({...updateCharacter, user_id: e.target.value})}
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
                                onChange={(e) => setUpdateCharacter({...updateCharacter, active: e.target.checked})}
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
        </div>
    );
};

export default CharacterManagement;