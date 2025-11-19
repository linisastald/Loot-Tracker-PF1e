// frontend/src/components/pages/ItemManagement/SearchHistoryManagement.jsx
import React, { useEffect, useState } from 'react';
import api from '../../../utils/api';
import {
  Alert,
  Box,
  CircularProgress,
  Grid,
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

const SearchHistoryManagement = () => {
  const [itemSearches, setItemSearches] = useState([]);
  const [spellcastingServices, setSpellcastingServices] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    // Default to today's date in YYYY-MM-DD format
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  useEffect(() => {
    fetchSearchHistory();
  }, [selectedDate]);

  const fetchSearchHistory = async () => {
    try {
      setError('');
      setLoading(true);

      // Fetch item searches - api interceptor already unwraps response.data
      const itemSearchResponse = await api.get('/item-search', {
        params: { date: selectedDate }
      });
      setItemSearches(itemSearchResponse || []);

      // Fetch spellcasting services - api interceptor already unwraps response.data
      const spellcastingResponse = await api.get('/spellcasting', {
        params: { date: selectedDate }
      });
      setSpellcastingServices(spellcastingResponse || []);
    } catch (err) {
      console.error('Error fetching search history:', err);
      setError('Error fetching search history');
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (event) => {
    setSelectedDate(event.target.value);
  };

  const formatDateTime = (datetime) => {
    if (!datetime) return '-';
    const date = new Date(datetime);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Search History
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <TextField
              label="Filter by Date"
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              fullWidth
              InputLabelProps={{
                shrink: true,
              }}
            />
          </Grid>
        </Grid>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Item Searches Section */}
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Item Availability Searches
          </Typography>
      {itemSearches.length === 0 ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          No item searches found for {selectedDate}
        </Alert>
      ) : (
        <TableContainer component={Paper} sx={{ mb: 4 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Item</TableCell>
                <TableCell>City</TableCell>
                <TableCell>City Size</TableCell>
                <TableCell align="right">Item Value</TableCell>
                <TableCell align="center">Roll</TableCell>
                <TableCell align="center">Threshold</TableCell>
                <TableCell align="center">Found</TableCell>
                <TableCell>Character</TableCell>
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {itemSearches.map((search) => (
                <TableRow
                  key={search.id}
                  sx={{
                    backgroundColor: search.found ? 'success.light' : 'error.light',
                    '&:hover': { backgroundColor: search.found ? 'success.main' : 'error.main' }
                  }}
                >
                  <TableCell>{formatDateTime(search.search_datetime)}</TableCell>
                  <TableCell>
                    {search.item_name || 'Custom Item'}
                    {search.item_type && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        {search.item_type}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{search.city_name}</TableCell>
                  <TableCell>{search.city_size}</TableCell>
                  <TableCell align="right">{search.item_value ? `${search.item_value} gp` : '-'}</TableCell>
                  <TableCell align="center">{search.roll_result || '-'}</TableCell>
                  <TableCell align="center">{search.availability_threshold || '-'}</TableCell>
                  <TableCell align="center">
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 'bold',
                        color: search.found ? 'success.dark' : 'error.dark'
                      }}
                    >
                      {search.found ? 'YES' : 'NO'}
                    </Typography>
                  </TableCell>
                  <TableCell>{search.character_name || '-'}</TableCell>
                  <TableCell>{search.notes || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Spellcasting Services Section */}
      <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
        Spellcasting Service Requests
      </Typography>
      {spellcastingServices.length === 0 ? (
        <Alert severity="info">
          No spellcasting services found for {selectedDate}
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Spell</TableCell>
                <TableCell align="center">Spell Level</TableCell>
                <TableCell align="center">Caster Level</TableCell>
                <TableCell>City</TableCell>
                <TableCell>City Size</TableCell>
                <TableCell align="right">Cost</TableCell>
                <TableCell>Character</TableCell>
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {spellcastingServices.map((service) => (
                <TableRow
                  key={service.id}
                  hover
                  sx={{
                    backgroundColor: 'info.light',
                    '&:hover': { backgroundColor: 'info.main' }
                  }}
                >
                  <TableCell>{formatDateTime(service.request_datetime)}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                      {service.spell_name}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">{service.spell_level}</TableCell>
                  <TableCell align="center">{service.caster_level}</TableCell>
                  <TableCell>{service.city_name}</TableCell>
                  <TableCell>
                    {service.city_size}
                    <Typography variant="caption" display="block" color="text.secondary">
                      Max: {service.city_max_spell_level}th
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{service.cost} gp</TableCell>
                  <TableCell>{service.character_name || '-'}</TableCell>
                  <TableCell>{service.notes || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
        </>
      )}
    </>
  );
};

export default SearchHistoryManagement;
