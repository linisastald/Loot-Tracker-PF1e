import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { 
  Container, Paper, Typography, Grid, Box, Button, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField
} from '@mui/material';

const GolarionCalendar = () => {
  const [currentDate, setCurrentDate] = useState({ year: 4720, month: 0, day: 1 });
  const [notes, setNotes] = useState({});
  const [openNoteDialog, setOpenNoteDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [noteText, setNoteText] = useState('');

  const months = [
    { name: 'Abadius', commonName: 'Prima', days: 31, deity: 'Abadar' },
    { name: 'Calistril', commonName: 'Snappe', days: 28, deity: 'Calistria' },
    { name: 'Pharast', commonName: 'Anu', days: 31, deity: 'Pharasma' },
    { name: 'Gozran', commonName: 'Rusanne', days: 30, deity: 'Gozreh' },
    { name: 'Desnus', commonName: 'Farlong', days: 31, deity: 'Desna' },
    { name: 'Sarenith', commonName: 'Sola', days: 30, deity: 'Sarenrae' },
    { name: 'Erastus', commonName: 'Fletch', days: 31, deity: 'Erastil' },
    { name: 'Arodus', commonName: 'Hazen', days: 31, deity: 'Aroden' },
    { name: 'Rova', commonName: 'Nuvar', days: 30, deity: 'Rovagug' },
    { name: 'Lamashan', commonName: 'Shaldo', days: 31, deity: 'Lamashtu' },
    { name: 'Neth', commonName: 'Joya', days: 30, deity: 'Nethys' },
    { name: 'Kuthona', commonName: 'Kai', days: 31, deity: 'Zon-Kuthon' }
  ];

  const daysOfWeek = ['Moonday', 'Toilday', 'Wealday', 'Oathday', 'Fireday', 'Starday', 'Sunday'];

  useEffect(() => {
    fetchCurrentDate();
    fetchNotes();
  }, []);

  const fetchCurrentDate = async () => {
    try {
      const response = await api.get(`/calendar/current-date`);
      setCurrentDate(response.data);
    } catch (error) {
      console.error('Error fetching current date:', error);
    }
  };

  const fetchNotes = async () => {
    try {
      const response = await api.get(`/calendar/notes`);
      setNotes(response.data);
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };

  const handleNextDay = async () => {
    try {
      const response = await api.post(`/calendar/next-day`);
      setCurrentDate(response.data);
    } catch (error) {
      console.error('Error advancing day:', error);
    }
  };

  const handleOpenNoteDialog = (date) => {
    setSelectedDate(date);
    setNoteText(notes[`${date.year}-${date.month}-${date.day}`] || '');
    setOpenNoteDialog(true);
  };

  const handleCloseNoteDialog = () => {
    setOpenNoteDialog(false);
    setSelectedDate(null);
    setNoteText('');
  };

  const handleSaveNote = async () => {
    try {
      await api.post(`/calendar/notes`, {
        date: selectedDate,
        note: noteText
      });
      setNotes({
        ...notes,
        [`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`]: noteText
      });
      handleCloseNoteDialog();
    } catch (error) {
      console.error('Error saving note:', error);
    }
  };

  const getDayOfWeek = (date) => {
    const totalDays = date.year * 365 + 
                      months.slice(0, date.month).reduce((sum, month) => sum + month.days, 0) + 
                      date.day;
    return daysOfWeek[(totalDays - 1) % 7];
  };

  const getMoonPhase = (date) => {
    const firstFullMoonDay = 26;
    const lunarCycle = 29.5;
    const totalDays = (date.year - 1) * 365 + 
                      months.slice(0, date.month).reduce((sum, month) => sum + month.days, 0) + 
                      date.day;
    const daysSinceFirstFullMoon = (totalDays - firstFullMoonDay) % lunarCycle;
    
    if (daysSinceFirstFullMoon < 3.7) return 'Full Moon';
    if (daysSinceFirstFullMoon < 11.1) return 'Waning Gibbous';
    if (daysSinceFirstFullMoon < 14.8) return 'Last Quarter';
    if (daysSinceFirstFullMoon < 22.2) return 'Waning Crescent';
    if (daysSinceFirstFullMoon < 25.9) return 'New Moon';
    if (daysSinceFirstFullMoon < 29.5) return 'Waxing Crescent';
    return 'First Quarter';
  };

  return (
    <Container maxWidth={false}>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h4" gutterBottom>Golarion Calendar</Typography>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5">
            {`${currentDate.day} ${months[currentDate.month].name} ${currentDate.year} (${getDayOfWeek(currentDate)})`}
          </Typography>
          <Button variant="contained" onClick={handleNextDay}>Next Day</Button>
        </Box>
        <Typography variant="h6">Moon Phase: {getMoonPhase(currentDate)}</Typography>
        <Button variant="outlined" onClick={() => handleOpenNoteDialog(currentDate)} sx={{ mt: 2 }}>
          Add/Edit Note for Today
        </Button>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Month Overview</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Day</TableCell>
                <TableCell>Day of Week</TableCell>
                <TableCell>Moon Phase</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Array.from({ length: months[currentDate.month].days }, (_, i) => i + 1).map((day) => {
                const date = { ...currentDate, day };
                const dateKey = `${date.year}-${date.month}-${date.day}`;
                return (
                  <TableRow key={day} selected={day === currentDate.day}>
                    <TableCell>{day}</TableCell>
                    <TableCell>{getDayOfWeek(date)}</TableCell>
                    <TableCell>{getMoonPhase(date)}</TableCell>
                    <TableCell>{notes[dateKey] ? notes[dateKey].substring(0, 20) + '...' : ''}</TableCell>
                    <TableCell>
                      <Button onClick={() => handleOpenNoteDialog(date)}>
                        {notes[dateKey] ? 'Edit Note' : 'Add Note'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={openNoteDialog} onClose={handleCloseNoteDialog}>
        <DialogTitle>
          {selectedDate ? `Note for ${selectedDate.day} ${months[selectedDate.month].name} ${selectedDate.year}` : ''}
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
          <Button onClick={handleCloseNoteDialog}>Cancel</Button>
          <Button onClick={handleSaveNote}>Save</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default GolarionCalendar;