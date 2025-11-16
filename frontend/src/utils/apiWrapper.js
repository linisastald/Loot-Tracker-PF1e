/**
 * API Wrapper - Standardized error handling for API calls
 *
 * Provides consistent error handling across all frontend API calls
 * with built-in fallbacks, error messages, and retry logic.
 *
 * Usage:
 *   import { apiCall } from 'utils/apiWrapper';
 *
 *   const result = await apiCall(
 *       () => api.post('/sessions', sessionData),
 *       'Failed to create session'
 *   );
 *
 *   if (result.success) {
 *       // Handle success
 *       console.log(result.data);
 *   } else {
 *       // Error already logged and user notified
 *       console.error(result.error);
 *   }
 */

/**
 * Standardized result object for API calls
 * @typedef {Object} ApiResult
 * @property {boolean} success - Whether the call succeeded
 * @property {*} data - Response data (if successful)
 * @property {Object} error - Error details (if failed)
 * @property {string} error.message - User-friendly error message
 * @property {string} error.code - Error code for categorization
 * @property {Object} error.validationErrors - Field-specific validation errors
 */

/**
 * Wrap an API call with standardized error handling
 *
 * @param {Function} apiFunction - The API call function to execute
 * @param {string} fallbackMessage - User-friendly error message if API call fails
 * @param {Object} options - Additional options
 * @param {boolean} options.showNotification - Whether to show error notification (default: true)
 * @param {number} options.retries - Number of retries on network failure (default: 0)
 * @param {number} options.retryDelay - Delay between retries in ms (default: 1000)
 * @returns {Promise<ApiResult>}
 */
export async function apiCall(apiFunction, fallbackMessage, options = {}) {
    const {
        showNotification = false, // Default to false to avoid duplicate notifications
        retries = 0,
        retryDelay = 1000
    } = options;

    let lastError = null;
    let attempt = 0;

    while (attempt <= retries) {
        try {
            const response = await apiFunction();

            // Handle successful response
            if (response.data) {
                return {
                    success: true,
                    data: response.data,
                    error: null
                };
            }

            // Handle response without data (e.g., 204 No Content)
            return {
                success: true,
                data: response,
                error: null
            };

        } catch (error) {
            lastError = error;

            // Check if this is a network error that should be retried
            const isNetworkError = !error.response && error.message === 'Network Error';
            const shouldRetry = isNetworkError && attempt < retries;

            if (shouldRetry) {
                attempt++;
                console.log(`Retrying API call (attempt ${attempt}/${retries})...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                continue;
            }

            // Extract error details
            const errorDetails = extractErrorDetails(error, fallbackMessage);

            // Log error for debugging
            console.error('API call failed:', {
                message: errorDetails.message,
                code: errorDetails.code,
                status: error.response?.status,
                data: error.response?.data
            });

            // Show notification if requested
            if (showNotification && typeof window !== 'undefined') {
                // In a real app, you'd integrate with your notification system
                // For now, just console.error
                console.error(errorDetails.message);
            }

            return {
                success: false,
                data: null,
                error: errorDetails
            };
        }
    }

    // This should never be reached, but just in case
    return {
        success: false,
        data: null,
        error: extractErrorDetails(lastError, fallbackMessage)
    };
}

/**
 * Extract standardized error details from an error object
 *
 * @param {Error} error - The error object
 * @param {string} fallbackMessage - Fallback message if no specific error available
 * @returns {Object} - Standardized error details
 */
function extractErrorDetails(error, fallbackMessage) {
    // Handle axios error responses
    if (error.response) {
        const { status, data } = error.response;

        // Extract error message
        let message = fallbackMessage;
        if (data?.error) {
            message = data.error;
        } else if (data?.message) {
            message = data.message;
        } else if (typeof data === 'string') {
            message = data;
        }

        // Determine error code
        let code = 'UNKNOWN_ERROR';
        if (status === 400) code = 'VALIDATION_ERROR';
        else if (status === 401) code = 'UNAUTHORIZED';
        else if (status === 403) code = 'FORBIDDEN';
        else if (status === 404) code = 'NOT_FOUND';
        else if (status === 409) code = 'CONFLICT';
        else if (status === 429) code = 'RATE_LIMITED';
        else if (status >= 500) code = 'SERVER_ERROR';

        // Use custom code if provided
        if (data?.code) {
            code = data.code;
        }

        return {
            message,
            code,
            status,
            validationErrors: data?.validationErrors || {}
        };
    }

    // Handle network errors
    if (error.message === 'Network Error') {
        return {
            message: 'Network error. Please check your connection and try again.',
            code: 'NETWORK_ERROR',
            status: null,
            validationErrors: {}
        };
    }

    // Handle timeout errors
    if (error.code === 'ECONNABORTED') {
        return {
            message: 'Request timed out. Please try again.',
            code: 'TIMEOUT',
            status: null,
            validationErrors: {}
        };
    }

    // Handle all other errors
    return {
        message: fallbackMessage,
        code: 'UNKNOWN_ERROR',
        status: null,
        validationErrors: {}
    };
}

/**
 * Specialized wrapper for GET requests
 *
 * @param {Function} apiFunction - The API GET function
 * @param {string} fallbackMessage - Error message
 * @param {*} defaultValue - Default value to return on error
 * @returns {Promise<*>} - Data or default value
 */
export async function apiGet(apiFunction, fallbackMessage, defaultValue = null) {
    const result = await apiCall(apiFunction, fallbackMessage);
    return result.success ? result.data : defaultValue;
}

/**
 * Specialized wrapper for POST/PUT/PATCH requests
 *
 * @param {Function} apiFunction - The API mutation function
 * @param {string} fallbackMessage - Error message
 * @returns {Promise<ApiResult>} - Result object
 */
export async function apiMutate(apiFunction, fallbackMessage) {
    return apiCall(apiFunction, fallbackMessage);
}

/**
 * Specialized wrapper for DELETE requests
 *
 * @param {Function} apiFunction - The API DELETE function
 * @param {string} fallbackMessage - Error message
 * @returns {Promise<boolean>} - Success status
 */
export async function apiDelete(apiFunction, fallbackMessage) {
    const result = await apiCall(apiFunction, fallbackMessage);
    return result.success;
}

export default {
    apiCall,
    apiGet,
    apiMutate,
    apiDelete
};
