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
