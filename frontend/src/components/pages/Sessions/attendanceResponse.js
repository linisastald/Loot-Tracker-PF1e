// Helpers shared by the Sessions page card and attendance dialog.
//
// The dialog works with three radio values (accepted, tentative, declined)
// plus two "late" / "early" flags that only apply to accepted; the server
// stores a response_type (yes, maybe, no, late, early, late_and_early) plus a
// coarse status (accepted, tentative, declined).

export const DEFAULT_ATTENDANCE_STATUS = 'accepted';

const STATUS_FROM_RESPONSE_TYPE = {
    yes: 'accepted',
    maybe: 'tentative',
    no: 'declined',
    late: 'accepted',
    early: 'accepted',
    late_and_early: 'accepted'
};

/** The server response_type for a dialog radio value and its late/early flags. */
export const responseTypeFor = (status, { late = false, early = false } = {}) => {
    if (status === 'tentative') return 'maybe';
    if (status === 'declined') return 'no';
    if (late && early) return 'late_and_early';
    if (late) return 'late';
    if (early) return 'early';
    return 'yes';
};

/**
 * The caller's existing response on a session row (GET /sessions/enhanced adds
 * user_status / user_response_type / user_character_id), or null when they
 * have not responded. `status` is a dialog radio value; `late` and `early`
 * are the flags on an accepted response.
 */
export const getUserResponse = (session) => {
    if (!session) return null;
    const type = session.user_response_type;
    const status = STATUS_FROM_RESPONSE_TYPE[type] || session.user_status;
    if (!status) return null;
    return {
        status,
        late: type === 'late' || type === 'late_and_early',
        early: type === 'early' || type === 'late_and_early',
        characterId: session.user_character_id || null
    };
};

const STATUS_TEXT = {
    accepted: { text: 'Attending', color: 'success.main' },
    declined: { text: 'Not Attending', color: 'error.main' },
    tentative: { text: 'Maybe Attending', color: 'warning.main' }
};

/** Label and theme colour for "Your Status" on a session card. */
export const describeUserStatus = (session) => {
    const response = getUserResponse(session);
    const base = STATUS_TEXT[response?.status];
    if (!base) return { text: 'Not Responded', color: 'text.secondary' };
    if (response.status !== 'accepted') return base;
    const flags = [response.late && 'late', response.early && 'early'].filter(Boolean);
    return flags.length > 0 ? { ...base, text: `${base.text} (${flags.join(', ')})` } : base;
};
