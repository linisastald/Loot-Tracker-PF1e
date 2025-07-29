const winston = require('winston');
require('winston-daily-rotate-file');
const { LOGGING } = require('../config/constants');
const fs = require('fs');
const path = require('path');

// Configure logs directory
const logsDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');

// Create logs directory if it doesn't exist (with error handling)
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (err) {
  console.error(`Warning: Could not create logs directory at ${logsDir}:`, err.message);
  console.error('Logs will be written to console only.');
}

// Check if we can write to the logs directory
let canWriteLogs = false;
try {
  // Try to create a test file
  const testFile = path.join(logsDir, '.write-test');
  fs.writeFileSync(testFile, 'test');
  fs.unlinkSync(testFile);
  canWriteLogs = true;
} catch (err) {
  console.error(`Warning: Cannot write to logs directory ${logsDir}:`, err.message);
}

// Configure transports based on write permissions
const transports = [];

if (canWriteLogs) {
  // File transports
  transports.push(
    // Error logs with rotation
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: LOGGING.DATE_PATTERN,
      level: 'error',
      maxSize: LOGGING.MAX_SIZE,
      maxFiles: LOGGING.MAX_FILES,
      createSymlink: true,
      symlinkName: 'error.log'
    }),
    // Combined logs with rotation
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: LOGGING.DATE_PATTERN,
      maxSize: LOGGING.MAX_SIZE,
      maxFiles: LOGGING.MAX_FILES,
      createSymlink: true,
      symlinkName: 'combined.log'
    })
  );
}

// Always add console transport for production (fallback)
if (!canWriteLogs || process.env.NODE_ENV === 'production') {
  transports.push(new winston.transports.Console({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

const logger = winston.createLogger({
  level: LOGGING.LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: transports
});

// Add console transport for development if not already added
if (process.env.NODE_ENV !== 'production' && canWriteLogs) {
  logger.add(new winston.transports.Console({
    level: 'debug',
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;