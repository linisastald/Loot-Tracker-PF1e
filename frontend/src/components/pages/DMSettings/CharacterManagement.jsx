// frontend/src/components/pages/DMSettings/CharacterManagement.jsx
import React, {useEffect, useMemo, useState} from 'react';
import {format, isValid, parseISO} from 'date-fns';
import api from '../../../utils/api';
import {getErrorMessage} from '../../../utils/apiErrors';
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

const COLUMNS = [
    {key: 'name', label: 'Name'},
    {key: 'username', label: 'User'},
    {key: 'active', label: 'Active'},
    {key: 'appraisal_bonus', label: 'Appraisal Bonus'},
    {key: 'birthday', label: 'Birthday'},
    {key: 'deathday', label: 'Deathday'},
];

const EMPTY_FORM = {
    name: '',
    appraisal_bonus: '',
    birthday: '',
    deathday: '',
    active: true,
    user_id: '',
};

// birthday/deathday are calendar dates (DATE columns, serialised as ISO
// timestamps at midnight): keep the YYYY-MM-DD part and never convert time zones
const calendarDate = (value) => {
    const match = typeof value === 'string' ? value.match(/^\d{4}-\d{2}-\d{2}/) : null;
    return match ? match[0] : '';
};

const formatDate = (value) => {
    const ymd = calendarDate(value);
    const date = ymd ? parseISO(ymd) : null;
    return date && isValid(date) ? format(date, 'PP') : '';
};

const compareValues = (a, b) => {
    const aValue = a ?? '';
    const bValue = b ?? '';
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
};

const CharacterManagement = () => {
    const [characters, setCharacters] = useState([]);
    const [users, setUsers] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [dialogError, setDialogError] = useState('');
    const [updateCharacterDialogOpen, setUpdateCharacterDialogOpen] = useState(false);
    const [selectedCharacter, setSelectedCharacter] = useState(null);
    const [updateCharacter, setUpdateCharacter] = useState(EMPTY_FORM);
    const [sortConfig, setSortConfig] = useState({key: 'name', direction: 'asc'});

    const setField = (key) => (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setUpdateCharacter((prev) => ({...prev, [key]: value}));
    };

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const charactersResponse = await api.get(`/user/all-characters`);
            setCharacters(charactersResponse.data);
            setError('');
        } catch {
            setError('Error loading data. Please try again.');
        }

        // The owner dropdown comes from the DM-scoped campaign roster. /user/all is
        // superadmin-only, so an ordinary campaign DM would be rejected there. A
        // roster failure must not stop the character list from rendering.
        try {
            const membersResponse = await api.get(`/campaigns/current/members`);
            const members = membersResponse?.data?.members || [];
            setUsers(members.map((member) => ({
                id: member.user_id,
                username: member.username,
                role: member.role
            })));
        } catch {
            // keep the previous roster
        }
    };

    const handleSort = (columnKey) => {
        const direction = sortConfig.key === columnKey && sortConfig.direction === 'asc' ? 'desc' : 'asc';
        setSortConfig({key: columnKey, direction});
    };

    const handleUpdateCharacter = (char) => {
        setSelectedCharacter(char);
        setUpdateCharacter({
            name: char.name,
            appraisal_bonus: char.appraisal_bonus,
            birthday: calendarDate(char.birthday),
            deathday: calendarDate(char.deathday),
            active: char.active,
            user_id: char.user_id,
        });
        setDialogError('');
        setUpdateCharacterDialogOpen(true);
    };

    const closeDialog = () => setUpdateCharacterDialogOpen(false);

    const handleCharacterUpdateSubmit = async () => {
        try {
            // DM-specific endpoint for updating any character; only the editable
            // fields are sent. appraisal_bonus is an INTEGER NOT NULL column, so a
            // cleared field means 0.
            await api.put(`/user/update-any-character`, {
                id: selectedCharacter.id,
                name: updateCharacter.name,
                appraisal_bonus: Number.parseInt(updateCharacter.appraisal_bonus, 10) || 0,
                birthday: updateCharacter.birthday,
                deathday: updateCharacter.deathday,
                active: updateCharacter.active,
                user_id: updateCharacter.user_id,
            });
            closeDialog();
            setSuccess('Character updated successfully');
            setError('');
            setSelectedCharacter(null);

            // Refresh characters list
            fetchData();
        } catch (err) {
            setDialogError(getErrorMessage(err, 'Error updating character'));
            setSuccess('');
        }
    };

    // Owner choices: everyone in this campaign (any campaign role), plus the
    // current owner if they are no longer a member, so the select is never blank
    const ownerOptions = useMemo(() => {
        const options = users.map((user) => ({id: user.id, label: user.username}));
        if (selectedCharacter && !options.some((option) => option.id === selectedCharacter.user_id)) {
            options.push({
                id: selectedCharacter.user_id,
                label: `${selectedCharacter.username || 'Unknown user'} (not a member)`
            });
        }
        return options;
    }, [users, selectedCharacter]);

    // Sort by the current column (for the boolean "Active" column, true sorts first when ascending)
    const sortedCharacters = useMemo(() => {
        const sign = sortConfig.direction === 'asc' ? 1 : -1;
        const valueOf = (char) => (sortConfig.key === 'active' ? !char.active : char[sortConfig.key]);
        return [...characters].sort((a, b) => sign * compareValues(valueOf(a), valueOf(b)));
    }, [characters, sortConfig]);

    return (
        <div>
            <Typography variant="h6" gutterBottom>Character Management</Typography>

            {success && <Alert severity="success" sx={{mt: 2, mb: 2}}>{success}</Alert>}
            {error && <Alert severity="error" sx={{mt: 2, mb: 2}}>{error}</Alert>}

            <TableContainer component={Paper} sx={{mt: 2}}>
                <Table>
                    <TableHead>
                        <TableRow>
                            {COLUMNS.map((column) => (
                                <TableCell key={column.key}>
                                    <TableSortLabel
                                        active={sortConfig.key === column.key}
                                        direction={sortConfig.direction}
                                        onClick={() => handleSort(column.key)}
                                    >
                                        {column.label}
                                    </TableSortLabel>
                                </TableCell>
                            ))}
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
            <Dialog open={updateCharacterDialogOpen} onClose={closeDialog}>
                <DialogTitle>Update Character</DialogTitle>
                <DialogContent>
                    {dialogError && <Alert severity="error" sx={{mb: 1}}>{dialogError}</Alert>}
                    <TextField
                        label="Name"
                        fullWidth
                        value={updateCharacter.name}
                        onChange={setField('name')}
                        margin="normal"
                    />
                    <TextField
                        label="Appraisal Bonus"
                        type="number"
                        fullWidth
                        value={updateCharacter.appraisal_bonus}
                        onChange={setField('appraisal_bonus')}
                        margin="normal"
                    />
                    <TextField
                        label="Birthday"
                        type="date"
                        fullWidth
                        value={updateCharacter.birthday || ''}
                        onChange={setField('birthday')}
                        margin="normal"
                        slotProps={{ inputLabel: {shrink: true} }}
                    />
                    <TextField
                        label="Deathday"
                        type="date"
                        fullWidth
                        value={updateCharacter.deathday || ''}
                        onChange={setField('deathday')}
                        margin="normal"
                        slotProps={{ inputLabel: {shrink: true} }}
                    />
                    <FormControl margin="normal" fullWidth>
                        <InputLabel id="user-select-label">User</InputLabel>
                        <Select
                            labelId="user-select-label"
                            value={updateCharacter.user_id}
                            onChange={setField('user_id')}
                        >
                            {ownerOptions.map((option) => (
                                <MenuItem key={option.id} value={option.id}>
                                    {option.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={updateCharacter.active}
                                onChange={setField('active')}
                            />
                        }
                        label="Active Character"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDialog} color="secondary" variant="outlined">
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
