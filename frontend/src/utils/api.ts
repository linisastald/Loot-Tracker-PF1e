// frontend/src/utils/api.ts
// The one axios instance every request goes through. Resolved calls return the
// response BODY ({ success, message, data }); rejected calls keep the axios
// error shape (callers read err.response?.data?.message / getErrorMessage).
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = '/api';

interface CsrfTokenResponse {
  success: boolean;
  data: {
    csrfToken: string;
  };
}

interface ErrorBody {
  message?: string;
  error?: string;
}

interface AuthConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

// Auth endpoints that must work without a CSRF token (no session yet, or the
// session probe itself).
const CSRF_EXEMPT_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/check-dm',
  '/auth/check-registration-status',
  '/auth/refresh',
  '/auth/status',
];

// Pages that are reachable without a session; a 401 from a request made there
// must not bounce the user to /login again (or overwrite where they came from).
const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

const isAuthUrl = (url?: string): boolean => !!url && url.includes('/auth/');

const api: AxiosInstance = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    timeout: 10000,
});

// One token request at a time: the backend rotates the CSRF secret on every
// fetch, so concurrent fetches would invalidate each other's tokens.
let csrfFetchInFlight: Promise<string | null> | null = null;

const fetchCsrfToken = (): Promise<string | null> => {
    if (!csrfFetchInFlight) {
        csrfFetchInFlight = axios
            .get<CsrfTokenResponse>(`${API_URL}/csrf-token`, { withCredentials: true })
            .then((response) => {
                const token = response.data?.data?.csrfToken;
                if (!token) return null;
                localStorage.setItem('csrfToken', token);
                return token;
            })
            .catch(() => null)
            .finally(() => {
                csrfFetchInFlight = null;
            });
    }
    return csrfFetchInFlight;
};

// Request interceptor
api.interceptors.request.use(
    async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
        // Multi-campaign: attach the active campaign selection so the backend
        // scopes queries to the chosen tenant. Deliberately NOT attached to
        // /auth/* requests: auth endpoints are campaign-independent, and a
        // stale selection 403ing /auth/status would race App.tsx's logout
        // handler and force-log-out the user instead of recovering.
        const activeCampaignId = localStorage.getItem('activeCampaignId');
        if (!isAuthUrl(config.url) && activeCampaignId && /^\d+$/.test(activeCampaignId) && config.headers) {
            config.headers['X-Campaign-Id'] = activeCampaignId;
        }
        // Superadmin "act as DM" override (see CampaignContext.setDmOverride);
        // the server ignores it for anyone who is not a superadmin.
        if (!isAuthUrl(config.url) && config.headers && localStorage.getItem('superadminDmOverride') === '1') {
            config.headers['X-Superadmin-DM'] = '1';
        }

        if (config.url && CSRF_EXEMPT_PATHS.some((path) => config.url!.includes(path))) {
            return config;
        }

        const csrfToken = localStorage.getItem('csrfToken') || await fetchCsrfToken();
        if (csrfToken && config.headers) {
            config.headers['X-CSRF-Token'] = csrfToken;
        }

        return config;
    },
    (error: AxiosError) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
    (response) => response.data,
    async (error: AxiosError) => {
        const authConfig = error.config as AuthConfig | undefined;
        const status = error.response?.status;
        const body = (error.response?.data ?? {}) as ErrorBody;

        // 401 on a normal endpoint: the session expired. Remember where the user
        // was so Login can explain the redirect and send them back afterwards.
        // /auth/* 401s (bad login, status probe, refresh) are handled by their
        // callers, and on a public page there is nowhere better to go.
        if (status === 401 && !isAuthUrl(authConfig?.url)) {
            if (!PUBLIC_PATHS.includes(window.location.pathname)) {
                sessionStorage.setItem('loginRedirectReason', 'expired');
                sessionStorage.setItem('loginReturnTo', window.location.pathname + window.location.search);
                localStorage.removeItem('csrfToken');
                window.location.href = '/login';
            }
            return Promise.reject(error);
        }

        // Stale campaign selection recovery (403 - membership revoked, campaign
        // deleted, etc.). Clear the stored selection and reload so the backend
        // falls back to a valid default campaign. Only fires when the request
        // actually carried the X-Campaign-Id header - after the reload the key
        // is gone, the header is no longer sent, so this cannot loop.
        if (status === 403 &&
            body.message === 'Not a member of this campaign' &&
            authConfig?.headers?.['X-Campaign-Id']) {
            localStorage.removeItem('activeCampaignId');
            window.location.reload();
            return Promise.reject(error);
        }

        // Invalid CSRF token (403): fetch a fresh token and replay the request
        // once. _retryCount stops it looping; if the token cannot be refreshed
        // the original error goes back to the caller (a failed token fetch is
        // not proof the session is gone, so no redirect).
        if (status === 403 &&
            (body.error === 'invalid csrf token' || body.message === 'invalid csrf token') &&
            authConfig && !authConfig._retryCount) {
            authConfig._retryCount = 1;
            localStorage.removeItem('csrfToken');
            const newToken = await fetchCsrfToken();

            if (newToken && authConfig.headers) {
                authConfig.headers['X-CSRF-Token'] = newToken;
                // Through `api` (not raw axios) so the retried call resolves to the
                // unwrapped body like every other call.
                return api(authConfig);
            }
        }

        return Promise.reject(error);
    }
);

export default api;
