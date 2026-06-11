// frontend/src/utils/api.ts
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ApiResponse } from '@/types';

const API_URL = process.env.REACT_APP_API_URL || '/api';

interface CsrfTokenResponse {
  success: boolean;
  data: {
    csrfToken: string;
  };
}

interface AuthConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

const api: AxiosInstance = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    timeout: 10000,
});

// Function to fetch CSRF token
const fetchCsrfToken = async (): Promise<string | null> => {
    try {
        const response = await axios.get<CsrfTokenResponse>(`${API_URL}/csrf-token`, {
            withCredentials: true
        });

        if (response.data?.data?.csrfToken) {
            const token = response.data.data.csrfToken;
            localStorage.setItem('csrfToken', token);
            return token;
        } else {
            console.error('Invalid CSRF token response format');
            return null;
        }
    } catch (error) {
        console.error('Error fetching CSRF token:', error);
        return null;
    }
};

// Request interceptor
api.interceptors.request.use(
    async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
        // Multi-campaign: attach the active campaign selection so the backend
        // scopes queries to the chosen tenant. Deliberately NOT attached to
        // /auth/* requests: auth endpoints are campaign-independent, and a
        // stale selection 403ing /auth/status would race App.tsx's logout
        // handler and force-log-out the user instead of recovering.
        const isAuthRoute = !!config.url && config.url.includes('/auth/');
        const activeCampaignId = localStorage.getItem('activeCampaignId');
        if (!isAuthRoute && activeCampaignId && /^\d+$/.test(activeCampaignId) && config.headers) {
            config.headers['X-Campaign-Id'] = activeCampaignId;
        }

        // Skip CSRF for auth routes
        if (config.url && (
            config.url.includes('/auth/login') ||
            config.url.includes('/auth/register') ||
            config.url.includes('/auth/check-dm') ||
            config.url.includes('/auth/check-registration-status') ||
            config.url.includes('/auth/refresh') ||
            config.url.includes('/auth/status'))) {
            return config;
        }

        let csrfToken = localStorage.getItem('csrfToken');

        // If no token exists, fetch a new one
        if (!csrfToken) {
            csrfToken = await fetchCsrfToken();
        }

        if (csrfToken && config.headers) {
            config.headers['X-CSRF-Token'] = csrfToken;
        }

        return config;
    },
    (error: AxiosError) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
    (response) => {
        return response.data;
    },
    async (error: AxiosError) => {
        console.error('API Error:', {
            message: error.message,
            status: error.response?.status
        });

        const authConfig = error.config as AuthConfig;

        // Handle authentication errors (401 Unauthorized - expired/invalid JWT)
        if (error.response?.status === 401) {
            // Skip redirect for auth-related endpoints to prevent loops
            const isAuthEndpoint = authConfig?.url?.includes('/auth/');

            if (!isAuthEndpoint) {
                console.warn('Authentication expired or invalid. Redirecting to login...');
                // Let the login page explain the redirect and return the user here after
                sessionStorage.setItem('loginRedirectReason', 'expired');
                sessionStorage.setItem('loginReturnTo', window.location.pathname + window.location.search);
                // Clear tokens
                localStorage.removeItem('csrfToken');
                // Redirect to login page
                window.location.href = '/login';
                return Promise.reject(error);
            }
        }

        // Stale campaign selection recovery (403 - membership revoked, campaign
        // deleted, etc.). Clear the stored selection and reload so the backend
        // falls back to a valid default campaign. Only fires when the request
        // actually carried the X-Campaign-Id header — after the reload the key
        // is gone, the header is no longer sent, so this cannot loop.
        if (error.response?.status === 403 &&
            (error.response?.data as any)?.message === 'Not a member of this campaign' &&
            authConfig?.headers?.['X-Campaign-Id']) {
            localStorage.removeItem('activeCampaignId');
            window.location.reload();
            return Promise.reject(error);
        }

        // Handle CSRF token errors (403 Forbidden - prevent infinite retry)
        if (error.response?.status === 403 &&
            ((error.response?.data as any)?.error === 'invalid csrf token' ||
            (error.response?.data as any)?.message === 'invalid csrf token') &&
            !authConfig?._retryCount) {

            // Mark this request as retried to prevent infinite loops
            if (authConfig) {
                authConfig._retryCount = 1;
            }
            localStorage.removeItem('csrfToken');
            const newToken = await fetchCsrfToken();

            if (newToken && authConfig && authConfig.headers) {
                // Retry the request with new token
                authConfig.headers['X-CSRF-Token'] = newToken;
                return axios(authConfig);
            } else {
                // If CSRF token refresh fails, might indicate session expired
                console.warn('Failed to refresh CSRF token. Session may have expired. Redirecting to login...');
                window.location.href = '/login';
                return Promise.reject(error);
            }
        }

        return Promise.reject(error);
    }
);

// Initialize CSRF token fetch
fetchCsrfToken();

export default api;