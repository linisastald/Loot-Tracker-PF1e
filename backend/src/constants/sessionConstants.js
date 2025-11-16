/**
 * Session-related constants and enums
 */

// Session status values
const SESSION_STATUS = {
    SCHEDULED: 'scheduled',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed'
};

// Valid session statuses as array
const VALID_SESSION_STATUSES = Object.values(SESSION_STATUS);

// Attendance status values
const ATTENDANCE_STATUS = {
    ACCEPTED: 'accepted',
    DECLINED: 'declined',
    TENTATIVE: 'tentative'
};

// Valid attendance statuses as array
const VALID_ATTENDANCE_STATUSES = Object.values(ATTENDANCE_STATUS);

// Response type mapping (Discord button to attendance status)
const RESPONSE_TYPE_MAP = {
    yes: ATTENDANCE_STATUS.ACCEPTED,
    no: ATTENDANCE_STATUS.DECLINED,
    maybe: ATTENDANCE_STATUS.TENTATIVE,
    late: ATTENDANCE_STATUS.ACCEPTED
};

// Reverse mapping (attendance status to response type)
const STATUS_TO_RESPONSE_MAP = {
    [ATTENDANCE_STATUS.ACCEPTED]: 'yes',
    [ATTENDANCE_STATUS.DECLINED]: 'no',
    [ATTENDANCE_STATUS.TENTATIVE]: 'maybe'
};

// Emoji mapping for response types
const RESPONSE_EMOJI_MAP = {
    yes: '✅',
    no: '❌',
    maybe: '❓',
    late: '🕐'
};

// Recurring session patterns
const RECURRING_PATTERN = {
    WEEKLY: 'weekly',
    BIWEEKLY: 'biweekly',
    MONTHLY: 'monthly',
    CUSTOM: 'custom'
};

// Valid recurring patterns as array
const VALID_RECURRING_PATTERNS = Object.values(RECURRING_PATTERN);

// Default values (will be moved to config later)
const DEFAULT_VALUES = {
    MINIMUM_PLAYERS: 3,
    MAXIMUM_PLAYERS: 6,
    AUTO_ANNOUNCE_HOURS: 168, // 1 week
    REMINDER_HOURS: 24,
    AUTO_CANCEL_HOURS: 48,
    CONFIRMATION_DAYS_BEFORE: 2,
    ANNOUNCEMENT_DAYS_BEFORE: 7
};

module.exports = {
    SESSION_STATUS,
    VALID_SESSION_STATUSES,
    ATTENDANCE_STATUS,
    VALID_ATTENDANCE_STATUSES,
    RESPONSE_TYPE_MAP,
    STATUS_TO_RESPONSE_MAP,
    RESPONSE_EMOJI_MAP,
    RECURRING_PATTERN,
    VALID_RECURRING_PATTERNS,
    DEFAULT_VALUES
};
