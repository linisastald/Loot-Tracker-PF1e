/**
 * Format a DATE-only column (sold.soldon, loot.session_date, ...) for display.
 *
 * Those columns arrive as UTC-midnight ISO strings ("2026-04-25T00:00:00.000Z").
 * Converting them into the campaign timezone shifts them back a day in any zone
 * west of UTC, so they are formatted in UTC, which keeps the stored calendar day.
 */
export const formatDateOnly = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};
