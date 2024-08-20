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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL;

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

const StyledDay = styled(Paper)(({ theme, isCurrentDay, hasNote }) => ({
  height: '80px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: theme.spacing(1),
  cursor: 'pointer',
  backgroundColor: isCurrentDay ? theme.palette.primary.light : (hasNote ? theme.palette.secondary.light : theme.palette.background.paper),
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));

const GolarionCalendar = () => {
  const [currentDate, setCurrentDate] = useState({ year: 4722, month: 0, day: 1 });
  const [selectedDate, setSelectedDate] = useState(null);
  const [notes, setNotes] = useState({});
  const [noteText, setNoteText] = useState('');
  const [openNoteDialog, setOpenNoteDialog] = useState(false);

  useEffect(() => {
    fetchCurrentDate();
    fetchNotes();
  }, []);

  const fetchCurrentDate = async () => {
    try {
      const response = await axios.get(`${API_URL}/calendar/current-date`);
      setCurrentDate(response.data);
    } catch (error) {
      console.error('Error fetching current date:', error);
    }
  };

  const fetchNotes = async () => {
    try {
      const response = await axios.get(`${API_URL}/calendar/notes`);
      setNotes(response.data);
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };

  const handleNextDay = async () => {
    try {
      const response = await axios.post(`${API_URL}/calendar/next-day`);
      setCurrentDate(response.data);
    } catch (error) {
      console.error('Error advancing day:', error);
    }
  };

  const handlePrevMonth = () => {
    setCurrentDate(prev => ({
      ...prev,
      month: prev.month > 0 ? prev.month - 1 : 11,
      year: prev.month > 0 ? prev.year : prev.year - 1
    }));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => ({
      ...prev,
      month: prev.month < 11 ? prev.month + 1 : 0,
      year: prev.month < 11 ? prev.year : prev.year + 1
    }));
  };

  const handleDayClick = (day) => {
    const clickedDate = { ...currentDate, day };
    setSelectedDate(clickedDate);
    setNoteText(notes[`${clickedDate.year}-${clickedDate.month}-${clickedDate.day}`] || '');
    setOpenNoteDialog(true);
  };

  const handleSaveNote = async () => {
    try {
      await axios.post(`${API_URL}/calendar/notes`, {
        date: selectedDate,
        note: noteText
      });
      setNotes({
        ...notes,
        [`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`]: noteText
      });
      setOpenNoteDialog(false);
    } catch (error) {
      console.error('Error saving note:', error);
    }
  };

  const renderCalendar = () => {
    const month = months[currentDate.month];
    const firstDayOfMonth = new Date(currentDate.year, currentDate.month, 1).getDay();
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
                  const dateKey = `${currentDate.year}-${currentDate.month}-${day}`;
                  const isCurrentDay = currentDate.day === day;
                  const hasNote = !!notes[dateKey];

                  return (
                    <TableCell key={dayIndex} padding="none">
                      {isValidDay && (
                        <StyledDay
                          onClick={() => handleDayClick(day)}
                          isCurrentDay={isCurrentDay}
                          hasNote={hasNote}
                        >
                          <Typography variant="body2">{day}</Typography>
                          {hasNote && <Typography variant="caption">Note</Typography>}
                        </StyledDay>
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
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h4" gutterBottom>Golarion Calendar</Typography>
        <Grid container justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Grid item>
            <Button onClick={handlePrevMonth}>&lt; Prev</Button>
          </Grid>
          <Grid item>
            <Typography variant="h5">
              {months[currentDate.month].name} {currentDate.year}
            </Typography>
          </Grid>
          <Grid item>
            <Button onClick={handleNextMonth}>Next &gt;</Button>
          </Grid>
        </Grid>
        {renderCalendar()}
        <Button variant="contained" onClick={handleNextDay} sx={{ mt: 2 }}>Next Day</Button>
      </Paper>

      <Dialog open={openNoteDialog} onClose={() => setOpenNoteDialog(false)}>
        <DialogTitle>
          {selectedDate && `Note for ${selectedDate.day} ${months[selectedDate.month].name} ${selectedDate.year}`}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Note"
            type="text"
            fullWidth
            multiline
            rows={4}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNoteDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveNote}>Save</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default GolarionCalendar;