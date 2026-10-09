import api from './api';

/** A session row as returned by GET /sessions/enhanced (attendance fields only when included). */
export interface SessionListItem {
    id: number;
    title?: string | null;
    description?: string | null;
    start_time: string;
    end_time?: string | null;
    status?: string | null;
    minimum_players?: number | null;
    confirmed_count?: number | null;
    maybe_count?: number | null;
    declined_count?: number | null;
    confirmed_names?: string | null;
    maybe_names?: string | null;
    declined_names?: string | null;
    /** The caller's own response (null when they have not responded). */
    user_status?: string | null;
    user_response_type?: string | null;
    user_character_id?: number | null;
}

/**
 * The api interceptor already unwraps the axios envelope, so list endpoints
 * answer { success, data: rows }. Accept that and a bare array.
 */
export const unwrapSessionList = (response: unknown): SessionListItem[] => {
    const body = response as { data?: unknown } | unknown[] | null | undefined;
    const rows = Array.isArray(body) ? body : body?.data;
    return Array.isArray(rows) ? (rows as SessionListItem[]) : [];
};

export interface FetchSessionListOptions {
    /**
     * When /sessions/enhanced fails, retry the plain /sessions endpoint
     * (upcoming sessions only, no attendance details). For callers that only
     * need to know which sessions exist and prefer a degraded answer to none.
     */
    fallbackToUpcoming?: boolean;
}

/** Fetch the campaign's sessions (all statuses, with attendance summaries). */
export const fetchSessionList = async (
    options: FetchSessionListOptions = {}
): Promise<SessionListItem[]> => {
    try {
        return unwrapSessionList(await api.get('/sessions/enhanced'));
    } catch (err) {
        if (!options.fallbackToUpcoming) {
            throw err;
        }
        return unwrapSessionList(await api.get('/sessions'));
    }
};
