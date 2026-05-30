import React, {useCallback, useEffect, useState} from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type {SelectChangeEvent} from '@mui/material';
import {styled} from '@mui/material/styles';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EventIcon from '@mui/icons-material/Event';
import NoteAltIcon from '@mui/icons-material/NoteAlt';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import api from '../../utils/api';
import {isDM} from '../../utils/auth';
import {
    getGolarionDayOfWeek,
    getGolarionMonthDays,
    getGolarionMoonPhase,
    addGolarionDays,
    compareGolarionDates,
    golarionSpanDays,
} from '../../utils/golarionDate';

interface MoonPhase {
    name: string;
    emoji: string;
}

// Weather conditions the DM can choose from (mirrors the backend's set).
const WEATHER_CONDITION_OPTIONS = [
    'Clear', 'Partly Cloudy', 'Cloudy', 'Overcast',
    'Light Rain', 'Rain', 'Heavy Rain', 'Thunderstorm',
    'Light Snow', 'Snow', 'Heavy Snow', 'Blizzard', 'Sleet',
    'Fog', 'Hurricane', 'Tropical Storm',
];

const VISIBILITY_OPTIONS = ['Clear', 'Good', 'Fair', 'Poor'];

interface WeatherData {
    year: number;
    month: number;
    day: number;
    region: string;
    condition: string;
    temp_low: number;
    temp_high: number;
    precipitation_type?: string | null;
    wind_speed?: number;
    humidity?: number;
    visibility?: string;
    description?: string;
    emoji?: string;
    is_locked?: boolean;
}

interface WeatherForm {
    condition: string;
    tempLow: string;
    tempHigh: string;
    windSpeed: string;
    humidity: string;
    visibility: string;
}

const EMPTY_WEATHER_FORM: WeatherForm = {
    condition: 'Clear',
    tempLow: '',
    tempHigh: '',
    windSpeed: '',
    humidity: '',
    visibility: 'Clear',
};

// Precipitation type is implied by the condition, so it is derived rather than
// entered separately. Conditions not listed here have no precipitation.
const PRECIP_BY_CONDITION: Record<string, string> = {
    'Light Rain': 'Light Rain',
    'Rain': 'Rain',
    'Heavy Rain': 'Heavy Rain',
    'Thunderstorm': 'Heavy Rain',
    'Light Snow': 'Light Snow',
    'Snow': 'Snow',
    'Heavy Snow': 'Heavy Snow',
    'Blizzard': 'Heavy Snow',
    'Sleet': 'Sleet',
    'Hurricane': 'Heavy Rain',
    'Tropical Storm': 'Heavy Rain',
};

const precipForCondition = (condition: string): string | null =>
    PRECIP_BY_CONDITION[condition] ?? null;

// Build a human-readable description from the structured weather inputs.
const buildWeatherDescription = (form: WeatherForm): string => {
    const parts: string[] = [form.condition || 'Clear'];
    if (form.tempLow !== '' && form.tempHigh !== '') {
        parts.push(`${form.tempLow}°–${form.tempHigh}°F`);
    }
    const wind = parseInt(form.windSpeed, 10);
    if (!isNaN(wind) && wind > 0) {
        parts.push(`winds ${wind} mph`);
    }
    if (form.visibility && form.visibility !== 'Clear') {
        parts.push(`${form.visibility.toLowerCase()} visibility`);
    }
    const humidity = parseInt(form.humidity, 10);
    if (!isNaN(humidity)) {
        parts.push(`${humidity}% humidity`);
    }
    return parts.join(', ') + '.';
};

interface Month {
  name: string;
  days: number;
}

interface DateObject {
  year: number;
  month: number;
  day?: number;
}

interface GolarionDate {
  year: number;
  month: number;
  day: number;
}

interface GolarionNoteData {
  id: number;
  startDate: GolarionDate;
  endDate: GolarionDate;
  note: string;
  dmOnly: boolean;
  createdBy: number | null;
  createdAt?: string;
  updatedAt?: string;
}

interface HolidayData {
  id: number;
  name: string;
  month: number | null;
  day: number | null;
  category: string;
  deity: string | null;
  region: string | null;
  description: string | null;
  movableRule: string | null;
  isCustom: boolean;
  createdBy: number | null;
}

interface HolidayForm {
  name: string;
  month: string;
  day: string;
  category: string;
  deity: string;
  region: string;
  description: string;
  movableRule: string;
}

const EMPTY_HOLIDAY_FORM: HolidayForm = {
  name: '', month: '', day: '', category: 'Cultural',
  deity: '', region: '', description: '', movableRule: '',
};

const HOLIDAY_CATEGORIES = ['Religious', 'Civic', 'Cultural', 'Seasonal', 'Astronomical', 'Regional'];

// localStorage key for the per-user (per-browser) category visibility filter.
const HIDDEN_HOLIDAY_CATEGORIES_KEY = 'golarion_hidden_holiday_categories';

const loadHiddenHolidayCategories = (): string[] => {
  try {
    const raw = localStorage.getItem(HIDDEN_HOLIDAY_CATEGORIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

interface StyledDayProps {
  isCurrentDay?: boolean;
  isSelected?: boolean;
}

const months: Month[] = [
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

const daysOfWeek: string[] = ['Moonday', 'Toilday', 'Wealday', 'Oathday', 'Fireday', 'Starday', 'Sunday'];

const StyledDay = styled(Paper)<StyledDayProps>(({theme, isCurrentDay, isSelected}) => ({
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

const DayNumber = styled(Typography)<{isCurrentDay?: boolean}>(({theme, isCurrentDay}) => ({
    fontWeight: 'bold',
    marginBottom: '2px',
    color: isCurrentDay ? theme.palette.primary.contrastText : theme.palette.text.primary,
}));

const NotePreview = styled(Typography)<{isCurrentDay?: boolean}>(({theme, isCurrentDay}) => ({
    fontSize: '0.7rem',
    lineHeight: 1.2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    width: '100%',
    color: isCurrentDay ? theme.palette.primary.contrastText : theme.palette.text.secondary,
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

const GolarionCalendar: React.FC = () => {
    const [currentDate, setCurrentDate] = useState<DateObject & {day: number}>({year: 4722, month: 1, day: 1});
    const [displayedDate, setDisplayedDate] = useState<DateObject>({year: 4722, month: 1});
    const [selectedDate, setSelectedDate] = useState<DateObject & {day: number} | null>(null);
    const [notes, setNotes] = useState<GolarionNoteData[]>([]);
    const [noteText, setNoteText] = useState<string>('');
    const [noteDays, setNoteDays] = useState<string>('1');
    const [noteSeparate, setNoteSeparate] = useState<boolean>(false);
    const [noteDmOnly, setNoteDmOnly] = useState<boolean>(false);
    const [editingNote, setEditingNote] = useState<GolarionNoteData | null>(null);
    const [activeTab, setActiveTab] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    const [confirmDialogOpen, setConfirmDialogOpen] = useState<boolean>(false);
    const [daysToAdd, setDaysToAdd] = useState<string>('');
    const [weather, setWeather] = useState<Record<string, WeatherData>>({});
    const [currentRegion, setCurrentRegion] = useState('Varisia');

    // DM-only weather forecast controls
    const dmMode = isDM();
    const [forecastDays, setForecastDays] = useState<string>('7');
    const [weatherDialogOpen, setWeatherDialogOpen] = useState<boolean>(false);
    const [weatherForm, setWeatherForm] = useState<WeatherForm>(EMPTY_WEATHER_FORM);
    const [weatherEditDate, setWeatherEditDate] = useState<(DateObject & {day: number}) | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    // Holidays
    const [holidays, setHolidays] = useState<HolidayData[]>([]);
    const [hiddenCategories, setHiddenCategories] = useState<string[]>(loadHiddenHolidayCategories);
    const [holidayDialogOpen, setHolidayDialogOpen] = useState<boolean>(false);
    const [holidayForm, setHolidayForm] = useState<HolidayForm>(EMPTY_HOLIDAY_FORM);
    const [editingHoliday, setEditingHoliday] = useState<HolidayData | null>(null);

    useEffect(() => {
        fetchCurrentDate();
        fetchNotes();
        fetchCurrentRegion();
        fetchHolidays();
        if (dmMode) {
            fetchForecastDays();
        }
    }, [dmMode]);

    // Fetch weather data when displayed month changes
    useEffect(() => {
        if (currentRegion) {
            fetchWeatherForMonth(displayedDate.year, displayedDate.month);
        }
    }, [displayedDate, currentRegion]);

    const fetchCurrentDate = async (): Promise<void> => {
        try {
            const response = await api.get('/calendar/current-date');
            const {year, month, day} = response.data;
            // Both backend and frontend now use 1-indexed months
            setCurrentDate({year, month, day});
            setDisplayedDate({year, month});
            setSelectedDate({year, month, day});
            setError(null);
        } catch (error) {
            setError('Failed to fetch current date. Please try again later.');
        }
    };

    const fetchNotes = async (): Promise<void> => {
        try {
            const response = await api.get('/calendar/notes');
            setNotes(Array.isArray(response.data) ? response.data : []);
            setError(null);
        } catch (error) {
            setError('Failed to fetch notes. Please try again later.');
        }
    };

    const fetchHolidays = async (): Promise<void> => {
        try {
            const response = await api.get('/calendar/holidays');
            setHolidays(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            // Non-fatal; holidays just won't show
        }
    };

    const fetchCurrentRegion = async (): Promise<void> => {
        try {
            const response = await api.get('/settings/region');
            if (response.data && response.data.value) {
                setCurrentRegion(response.data.value);
            }
        } catch (error) {
            // Don't show error for region fetch, use default
        }
    };

    const fetchWeatherForMonth = useCallback(async (year: number, month: number): Promise<void> => {
        try {
            // Calculate start and end dates for the month (leap-aware)
            const startDay = 1;
            const endDay = getGolarionMonthDays(year, month);
            
            // Both frontend and backend now use 1-indexed months
            const response = await api.get(
                `/weather/range/${year}/${month}/${startDay}/${year}/${month}/${endDay}/${currentRegion}`
            );
            
            if (response.data) {
                const weatherData: Record<string, WeatherData> = {};
                (response.data as WeatherData[]).forEach(w => {
                    // Both frontend and backend use 1-indexed months
                    const key = `${w.year}-${w.month}-${w.day}`;
                    weatherData[key] = w;
                });
                setWeather(weatherData);
            }
        } catch (error) {
            // Don't show error for weather fetch
        }
    }, [currentRegion]);

    const fetchForecastDays = async (): Promise<void> => {
        try {
            const response = await api.get('/settings/weather-forecast-days');
            if (response.data && response.data.value !== undefined) {
                setForecastDays(String(response.data.value));
            }
        } catch (error) {
            // Non-fatal; keep default
        }
    };

    // Whether a date falls after the current (in-game) date — i.e. it is a
    // DM-only forecast day rather than a day the party has reached.
    const isForecastDate = (date: DateObject & {day: number}): boolean => {
        if (date.year !== currentDate.year) return date.year > currentDate.year;
        if (date.month !== currentDate.month) return date.month > currentDate.month;
        return date.day > currentDate.day;
    };

    const handleOpenWeatherDialog = (date: DateObject & {day: number}): void => {
        const existing = weather[`${date.year}-${date.month}-${date.day}`];
        setWeatherForm(existing ? {
            condition: existing.condition || 'Clear',
            tempLow: existing.temp_low?.toString() ?? '',
            tempHigh: existing.temp_high?.toString() ?? '',
            windSpeed: existing.wind_speed?.toString() ?? '',
            humidity: existing.humidity?.toString() ?? '',
            visibility: existing.visibility || 'Clear',
        } : EMPTY_WEATHER_FORM);
        setWeatherEditDate(date);
        setWeatherDialogOpen(true);
    };

    const handleSaveWeather = async (): Promise<void> => {
        if (!weatherEditDate) return;

        const tempLow = parseInt(weatherForm.tempLow, 10);
        const tempHigh = parseInt(weatherForm.tempHigh, 10);
        if (!weatherForm.condition || isNaN(tempLow) || isNaN(tempHigh)) {
            setError('Condition, low temp, and high temp are required to set weather.');
            return;
        }

        // Wind and humidity can't be negative; humidity caps at 100.
        const windSpeed = Math.max(0, parseInt(weatherForm.windSpeed, 10) || 0);
        const humidity = weatherForm.humidity === ''
            ? 50
            : Math.min(100, Math.max(0, parseInt(weatherForm.humidity, 10) || 0));

        try {
            await api.put('/weather/set', {
                year: weatherEditDate.year,
                month: weatherEditDate.month,
                day: weatherEditDate.day,
                region: currentRegion,
                condition: weatherForm.condition,
                tempLow,
                tempHigh,
                // Derived from the structured inputs rather than entered by hand.
                precipitationType: precipForCondition(weatherForm.condition),
                windSpeed,
                humidity,
                visibility: weatherForm.visibility || 'Clear',
                description: buildWeatherDescription(weatherForm),
            });
            setWeatherDialogOpen(false);
            setError(null);
            setStatusMessage('Weather updated for this date.');
            await fetchWeatherForMonth(displayedDate.year, displayedDate.month);
        } catch (error) {
            setError('Failed to save weather. Please try again later.');
        }
    };

    const handleSaveForecastDays = async (): Promise<void> => {
        const days = parseInt(forecastDays, 10);
        if (isNaN(days) || days < 0 || days > 60) {
            setError('Forecast days must be between 0 and 60.');
            return;
        }
        try {
            await api.post('/settings/weather-forecast-days', {days});
            setError(null);
            setStatusMessage(`Forecast length set to ${days} day(s).`);
        } catch (error) {
            setError('Failed to update forecast length. Please try again later.');
        }
    };

    const handleRegenerateForecast = async (): Promise<void> => {
        try {
            await api.post('/weather/regenerate-forecast');
            setError(null);
            setStatusMessage('Forecast regenerated (DM-locked days were preserved).');
            await fetchWeatherForMonth(displayedDate.year, displayedDate.month);
        } catch (error) {
            setError('Failed to regenerate forecast. Please try again later.');
        }
    };

    const handleNextDay = async (): Promise<void> => {
        try {
            const response = await api.post('/calendar/next-day');
            const {year, month, day} = response.data;
            // Both backend and frontend now use 1-indexed months
            setCurrentDate({year, month, day});
            setDisplayedDate({year, month});
            setSelectedDate({year, month, day});
            setError(null);
        } catch (error) {
            setError('Failed to advance day. Please try again later.');
        }
    };

    const handleSetCurrentDay = async (): Promise<void> => {
        if (!selectedDate) return;

        try {
            // Both frontend and backend now use 1-indexed months
            await api.post('/calendar/set-current-date', {
                year: selectedDate.year,
                month: selectedDate.month,
                day: selectedDate.day
            });

            setCurrentDate(selectedDate);
            setConfirmDialogOpen(false);
            setError(null);
        } catch (error) {
            setError('Failed to set current date. Please try again later.');
        }
    };

    const handleIncreaseDays = async (): Promise<void> => {
        const days = parseInt(daysToAdd);
        if (isNaN(days) || days < 1) {
            setError('Please enter a valid number of days');
            return;
        }

        try {
            // Single request: the backend advances the date and generates
            // weather for every day jumped over in one transaction.
            const response = await api.post('/calendar/advance', {days});
            const {year, month, day} = response.data;
            setCurrentDate({year, month, day});
            setDisplayedDate({year, month});
            setSelectedDate({year, month, day});
            setDaysToAdd('');
            setError(null);
        } catch (error) {
            setError('Failed to increase days. Please try again later.');
        }
    };

    const handlePrevMonth = (): void => {
        setDisplayedDate(prev => ({
            year: prev.month > 1 ? prev.year : prev.year - 1,
            month: prev.month > 1 ? prev.month - 1 : 12
        }));
    };

    const handleNextMonth = (): void => {
        setDisplayedDate(prev => ({
            year: prev.month < 12 ? prev.year : prev.year + 1,
            month: prev.month < 12 ? prev.month + 1 : 1
        }));
    };

    const handleGoToToday = (): void => {
        setDisplayedDate({year: currentDate.year, month: currentDate.month});
        setSelectedDate(currentDate);
    };

    // Reset the note editor to a blank "new note" state.
    const resetNoteForm = (): void => {
        setEditingNote(null);
        setNoteText('');
        setNoteDays('1');
        setNoteSeparate(false);
        setNoteDmOnly(false);
    };

    const handleDayClick = (day: number): void => {
        const clickedDate = {...displayedDate, day};
        setSelectedDate(clickedDate);
        resetNoteForm();
    };

    // Notes expanded into a per-day map so the grid and the selected-day panel
    // can quickly find which notes touch a given date.
    const notesByDay: Record<string, GolarionNoteData[]> = React.useMemo(() => {
        const map: Record<string, GolarionNoteData[]> = {};
        for (const n of notes) {
            let d: GolarionDate = n.startDate;
            let guard = 0;
            // Guard well above the backend's MAX_NOTE_SPAN_DAYS (366); a note can
            // never legitimately exceed it, so this only bounds malformed data.
            while (compareGolarionDates(d, n.endDate) <= 0 && guard < 1000) {
                const key = `${d.year}-${d.month}-${d.day}`;
                (map[key] = map[key] || []).push(n);
                d = addGolarionDays(d, 1);
                guard++;
            }
        }
        return map;
    }, [notes]);

    const handleSaveNote = async (): Promise<void> => {
        if (!selectedDate) return;
        if (noteText.trim() === '') {
            setError('Note text is required.');
            return;
        }

        const days = parseInt(noteDays, 10);
        if (isNaN(days) || days < 1) {
            setError('A note must span at least 1 day.');
            return;
        }

        try {
            if (editingNote) {
                await api.put(`/calendar/notes/${editingNote.id}`, {
                    note: noteText,
                    days,
                    dmOnly: noteDmOnly,
                });
            } else {
                await api.post('/calendar/notes', {
                    startDate: {
                        year: selectedDate.year,
                        month: selectedDate.month,
                        day: selectedDate.day,
                    },
                    days,
                    note: noteText,
                    dmOnly: noteDmOnly,
                    asSeparateNotes: noteSeparate,
                });
            }
            resetNoteForm();
            setError(null);
            await fetchNotes();
        } catch (error) {
            setError('Failed to save note. Please try again later.');
        }
    };

    const handleEditNote = (note: GolarionNoteData): void => {
        setEditingNote(note);
        setNoteText(note.note);
        setNoteDays(String(golarionSpanDays(note.startDate, note.endDate)));
        setNoteSeparate(false);
        setNoteDmOnly(note.dmOnly);
        setSelectedDate({year: note.startDate.year, month: note.startDate.month, day: note.startDate.day});
        // The per-day edit form lives on the Calendar tab; jump there.
        setActiveTab(0);
    };

    const handleDeleteNote = async (id: number): Promise<void> => {
        try {
            await api.delete(`/calendar/notes/${id}`);
            if (editingNote?.id === id) {
                resetNoteForm();
            }
            setError(null);
            await fetchNotes();
        } catch (error) {
            setError('Failed to delete note. Please try again later.');
        }
    };

    // Format a note's date or date range for display.
    const formatNoteRange = (note: GolarionNoteData): string => {
        const start = `${note.startDate.day} ${months[note.startDate.month - 1]?.name || ''} ${note.startDate.year}`;
        if (compareGolarionDates(note.startDate, note.endDate) === 0) {
            return start;
        }
        const end = `${note.endDate.day} ${months[note.endDate.month - 1]?.name || ''} ${note.endDate.year}`;
        return `${start} – ${end}`;
    };

    // --- Holidays ---

    const isCategoryVisible = (category: string): boolean => !hiddenCategories.includes(category);

    const toggleCategory = (category: string): void => {
        setHiddenCategories(prev => {
            const next = prev.includes(category)
                ? prev.filter(c => c !== category)
                : [...prev, category];
            try {
                localStorage.setItem(HIDDEN_HOLIDAY_CATEGORIES_KEY, JSON.stringify(next));
            } catch {
                // ignore storage failures
            }
            return next;
        });
    };

    // Categories actually present in the data (for the toggle row).
    const presentCategories = Array.from(new Set(holidays.map(h => h.category)))
        .sort((a, b) => a.localeCompare(b));

    // Dated holidays grouped by month-day (recurring annually), filtered by the
    // visible-category preference.
    const holidaysByMonthDay: Record<string, HolidayData[]> = React.useMemo(() => {
        const map: Record<string, HolidayData[]> = {};
        for (const h of holidays) {
            if (h.month == null || h.day == null) continue;
            if (!isCategoryVisible(h.category)) continue;
            const key = `${h.month}-${h.day}`;
            (map[key] = map[key] || []).push(h);
        }
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [holidays, hiddenCategories]);

    // Movable / undated holidays (no fixed month-day) for the reference list.
    const movableHolidays = holidays.filter(h => h.month == null || h.day == null);

    const resetHolidayForm = (): void => {
        setEditingHoliday(null);
        setHolidayForm(EMPTY_HOLIDAY_FORM);
    };

    const handleOpenHolidayDialog = (holiday?: HolidayData): void => {
        if (holiday) {
            setEditingHoliday(holiday);
            setHolidayForm({
                name: holiday.name,
                month: holiday.month != null ? String(holiday.month) : '',
                day: holiday.day != null ? String(holiday.day) : '',
                category: holiday.category,
                deity: holiday.deity ?? '',
                region: holiday.region ?? '',
                description: holiday.description ?? '',
                movableRule: holiday.movableRule ?? '',
            });
        } else {
            resetHolidayForm();
        }
        setHolidayDialogOpen(true);
    };

    const handleSaveHoliday = async (): Promise<void> => {
        if (holidayForm.name.trim() === '') {
            setError('Holiday name is required.');
            return;
        }
        // A holiday is either dated (both month and day) or movable (neither).
        if ((holidayForm.month !== '') !== (holidayForm.day !== '')) {
            setError('Enter both a month and a day, or leave both empty for a movable holiday.');
            return;
        }
        const payload = {
            name: holidayForm.name.trim(),
            month: holidayForm.month === '' ? null : parseInt(holidayForm.month, 10),
            day: holidayForm.day === '' ? null : parseInt(holidayForm.day, 10),
            category: holidayForm.category,
            deity: holidayForm.deity || null,
            region: holidayForm.region || null,
            description: holidayForm.description || null,
            movableRule: holidayForm.movableRule || null,
        };
        try {
            if (editingHoliday) {
                await api.put(`/calendar/holidays/${editingHoliday.id}`, payload);
            } else {
                await api.post('/calendar/holidays', payload);
            }
            setHolidayDialogOpen(false);
            resetHolidayForm();
            setError(null);
            setStatusMessage('Holiday saved.');
            await fetchHolidays();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to save holiday. Please try again later.');
        }
    };

    const handleDeleteHoliday = async (id: number): Promise<void> => {
        try {
            await api.delete(`/calendar/holidays/${id}`);
            setError(null);
            setStatusMessage('Holiday deleted.');
            await fetchHolidays();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to delete holiday. Please try again later.');
        }
    };

    const getMoonPhase = (date: DateObject & {day: number}): MoonPhase =>
        getGolarionMoonPhase(date.year, date.month, date.day);

    const renderCalendar = () => {
        const month = months[displayedDate.month - 1];
        if (!month) {
            return <div>Loading calendar...</div>;
        }
        // Leap-aware: Calistril has 29 days in leap years.
        const daysInMonth = getGolarionMonthDays(displayedDate.year, displayedDate.month);
        const firstDayOfMonth = getGolarionDayOfWeek(displayedDate.year, displayedDate.month, 1);
        const weeks = Math.ceil((daysInMonth + firstDayOfMonth) / 7);

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
                                    const isValidDay = day > 0 && day <= daysInMonth;
                                    const dateKey = `${displayedDate.year}-${displayedDate.month}-${day}`;
                                    const isCurrentDay = currentDate.year === displayedDate.year &&
                                        currentDate.month === displayedDate.month &&
                                        currentDate.day === day;
                                    const isSelected = selectedDate &&
                                        selectedDate.year === displayedDate.year &&
                                        selectedDate.month === displayedDate.month &&
                                        selectedDate.day === day;
                                    const dayNotes = notesByDay[dateKey] || [];
                                    const note = dayNotes.length > 0
                                        ? (dayNotes.length > 1
                                            ? `${dayNotes[0].note} (+${dayNotes.length - 1} more)`
                                            : dayNotes[0].note)
                                        : '';
                                    const dayHolidays = holidaysByMonthDay[`${displayedDate.month}-${day}`] || [];

                                    if (isValidDay) {
                                        // For valid days, get weather and moon phase
                                        const weatherData = weather[dateKey];

                                        // DM-only: a day past the current date is a forecast (shown
                                        // distinctly); a manually set day is locked (story weather).
                                        const isForecast = dmMode && weatherData &&
                                            isForecastDate({year: displayedDate.year, month: displayedDate.month, day});
                                        const isLocked = Boolean(weatherData?.is_locked);

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
                                        const prevMonth = displayedDate.month > 1 ? displayedDate.month - 1 : 12;
                                        const prevYear = prevMonth === 12 ? displayedDate.year - 1 : displayedDate.year;
                                        const lastDayOfPrevMonth = getGolarionMonthDays(prevYear, prevMonth);
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
                                                            {dayHolidays.length > 0 && (
                                                                <Box mb={0.5}>
                                                                    {dayHolidays.map(h => (
                                                                        <Typography key={h.id} variant="caption" sx={{display: 'block'}}>
                                                                            🎉 {h.name}
                                                                        </Typography>
                                                                    ))}
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
                                                                    <Typography variant="caption"
                                                                                sx={{fontSize: '0.6rem', lineHeight: 1,
                                                                                     fontStyle: isForecast ? 'italic' : 'normal',
                                                                                     opacity: isForecast ? 0.75 : 1}}>
                                                                        {isLocked && '🔒'}{weatherData.emoji} {weatherData.condition}
                                                                    </Typography>
                                                                )}
                                                                {weatherData && (
                                                                    <Typography variant="caption"
                                                                                sx={{fontSize: '0.55rem', lineHeight: 1,
                                                                                     opacity: isForecast ? 0.75 : 1}}>
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
                                                                {dayHolidays.length > 0 && (
                                                                    <Typography variant="caption" sx={{fontSize: '0.7rem'}}>
                                                                        🎉
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

    const selectedWeather = selectedDate
        ? weather[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`]
        : undefined;

    const selectedDayNotes = selectedDate
        ? (notesByDay[`${selectedDate.year}-${selectedDate.month}-${selectedDate.day}`] || [])
        : [];

    const selectedDayHolidays = selectedDate
        ? (holidaysByMonthDay[`${selectedDate.month}-${selectedDate.day}`] || [])
        : [];

    return (
        <Container maxWidth="lg">
            {error && (
                <Alert severity="error" sx={{mb: 2}} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {statusMessage && (
                <Alert severity="success" sx={{mb: 2}} onClose={() => setStatusMessage(null)}>
                    {statusMessage}
                </Alert>
            )}

            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{mb: 2}}>
                <Tab label="Calendar"/>
                <Tab label="Notes"/>
                <Tab label="Holidays"/>
            </Tabs>

            {activeTab === 0 && (
            <>
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
                        {months[displayedDate.month - 1]?.name || 'Loading...'} {displayedDate.year}
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

                {dmMode && (
                    <>
                        <Divider sx={{my: 2}}/>
                        <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 1}}>
                            <Typography variant="body2" color="text.secondary" sx={{mr: 1}}>
                                DM weather forecast:
                            </Typography>
                            <TextField
                                label="Days ahead"
                                type="number"
                                value={forecastDays}
                                onChange={(e) => setForecastDays(e.target.value)}
                                size="small"
                                sx={{width: '110px'}}
                                InputProps={{inputProps: {min: 0, max: 60}}}
                            />
                            <Button
                                variant="outlined"
                                color="primary"
                                onClick={handleSaveForecastDays}
                                sx={{fontWeight: 500, textTransform: 'none'}}
                            >
                                Save
                            </Button>
                            <Button
                                variant="outlined"
                                color="secondary"
                                onClick={handleRegenerateForecast}
                                startIcon={<AutorenewIcon/>}
                                sx={{fontWeight: 500, textTransform: 'none'}}
                            >
                                Regenerate Forecast
                            </Button>
                        </Box>
                        <Typography variant="caption" color="text.secondary"
                                    sx={{display: 'block', textAlign: 'center', mt: 1}}>
                            Forecast days are visible only to DMs. 🔒 marks manually set (locked) weather.
                        </Typography>
                    </>
                )}
            </Paper>

            {selectedDate && (
                <Paper sx={{p: 3, mt: 3, borderRadius: 2}} elevation={3}>
                    <Typography variant="h5" gutterBottom color="primary"
                                sx={{display: 'flex', alignItems: 'center', mb: 2}}>
                        <CalendarTodayIcon sx={{mr: 1}}/>
                        {`${selectedDate.day} ${months[selectedDate.month - 1]?.name || 'Unknown Month'} ${selectedDate.year}`}
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

                                        <ListItem
                                            secondaryAction={dmMode && selectedDate ? (
                                                <Button
                                                    size="small"
                                                    startIcon={<EditIcon/>}
                                                    onClick={() => handleOpenWeatherDialog(selectedDate)}
                                                    sx={{textTransform: 'none'}}
                                                >
                                                    Edit
                                                </Button>
                                            ) : undefined}
                                        >
                                            <ListItemText
                                                primary={<Typography variant="subtitle1">Weather</Typography>}
                                                secondary={
                                                    selectedWeather ? (
                                                        <Box component="span" sx={{display: 'block'}}>
                                                            <Typography variant="body2" component="span" sx={{display: 'block'}}>
                                                                {selectedWeather.is_locked && '🔒 '}{selectedWeather.emoji} {selectedWeather.condition}
                                                            </Typography>
                                                            <Typography variant="body2" component="span" sx={{display: 'block'}}>
                                                                Low: {selectedWeather.temp_low}°F, High: {selectedWeather.temp_high}°F
                                                            </Typography>
                                                            {selectedWeather.precipitation_type && (
                                                                <Typography variant="body2" component="span" sx={{display: 'block'}}>
                                                                    {selectedWeather.precipitation_type}
                                                                </Typography>
                                                            )}
                                                            {Number(selectedWeather.wind_speed) > 0 && (
                                                                <Typography variant="body2" component="span" sx={{display: 'block'}}>
                                                                    Wind: {selectedWeather.wind_speed} mph
                                                                </Typography>
                                                            )}
                                                            {selectedWeather.description && (
                                                                <Typography variant="caption" component="span" color="text.secondary" sx={{display: 'block'}}>
                                                                    {selectedWeather.description}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    ) : (
                                                        <Typography variant="body2" component="span" color="text.secondary">
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
                                                secondary={
                                                    selectedDayHolidays.length > 0 ? (
                                                        <Box component="span" sx={{display: 'block'}}>
                                                            {selectedDayHolidays.map(h => (
                                                                <Box component="span" key={h.id} sx={{display: 'block', mb: 0.5}}>
                                                                    <Typography variant="body2" component="span" sx={{display: 'block'}}>
                                                                        🎉 {h.name}
                                                                        {h.deity ? ` — ${h.deity}` : ''}
                                                                    </Typography>
                                                                    {h.description && (
                                                                        <Typography variant="caption" component="span"
                                                                                    color="text.secondary" sx={{display: 'block'}}>
                                                                            {h.description}
                                                                        </Typography>
                                                                    )}
                                                                </Box>
                                                            ))}
                                                        </Box>
                                                    ) : (
                                                        <Typography variant="body2" component="span" color="text.secondary">
                                                            No holidays on this day
                                                        </Typography>
                                                    )
                                                }
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

                                {selectedDayNotes.length > 0 ? (
                                    <List dense sx={{mb: 1}}>
                                        {selectedDayNotes.map(n => (
                                            <ListItem
                                                key={n.id}
                                                alignItems="flex-start"
                                                disableGutters
                                                secondaryAction={
                                                    <Box>
                                                        <IconButton size="small" aria-label="edit note"
                                                                    onClick={() => handleEditNote(n)}>
                                                            <EditIcon fontSize="small"/>
                                                        </IconButton>
                                                        <IconButton size="small" aria-label="delete note"
                                                                    onClick={() => handleDeleteNote(n.id)}>
                                                            <DeleteIcon fontSize="small"/>
                                                        </IconButton>
                                                    </Box>
                                                }
                                            >
                                                <ListItemText
                                                    primaryTypographyProps={{component: 'span'}}
                                                    primary={
                                                        <Box component="span" sx={{display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.5}}>
                                                            {n.dmOnly && (
                                                                <Chip label="DM only" size="small" color="warning" variant="outlined"/>
                                                            )}
                                                            {compareGolarionDates(n.startDate, n.endDate) !== 0 && (
                                                                <Chip label={formatNoteRange(n)} size="small" variant="outlined"/>
                                                            )}
                                                        </Box>
                                                    }
                                                    secondary={
                                                        <Typography variant="body2" component="span"
                                                                    sx={{whiteSpace: 'pre-wrap', display: 'block', pr: 6}}>
                                                            {n.note}
                                                        </Typography>
                                                    }
                                                />
                                            </ListItem>
                                        ))}
                                    </List>
                                ) : (
                                    <Typography variant="body2" color="text.secondary" sx={{mb: 1}}>
                                        No notes on this day yet.
                                    </Typography>
                                )}

                                <Divider sx={{my: 1.5}}/>

                                <Typography variant="subtitle2" sx={{mb: 1}}>
                                    {editingNote ? 'Edit note' : 'Add a note'}
                                </Typography>

                                <TextField
                                    label="Note"
                                    multiline
                                    rows={4}
                                    fullWidth
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    sx={{mb: 1}}
                                    placeholder="Add your notes for this date..."
                                    variant="outlined"
                                />

                                <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1}}>
                                    <TextField
                                        label="Spans (days)"
                                        type="number"
                                        size="small"
                                        value={noteDays}
                                        onChange={(e) => setNoteDays(e.target.value)}
                                        sx={{width: '120px'}}
                                        InputProps={{inputProps: {min: 1}}}
                                    />
                                    {!editingNote && parseInt(noteDays, 10) > 1 && (
                                        <FormControlLabel
                                            control={<Checkbox size="small" checked={noteSeparate}
                                                               onChange={(e) => setNoteSeparate(e.target.checked)}/>}
                                            label="Separate note per day"
                                        />
                                    )}
                                    {dmMode && (
                                        <FormControlLabel
                                            control={<Checkbox size="small" checked={noteDmOnly}
                                                               onChange={(e) => setNoteDmOnly(e.target.checked)}/>}
                                            label="DM only"
                                        />
                                    )}
                                </Box>

                                <Box display="flex" justifyContent="flex-end" gap={1}>
                                    {editingNote && (
                                        <Button onClick={resetNoteForm} sx={{fontWeight: 500, textTransform: 'none'}}>
                                            Cancel
                                        </Button>
                                    )}
                                    <Button
                                        variant="outlined"
                                        onClick={handleSaveNote}
                                        color="secondary"
                                        startIcon={<NoteAltIcon/>}
                                        sx={{fontWeight: 500, textTransform: 'none', boxShadow: 1}}
                                    >
                                        {editingNote ? 'Update Note' : 'Add Note'}
                                    </Button>
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                </Paper>
            )}
            </>
            )}

            {/* Notes tab: agenda of every dated note */}
            {activeTab === 1 && (notes.length > 0 ? (
                <Paper sx={{p: 3, mt: 3, borderRadius: 2}} elevation={3}>
                    <Typography variant="h5" gutterBottom color="primary"
                                sx={{display: 'flex', alignItems: 'center', mb: 2}}>
                        <EventIcon sx={{mr: 1}}/>
                        All Notes
                    </Typography>
                    <List dense>
                        {notes.map(n => (
                            <ListItem
                                key={n.id}
                                alignItems="flex-start"
                                divider
                                secondaryAction={
                                    <Box>
                                        <IconButton size="small" aria-label="edit note"
                                                    onClick={() => handleEditNote(n)}>
                                            <EditIcon fontSize="small"/>
                                        </IconButton>
                                        <IconButton size="small" aria-label="delete note"
                                                    onClick={() => handleDeleteNote(n.id)}>
                                            <DeleteIcon fontSize="small"/>
                                        </IconButton>
                                    </Box>
                                }
                            >
                                <ListItemText
                                    primaryTypographyProps={{component: 'span'}}
                                    primary={
                                        <Box component="span" sx={{display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap'}}>
                                            <Typography variant="subtitle2" component="span">
                                                {formatNoteRange(n)}
                                            </Typography>
                                            {n.dmOnly && (
                                                <Chip label="DM only" size="small" color="warning" variant="outlined"/>
                                            )}
                                        </Box>
                                    }
                                    secondary={
                                        <Typography variant="body2" component="span"
                                                    sx={{whiteSpace: 'pre-wrap', display: 'block', pr: 6}}>
                                            {n.note}
                                        </Typography>
                                    }
                                />
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            ) : (
                <Paper sx={{p: 3, mt: 3, borderRadius: 2}} elevation={3}>
                    <Typography variant="body2" color="text.secondary">
                        No notes yet. Add notes from a day on the Calendar tab.
                    </Typography>
                </Paper>
            ))}

            {/* Holidays tab: per-category visibility + reference list + DM management */}
            {activeTab === 2 && (holidays.length > 0 ? (
                <Paper sx={{p: 3, mt: 3, borderRadius: 2}} elevation={3}>
                    <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1}}>
                        <Typography variant="h5" color="primary" sx={{display: 'flex', alignItems: 'center'}}>
                            <EventIcon sx={{mr: 1}}/>
                            Holidays
                        </Typography>
                        {dmMode && (
                            <Button variant="outlined" size="small" startIcon={<EventIcon/>}
                                    onClick={() => handleOpenHolidayDialog()}
                                    sx={{textTransform: 'none'}}>
                                Add Holiday
                            </Button>
                        )}
                    </Box>

                    <Box sx={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mb: 1}}>
                        <Typography variant="caption" color="text.secondary" sx={{mr: 1}}>
                            Show on calendar:
                        </Typography>
                        {presentCategories.map(cat => (
                            <Chip
                                key={cat}
                                label={cat}
                                size="small"
                                color={isCategoryVisible(cat) ? 'primary' : 'default'}
                                variant={isCategoryVisible(cat) ? 'filled' : 'outlined'}
                                onClick={() => toggleCategory(cat)}
                            />
                        ))}
                    </Box>

                    <List dense>
                        {holidays.map(h => (
                            <ListItem
                                key={h.id}
                                alignItems="flex-start"
                                divider
                                secondaryAction={dmMode && h.isCustom ? (
                                    <Box>
                                        <IconButton size="small" aria-label="edit holiday"
                                                    onClick={() => handleOpenHolidayDialog(h)}>
                                            <EditIcon fontSize="small"/>
                                        </IconButton>
                                        <IconButton size="small" aria-label="delete holiday"
                                                    onClick={() => handleDeleteHoliday(h.id)}>
                                            <DeleteIcon fontSize="small"/>
                                        </IconButton>
                                    </Box>
                                ) : undefined}
                            >
                                <ListItemText
                                    primaryTypographyProps={{component: 'span'}}
                                    primary={
                                        <Box component="span" sx={{display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap'}}>
                                            <Typography variant="subtitle2" component="span">
                                                {h.month != null && h.day != null
                                                    ? `${h.day} ${months[h.month - 1]?.name || ''}`
                                                    : (h.movableRule || 'Movable')}
                                            </Typography>
                                            <Typography variant="body2" component="span">— {h.name}</Typography>
                                            <Chip label={h.category} size="small" variant="outlined"/>
                                            {h.isCustom && <Chip label="Custom" size="small" color="secondary" variant="outlined"/>}
                                        </Box>
                                    }
                                    secondary={
                                        <Typography variant="caption" component="span" color="text.secondary" sx={{display: 'block', pr: 6}}>
                                            {[h.deity, h.region].filter(Boolean).join(' · ')}
                                            {(h.deity || h.region) && h.description ? ' — ' : ''}
                                            {h.description}
                                        </Typography>
                                    }
                                />
                            </ListItem>
                        ))}
                    </List>
                    {movableHolidays.length > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{display: 'block', mt: 1}}>
                            Movable holidays (solstices, weekday-based, etc.) have no fixed day and aren't shown on the grid.
                        </Typography>
                    )}
                </Paper>
            ) : (
                <Paper sx={{p: 3, mt: 3, borderRadius: 2}} elevation={3}>
                    <Typography variant="body2" color="text.secondary">No holidays defined.</Typography>
                </Paper>
            ))}

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
                        `${selectedDate.day} ${months[selectedDate.month - 1]?.name || 'Unknown Month'} ${selectedDate.year}` :
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

            {/* DM-only: manually set (story) weather for a date */}
            <Dialog
                open={weatherDialogOpen}
                onClose={() => setWeatherDialogOpen(false)}
                fullWidth
                maxWidth="sm"
                PaperProps={{elevation: 3, sx: {borderRadius: 2}}}
            >
                <DialogTitle>
                    {weatherEditDate
                        ? `Set Weather — ${weatherEditDate.day} ${months[weatherEditDate.month - 1]?.name || ''} ${weatherEditDate.year}`
                        : 'Set Weather'}
                </DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{mb: 2}}>
                        Manually setting weather locks this day so automatic generation and
                        forecast regeneration will not overwrite it.
                    </DialogContentText>
                    <Grid container spacing={2}>
                        <Grid size={{xs: 12, sm: 6}}>
                            <FormControl fullWidth size="small">
                                <InputLabel id="weather-condition-label">Condition</InputLabel>
                                <Select
                                    labelId="weather-condition-label"
                                    label="Condition"
                                    value={weatherForm.condition}
                                    onChange={(e: SelectChangeEvent) =>
                                        setWeatherForm({...weatherForm, condition: e.target.value})}
                                >
                                    {WEATHER_CONDITION_OPTIONS.map(opt => (
                                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{xs: 12, sm: 6}}>
                            <FormControl fullWidth size="small">
                                <InputLabel id="weather-visibility-label">Visibility</InputLabel>
                                <Select
                                    labelId="weather-visibility-label"
                                    label="Visibility"
                                    value={weatherForm.visibility}
                                    onChange={(e: SelectChangeEvent) =>
                                        setWeatherForm({...weatherForm, visibility: e.target.value})}
                                >
                                    {VISIBILITY_OPTIONS.map(opt => (
                                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{xs: 6, sm: 3}}>
                            <TextField label="Low °F" type="number" size="small" fullWidth
                                       value={weatherForm.tempLow}
                                       onChange={(e) => setWeatherForm({...weatherForm, tempLow: e.target.value})}/>
                        </Grid>
                        <Grid size={{xs: 6, sm: 3}}>
                            <TextField label="High °F" type="number" size="small" fullWidth
                                       value={weatherForm.tempHigh}
                                       onChange={(e) => setWeatherForm({...weatherForm, tempHigh: e.target.value})}/>
                        </Grid>
                        <Grid size={{xs: 6, sm: 3}}>
                            <TextField label="Wind mph" type="number" size="small" fullWidth
                                       value={weatherForm.windSpeed}
                                       InputProps={{inputProps: {min: 0}}}
                                       onChange={(e) => setWeatherForm({...weatherForm, windSpeed: e.target.value})}/>
                        </Grid>
                        <Grid size={{xs: 6, sm: 3}}>
                            <TextField label="Humidity %" type="number" size="small" fullWidth
                                       value={weatherForm.humidity}
                                       InputProps={{inputProps: {min: 0, max: 100}}}
                                       onChange={(e) => setWeatherForm({...weatherForm, humidity: e.target.value})}/>
                        </Grid>
                        <Grid size={12}>
                            <Typography variant="caption" color="text.secondary">
                                Description (auto-generated): {buildWeatherDescription(weatherForm)}
                            </Typography>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setWeatherDialogOpen(false)} sx={{textTransform: 'none'}}>
                        Cancel
                    </Button>
                    <Button onClick={handleSaveWeather} variant="outlined" color="primary"
                            sx={{textTransform: 'none', boxShadow: 1}}>
                        Save Weather
                    </Button>
                </DialogActions>
            </Dialog>

            {/* DM-only: add / edit a custom holiday */}
            <Dialog
                open={holidayDialogOpen}
                onClose={() => setHolidayDialogOpen(false)}
                fullWidth
                maxWidth="sm"
                PaperProps={{elevation: 3, sx: {borderRadius: 2}}}
            >
                <DialogTitle>{editingHoliday ? 'Edit Holiday' : 'Add Custom Holiday'}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{mb: 2}}>
                        Leave month and day empty for a movable holiday (e.g. a solstice) and
                        describe how its date is determined in "Movable rule".
                    </DialogContentText>
                    <Grid container spacing={2}>
                        <Grid size={12}>
                            <TextField label="Name" size="small" fullWidth required
                                       value={holidayForm.name}
                                       onChange={(e) => setHolidayForm({...holidayForm, name: e.target.value})}/>
                        </Grid>
                        <Grid size={{xs: 6, sm: 3}}>
                            <FormControl fullWidth size="small">
                                <InputLabel id="holiday-month-label">Month</InputLabel>
                                <Select
                                    labelId="holiday-month-label"
                                    label="Month"
                                    value={holidayForm.month}
                                    onChange={(e: SelectChangeEvent) =>
                                        setHolidayForm({...holidayForm, month: e.target.value})}
                                >
                                    <MenuItem value=""><em>None</em></MenuItem>
                                    {months.map((m, i) => (
                                        <MenuItem key={m.name} value={String(i + 1)}>{m.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{xs: 6, sm: 3}}>
                            <TextField label="Day" type="number" size="small" fullWidth
                                       value={holidayForm.day}
                                       InputProps={{inputProps: {min: 1, max: 31}}}
                                       onChange={(e) => setHolidayForm({...holidayForm, day: e.target.value})}/>
                        </Grid>
                        <Grid size={{xs: 12, sm: 6}}>
                            <FormControl fullWidth size="small">
                                <InputLabel id="holiday-category-label">Category</InputLabel>
                                <Select
                                    labelId="holiday-category-label"
                                    label="Category"
                                    value={holidayForm.category}
                                    onChange={(e: SelectChangeEvent) =>
                                        setHolidayForm({...holidayForm, category: e.target.value})}
                                >
                                    {HOLIDAY_CATEGORIES.map(c => (
                                        <MenuItem key={c} value={c}>{c}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{xs: 12, sm: 6}}>
                            <TextField label="Deity (if religious)" size="small" fullWidth
                                       value={holidayForm.deity}
                                       onChange={(e) => setHolidayForm({...holidayForm, deity: e.target.value})}/>
                        </Grid>
                        <Grid size={{xs: 12, sm: 6}}>
                            <TextField label="Region (if regional)" size="small" fullWidth
                                       value={holidayForm.region}
                                       onChange={(e) => setHolidayForm({...holidayForm, region: e.target.value})}/>
                        </Grid>
                        <Grid size={12}>
                            <TextField label="Movable rule (if no fixed date)" size="small" fullWidth
                                       value={holidayForm.movableRule}
                                       onChange={(e) => setHolidayForm({...holidayForm, movableRule: e.target.value})}/>
                        </Grid>
                        <Grid size={12}>
                            <TextField label="Description" size="small" fullWidth multiline rows={2}
                                       value={holidayForm.description}
                                       onChange={(e) => setHolidayForm({...holidayForm, description: e.target.value})}/>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setHolidayDialogOpen(false)} sx={{textTransform: 'none'}}>
                        Cancel
                    </Button>
                    <Button onClick={handleSaveHoliday} variant="outlined" color="primary"
                            sx={{textTransform: 'none', boxShadow: 1}}>
                        {editingHoliday ? 'Update Holiday' : 'Add Holiday'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default GolarionCalendar;