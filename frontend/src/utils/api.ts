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
        // Skip CSRF for auth routes
        if (config.url && (
            config.url.includes('/auth/login') ||
            config.url.includes('/auth/register') ||
            config.url.includes('/auth/check-dm') ||
            config.url.includes('/auth/check-registration-status') ||
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

        // Handle CSRF token errors (prevent infinite retry)
        if (error.response?.status === 403 &&
            (error.response?.data as any)?.error === 'invalid csrf token' ||
            (error.response?.data as any)?.message === 'invalid csrf token' &&
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
            }
        }

        return Promise.reject(error);
    }
);

// Initialize CSRF token fetch
fetchCsrfToken();

export default api;