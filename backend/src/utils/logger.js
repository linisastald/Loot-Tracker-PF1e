const winston = require('winston');
require('winston-daily-rotate-file');
const { LOGGING } = require('../config/constants');
const fs = require('fs');
const path = require('path');

// Configure logs directory
const logsDir = process.env.LOG_DIR || path.join(__dirname, '../../../logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: LOGGING.LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
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
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    level: 'debug',
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;