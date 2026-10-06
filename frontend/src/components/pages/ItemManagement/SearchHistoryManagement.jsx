import { useEffect, useState } from 'react';
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
import { useCampaignTimezone } from '../../../hooks/useCampaignTimezone';
import { formatInCampaignTimezone } from '../../../utils/timezoneUtils';

// Today's calendar date (YYYY-MM-DD) in the campaign timezone, which is the zone
// every row's time is displayed in.
const todayInTimezone = (timezone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());

// Response body is { success, message, data }; tolerate a bare array too.
const fetchList = async (path, date) => {
  const response = await api.get(path, { params: { date } });
  const body = response?.data ?? response;
  return Array.isArray(body) ? body : [];
};

const SearchHistoryManagement = () => {
  const { timezone } = useCampaignTimezone();
  const [itemSearches, setItemSearches] = useState([]);
  const [spellcastingServices, setSpellcastingServices] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // null until the user picks a date: the default follows the campaign timezone
  const [pickedDate, setPickedDate] = useState(null);
  const selectedDate = pickedDate ?? todayInTimezone(timezone);

  useEffect(() => {
    const fetchSearchHistory = async () => {
      try {
        setError('');
        setLoading(true);
        const [searches, services] = await Promise.all([
          fetchList('/item-search', selectedDate),
          fetchList('/spellcasting', selectedDate),
        ]);
        setItemSearches(searches);
        setSpellcastingServices(services);
      } catch {
        setError('Error fetching search history');
      } finally {
        setLoading(false);
      }
    };

    fetchSearchHistory();
  }, [selectedDate]);

  const handleDateChange = (event) => {
    setPickedDate(event.target.value);
  };

  const formatDateTime = (datetime) => {
    if (!datetime) return '-';
    return timezone ? formatInCampaignTimezone(datetime, timezone, 'PPp z') : '-';
  };

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Search History
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{xs: 12, md: 4}}>
            <TextField
              label="Filter by Date"
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              fullWidth
              slotProps={{ inputLabel: {
                shrink: true,
              } }}
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
                      <Typography
                        variant="caption"
                        sx={{
                          display: "block",
                          color: "text.secondary"
                        }}>
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
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        color: "text.secondary"
                      }}>
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
