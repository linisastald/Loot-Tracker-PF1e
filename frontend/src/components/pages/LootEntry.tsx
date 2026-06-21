import React, {useEffect, useState} from 'react';
import {fetchInitialData, prepareEntryForSubmission, validateLootEntries} from '../../utils/lootEntryUtils';
import useLootEntryForm from '../../hooks/useLootEntryForm';
import {notifyLootCountsChanged} from '../../utils/events';
import {Alert, Box, Button, Container, Paper, Typography} from '@mui/material';
import EntryForm from './EntryForm';
import api from '../../utils/api';
import {useAuth} from '../../contexts/AuthContext';

const LootEntry = () => {
    const {
        entries,
        setEntries,
        error,
        setError,
        success,
        setSuccess,
        handleAddEntry,
        handleRemoveEntry,
        handleEntryChange,
        resetForm
    } = useLootEntryForm();

    const [activeCharacterId, setActiveCharacterId] = useState(null);
    const [itemOptions, setItemOptions] = useState([]);
    const [characters, setCharacters] = useState([]);
    const {isDM} = useAuth();

    useEffect(() => {
        fetchInitialData(setItemOptions, setActiveCharacterId);
    }, []);

    // DMs can attribute a gold entry to any character, so load the list for them
    useEffect(() => {
        if (!isDM) return;
        const loadCharacters = async () => {
            try {
                const response = await api.get('/user/active-characters');
                const rows = response.data || response;
                setCharacters(Array.isArray(rows) ? rows.map((r) => ({id: r.id, name: r.name})) : []);
            } catch (err) {
                console.error('Failed to fetch characters:', err);
            }
        };
        loadCharacters();
    }, [isDM]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const {validEntries, invalidEntries} = validateLootEntries(entries);

        if (validEntries.length === 0) {
            setError('No valid entries to submit');
            return;
        }

        try {
            const processedEntries = await Promise.all(
                validEntries.map(entry => prepareEntryForSubmission(entry, activeCharacterId))
            );

            const processedCount = processedEntries.filter(entry => entry).length;

            setSuccess(`Successfully processed ${processedCount} entries.`);

            // New unprocessed loot rows just got created — refresh sidebar badges.
            if (processedCount > 0) {
                notifyLootCountsChanged();
            }

            // Keep only invalid entries in the form
            setEntries(invalidEntries);

            if (invalidEntries.length > 0) {
                setError(`${invalidEntries.length} entries were not submitted due to errors.`);
            }
        } catch (error) {
            console.error('Error submitting entries', error);
            setError('An error occurred while submitting entries. Please try again.');
        }
    };

    // The action bar is rendered both stickied to the top and to the bottom so
    // the buttons stay reachable no matter how far you've scrolled while adding
    // a long list of entries.
    const renderActionBar = (placement: 'top' | 'bottom') => (
        <Box sx={{
            position: 'sticky',
            [placement]: 0,
            left: 0,
            right: 0,
            zIndex: 1100,
            backgroundColor: 'background.default',
            pt: 2,
            pb: 2,
        }}>
            <Paper sx={{ p: { xs: 1.5, md: 2 } }}>
                <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 1,
                }}>
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={() => handleAddEntry('item')}
                        fullWidth
                        sx={{ flex: { sm: 1 } }}
                    >
                        Add Item Entry
                    </Button>
                    <Button
                        variant="outlined"
                        color="secondary"
                        onClick={() => handleAddEntry('gold')}
                        fullWidth
                        sx={{ flex: { sm: 1 } }}
                    >
                        Add Gold Entry
                    </Button>
                    <Button
                        type="submit"
                        variant="outlined"
                        color="primary"
                        onClick={handleSubmit}
                        fullWidth
                        sx={{ flex: { sm: 1 } }}
                    >
                        Submit
                    </Button>
                </Box>
            </Paper>
        </Box>
    );

    return (
        <Container maxWidth={false} component="main">
            {renderActionBar('top')}

            {error && <Alert severity="error" sx={{mt: 2, mb: 2}}>{error}</Alert>}
            {success && <Alert severity="success" sx={{mt: 2, mb: 2}}>{success}</Alert>}

            <form onSubmit={handleSubmit}>
                {entries.map((entry, index) => (
                    <EntryForm
                        key={index}
                        entry={entry}
                        index={index}
                        onRemove={() => handleRemoveEntry(index)}
                        onChange={handleEntryChange}
                        isDM={isDM}
                        characters={characters}
                    />
                ))}
            </form>

            {renderActionBar('bottom')}
        </Container>
    );
};

export default LootEntry;