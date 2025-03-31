// frontend/src/components/pages/Fame.js
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Container,
    Divider,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import api from '../../utils/api';
import { fetchActiveUser } from '../../utils/utils';
import { isDM } from '../../utils/auth';

const Fame = () => {
    const [famePoints, setFamePoints] = useState(0);
    const [prestige, setPrestige] = useState(0);
    const [characters, setCharacters] = useState([]);
    const [activeCharacterId, setActiveCharacterId] = useState(null);
    const [fameSystem, setFameSystem] = useState('fame');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isDMUser, setIsDMUser] = useState(false);

    // For DM: Add points form
    const [characterToModify, setCharacterToModify] = useState('');
    const [pointsToAdd, setPointsToAdd] = useState(0);
    const [reason, setReason] = useState('');

    useEffect(() => {
        const initializeComponent = async () => {
            setLoading(true);
            setIsDMUser(isDM());

            try {
                // Fetch system type (fame or infamy)
                const fameSystemResponse = await api.get('/settings/fame-system');
                const systemType = fameSystemResponse.data?.value || 'fame';
                setFameSystem(systemType);

                // Fetch active character
                const activeUser = await fetchActiveUser();
                if (activeUser?.activeCharacterId) {
                    setActiveCharacterId(activeUser.activeCharacterId);

                    // Fetch fame points for the active character
                    await fetchFamePoints(activeUser.activeCharacterId);
                }

                // If DM, fetch all characters
                if (isDM()) {
                    const charactersResponse = await api.get('/user/active-characters');
                    setCharacters(charactersResponse.data);
                }
            } catch (error) {
                console.error('Error initializing Fame component:', error);
                setError('Failed to load fame data. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        initializeComponent();
    }, []);

    const fetchFamePoints = async (characterId) => {
        try {
            // This is a placeholder - we'll need to implement this API endpoint
            const response = await api.get(`/fame/${characterId}`);
            if (response.data) {
                setFamePoints(response.data.points || 0);
                setPrestige(calculatePrestige(response.data.points || 0));
            }
        } catch (error) {
            console.error('Error fetching fame points:', error);
            // If endpoint doesn't exist yet, don't show error
            if (error.response && error.response.status !== 404) {
                setError('Failed to fetch fame points.');
            }
        }
    };

    const calculatePrestige = (points) => {
        // Pathfinder rules: 10 fame points = 1 prestige
        return Math.floor(points / 10);
    };

    const handleAddPoints = async () => {
        try {
            setError('');
            setSuccess('');

            if (!characterToModify) {
                setError('Please select a character');
                return;
            }

            if (!pointsToAdd || pointsToAdd === 0) {
                setError('Please enter a non-zero value');
                return;
            }

            // This is a placeholder - we'll need to implement this API endpoint
            await api.post('/fame/add-points', {
                characterId: characterToModify,
                points: parseInt(pointsToAdd, 10),
                reason: reason
            });

            setSuccess(`Successfully ${pointsToAdd > 0 ? 'added' : 'removed'} ${Math.abs(pointsToAdd)} ${fameSystem === 'fame' ? 'Fame' : 'Infamy'} points`);

            // Reset form
            setPointsToAdd(0);
            setReason('');

            // Refresh data if needed
            if (characterToModify === activeCharacterId) {
                fetchFamePoints(activeCharacterId);
            }
        } catch (error) {
            console.error('Error adding points:', error);
            setError('Failed to update points.');
        }
    };

    const getPageTitle = () => {
        return fameSystem === 'fame' ? 'Fame' : 'Infamy';
    };

    const getFameRules = () => {
        if (fameSystem === 'fame') {
            return (
                <Box mt={2}>
                    <Typography variant="h6">Fame Rules</Typography>
                    <Typography variant="body1" paragraph>
                        Fame represents your character's reputation and standing within a particular organization or region.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Fame Points:</strong> These are earned through completing missions, helping NPCs, and advancing the goals of factions you belong to.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Prestige:</strong> For every 10 Fame points, you gain 1 Prestige point. Prestige can be spent on special rewards, favors, and benefits.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Benefits:</strong> Higher Fame may grant access to special equipment, services, or information from allied organizations.
                    </Typography>
                </Box>
            );
        } else {
            return (
                <Box mt={2}>
                    <Typography variant="h6">Infamy Rules (Skull & Shackles)</Typography>
                    <Typography variant="body1" paragraph>
                        Infamy represents your reputation as a fearsome pirate in the Shackles and beyond.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Infamy Points:</strong> You earn these by plundering, performing daring deeds, defeating worthy foes, and building your pirate legend.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Disrepute:</strong> For every 10 Infamy points, you gain 1 Disrepute point, which can be spent on special rewards and favors from other pirates.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Benefits:</strong> Higher Infamy may intimidate enemies, grant access to pirate havens, and earn respect from other captains.
                    </Typography>
                </Box>
            );
        }
    };

    if (loading) {
        return (
            <Container maxWidth="lg">
                <Typography>Loading...</Typography>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg">
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h5">{getPageTitle()} System</Typography>
                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}

                <Box mt={3} display="flex" justifyContent="space-between">
                    <Box>
                        <Typography variant="h6">Your {fameSystem === 'fame' ? 'Fame' : 'Infamy'}</Typography>
                        <Typography variant="h3">{famePoints}</Typography>
                        <Typography variant="subtitle1">
                            {fameSystem === 'fame' ? 'Prestige' : 'Disrepute'}: {prestige}
                        </Typography>
                    </Box>
                </Box>

                {getFameRules()}
            </Paper>

            {isDMUser && (
                <Paper sx={{ p: 3 }}>
                    <Typography variant="h6">Add/Remove Points (DM)</Typography>
                    <Box mt={2} component="form" noValidate>
                        <Box mb={2}>
                            <TextField
                                select
                                fullWidth
                                label="Character"
                                value={characterToModify}
                                onChange={(e) => setCharacterToModify(e.target.value)}
                                SelectProps={{
                                    native: true,
                                }}
                            >
                                <option value="">Select a character</option>
                                {characters.map((char) => (
                                    <option key={char.id} value={char.id}>
                                        {char.name}
                                    </option>
                                ))}
                            </TextField>
                        </Box>

                        <Box mb={2}>
                            <TextField
                                fullWidth
                                label={`Points to ${pointsToAdd > 0 ? 'add' : 'remove'}`}
                                type="number"
                                value={pointsToAdd}
                                onChange={(e) => setPointsToAdd(e.target.value)}
                                helperText="Use negative values to remove points"
                            />
                        </Box>

                        <Box mb={2}>
                            <TextField
                                fullWidth
                                label="Reason"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                multiline
                                rows={2}
                            />
                        </Box>

                        <Button
                            variant="contained"
                            color="primary"
                            onClick={handleAddPoints}
                            disabled={!characterToModify || pointsToAdd === 0}
                        >
                            {pointsToAdd > 0 ? 'Add' : 'Remove'} Points
                        </Button>
                    </Box>
                </Paper>
            )}
        </Container>
    );
};

export default Fame;