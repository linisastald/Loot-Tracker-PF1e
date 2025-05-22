/**
 * Application configuration constants
 * These can be overridden by environment variables
 */

module.exports = {
  // Authentication settings
  AUTH: {
    MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    ACCOUNT_LOCK_TIME: parseInt(process.env.ACCOUNT_LOCK_TIME) || 5 * 60 * 1000, // 5 minutes in milliseconds
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
    PASSWORD_MIN_LENGTH: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
    PASSWORD_MAX_LENGTH: parseInt(process.env.PASSWORD_MAX_LENGTH) || 64,
    USERNAME_MIN_LENGTH: parseInt(process.env.USERNAME_MIN_LENGTH) || 5,
  },

  // Rate limiting settings
  RATE_LIMIT: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 10 * 1000, // 10 seconds
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
    AUTH_WINDOW_MS: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 1 * 60 * 1000, // 1 minute
    AUTH_MAX_REQUESTS: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 20,
  },

  // Database settings
  DATABASE: {
    SLOW_QUERY_THRESHOLD: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD) || 500, // milliseconds
    CONNECTION_TIMEOUT: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000, // 10 seconds
    MAX_CONNECTIONS: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
    IDLE_TIMEOUT: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000, // 30 seconds
  },

  // Server settings
  SERVER: {
    PORT: parseInt(process.env.PORT) || 5000,
    GRACEFUL_SHUTDOWN_TIMEOUT: parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT) || 15000, // 15 seconds
    POOL_CLOSE_TIMEOUT: parseInt(process.env.POOL_CLOSE_TIMEOUT) || 10000, // 10 seconds
    UNCAUGHT_EXCEPTION_TIMEOUT: parseInt(process.env.UNCAUGHT_EXCEPTION_TIMEOUT) || 5000, // 5 seconds
  },

  // Session/Cookie settings
  COOKIES: {
    MAX_AGE: parseInt(process.env.COOKIE_MAX_AGE) || 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    HTTP_ONLY: process.env.COOKIE_HTTP_ONLY === 'false' ? false : true,
    SECURE: process.env.NODE_ENV === 'production',
    SAME_SITE: process.env.COOKIE_SAME_SITE || 'strict',
  },

  // Logging settings
  LOGGING: {
    LEVEL: process.env.LOG_LEVEL || 'info',
    MAX_FILES: parseInt(process.env.LOG_MAX_FILES) || 5,
    MAX_SIZE: process.env.LOG_MAX_SIZE || '20m',
    DATE_PATTERN: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD',
  },

  // Business logic settings
  GAME: {
    QUICK_INVITE_EXPIRY_HOURS: parseInt(process.env.QUICK_INVITE_EXPIRY_HOURS) || 4,
    DEFAULT_APPRAISAL_BONUS: parseInt(process.env.DEFAULT_APPRAISAL_BONUS) || 0,
    SIMILARITY_THRESHOLD: parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.3,
  },

  // File upload settings (if applicable)
  UPLOADS: {
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    ALLOWED_EXTENSIONS: process.env.ALLOWED_EXTENSIONS ? 
      process.env.ALLOWED_EXTENSIONS.split(',') : 
      ['.jpg', '.jpeg', '.png', '.pdf'],
  },

  // External API settings
  EXTERNAL_APIS: {
    OPENAI_TIMEOUT: parseInt(process.env.OPENAI_TIMEOUT) || 30000, // 30 seconds
    OPENAI_MAX_RETRIES: parseInt(process.env.OPENAI_MAX_RETRIES) || 3,
  }
};
