// src/utils/golarionCalendar.js
//
// Shared date arithmetic for the Golarion (Absalom Reckoning) calendar.
//
// Canon notes (Pathfinder 1e, validated against Paizo / PathfinderWiki):
//  - The year has 12 months totalling 365 days (see MONTH_DAYS below).
//  - A leap day is added every year divisible by 8, appended to Calistril
//    (month 2), making it 29 days that year. 4712 AR and 4720 AR are
//    canonically confirmed leap years; 4722 AR is not.
//  - The week runs Moonday, Toilday, Wealday, Oathday, Fireday, Starday,
//    Sunday. There is no printed date->weekday anchor in canon; this app
//    treats 1 Abadius 1 AR as Moonday (the de facto community convention).

// Base month lengths for a common (non-leap) year. Index 0 = Abadius.
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Whether the given Absalom Reckoning year is a leap year.
 * Canon rule: every year divisible by 8.
 * @param {number} year
 * @returns {boolean}
 */
const isLeapYear = (year) => Number.isInteger(year) && year % 8 === 0;

/**
 * Number of days in a given Golarion month, accounting for leap years.
 * @param {number} year
 * @param {number} month - 1-indexed (1 = Abadius ... 12 = Kuthona)
 * @returns {number}
 */
const getMonthDays = (year, month) => {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return MONTH_DAYS[month - 1];
};

/**
 * Number of days in a given Golarion year (365, or 366 in leap years).
 * @param {number} year
 * @returns {number}
 */
const getYearDays = (year) => (isLeapYear(year) ? 366 : 365);

/**
 * Advance a date by a whole number of days, handling month/year rollover
 * with leap-aware month lengths.
 * @param {{year:number, month:number, day:number}} date
 * @param {number} n - days to add (>= 0)
 * @returns {{year:number, month:number, day:number}}
 */
const addDays = (date, n) => {
  let { year, month, day } = date;
  for (let i = 0; i < n; i++) {
    day++;
    if (day > getMonthDays(year, month)) {
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

/**
 * Generate the list of dates strictly after startDate up to and including
 * endDate. Returns an empty array if endDate is not after startDate.
 * @param {{year:number, month:number, day:number}} startDate
 * @param {{year:number, month:number, day:number}} endDate
 * @returns {Array<{year:number, month:number, day:number}>}
 */
const calculateDaysBetween = (startDate, endDate) => {
  const days = [];
  let current = { ...startDate };

  while (
    current.year < endDate.year ||
    (current.year === endDate.year && current.month < endDate.month) ||
    (current.year === endDate.year && current.month === endDate.month && current.day < endDate.day)
  ) {
    current = addDays(current, 1);
    days.push({ ...current });
  }

  return days;
};

module.exports = {
  MONTH_DAYS,
  isLeapYear,
  getMonthDays,
  getYearDays,
  addDays,
  calculateDaysBetween,
};
