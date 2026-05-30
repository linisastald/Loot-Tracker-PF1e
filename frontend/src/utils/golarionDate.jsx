// Golarion date utilities
import api from './api';

export const GOLARION_MONTHS = [
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

// Days of the Golarion week, in order. 1 Abadius 1 AR is treated as Moonday
// (index 0) — the de facto community convention; canon names the days and
// their order but does not print a date->weekday anchor.
export const GOLARION_DAYS_OF_WEEK = [
  'Moonday', 'Toilday', 'Wealday', 'Oathday', 'Fireday', 'Starday', 'Sunday'
];

// Length of the lunar (synodic) cycle in days. Golarion's moon timing is NOT
// fixed in official canon; 28 is an app convention chosen to echo the
// Blood of the Moon lunar calendar. Change here to retune moon phases.
export const LUNAR_CYCLE_DAYS = 28;

// Whether an Absalom Reckoning year is a leap year. Canon: every year
// divisible by 8 gains a day at the end of Calistril (4712 & 4720 confirmed).
export const isGolarionLeapYear = (year) =>
  Number.isInteger(year) && year % 8 === 0;

// Number of days in a Golarion month, accounting for leap years (Calistril
// gains a 29th day in leap years).
export const getGolarionMonthDays = (year, month) => {
  if (month === 2 && isGolarionLeapYear(year)) {
    return 29;
  }
  return GOLARION_MONTHS[month - 1]?.days ?? 30;
};

// Number of whole days from the calendar epoch (1 Abadius 1 AR = 0),
// leap-aware. Used as a single continuous day counter so day-of-week and
// moon phase advance by exactly one unit per day with no boundary glitches.
const daysSinceEpoch = (year, month, day) => {
  // Whole years before this one, plus one leap day per year divisible by 8.
  let total = (year - 1) * 365 + Math.floor((year - 1) / 8);
  for (let m = 1; m < month; m++) {
    total += getGolarionMonthDays(year, m);
  }
  total += day - 1;
  return total;
};

// Advance a Golarion date by n whole days (leap-aware month/year rollover).
export const addGolarionDays = (date, n) => {
  let { year, month, day } = date;
  for (let i = 0; i < n; i++) {
    day++;
    if (day > getGolarionMonthDays(year, month)) {
      day = 1;
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
  }
  return { year, month, day };
};

// Compare two Golarion dates: <0 if a before b, 0 if equal, >0 if a after b.
export const compareGolarionDates = (a, b) => {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
};

// Inclusive number of days a note spans from start to end.
export const golarionSpanDays = (start, end) => {
  let count = 1;
  let d = start;
  let guard = 0;
  while (compareGolarionDates(d, end) < 0 && guard < 1000) {
    d = addGolarionDays(d, 1);
    count++;
    guard++;
  }
  return count;
};

// Day-of-week index (0 = Moonday ... 6 = Sunday) for a Golarion date.
export const getGolarionDayOfWeek = (year, month, day) => {
  const total = daysSinceEpoch(year, month, day);
  return ((total % 7) + 7) % 7;
};

// Moon phase for a Golarion date, derived from a continuous day count so the
// phase moves smoothly across month and year boundaries (including leap days).
// The epoch (1 Abadius 1 AR) is defined as a New Moon — an app convention.
export const getGolarionMoonPhase = (year, month, day) => {
  const total = daysSinceEpoch(year, month, day);
  const phase = ((total % LUNAR_CYCLE_DAYS) + LUNAR_CYCLE_DAYS) % LUNAR_CYCLE_DAYS;
  if (phase < 3) return { name: 'New Moon', emoji: '🌑' };
  if (phase < 7) return { name: 'Waxing Crescent', emoji: '🌒' };
  if (phase < 10) return { name: 'First Quarter', emoji: '🌓' };
  if (phase < 14) return { name: 'Waxing Gibbous', emoji: '🌔' };
  if (phase < 17) return { name: 'Full Moon', emoji: '🌕' };
  if (phase < 21) return { name: 'Waning Gibbous', emoji: '🌖' };
  if (phase < 24) return { name: 'Last Quarter', emoji: '🌗' };
  return { name: 'Waning Crescent', emoji: '🌘' };
};

// Convert Golarion date to display format
export const formatGolarionDate = (year, month, day) => {
  const monthName = GOLARION_MONTHS[month - 1]?.name || 'Unknown';
  return `${day} ${monthName} ${year}`;
};

// Convert display format to Golarion date object
export const parseGolarionDate = (dateString) => {
  if (!dateString) return null;
  
  const parts = dateString.split(' ');
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0]);
  const monthName = parts[1];
  const year = parseInt(parts[2]);
  
  const monthIndex = GOLARION_MONTHS.findIndex(m => m.name === monthName);
  if (monthIndex === -1) return null;
  
  return {
    year,
    month: monthIndex + 1, // Backend uses 1-indexed months
    day
  };
};

// Get current Golarion date from the calendar system
export const getCurrentGolarionDate = async () => {
  try {
    const response = await api.get('/calendar/current-date');
    const { year, month, day } = response.data;
    return { year, month, day };
  } catch (error) {
    console.error('Error fetching current Golarion date:', error);
    // Return a default date if fetch fails
    return { year: 4722, month: 1, day: 1 };
  }
};

// Convert Golarion date to input field format (YYYY-MM-DD)
export const golarionToInputFormat = (year, month, day) => {
  const monthStr = month.toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');
  return `${year}-${monthStr}-${dayStr}`;
};

// Convert input field format to Golarion date
export const inputFormatToGolarion = (inputValue) => {
  if (!inputValue) return null;
  
  const parts = inputValue.split('-');
  if (parts.length !== 3) return null;
  
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const day = parseInt(parts[2]);
  
  return { year, month, day };
};

// Get today's date in input format for default values
export const getTodayInInputFormat = async () => {
  try {
    const currentDate = await getCurrentGolarionDate();
    return golarionToInputFormat(currentDate.year, currentDate.month, currentDate.day);
  } catch (error) {
    console.error('Error getting today in input format:', error);
    return golarionToInputFormat(4722, 1, 1); // Default fallback
  }
};
