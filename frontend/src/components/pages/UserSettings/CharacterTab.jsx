import React, {useEffect, useState} from 'react';
import api from '../../../utils/api';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {Add as AddIcon, Edit as EditIcon, Star as StarIcon, StarBorder as StarBorderIcon} from '@mui/icons-material';
import HeartBrokenIcon from '@mui/icons-material/HeartBroken';
import { useAuth } from '../../../contexts/AuthContext';
import { useCampaign } from '../../../contexts/CampaignContext';
import { useCampaignTimezone } from '../../../hooks/useCampaignTimezone';
import { formatInCampaignTimezone } from '../../../utils/timezoneUtils';

const EMPTY_CHARACTER = {
    name: '',
    appraisal_bonus: 0,
    birthday: '',
    deathday: '',
    active: false
};

// The API serialises DATE columns as ISO timestamps; keep the calendar date part
const toDateInput = (value) => (value ? new Date(value).toISOString().split('T')[0] : '');

const CharacterTab = () => {
    const [characters, setCharacters] = useState([]);
    const [openDialog, setOpenDialog] = useState(false);
    const [dialogMode, setDialogMode] = useState('add'); // 'add' or 'edit'
    const [selectedCharacter, setSelectedCharacter] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Campaign timezone hook
    const { timezone } = useCampaignTimezone();
    // AuthContext caches the active character id, so refresh it after changes
    const { refreshUser } = useAuth();
    // ...and so does the campaign context, which serves the active character of the
    // SELECTED campaign (what the loot pages read). This tab is campaign-agnostic:
    // it lists the user's characters in every campaign they belong to, and a new
    // character can be created in any of them (default: the open campaign).
    const { refresh: refreshCampaign, campaigns: memberCampaigns, currentCampaign } = useCampaign();
    const campaigns = Array.isArray(memberCampaigns) ? memberCampaigns : [];
    const multiCampaign = campaigns.length > 1;

    const [characterForm, setCharacterForm] = useState(EMPTY_CHARACTER);
    // Campaign for a NEW character ('' = the open campaign, i.e. no campaignId sent)
    const [newCharacterCampaignId, setNewCharacterCampaignId] = useState('');

    // Delete confirmation dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [characterToDelete, setCharacterToDelete] = useState(null);

    useEffect(() => {
        fetchCharacters();
    }, []);

    const fetchCharacters = async () => {
        try {
            // Every campaign the user belongs to, each row with its campaign
            const response = await api.get('/user/characters', { params: { scope: 'all' } });
            setCharacters(response.data);
        } catch {
            setError('Failed to load characters');
        }
    };

    /**
     * Send a character change, then report, reload the list and refresh the
     * cached user (a changed active character must reach the rest of the app).
     * Returns true on success so callers can close their dialogs.
     */
    const saveCharacter = async (request, successMessage, errorMessage) => {
        try {
            await request();
            setSuccess(successMessage);
            setError('');
            await Promise.all([
                fetchCharacters(),
                refreshUser().catch(() => {}),
                refreshCampaign().catch(() => {}),
            ]);
            return true;
        } catch {
            setError(errorMessage);
            setSuccess('');
            return false;
        }
    };

    const handleOpenAddDialog = () => {
        setDialogMode('add');
        setCharacterForm(EMPTY_CHARACTER);
        setNewCharacterCampaignId(currentCampaign?.id ? String(currentCampaign.id) : '');
        setOpenDialog(true);
    };

    const handleOpenEditDialog = (character) => {
        setDialogMode('edit');
        setSelectedCharacter(character);
        setCharacterForm({
            name: character.name,
            appraisal_bonus: character.appraisal_bonus || 0,
            birthday: toDateInput(character.birthday),
            deathday: toDateInput(character.deathday),
            active: character.active || false
        });
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setSelectedCharacter(null);
    };

    const handleFormChange = (e) => {
        const {name, value, checked} = e.target;
        setCharacterForm(prev => ({
            ...prev,
            [name]: name === 'active' ? checked : value
        }));
    };

    const handleSetActive = async (characterId) => {
        const character = characters.find(c => c.id === characterId);
        // Nothing to do when unknown or already active
        if (!character || character.active) return;

        await saveCharacter(
            () => api.put('/user/characters', {id: characterId, active: true}),
            `${character.name} is now your active character`,
            'Failed to set active character'
        );
    };

    const handleKillCharacter = (character) => {
        setCharacterToDelete(character);
        setDeleteDialogOpen(true);
    };

    const confirmKillCharacter = async () => {
        // "Today" in the campaign's timezone, not UTC (evening sessions west of UTC)
        const today = formatInCampaignTimezone(new Date(), timezone || 'UTC', 'yyyy-MM-dd');

        // A dead character is no longer active
        const saved = await saveCharacter(
            () => api.put('/user/characters', {id: characterToDelete.id, deathday: today, active: false}),
            `${characterToDelete.name} has fallen in battle. RIP.`,
            'Failed to update character death status'
        );
        if (saved) {
            setDeleteDialogOpen(false);
            setCharacterToDelete(null);
        }
    };

    const handleSubmit = async () => {
        const isAdd = dialogMode === 'add';
        // Only name a campaign when the user could choose one; otherwise the
        // server creates the character in the open campaign.
        const addPayload = multiCampaign && newCharacterCampaignId
            ? {...characterForm, campaignId: Number(newCharacterCampaignId)}
            : characterForm;
        const saved = await saveCharacter(
            () => isAdd
                ? api.post('/user/characters', addPayload)
                : api.put('/user/characters', {...characterForm, id: selectedCharacter.id}),
            isAdd ? 'Character created successfully' : 'Character updated successfully',
            'Failed to save character'
        );
        if (saved) {
            handleCloseDialog();
        }
    };

    return (
        <div>
            <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3}}>
                <Typography variant="h6">Character Management</Typography>
                <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<AddIcon/>}
                    onClick={handleOpenAddDialog}
                >
                    Add Character
                </Button>
            </Box>

            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {success && <Alert severity="success" sx={{mb: 2}}>{success}</Alert>}

            {characters.length === 0 ? (
                <Card>
                    <CardContent>
                        <Typography variant="body1" align="center">
                            You don't have any characters yet. Create one to get started!
                        </Typography>
                    </CardContent>
                </Card>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Campaign</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Appraisal Bonus</TableCell>
                                <TableCell>Birthday</TableCell>
                                <TableCell>Deathday</TableCell>
                                <TableCell>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {characters.map((character) => (
                                <TableRow key={character.id}>
                                    <TableCell>
                                        <Box sx={{display: 'flex', alignItems: 'center'}}>
                                            {character.name}
                                            {character.active && (
                                                <Chip
                                                    size="small"
                                                    color="primary"
                                                    label="Active"
                                                    sx={{ml: 1}}
                                                />
                                            )}
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5}}>
                                            {character.campaign_name || '—'}
                                            {character.campaign_active === false && (
                                                <Chip size="small" variant="outlined" label="Inactive campaign"/>
                                            )}
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        {character.deathday ? 'Deceased' : 'Alive'}
                                    </TableCell>
                                    <TableCell>+{character.appraisal_bonus || 0}</TableCell>
                                    <TableCell>
                                        {timezone && character.birthday
                                            ? formatInCampaignTimezone(character.birthday, timezone, 'PPPP')
                                            : 'Not set'}
                                    </TableCell>
                                    <TableCell>
                                        {timezone && character.deathday
                                            ? formatInCampaignTimezone(character.deathday, timezone, 'PPPP')
                                            : 'Not set'}
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{display: 'flex'}}>
                                            <Tooltip title="Set as Active Character">
                                                <IconButton
                                                    color="primary"
                                                    onClick={() => handleSetActive(character.id)}
                                                    disabled={character.active}
                                                >
                                                    {character.active ? <StarIcon/> : <StarBorderIcon/>}
                                                </IconButton>
                                            </Tooltip>

                                            <Tooltip title="Edit Character">
                                                <IconButton
                                                    color="primary"
                                                    onClick={() => handleOpenEditDialog(character)}
                                                >
                                                    <EditIcon/>
                                                </IconButton>
                                            </Tooltip>

                                            <Tooltip title="Kill Character">
                                                <IconButton
                                                    color="error"
                                                    onClick={() => handleKillCharacter(character)}
                                                    disabled={character.deathday !== null && character.deathday !== ''}
                                                >
                                                    <HeartBrokenIcon/>
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Character Form Dialog */}
            <Dialog
                open={openDialog}
                onClose={handleCloseDialog}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    {dialogMode === 'add' ? 'Create New Character' : `Edit ${selectedCharacter?.name}`}
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{mt: 1}}>
                        {dialogMode === 'add' && multiCampaign && (
                            <Grid size={12}>
                                <FormControl fullWidth>
                                    <InputLabel id="new-character-campaign-label">Campaign</InputLabel>
                                    <Select
                                        labelId="new-character-campaign-label"
                                        label="Campaign"
                                        value={newCharacterCampaignId}
                                        onChange={(e) => setNewCharacterCampaignId(String(e.target.value))}
                                    >
                                        {campaigns.map((campaign) => (
                                            <MenuItem key={campaign.id} value={String(campaign.id)}>{campaign.name}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        )}
                        {dialogMode === 'edit' && selectedCharacter?.campaign_name && (
                            <Grid size={12}>
                                <Typography variant="body2" sx={{color: 'text.secondary'}}>
                                    Campaign: {selectedCharacter.campaign_name}
                                </Typography>
                            </Grid>
                        )}
                        <Grid size={12}>
                            <TextField
                                label="Character Name"
                                name="name"
                                fullWidth
                                value={characterForm.name}
                                onChange={handleFormChange}
                                required
                            />
                        </Grid>
                        <Grid size={{xs: 12, md: 6}}>
                            <TextField
                                label="Appraisal Bonus"
                                name="appraisal_bonus"
                                type="number"
                                fullWidth
                                value={characterForm.appraisal_bonus}
                                onChange={handleFormChange}
                                slotProps={{ htmlInput: {min: 0} }}
                            />
                        </Grid>
                        <Grid size={{xs: 12, md: 6}}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={characterForm.active}
                                        onChange={handleFormChange}
                                        name="active"
                                        color="primary"
                                    />
                                }
                                label="Set as Active Character"
                            />
                        </Grid>
                        <Grid size={{xs: 12, md: 6}}>
                            <TextField
                                label="Birthday"
                                name="birthday"
                                type="date"
                                fullWidth
                                value={characterForm.birthday}
                                onChange={handleFormChange}
                                slotProps={{ inputLabel: {shrink: true} }}
                            />
                        </Grid>
                        <Grid size={{xs: 12, md: 6}}>
                            <TextField
                                label="Deathday (if applicable)"
                                name="deathday"
                                type="date"
                                fullWidth
                                value={characterForm.deathday}
                                onChange={handleFormChange}
                                slotProps={{ inputLabel: {shrink: true} }}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button
                        onClick={handleSubmit}
                        variant="contained"
                        color="primary"
                        disabled={!characterForm.name.trim()}
                    >
                        {dialogMode === 'add' ? 'Create Character' : 'Update Character'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Kill Character Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
                <DialogTitle>Confirm Character Death</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure {characterToDelete?.name} has fallen in battle? This will mark the character as
                        deceased with today's date.
                    </Typography>
                    {characterToDelete?.active && (
                        <Alert severity="warning" sx={{mt: 2}}>
                            This character is currently active. Another character will need to be set as active after
                            confirming death.
                        </Alert>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={confirmKillCharacter}
                        variant="contained"
                        color="error"
                        startIcon={<HeartBrokenIcon/>}
                    >
                        Confirm Death
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default CharacterTab;