/**
 * ServiceResult - Standardized result pattern for service operations
 *
 * Services return a result object instead of throwing, so callers branch on
 * `result.success`:
 *
 *   const result = await someService.doSomething();
 *   if (result.success) {
 *       use(result.data);
 *   } else {
 *       logger.error(result.error.message, { code: result.error.code });
 *   }
 *
 * Error codes are free-form strings chosen by the service that fails (for
 * example DISCORD_API_ERROR or NOT_FOUND); `failure` defaults to UNKNOWN_ERROR.
 */
class ServiceResult {
    /**
     * Create a successful result
     * @param {*} data - The successful operation's data
     * @param {string} message - Optional success message
     * @returns {ServiceResult}
     */
    static success(data = null, message = null) {
        return {
            success: true,
            data,
            message,
            error: null
        };
    }

    /**
     * Create a failure result
     * @param {string} message - Error message
     * @param {Error} error - Original error object (optional)
     * @param {string} code - Error code for categorization (optional)
     * @returns {ServiceResult}
     */
    static failure(message, error = null, code = 'UNKNOWN_ERROR') {
        return {
            success: false,
            data: null,
            message,
            error: {
                message,
                code,
                stack: error?.stack,
                originalError: error
            }
        };
    }
}

module.exports = ServiceResult;
