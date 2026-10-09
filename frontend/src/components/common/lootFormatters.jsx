import React from 'react';
import { Tooltip } from '@mui/material';
import { useActiveCharacterId } from '../../contexts/CampaignContext';

/**
 * Formats an ISO timestamp string to a date-only display format.
 * Handles UTC timestamps without timezone conversion.
 * (Distinct from utils/timezoneUtils.formatDateOnly, which works in the
 * campaign timezone.)
 * @param {string} dateString - ISO timestamp (e.g., "2025-11-09T00:00:00.000Z")
 * @returns {string} Formatted date (e.g., "Nov 9, 2025") or empty string if invalid
 */
export const formatLootDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
};

/** Two decimals with a trailing ".00" dropped; '' when not a number. */
const formatAmount = (raw) => {
  const value = parseFloat(raw);
  return isNaN(value) ? '' : value.toFixed(2).replace(/\.0+$/, '');
};

// Tooltip text listing every character's appraisal of an item
export const formatAppraisalDetails = (item) => {
  const appraisals = item.appraisals || [];
  if (!appraisals.length) return 'No appraisals available';

  return appraisals.map(appraisal => {
    const characterName = appraisal.character_name || 'Unknown';
    const value = parseFloat(appraisal.believedvalue);
    return `${characterName}: ${isNaN(value) ? '?' : value.toFixed(2)}`;
  }).join('\n');
};

/**
 * The believed value of an item for the active character: a value the row
 * carries directly, otherwise that character's own appraisal (never another
 * character's). Null when there is none.
 */
export const getBelievedValue = (item, activeCharacterId) => {
  if (item.believedvalue !== undefined && item.believedvalue !== null) {
    return item.believedvalue;
  }
  if (activeCharacterId && Array.isArray(item.appraisals)) {
    const own = item.appraisals.find(a =>
      a.character_id === activeCharacterId || a.characterId === activeCharacterId
    );
    if (own) return own.believedvalue ?? null;
  }
  return null;
};

export const FormatAverageAppraisal = ({ item }) => {
  if (item.average_appraisal === undefined || item.average_appraisal === null) return null;

  return (
    <Tooltip title={formatAppraisalDetails(item)} arrow>
      <span>{formatAmount(item.average_appraisal)}</span>
    </Tooltip>
  );
};

// Believed value for the user's active character in the selected campaign (read
// from the campaign context, so rendering a row costs no request).
export const FormatBelievedValue = ({ item }) => {
  const activeCharacterId = useActiveCharacterId();
  const formatted = formatAmount(getBelievedValue(item, activeCharacterId));
  return formatted === '' ? null : <span>{formatted}</span>;
};
