import React, {useEffect, useState} from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemText,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {styled} from '@mui/material/styles';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EventIcon from '@mui/icons-material/Event';
import NoteAltIcon from '@mui/icons-material/NoteAlt';
import api from '../../utils/api';

const months = [
    {name: 'Abadius', days: 31},
    {name: 'Calistril', days: 28},
    {name: 'Pharast', days: 31},
    {name: 'Gozran', days: 30},
    {name: 'Desnus', days: 31},
    {name: 'Sarenith', days: 30},
    {name: 'Erastus', days: 31},
    {name: 'Arodus', days: 31},
    {name: 'Rova', days: 30},
    {name: 'Lamashan', days: 31},
    {name: 'Neth', days: 30},
    {name: 'Kuthona', days: 31}
];

const daysOfWeek = ['Moonday', 'Toilday', 'Wealday', 'Oathday', 'Fireday', 'Starday', 'Sunday'];

const StyledDay = styled(Paper)(({theme, isCurrentDay, isSelected}) => ({
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
        ? theme.palette.primary.contrastText
        : theme.palette.text.primary,
    border: isSelected
        ? `2px solid ${theme.palette.primary.main}`
        : 'none',
    '&:hover': {
        backgroundColor: isCurrentDay
            ? theme.palette.grey[800]
            : theme.palette.action.hover,
        boxShadow: theme.shadows[3],
        transform: 'translateY(-2px)',
        transition: 'transform 0.2s, box-shadow 0.2s',
    },
    overflow: 'hidden',
    width: '100%',
    transition: 'background-color 0.3s, transform 0.2s, box-shadow 0.2s',
    borderRadius: theme.shape.borderRadius,
}));

const DayNumber = styled(Typography)(({theme, isCurrentDay}) => ({
    fontWeight: 'bold',
    marginBottom: '2px',
    color: isCurrentDay ? theme.palette.primary.contrastText : theme.palette.text.primary,
}));

const NotePreview = styled(Typography)(({theme, isCurrentDay}) => ({
    fontSize: '0.7rem',
    lineHeight: 1.2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    '-webkit-line-clamp': 3,
    '-webkit-box-orient': 'vertical',
    width: '100%',
    color: isCurrentDay ? theme.palette.primary.contrastText : theme.palette.text.secondary,
}));

const NavButton = styled(Button)(({theme}) => ({
    minWidth: '40px',
    padding: theme.spacing(1),
    borderRadius: theme.shape.borderRadius,
    boxShadow: 'none',
    textTransform: 'none',
    fontWeight: 500,
}));

const CalendarHeader = styled(Box)(({theme}) => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
    padding: theme.spacing(1, 0),
}));

const CalendarTitle = styled(Typography)(({theme}) => ({
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    '& svg': {
        marginRight: theme.spacing(1),
    },
}));

const InfoCard = styled(Card)(({theme}) => ({
    marginBottom: theme.spacing(2),
    borderLeft: `4px solid ${theme.palette.primary.main}`,
}));

const InfoCardContent = styled(CardContent)(({theme}) => ({
    padding: theme.spacing(1.5),
    '&:last-child': {
        paddingBottom: theme.spacing(1.5),
    },
}));

const GolarionCalendar = () => {
    const [currentDate, setCurrentDate] = useState({year: 4722, month: 0, day: 1});
    const [displayedDate, setDisplayedDate] = useState({year: 4722, month: 0});
    const [selectedDate, setSelectedDate] = useState(null);
    const [notes, setNotes] = useState({});
    const [noteText, setNoteText] = useState('');
    const [error, setError] = useState(null);
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
    const [daysToAdd, setDaysToAdd] = useState('');
    const [weather, setWeather] = useState({});
    const [currentRegion, setCurrentRegion] = useState('Varisia');

    useEffect(() => {
        fetchCurrentDate();
        fetchNotes();
        fetchCurrentRegion();
    }, []);

    // Fetch weather data when displayed month changes
    useEffect(() => {
        if (currentRegion) {
            fetchWeatherForMonth(displayedDate.year, displayedDate.month);
        }
    }, [displayedDate, currentRegion]);

    const fetchCurrentDate = async () => {
        try {
            const response = await api.get('/calendar/current-date');
            console.log('Current date response:', response.data);
            const {year, month, day} = response.data;
            // Backend uses 1-indexed months, frontend uses 0-indexed
            const frontendMonth = month - 1;
            setCurrentDate({year, month: frontendMonth, day});
            setDisplayedDate({year, month: frontendMonth});
            setSelectedDate({year, month: frontendMonth, day});
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

    const fetchCurrentRegion = async () => {
        try {
            const response = await api.get('/settings/region');
            if (response.data && response.data.value) {
                setCurrentRegion(response.data.value);
            }
        } catch (error) {
            console.error('Error fetching current region:', error);
            // Don't show error for region fetch, use default
        }
    };

    const fetchWeatherForMonth = async (year, month) => {
        try {
            // Calculate start and end dates for the month
            const startDay = 1;
            const endDay = months[month].days;
            
            // Convert frontend 0-indexed month to backend 1-indexed month
            const backendMonth = month + 1;
            const response = await api.get(
                `/weather/range/${year}/${backendMonth}/${startDay}/${year}/${backendMonth}/${endDay}/${currentRegion}`
            );
            
            if (response.data) {
                const weatherData = {};
                response.data.forEach(w => {
                    // Convert backend 1-indexed month to frontend 0-indexed for key
                    const key = `${w.year}-${w.month - 1}-${w.day}`;
                    weatherData[key] = w;
                });
                setWeather(weatherData);
            }
        } catch (error) {
            console.error('Error fetching weather:', error);
            // Don't show error for weather fetch
        }
    };

    const handleNextDay = async () => {
        try {
            const response = await api.post('/calendar/next-day');
            const {year, month, day} = response.data;
            // Backend uses 1-indexed months, frontend uses 0-indexed
            const frontendMonth = month - 1;
            setCurrentDate({year, month: frontendMonth, day});
            setDisplayedDate({year, month: frontendMonth});
            setSelectedDate({year, month: frontendMonth, day});
            setError(null);
        } catch (error) {
            console.error('Error advancing day:', error);
            setError('Failed to advance day. Please try again later.');
        }
    };

    const handleSetCurrentDay = async () => {
        if (!selectedDate) return;

        try {
            // Convert frontend 0-indexed month to backend 1-indexed month
            await api.post('/calendar/set-current-date', {
                year: selectedDate.year,
                month: selectedDate.month + 1,
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
        setDisplayedDate({year: currentDate.year, month: currentDate.month});
        setSelectedDate(currentDate);
    };

    const handleDayClick = (day) => {
        const clickedDate = {...displayedDate, day};
        setSelectedDate(clickedDate);
        setNoteText(notes[`${clickedDate.year}-${clickedDate.month}-${clickedDate.day}`] || '');
    };

    const handleSaveNote = async () => {
        if (!selectedDate) return;

        try {
            // Convert frontend 0-indexed month to backend 1-indexed month
            await api.post('/calendar/notes', {
                date: {
                    year: selectedDate.year,
                    month: selectedDate.month + 1,
                    day: selectedDate.day
                },
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
        if (phase < 3) return {name: 'New Moon', emoji: '🌑'};
        if (phase < 7) return {name: 'Waxing Crescent', emoji: '🌒'};
        if (phase < 10) return {name: 'First Quarter', emoji: '🌓'};
        if (phase < 14) return {name: 'Waxing Gibbous', emoji: '🌔'};
        if (phase < 17) return {name: 'Full Moon', emoji: '🌕'};
        if (phase < 21) return {name: 'Waning Gibbous', emoji: '🌖'};
        if (phase < 24) return {name: 'Last Quarter', emoji: '🌗'};
        return {name: 'Waning Crescent', emoji: '🌘'};
    };

    const renderCalendar = () => {
        const month = months[displayedDate.month];
        if (!month) {
            return <div>Loading calendar...</div>;
        }
        // Note: Date constructor uses 0-indexed months, Golarion uses 1-indexed
        const firstDayOfMonth = new Date(displayedDate.year, displayedDate.month, 1).getDay();
        const weeks = Math.ceil((month.days + firstDayOfMonth) / 7);

        return (
            <TableContainer component={Paper} elevation={3}>
                <Table>
                    <TableHead>
                        <TableRow>
                            {daysOfWeek.map(day => (
                                <TableCell key={day} align="center" padding="normal">{day}</TableCell>
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
                                    const hasNote = Boolean(note);

                                    if (isValidDay) {
                                        // For valid days, get weather and moon phase
                                        const dateKey = `${displayedDate.year}-${displayedDate.month}-${day}`;
                                        const weatherData = weather[dateKey];
                                        
                                        const moonPhaseData = getMoonPhase({
                                        year: displayedDate.year,
                                        month: displayedDate.month,
                                        day
                                        });
                                        const moonEmoji = moonPhaseData?.emoji || '🌑';

                                        // Check if the phase changed from previous day
                                        const prevDay = day - 1;
                                        let showMoonPhase = false;

                                        if (prevDay > 0) {
                                        const prevPhase = getMoonPhase({
                                        year: displayedDate.year,
                                        month: displayedDate.month,
                                        day: prevDay
                                        });
                                        showMoonPhase = prevPhase?.name && moonPhaseData?.name && prevPhase.name !== moonPhaseData.name;
                                        } else if (day === 1) {
                                        // First day of month - check against last day of previous month
                                        const prevMonth = displayedDate.month > 0 ? displayedDate.month - 1 : 11;
                                        const prevYear = prevMonth === 11 ? displayedDate.year - 1 : displayedDate.year;
                                        const lastDayOfPrevMonth = months[prevMonth].days;
                                        const prevPhase = getMoonPhase({
                                        year: prevYear,
                                        month: prevMonth,
                                        day: lastDayOfPrevMonth
                                        });
                                        showMoonPhase = prevPhase?.name && moonPhaseData?.name && prevPhase.name !== moonPhaseData.name;
                                        }

                                        return (
                                            <TableCell key={dayIndex} padding="normal"
                                                       style={{width: '14.28%', maxWidth: '14.28%', height: '120px'}}>
                                                <Tooltip 
                                                    title={
                                                        <Box>
                                                            {weatherData && (
                                                                <Box mb={1}>
                                                                    <Typography variant="caption">
                                                                        {weatherData.emoji} {weatherData.condition}
                                                                    </Typography>
                                                                    <br />
                                                                    <Typography variant="caption">
                                                                        Low: {weatherData.temp_low}°F, High: {weatherData.temp_high}°F
                                                                    </Typography>
                                                                    {weatherData.precipitation_type && (
                                                                        <><br /><Typography variant="caption">
                                                                            {weatherData.precipitation_type}
                                                                        </Typography></>
                                                                    )}
                                                                    {weatherData.wind_speed > 20 && (
                                                                        <><br /><Typography variant="caption">
                                                                            Wind: {weatherData.wind_speed} mph
                                                                        </Typography></>
                                                                    )}
                                                                </Box>
                                                            )}
                                                            <Typography variant="caption">
                                                                {note || 'Click to add a note'}
                                                            </Typography>
                                                        </Box>
                                                    } 
                                                    arrow
                                                >
                                                    <StyledDay
                                                        onClick={() => handleDayClick(day)}
                                                        isCurrentDay={isCurrentDay}
                                                        isSelected={isSelected}
                                                        elevation={isCurrentDay || isSelected ? 3 : 1}
                                                    >
                                                        <Box display="flex" justifyContent="space-between"
                                                             alignItems="flex-start" width="100%">
                                                            <Box display="flex" flexDirection="column">
                                                                <DayNumber variant="body2" isCurrentDay={isCurrentDay}>
                                                                    {day}
                                                                </DayNumber>
                                                                {weatherData && (
                                                                    <Typography variant="caption" sx={{fontSize: '0.6rem', lineHeight: 1}}>
                                                                        {weatherData.emoji} {weatherData.condition}
                                                                    </Typography>
                                                                )}
                                                                {weatherData && (
                                                                    <Typography variant="caption" sx={{fontSize: '0.55rem', lineHeight: 1}}>
                                                                        {weatherData.temp_low}°-{weatherData.temp_high}°F
                                                                    </Typography>
                                                                )}
                                                            </Box>
                                                            <Box display="flex" flexDirection="column" alignItems="flex-end">
                                                                {showMoonPhase && (
                                                                    <Typography variant="caption" sx={{fontSize: '0.7rem'}}>
                                                                        {moonEmoji}
                                                                    </Typography>
                                                                )}
                                                            </Box>
                                                        </Box>
                                                        {note && (
                                                            <NotePreview isCurrentDay={isCurrentDay}>
                                                                {note}
                                                            </NotePreview>
                                                        )}
                                                    </StyledDay>
                                                </Tooltip>
                                            </TableCell>
                                        );
                                    } else {
                                        // Empty cell for invalid days
                                        return (
                                            <TableCell key={dayIndex} padding="normal"
                                                       style={{width: '14.28%', maxWidth: '14.28%', height: '120px'}}>
                                            </TableCell>
                                        );
                                    }
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
                <Alert severity="error" sx={{mb: 2}}>
                    {error}
                </Alert>
            )}

            <Paper sx={{p: 3, mb: 3, borderRadius: 2}} elevation={3}>
                <CalendarHeader>
                    <Button
                        onClick={handlePrevMonth}
                        variant="outlined"
                        startIcon={<ArrowBackIosNewIcon/>}
                        sx={{fontWeight: 500, textTransform: 'none'}}
                    >
                        Prev
                    </Button>

                    <CalendarTitle variant="h4">
                        <EventIcon color="primary"/>
                        {months[displayedDate.month]?.name || 'Loading...'} {displayedDate.year}
                    </CalendarTitle>

                    <Button
                        onClick={handleNextMonth}
                        variant="outlined"
                        endIcon={<ArrowForwardIosIcon/>}
                        sx={{fontWeight: 500, textTransform: 'none'}}
                    >
                        Next
                    </Button>
                </CalendarHeader>

                {renderCalendar()}

                <Box sx={{mt: 3, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1}}>
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={handleNextDay}
                        startIcon={<ArrowForwardIosIcon/>}
                        sx={{fontWeight: 500, textTransform: 'none', boxShadow: 1, mx: 0.5}}
                    >
                        Next Day
                    </Button>

                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={handleGoToToday}
                        startIcon={<CalendarTodayIcon/>}
                        sx={{fontWeight: 500, textTransform: 'none', mx: 0.5}}
                    >
                        Go to Today
                    </Button>

                    <Button
                        variant="outlined"
                        color="secondary"
                        onClick={() => setConfirmDialogOpen(true)}
                        disabled={!selectedDate}
                        startIcon={<EventIcon/>}
                        sx={{fontWeight: 500, textTransform: 'none', boxShadow: 1, mx: 0.5}}
                    >
                        Set Current Day
                    </Button>

                    <Box sx={{display: 'flex', alignItems: 'center', mx: 0.5}}>
                        <TextField
                            label="Days"
                            type="number"
                            value={daysToAdd}
                            onChange={(e) => setDaysToAdd(e.target.value)}
                            size="small"
                            sx={{width: '80px', mr: 1}}
                            InputProps={{inputProps: {min: 1}}}
                        />
                        <Button
                            variant="outlined"
                            color="primary"
                            onClick={handleIncreaseDays}
                            disabled={!daysToAdd}
                            sx={{fontWeight: 500, textTransform: 'none', boxShadow: 1}}
                        >
                            Add Days
                        </Button>
                    </Box>
                </Box>
            </Paper>

            {selectedDate && (
                <Paper sx={{p: 3, mt: 3, borderRadius: 2}} elevation={3}>
                    <Typography variant="h5" gutterBottom color="primary"
                                sx={{display: 'flex', alignItems: 'center', mb: 2}}>
                        <CalendarTodayIcon sx={{mr: 1}}/>
                        {`${selectedDate.day} ${months[selectedDate.month]?.name || 'Unknown Month'} ${selectedDate.year}`}
                    </Typography>

                    <Grid container spacing={3} size={12}>
                        <Grid size={{xs: 12, md: 5}}>
                            <InfoCard>
                                <InfoCardContent>
                                    <Typography variant="h6" color="primary" gutterBottom>Calendar
                                        Information</Typography>

                                    <List disablePadding>
                                        <ListItem>
                                            <ListItemText
                                                primary={<Typography variant="subtitle1">Moon Phase</Typography>}
                                                secondary={
                                                    selectedDate && (
                                                    <Chip
                                                    icon={<span
                                                    style={{fontSize: '1.2rem'}}>{getMoonPhase(selectedDate)?.emoji || '🌑'}</span>}
                                                    label={getMoonPhase(selectedDate)?.name || 'Unknown Phase'}
                                                    color="primary"
                                                    variant="outlined"
                                                    size="small"
                                                    sx={{mt: 0.5}}
                                                    />
                                                    )
                                                }
                                            />
                                        </ListItem>
                                        <Divider component="li"/>

                                        <ListItem>
                                            <ListItemText
                                                primary={<Typography variant="subtitle1">Weather</Typography>}
                                                secondary={
                                                    selectedDate && weather[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`] ? (
                                                        <Box>
                                                            <Typography variant="body2">
                                                                {weather[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`].emoji} {weather[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`].condition}
                                                            </Typography>
                                                            <Typography variant="body2">
                                                                Low: {weather[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`].temp_low}°F, High: {weather[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`].temp_high}°F
                                                            </Typography>
                                                            {weather[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`].precipitation_type && (
                                                                <Typography variant="body2">
                                                                    {weather[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`].precipitation_type}
                                                                </Typography>
                                                            )}
                                                            {weather[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`].wind_speed > 0 && (
                                                                <Typography variant="body2">
                                                                    Wind: {weather[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`].wind_speed} mph
                                                                </Typography>
                                                            )}
                                                            {weather[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`].description && (
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {weather[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`].description}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    ) : (
                                                        <Typography variant="body2" color="text.secondary">
                                                            Weather information not available
                                                        </Typography>
                                                    )
                                                }
                                            />
                                        </ListItem>
                                        <Divider component="li"/>

                                        <ListItem>
                                            <ListItemText
                                                primary={<Typography variant="subtitle1">Holidays</Typography>}
                                                secondary="Holiday information not available yet"
                                            />
                                        </ListItem>
                                    </List>
                                </InfoCardContent>
                            </InfoCard>
                        </Grid>

                        <Grid size={{xs: 12, md: 7}}>
                            <Paper sx={{p: 2, height: '100%', borderRadius: 2}} elevation={2}>
                                <Typography variant="h6" gutterBottom sx={{display: 'flex', alignItems: 'center'}}>
                                    <NoteAltIcon sx={{mr: 1}} color="secondary"/>
                                    Notes for this Date
                                </Typography>

                                <TextField
                                    label="Notes"
                                    multiline
                                    rows={6}
                                    fullWidth
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    sx={{mb: 2}}
                                    placeholder="Add your notes for this date..."
                                    variant="outlined"
                                />

                                <Box display="flex" justifyContent="flex-end">
                                    <Button
                                        variant="outlined"
                                        onClick={handleSaveNote}
                                        color="secondary"
                                        startIcon={<NoteAltIcon/>}
                                        sx={{fontWeight: 500, textTransform: 'none', boxShadow: 1}}
                                    >
                                        Save Note
                                    </Button>
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                </Paper>
            )}

            <Dialog
                open={confirmDialogOpen}
                onClose={() => setConfirmDialogOpen(false)}
                PaperProps={{
                    elevation: 3,
                    sx: {borderRadius: 2}
                }}
            >
                <DialogTitle>Confirm Date Change</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to set the current date to {selectedDate ?
                        `${selectedDate.day} ${months[selectedDate.month]?.name || 'Unknown Month'} ${selectedDate.year}` :
                        ''
                    }?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setConfirmDialogOpen(false)}
                        sx={{fontWeight: 500, textTransform: 'none'}}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSetCurrentDay}
                        variant="outlined"
                        color="primary"
                        sx={{fontWeight: 500, textTransform: 'none', boxShadow: 1}}
                    >
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default GolarionCalendar;