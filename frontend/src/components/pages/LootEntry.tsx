import React, {useEffect, useState} from 'react';
import {fetchInitialData, prepareEntryForSubmission, validateLootEntries} from '../../utils/lootEntryUtils';
import {getErrorMessage} from '../../utils/apiErrors';
import useLootEntryForm from '../../hooks/useLootEntryForm';
import {notifyLootCountsChanged} from '../../utils/events';
import {Alert, Box, Button, Container, Paper} from '@mui/material';
import EntryForm from './EntryForm';
import api from '../../utils/api';
import {useCampaign, useIsDM} from '../../contexts/CampaignContext';
import {getDefaultItemQuantity} from '../../utils/itemEntryDefaults';

const LootEntry = () => {
    const {campaignSettings} = useCampaign();
    const {
        entries,
        setEntries,
        error,
        setError,
        success,
        setSuccess,
        handleAddEntry,
        handleRemoveEntry,
        handleEntryChange
    } = useLootEntryForm({defaultQuantity: getDefaultItemQuantity(campaignSettings)});

    const [itemOptions, setItemOptions] = useState([]);
    const [characters, setCharacters] = useState([]);
    const [hasOpenAiKey, setHasOpenAiKey] = useState(false);
    const isDM = useIsDM();

    useEffect(() => {
        fetchInitialData(setItemOptions);
    }, []);

    // Smart Item Detection needs an OpenAI key: ask once for the whole form
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await api.get('/settings/openai-key');
                if (!cancelled) setHasOpenAiKey(Boolean(response?.data?.hasKey));
            } catch {
                if (!cancelled) setHasOpenAiKey(false);
            }
        })();
        return () => { cancelled = true; };
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
        setError('');
        setSuccess('');

        const {validEntries, invalidEntries} = validateLootEntries(entries);

        if (validEntries.length === 0) {
            setError('No valid entries to submit');
            return;
        }

        // One request per entry: some may be saved while others fail, so settle them all and
        // keep only the failures in the form (re-submitting a saved entry would duplicate it).
        const results = await Promise.allSettled(
            validEntries.map(entry => prepareEntryForSubmission(entry))
        );

        const failedEntries = [];
        let savedCount = 0;
        results.forEach((result, i) => {
            if (result.status === 'fulfilled') {
                if (result.value) savedCount += 1;
            } else {
                failedEntries.push({
                    ...validEntries[i],
                    error: getErrorMessage(result.reason, 'Failed to submit this entry. Please try again.')
                });
            }
        });

        if (savedCount > 0) {
            setSuccess(`Successfully processed ${savedCount} entries.`);
            // New unprocessed loot rows just got created: refresh sidebar badges.
            notifyLootCountsChanged();
        }

        // Keep only the entries that were not saved
        const remaining = [...invalidEntries, ...failedEntries];
        setEntries(remaining);

        if (remaining.length > 0) {
            setError(`${remaining.length} entries were not submitted due to errors.`);
        }
    };

    // The action bar is rendered both stickied to the top and to the bottom so
    // the buttons stay reachable no matter how far you've scrolled while adding
    // a long list of entries.
    const actions: Array<{label: string; color: 'primary' | 'secondary'; onClick: (e) => void; type?: 'submit'}> = [
        {label: 'Add Item Entry', color: 'primary', onClick: () => handleAddEntry('item')},
        {label: 'Add Gold Entry', color: 'secondary', onClick: () => handleAddEntry('gold')},
        {label: 'Submit', color: 'primary', onClick: handleSubmit, type: 'submit'},
    ];

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
                    {actions.map(({label, color, onClick, type}) => (
                        <Button
                            key={label}
                            type={type}
                            variant="outlined"
                            color={color}
                            onClick={onClick}
                            fullWidth
                            sx={{ flex: { sm: 1 } }}
                        >
                            {label}
                        </Button>
                    ))}
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
                        key={entry.id ?? index}
                        entry={entry}
                        index={index}
                        onRemove={() => handleRemoveEntry(index)}
                        onChange={handleEntryChange}
                        isDM={isDM}
                        characters={characters}
                        hasOpenAiKey={hasOpenAiKey}
                        initialItemOptions={itemOptions}
                    />
                ))}
            </form>

            {renderActionBar('bottom')}
        </Container>
    );
};

export default LootEntry;