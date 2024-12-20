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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
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
  justifyContent: 'flex-start',
  padding: theme.spacing(0.5),
  cursor: 'pointer',
  backgroundColor: isCurrentDay
    ? theme.palette.grey[800]
    : theme.palette.background.paper,
  color: isCurrentDay
    ? theme.palette.getContrastText(theme.palette.grey[800])
    : theme.palette.text.primary,
  border: isSelected
    ? `2px solid ${theme.palette.error.dark}`
    : 'none',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
  overflow: 'hidden',
  width: '100%',
}));

const DayNumber = styled(Typography)({
  fontWeight: 'bold',
  marginBottom: '2px',
});

const NotePreview = styled(Typography)({
  fontSize: '0.7rem',
  lineHeight: 1.2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  '-webkit-line-clamp': 3,
  '-webkit-box-orient': 'vertical',
  width: '100%',
});

const GolarionCalendar = () => {
  const [currentDate, setCurrentDate] = useState({ year: 4722, month: 0, day: 1 });
  const [displayedDate, setDisplayedDate] = useState({ year: 4722, month: 0 });
  const [selectedDate, setSelectedDate] = useState(null);
  const [notes, setNotes] = useState({});
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [daysToAdd, setDaysToAdd] = useState('');

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

  const handleSetCurrentDay = async () => {
    if (!selectedDate) return;

    try {
      await api.post('/calendar/set-current-date', {
        year: selectedDate.year,
        month: selectedDate.month,
        day: selectedDate.day
      });

      setCurrentDate(selectedDate);
      setConfirmDialogOpen(false);
      setError(null);
    } catch (error) {
      console.error('Error setting current date:', error);
      setError('Failed to set current date. Please try again later.');
    }
  };

  const handleIncreaseDays = async () => {
    const days = parseInt(daysToAdd);
    if (isNaN(days) || days < 1) {
      setError('Please enter a valid number of days');
      return;
    }

    try {
      for (let i = 0; i < days; i++) {
        await handleNextDay();
      }
      setDaysToAdd('');
      setError(null);
    } catch (error) {
      console.error('Error increasing days:', error);
      setError('Failed to increase days. Please try again later.');
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
                <TableCell key={day} align="center" padding="none">{day}</TableCell>
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
                    <TableCell key={dayIndex} padding="none" style={{ width: '14.28%', maxWidth: '14.28%' }}>
                      {isValidDay && (
                        <Tooltip title={note || ''} arrow>
                          <StyledDay
                            onClick={() => handleDayClick(day)}
                            isCurrentDay={isCurrentDay}
                            isSelected={isSelected}
                          >
                            <DayNumber variant="body2">{day}</DayNumber>
                            {note && (
                              <NotePreview>
                                {note}
                              </NotePreview>
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
          <Grid item>
            <Button
              variant="contained"
              onClick={() => setConfirmDialogOpen(true)}
              disabled={!selectedDate}
            >
              Set Current Day
            </Button>
          </Grid>
          <Grid item sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              label="Days"
              type="number"
              value={daysToAdd}
              onChange={(e) => setDaysToAdd(e.target.value)}
              size="small"
              sx={{ width: '80px' }}
            />
            <Button
              variant="contained"
              onClick={handleIncreaseDays}
              disabled={!daysToAdd}
            >
              Add Days
            </Button>
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

      <Dialog
        open={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
      >
        <DialogTitle>Confirm Date Change</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to set the current date to {selectedDate ?
              `${selectedDate.day} ${months[selectedDate.month].name} ${selectedDate.year}` :
              ''
            }?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSetCurrentDay} variant="contained">
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default GolarionCalendar;