import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Grid,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Box,
  List,
  ListItem,
  ListItemText,
  Divider,
  Alert,
  Tooltip,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import api from '../../utils/api';

const months = [
  { name: 'Abadius', days: 31 },
  { name: 'Calistril', days: 28 },
  { name: 'Pharast', days: 31 },
  { name: 'Gozran', days: 30 },
  { name: 'Desnus', days: 31 },
  { name: 'Sarenith', days: 30 },
  { name: 'Erastus', days: 31 },
  { name: 'Arodus', days: 31 },
  { name: 'Rova', days: 30 },
  { name: 'Lamashan', days: 31 },
  { name: 'Neth', days: 30 },
  { name: 'Kuthona', days: 31 }
];

const daysOfWeek = ['Moonday', 'Toilday', 'Wealday', 'Oathday', 'Fireday', 'Starday', 'Sunday'];

const StyledDay = styled(Paper)(({ theme, isCurrentDay, isSelected }) => ({
  height: '80px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: theme.spacing(1),
  cursor: 'pointer',
  backgroundColor: isCurrentDay
    ? theme.palette.grey[800]  // Slightly lighter gray for current day
    : theme.palette.background.paper,
  border: isSelected
    ? `2px solid ${theme.palette.error.dark}`  // Dark red outline for selected day
    : 'none',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));

const GolarionCalendar = () => {
  const [currentDate, setCurrentDate] = useState({ year: 4722, month: 0, day: 1 });
  const [displayedDate, setDisplayedDate] = useState({ year: 4722, month: 0 });
  const [selectedDate, setSelectedDate] = useState(null);
  const [notes, setNotes] = useState({});
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCurrentDate();
    fetchNotes();
  }, []);

  const fetchCurrentDate = async () => {
    try {
      const response = await api.get('/calendar/current-date');
      console.log('Current date response:', response.data);
      const { year, month, day } = response.data;
      setCurrentDate({ year, month, day });
      setDisplayedDate({ year, month });
      setSelectedDate({ year, month, day });
      setError(null);
    } catch (error) {
      console.error('Error fetching current date:', error.response || error);
      setError('Failed to fetch current date. Please try again later.');
    }
  };

  const fetchNotes = async () => {
    try {
      const response = await api.get('/calendar/notes');
      console.log('Notes response:', response.data);
      setNotes(response.data);
      setError(null);
    } catch (error) {
      console.error('Error fetching notes:', error.response || error);
      setError('Failed to fetch notes. Please try again later.');
    }
  };

  const handleNextDay = async () => {
    try {
      const response = await api.post('/calendar/next-day');
      const { year, month, day } = response.data;
      setCurrentDate({ year, month, day });
      setDisplayedDate({ year, month });
      setSelectedDate({ year, month, day });
      setError(null);
    } catch (error) {
      console.error('Error advancing day:', error);
      setError('Failed to advance day. Please try again later.');
    }
  };

  const handlePrevMonth = () => {
    setDisplayedDate(prev => ({
      year: prev.month > 0 ? prev.year : prev.year - 1,
      month: prev.month > 0 ? prev.month - 1 : 11
    }));
  };

  const handleNextMonth = () => {
    setDisplayedDate(prev => ({
      year: prev.month < 11 ? prev.year : prev.year + 1,
      month: prev.month < 11 ? prev.month + 1 : 0
    }));
  };

  const handleGoToToday = () => {
    setDisplayedDate({ year: currentDate.year, month: currentDate.month });
    setSelectedDate(currentDate);
  };

  const handleDayClick = (day) => {
    const clickedDate = { ...displayedDate, day };
    setSelectedDate(clickedDate);
    setNoteText(notes[`${clickedDate.year}-${clickedDate.month}-${clickedDate.day}`] || '');
  };

  const handleSaveNote = async () => {
    if (!selectedDate) return;

    try {
      await api.post('/calendar/notes', {
        date: selectedDate,
        note: noteText
      });
      setNotes(prevNotes => ({
        ...prevNotes,
        [`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`]: noteText
      }));
      setError(null);
    } catch (error) {
      console.error('Error saving note:', error);
      setError('Failed to save note. Please try again later.');
    }
  };

  const getMoonPhase = (date) => {
    const totalDays = date.year * 365 + date.month * 30 + date.day;
    const phase = totalDays % 28;
    if (phase < 7) return 'New Moon';
    if (phase < 14) return 'First Quarter';
    if (phase < 21) return 'Full Moon';
    return 'Last Quarter';
  };

  const renderCalendar = () => {
    const month = months[displayedDate.month];
    const firstDayOfMonth = new Date(displayedDate.year, displayedDate.month, 1).getDay();
    const weeks = Math.ceil((month.days + firstDayOfMonth) / 7);

    return (
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              {daysOfWeek.map(day => (
                <TableCell key={day} align="center">{day}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {[...Array(weeks)].map((_, weekIndex) => (
              <TableRow key={weekIndex}>
                {[...Array(7)].map((_, dayIndex) => {
                  const day = weekIndex * 7 + dayIndex - firstDayOfMonth + 1;
                  const isValidDay = day > 0 && day <= month.days;
                  const dateKey = `${displayedDate.year}-${displayedDate.month}-${day}`;
                  const isCurrentDay = currentDate.year === displayedDate.year &&
                                       currentDate.month === displayedDate.month &&
                                       currentDate.day === day;
                  const isSelected = selectedDate &&
                                     selectedDate.year === displayedDate.year &&
                                     selectedDate.month === displayedDate.month &&
                                     selectedDate.day === day;
                  const note = notes[dateKey];

                  return (
                    <TableCell key={dayIndex} padding="none">
                      {isValidDay && (
                        <Tooltip title={note ? note.substring(0, 50) + (note.length > 50 ? '...' : '') : ''} arrow>
                          <StyledDay
                            onClick={() => handleDayClick(day)}
                            isCurrentDay={isCurrentDay}
                            isSelected={isSelected}
                          >
                            <Typography variant="body2">{day}</Typography>
                            {note && (
                              <Typography variant="caption" noWrap>
                                {note.substring(0, 20)}...
                              </Typography>
                            )}
                          </StyledDay>
                        </Tooltip>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <Container maxWidth="lg">
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h4" gutterBottom>Golarion Calendar</Typography>
        <Grid container justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Grid item>
            <Button onClick={handlePrevMonth}>&lt; Prev</Button>
          </Grid>
          <Grid item>
            <Typography variant="h5">
              {months[displayedDate.month].name} {displayedDate.year}
            </Typography>
          </Grid>
          <Grid item>
            <Button onClick={handleNextMonth}>Next &gt;</Button>
          </Grid>
        </Grid>
        {renderCalendar()}
        <Grid container spacing={2} sx={{ mt: 2 }}>
          <Grid item>
            <Button variant="contained" onClick={handleNextDay}>Next Day</Button>
          </Grid>
          <Grid item>
            <Button variant="contained" onClick={handleGoToToday}>Go to Today</Button>
          </Grid>
        </Grid>
      </Paper>

      {selectedDate && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography variant="h6" gutterBottom>
            {`${selectedDate.day} ${months[selectedDate.month].name} ${selectedDate.year}`}
          </Typography>

          <List>
            <ListItem>
              <ListItemText primary="Moon Phase" secondary={getMoonPhase(selectedDate)} />
            </ListItem>
            <Divider component="li" />
            <ListItem>
              <ListItemText primary="Weather" secondary="Weather information not available yet" />
            </ListItem>
            <Divider component="li" />
            <ListItem>
              <ListItemText primary="Holidays" secondary="Holiday information not available yet" />
            </ListItem>
            <Divider component="li" />
            <ListItem>
              <ListItemText
                primary="Previous Notes"
                secondary={notes[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`] || 'No previous notes'}
              />
            </ListItem>
          </List>

          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            Add/Edit Note
          </Typography>
          <TextField
            label="Notes"
            multiline
            rows={4}
            fullWidth
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Box display="flex" justifyContent="flex-end">
            <Button variant="contained" onClick={handleSaveNote}>Save Note</Button>
          </Box>
        </Paper>
      )}
    </Container>
  );
};

export default GolarionCalendar;