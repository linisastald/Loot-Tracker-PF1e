// GolarionCalendar.js

import React, { useState } from 'react';
import { Container, Paper, Typography, Grid, Box, Button } from '@mui/material';

const GolarionCalendar = () => {
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

  const [currentYear, setCurrentYear] = useState(4720); // Example starting year
  const [currentMonth, setCurrentMonth] = useState(0); // Starting at January

  const renderCalendar = () => {
    const month = months[currentMonth];
    const days = Array.from({ length: month.days }, (_, i) => i + 1);
    const startDay = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7; // Adjusting to Moonday start

    // Create an array of weeks with days
    const weeks = [];
    let currentWeek = Array(startDay).fill(null); // Start with empty days

    days.forEach(day => {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });

    // Add the remaining days to the last week
    if (currentWeek.length > 0) {
      weeks.push(currentWeek.concat(Array(7 - currentWeek.length).fill(null)));
    }

    return (
      <Box>
        <Typography variant="h6" align="center">{month.name} {currentYear}</Typography>
        <Grid container spacing={1}>
          {daysOfWeek.map((day, index) => (
            <Grid item xs key={index}>
              <Typography variant="body2" align="center">{day}</Typography>
            </Grid>
          ))}
          {weeks.map((week, index) => (
            <Grid container item xs={12} spacing={1} key={index}>
              {week.map((day, index) => (
                <Grid item xs key={index}>
                  <Paper>
                    <Typography variant="body2" align="center">
                      {day ? day : ''}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  };

  const handlePreviousMonth = () => {
    setCurrentMonth((prevMonth) => (prevMonth === 0 ? 11 : prevMonth - 1));
    if (currentMonth === 0) setCurrentYear(prevYear => prevYear - 1);
  };

  const handleNextMonth = () => {
    setCurrentMonth((prevMonth) => (prevMonth === 11 ? 0 : prevMonth + 1));
    if (currentMonth === 11) setCurrentYear(prevYear => prevYear + 1);
  };

  return (
    <Container>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h4" gutterBottom>Golarion Calendar</Typography>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Button variant="contained" onClick={handlePreviousMonth}>Previous Month</Button>
          <Typography variant="h5">{months[currentMonth].name} {currentYear}</Typography>
          <Button variant="contained" onClick={handleNextMonth}>Next Month</Button>
        </Box>
        {renderCalendar()}
      </Paper>
    </Container>
  );
};

export default GolarionCalendar;