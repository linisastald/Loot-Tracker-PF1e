/**
 * ServiceResult - Standardized result pattern for service operations
 *
 * Provides consistent error handling across all services by returning
 * a result object instead of throwing exceptions.
 *
 * Usage:
 *   const result = await someService.doSomething();
 *   if (result.success) {
 *       // Handle success - data is in result.data
 *       console.log(result.data);
 *   } else {
 *       // Handle failure - error info in result.error
 *       logger.error(result.error.message);
 *   }
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

    /**
     * Create a validation error result
     * @param {string} message - Validation error message
     * @param {Object} validationErrors - Field-specific validation errors
     * @returns {ServiceResult}
     */
    static validationError(message, validationErrors = {}) {
        return {
            success: false,
            data: null,
            message,
            error: {
                message,
                code: 'VALIDATION_ERROR',
                validationErrors
            }
        };
    }

    /**
     * Create a not found result
     * @param {string} resourceType - Type of resource not found (e.g., 'Session', 'User')
     * @param {*} identifier - The identifier that wasn't found
     * @returns {ServiceResult}
     */
    static notFound(resourceType, identifier = null) {
        const message = identifier
            ? `${resourceType} not found: ${identifier}`
            : `${resourceType} not found`;

        return {
            success: false,
            data: null,
            message,
            error: {
                message,
                code: 'NOT_FOUND',
                resourceType,
                identifier
            }
        };
    }

    /**
     * Create an unauthorized result
     * @param {string} message - Unauthorized message
     * @returns {ServiceResult}
     */
    static unauthorized(message = 'Unauthorized') {
        return {
            success: false,
            data: null,
            message,
            error: {
                message,
                code: 'UNAUTHORIZED'
            }
        };
    }

    /**
     * Wrap a promise to return a ServiceResult
     * @param {Promise} promise - Promise to wrap
     * @param {string} errorMessage - Custom error message on failure
     * @returns {Promise<ServiceResult>}
     */
    static async wrap(promise, errorMessage = 'Operation failed') {
        try {
            const data = await promise;
            return ServiceResult.success(data);
        } catch (error) {
            return ServiceResult.failure(errorMessage, error);
        }
    }

    /**
     * Check if result is successful
     * @param {ServiceResult} result - Result to check
     * @returns {boolean}
     */
    static isSuccess(result) {
        return result?.success === true;
    }

    /**
     * Check if result is a failure
     * @param {ServiceResult} result - Result to check
     * @returns {boolean}
     */
    static isFailure(result) {
        return result?.success === false;
    }

    /**
     * Convert ServiceResult to HTTP response format
     * @param {ServiceResult} result - Result to convert
     * @returns {Object} - HTTP response object { statusCode, body }
     */
    static toHttpResponse(result) {
        if (result.success) {
            return {
                statusCode: 200,
                body: {
                    success: true,
                    data: result.data,
                    message: result.message
                }
            };
        }

        // Map error codes to HTTP status codes
        const statusCodeMap = {
            'VALIDATION_ERROR': 400,
            'NOT_FOUND': 404,
            'UNAUTHORIZED': 401,
            'FORBIDDEN': 403,
            'CONFLICT': 409,
            'UNKNOWN_ERROR': 500
        };

        const statusCode = statusCodeMap[result.error.code] || 500;

        return {
            statusCode,
            body: {
                success: false,
                error: result.error.message,
                code: result.error.code,
                validationErrors: result.error.validationErrors
            }
        };
    }
}

module.exports = ServiceResult;
