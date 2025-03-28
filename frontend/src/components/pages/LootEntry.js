import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import {
  validateLootEntries,
  prepareEntryForSubmission,
  fetchInitialData,
  fetchItemNames
} from '../../utils/lootEntryUtils';
import useLootEntryForm from '../../hooks/useLootEntryForm';
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
  Alert
} from '@mui/material';
import EntryForm from './EntryForm';

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

  useEffect(() => {
    fetchInitialData(setItemOptions, setActiveCharacterId);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { validEntries, invalidEntries } = validateLootEntries(entries);

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

  return (
    <Container maxWidth={false} component="main">
      <Box sx={{ position: 'sticky', top: 0, left: 0, right: 0, zIndex: 1100, backgroundColor: 'background.default', pb: 2, pt: 2 }}>
        <Paper sx={{
          p: 2,
          mb: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Typography variant="h6">Loot Entry</Typography>
          <Box>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => handleAddEntry('item')}
              sx={{ mr: 2 }}
            >
              Add Item Entry
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => handleAddEntry('gold')}
              sx={{ mr: 2 }}
            >
              Add Gold Entry
            </Button>
            <Button
              type="submit"
              variant="outlined"
              color="primary"
              onClick={handleSubmit}
            >
              Submit
            </Button>
          </Box>
        </Paper>
      </Box>


      {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mt: 2, mb: 2 }}>{success}</Alert>}

      <form onSubmit={handleSubmit}>
        {entries.map((entry, index) => (
          <EntryForm
            key={index}
            entry={entry}
            index={index}
            itemOptions={itemOptions}
            onRemove={() => handleRemoveEntry(index)}
            onChange={handleEntryChange}
          />
        ))}
      </form>
    </Container>
  );
};

export default LootEntry;