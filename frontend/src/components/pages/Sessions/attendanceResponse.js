// Helpers shared by the Sessions page card and attendance dialog.
//
// The dialog works with five radio values (accepted, tentative, declined,
// late, early); the server stores a response_type (yes, maybe, no, late,
// early, late_and_early) plus a coarse status (accepted, tentative, declined).

export const DEFAULT_ATTENDANCE_STATUS = 'accepted';

const STATUS_FROM_RESPONSE_TYPE = {
    yes: 'accepted',
    maybe: 'tentative',
    no: 'declined',
    late: 'late',
    early: 'early',
    late_and_early: 'accepted'
};

const RESPONSE_TYPE_FROM_STATUS = {
    accepted: 'yes',
    tentative: 'maybe',
    declined: 'no',
    late: 'late',
    early: 'early'
};

/** The server response_type to send for a dialog radio value. */
export const responseTypeForStatus = (status) => RESPONSE_TYPE_FROM_STATUS[status] || 'yes';

/**
 * The caller's existing response on a session row (GET /sessions/enhanced adds
 * user_status / user_response_type / user_character_id), or null when they
 * have not responded. `status` is a dialog radio value.
 */
export const getUserResponse = (session) => {
    if (!session) return null;
    const status = STATUS_FROM_RESPONSE_TYPE[session.user_response_type] || session.user_status;
    if (!status) return null;
    return { status, characterId: session.user_character_id || null };
};

const STATUS_TEXT = {
    accepted: { text: 'Attending', color: 'success.main' },
    late: { text: 'Attending', color: 'success.main' },
    early: { text: 'Attending', color: 'success.main' },
    declined: { text: 'Not Attending', color: 'error.main' },
    tentative: { text: 'Maybe Attending', color: 'warning.main' }
};

/** Label and theme colour for "Your Status" on a session card. */
export const describeUserStatus = (session) => {
    const response = getUserResponse(session);
    return STATUS_TEXT[response?.status] || { text: 'Not Responded', color: 'text.secondary' };
};
