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
} from '@mui/material';
import { styled } from '@mui/material/styles';
import api from '../../utils/api';

// ... (keep the months and daysOfWeek arrays as they were)

const StyledDay = styled(Paper)(({ theme, isCurrentDay, isSelected, hasNote }) => ({
  // ... (keep the styling as it was)
}));

const GolarionCalendar = () => {
  const [currentDate, setCurrentDate] = useState({ year: 4722, month: 0, day: 1 });
  const [displayedDate, setDisplayedDate] = useState({ year: 4722, month: 0 });
  const [selectedDate, setSelectedDate] = useState(null);
  const [notes, setNotes] = useState({});
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    fetchCurrentDate();
    fetchNotes();
  }, []);

  const fetchCurrentDate = async () => {
    try {
      const response = await api.get('/calendar/current-date');
      const { year, month, day } = response.data;
      setCurrentDate({ year, month, day });
      setDisplayedDate({ year, month });
      setSelectedDate({ year, month, day });
    } catch (error) {
      console.error('Error fetching current date:', error);
    }
  };

  const fetchNotes = async () => {
    try {
      const response = await api.get('/calendar/notes');
      setNotes(response.data);
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };

  const handleNextDay = async () => {
    try {
      const response = await api.post('/calendar/next-day');
      const { year, month, day } = response.data;
      setCurrentDate({ year, month, day });
      setDisplayedDate({ year, month });
      setSelectedDate({ year, month, day });
    } catch (error) {
      console.error('Error advancing day:', error);
    }
  };

  // ... (keep handlePrevMonth, handleNextMonth, and handleGoToToday as they were)

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
    } catch (error) {
      console.error('Error saving note:', error);
    }
  };

  // ... (keep getMoonPhase and renderCalendar as they were)

  return (
    <Container maxWidth="lg">
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