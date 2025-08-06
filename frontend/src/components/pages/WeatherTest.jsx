import React, { useState, useEffect } from 'react';
import {
    Box,
    Button,
    Card,
    CardContent,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Typography,
    Dialog,
    DialogTitle,
    DialogContent,
    TextField,
    DialogActions,
    Grid
} from '@mui/material';
import api from '../../utils/api';

const WeatherTest = () => {
    const [regions, setRegions] = useState([]);
    const [selectedRegion, setSelectedRegion] = useState('');
    const [weather, setWeather] = useState(null);
    const [currentDate, setCurrentDate] = useState({ year: 4722, month: 0, day: 1 });
    const [dialogOpen, setDialogOpen] = useState(false);
    const [customDate, setCustomDate] = useState({ year: 4722, month: 0, day: 1 });

    useEffect(() => {
        fetchRegions();
        fetchCurrentDate();
    }, []);

    const fetchRegions = async () => {
        try {
            const response = await api.get('/weather/regions');
            if (response.data) {
                setRegions(response.data);
                if (response.data.length > 0) {
                    setSelectedRegion(response.data[0]);
                }
            }
        } catch (error) {
            console.error('Error fetching regions:', error);
        }
    };

    const fetchCurrentDate = async () => {
        try {
            const response = await api.get('/calendar/current-date');
            if (response.data) {
                setCurrentDate(response.data);
            }
        } catch (error) {
            console.error('Error fetching current date:', error);
        }
    };

    const initializeWeather = async (region) => {
        try {
            await api.post(`/weather/initialize/${region}`);
            alert(`Weather initialized for ${region}`);
        } catch (error) {
            console.error('Error initializing weather:', error);
            alert('Error initializing weather');
        }
    };

    const getWeatherForDate = async (date, region) => {
        try {
            const response = await api.get(`/weather/date/${date.year}/${date.month}/${date.day}/${region}`);
            setWeather(response.data);
        } catch (error) {
            console.error('Error fetching weather:', error);
            setWeather(null);
        }
    };

    const setCustomWeather = async () => {
        if (!weather) return;
        
        try {
            await api.put('/weather/set', {
                year: customDate.year,
                month: customDate.month,
                day: customDate.day,
                region: selectedRegion,
                condition: weather.condition,
                tempLow: weather.temp_low,
                tempHigh: weather.temp_high,
                precipitationType: weather.precipitation_type,
                windSpeed: weather.wind_speed,
                humidity: weather.humidity,
                visibility: weather.visibility,
                description: weather.description
            });
            alert('Weather updated successfully');
            setDialogOpen(false);
        } catch (error) {
            console.error('Error setting weather:', error);
            alert('Error setting weather');
        }
    };

    const currentWeatherKey = `${currentDate.year}-${currentDate.month}-${currentDate.day}`;

    return (
        <Box p={3}>
            <Typography variant="h4" gutterBottom>
                Weather System Test
            </Typography>

            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Region Management
                            </Typography>
                            
                            <FormControl fullWidth margin="normal">
                                <InputLabel>Region</InputLabel>
                                <Select
                                    value={selectedRegion}
                                    label="Region"
                                    onChange={(e) => setSelectedRegion(e.target.value)}
                                >
                                    {regions.map((region) => (
                                        <MenuItem key={region} value={region}>
                                            {region}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Box mt={2}>
                                <Button
                                    variant="contained"
                                    color="primary"
                                    onClick={() => initializeWeather(selectedRegion)}
                                    disabled={!selectedRegion}
                                    fullWidth
                                >
                                    Initialize Weather for {selectedRegion}
                                </Button>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Current Date Weather
                            </Typography>
                            
                            <Typography variant="body1" gutterBottom>
                                Date: {currentDate.day} {['Abadius', 'Calistril', 'Pharast', 'Gozran', 'Desnus', 'Sarenith', 'Erastus', 'Arodus', 'Rova', 'Lamashan', 'Neth', 'Kuthona'][currentDate.month]} {currentDate.year}
                            </Typography>

                            <Button
                                variant="outlined"
                                onClick={() => getWeatherForDate(currentDate, selectedRegion)}
                                disabled={!selectedRegion}
                                fullWidth
                            >
                                Get Current Weather
                            </Button>

                            {weather && (
                                <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
                                    <Typography variant="subtitle1">
                                        {weather.emoji} {weather.condition}
                                    </Typography>
                                    <Typography variant="body2">
                                        Low: {weather.temp_low}°F, High: {weather.temp_high}°F
                                    </Typography>
                                    {weather.precipitation_type && (
                                        <Typography variant="body2">
                                            Precipitation: {weather.precipitation_type}
                                        </Typography>
                                    )}
                                    <Typography variant="body2">
                                        Wind: {weather.wind_speed} mph
                                    </Typography>
                                    <Typography variant="body2">
                                        Humidity: {weather.humidity}%
                                    </Typography>
                                    <Typography variant="body2">
                                        Visibility: {weather.visibility}
                                    </Typography>
                                    {weather.description && (
                                        <Typography variant="caption" color="text.secondary">
                                            {weather.description}
                                        </Typography>
                                    )}
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Custom Weather Test
                            </Typography>
                            
                            <Button
                                variant="outlined"
                                onClick={() => setDialogOpen(true)}
                                disabled={!selectedRegion}
                            >
                                Set Custom Weather
                            </Button>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Set Custom Weather</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2}>
                        <Grid item xs={4}>
                            <TextField
                                label="Year"
                                type="number"
                                value={customDate.year}
                                onChange={(e) => setCustomDate({...customDate, year: parseInt(e.target.value)})}
                                fullWidth
                                margin="normal"
                            />
                        </Grid>
                        <Grid item xs={4}>
                            <TextField
                                label="Month (0-11)"
                                type="number"
                                value={customDate.month}
                                onChange={(e) => setCustomDate({...customDate, month: parseInt(e.target.value)})}
                                fullWidth
                                margin="normal"
                                inputProps={{ min: 0, max: 11 }}
                            />
                        </Grid>
                        <Grid item xs={4}>
                            <TextField
                                label="Day"
                                type="number"
                                value={customDate.day}
                                onChange={(e) => setCustomDate({...customDate, day: parseInt(e.target.value)})}
                                fullWidth
                                margin="normal"
                                inputProps={{ min: 1, max: 31 }}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button onClick={setCustomWeather} color="primary" disabled={!weather}>
                        Set Weather
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default WeatherTest;
