import { addMonths, format } from 'date-fns';
import type { SessionListItem } from '../../../../utils/sessionsApi';

// ---------------------------------------------------------------------------
// Status display and filtering
// ---------------------------------------------------------------------------

export type SessionStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
export type StatusChipColor = 'primary' | 'success' | 'error' | 'default';

export const SESSION_STATUSES: Record<SessionStatus, { label: string; color: StatusChipColor; defaultOn: boolean }> = {
    scheduled: { label: 'Scheduled', color: 'primary', defaultOn: true },
    confirmed: { label: 'Confirmed', color: 'success', defaultOn: true },
    completed: { label: 'Completed', color: 'default', defaultOn: true },
    cancelled: { label: 'Cancelled', color: 'error', defaultOn: false }
};

export const SESSION_STATUS_KEYS = Object.keys(SESSION_STATUSES) as SessionStatus[];

export const getStatusLabel = (status?: string | null): string =>
    SESSION_STATUSES[status as SessionStatus]?.label ?? status ?? '';

export const getStatusColor = (status?: string | null): StatusChipColor =>
    SESSION_STATUSES[status as SessionStatus]?.color ?? 'default';

export type StatusFilter = Record<SessionStatus, boolean>;

export interface SessionFilters {
    status: StatusFilter;
    dateFrom: string;
    dateTo: string;
}

/** Fresh default filters: active statuses, today through two months out. */
export const defaultFilters = (): SessionFilters => ({
    status: SESSION_STATUS_KEYS.reduce((acc, key) => {
        acc[key] = SESSION_STATUSES[key].defaultOn;
        return acc;
    }, {} as StatusFilter),
    dateFrom: format(new Date(), 'yyyy-MM-dd'),
    dateTo: format(addMonths(new Date(), 2), 'yyyy-MM-dd')
});

/**
 * Apply the status checkboxes and the date range. Both bounds are parsed as
 * local time so a session on the boundary day is never excluded by a UTC
 * offset.
 */
export const filterSessions = (sessions: SessionListItem[], filters: SessionFilters): SessionListItem[] => {
    const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null;
    const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`) : null;

    return sessions.filter(session => {
        const status = (session.status || 'scheduled') as SessionStatus;
        if (!filters.status[status]) {
            return false;
        }
        const start = new Date(session.start_time);
        if (from && start < from) {
            return false;
        }
        if (to && start > to) {
            return false;
        }
        return true;
    });
};

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

export const DAYS_OF_WEEK = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

/** Default session length is five hours after the given start. */
export const defaultEndTime = (start: Date = new Date()): Date =>
    new Date(start.getTime() + 5 * 60 * 60 * 1000);

/** Returns an error message for an invalid title/start/end combination, else null. */
export const validateSessionTimes = (
    title: string,
    start: Date | null,
    end: Date | null
): string | null => {
    if (!title || !start || !end) {
        return 'Please fill in all required fields';
    }
    if (end <= start) {
        return 'End time must be after start time';
    }
    return null;
};

// ---------------------------------------------------------------------------
// Default timing settings (saved per browser in localStorage)
// ---------------------------------------------------------------------------

export interface SessionDefaults {
    minimumPlayers: number;
    autoAnnounceHours: number;
    reminderHours: number;
    confirmationHours: number;
}

export const HARDCODED_SESSION_DEFAULTS: SessionDefaults = {
    minimumPlayers: 3,
    autoAnnounceHours: 168, // 1 week
    reminderHours: 48,      // 2 days
    confirmationHours: 48   // 2 days
};

export const SESSION_DEFAULTS_STORAGE_KEY = 'sessionDefaults';

/**
 * Saved defaults merged over the hardcoded ones. Missing, malformed or
 * non-positive values fall back to the hardcoded value, so a partial object
 * never yields undefined fields.
 */
export const loadSessionDefaults = (): SessionDefaults => {
    const defaults = { ...HARDCODED_SESSION_DEFAULTS };
    try {
        const raw = localStorage.getItem(SESSION_DEFAULTS_STORAGE_KEY);
        if (!raw) {
            return defaults;
        }
        const parsed = JSON.parse(raw) as Partial<Record<keyof SessionDefaults, unknown>> | null;
        (Object.keys(defaults) as (keyof SessionDefaults)[]).forEach(key => {
            const value = parsed?.[key];
            if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
                defaults[key] = value;
            }
        });
    } catch {
        // Unreadable saved defaults - use the hardcoded ones
    }
    return defaults;
};

export interface TimingFieldConfig {
    key: keyof SessionDefaults;
    label: string;
    max: number;
    fallback: number;
    createHelper?: string;
    defaultsHelper?: string;
}

export const TIMING_FIELDS: TimingFieldConfig[] = [
    {
        key: 'minimumPlayers',
        label: 'Minimum Players',
        max: 10,
        fallback: HARDCODED_SESSION_DEFAULTS.minimumPlayers
    },
    {
        key: 'autoAnnounceHours',
        label: 'Auto-Announce Hours Before',
        max: 720,
        fallback: HARDCODED_SESSION_DEFAULTS.autoAnnounceHours,
        createHelper: 'Hours before session to post announcement (168 = 1 week)',
        defaultsHelper: '168 hours = 1 week'
    },
    {
        key: 'reminderHours',
        label: 'Reminder Hours Before',
        max: 336,
        fallback: HARDCODED_SESSION_DEFAULTS.reminderHours,
        createHelper: 'Hours before session to send reminder (48 = 2 days)',
        defaultsHelper: '48 hours = 2 days'
    },
    {
        key: 'confirmationHours',
        label: 'Confirmation Hours Before',
        max: 336,
        fallback: HARDCODED_SESSION_DEFAULTS.confirmationHours,
        createHelper: 'Hours before session to check attendance. Will confirm if enough players, cancel if not (48 = 2 days)',
        defaultsHelper: '48 hours = 2 days. Checks attendance and auto-confirms or auto-cancels.'
    }
];
