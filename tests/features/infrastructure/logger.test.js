/**
 * Tests for logger.js - Logging infrastructure
 * Tests Winston logger configuration, file handling, and error scenarios
 */

const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('winston');
jest.mock('winston-daily-rotate-file', () => {
  return class MockDailyRotateFile {
    constructor(options) {
      this.options = options;
      this.type = 'DailyRotateFile';
    }
  };
});
jest.mock('fs');
jest.mock('path');

// Mock constants
jest.mock('../../../backend/src/config/constants', () => ({
  LOGGING: {
    DATE_PATTERN: 'YYYY-MM-DD',
    MAX_SIZE: '20m',
    MAX_FILES: '14d',
    LEVEL: 'info'
  }
}));

describe('Logger Configuration', () => {
  let mockLogger;
  let mockTransports;
  let mockDailyRotateFile;
  let mockConsoleTransport;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock winston.createLogger
    mockLogger = {
      add: jest.fn(),
      remove: jest.fn(),
      log: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    };

    winston.createLogger.mockReturnValue(mockLogger);

    // Mock winston transports
    mockDailyRotateFile = jest.fn();
    mockConsoleTransport = jest.fn();

    winston.transports = {
      DailyRotateFile: mockDailyRotateFile,
      Console: mockConsoleTransport
    };

    // Mock winston format
    winston.format = {
      combine: jest.fn((...args) => ({ type: 'combined', formats: args })),
      timestamp: jest.fn(() => ({ type: 'timestamp' })),
      errors: jest.fn((options) => ({ type: 'errors', options })),
      json: jest.fn(() => ({ type: 'json' })),
      colorize: jest.fn(() => ({ type: 'colorize' })),
      simple: jest.fn(() => ({ type: 'simple' }))
    };

    // Reset environment variables
    delete process.env.LOG_DIR;
    delete process.env.NODE_ENV;

    // Mock path.join
    path.join.mockImplementation((...args) => args.join('/'));

    // Mock __dirname
    path.join.mockImplementation((dirname, ...args) => {
      if (dirname === '__dirname') {
        return `/mock/backend/src/utils/${args.join('/')}`;
      }
      return args.join('/');
    });
  });

  describe('Logs Directory Creation', () => {
    it('should create logs directory when it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockReturnValue(undefined);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        { recursive: true }
      );
    });

    it('should not create logs directory when it already exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should handle directory creation errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      require('../../../backend/src/utils/logger');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Could not create logs directory'),
        'Permission denied'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Logs will be written to console only.'
      );

      consoleSpy.mockRestore();
    });

    it('should use custom LOG_DIR when provided', () => {
      process.env.LOG_DIR = '/custom/logs/path';
      
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockReturnValue(undefined);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(fs.existsSync).toHaveBeenCalledWith('/custom/logs/path');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/custom/logs/path', { recursive: true });
    });
  });

  describe('Write Permission Testing', () => {
    it('should detect writable logs directory', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.write-test'),
        'test'
      );
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('.write-test')
      );
    });

    it('should handle write permission errors', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Read-only filesystem');
      });

      require('../../../backend/src/utils/logger');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Cannot write to logs directory'),
        'Read-only filesystem'
      );

      consoleSpy.mockRestore();
    });

    it('should continue gracefully when test file deletion fails', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockImplementation(() => {
        throw new Error('File locked');
      });

      // Should not throw an error
      require('../../../backend/src/utils/logger');

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('Transport Configuration', () => {
    describe('File Transports', () => {
      it('should configure file transports when directory is writable', () => {
        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockReturnValue(undefined);
        fs.unlinkSync.mockReturnValue(undefined);

        require('../../../backend/src/utils/logger');

        expect(mockDailyRotateFile).toHaveBeenCalledTimes(2);
        
        // Error log transport
        expect(mockDailyRotateFile).toHaveBeenCalledWith({
          filename: expect.stringContaining('error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '20m',
          maxFiles: '14d',
          createSymlink: true,
          symlinkName: 'error.log'
        });

        // Combined log transport
        expect(mockDailyRotateFile).toHaveBeenCalledWith({
          filename: expect.stringContaining('combined-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          createSymlink: true,
          symlinkName: 'combined.log'
        });
      });

      it('should not configure file transports when directory is not writable', () => {
        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });

        require('../../../backend/src/utils/logger');

        expect(mockDailyRotateFile).not.toHaveBeenCalled();
      });
    });

    describe('Console Transport', () => {
      it('should add console transport when files are not writable', () => {
        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });

        require('../../../backend/src/utils/logger');

        expect(mockConsoleTransport).toHaveBeenCalledWith({
          level: 'debug',
          format: expect.objectContaining({
            type: 'combined',
            formats: expect.arrayContaining([
              expect.objectContaining({ type: 'colorize' }),
              expect.objectContaining({ type: 'simple' })
            ])
          })
        });
      });

      it('should add console transport in production mode', () => {
        process.env.NODE_ENV = 'production';
        
        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockReturnValue(undefined);
        fs.unlinkSync.mockReturnValue(undefined);

        require('../../../backend/src/utils/logger');

        expect(mockConsoleTransport).toHaveBeenCalledWith({
          level: 'info',
          format: expect.objectContaining({
            type: 'combined'
          })
        });
      });

      it('should add console transport in development when files are writable', () => {
        process.env.NODE_ENV = 'development';
        
        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockReturnValue(undefined);
        fs.unlinkSync.mockReturnValue(undefined);

        require('../../../backend/src/utils/logger');

        expect(mockLogger.add).toHaveBeenCalledWith(
          expect.objectContaining({
            type: undefined // Mock constructor doesn't set type
          })
        );
      });

      it('should use debug level in non-production when files not writable', () => {
        process.env.NODE_ENV = 'development';
        
        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });

        require('../../../backend/src/utils/logger');

        expect(mockConsoleTransport).toHaveBeenCalledWith({
          level: 'debug',
          format: expect.any(Object)
        });
      });

      it('should use info level in production', () => {
        process.env.NODE_ENV = 'production';
        
        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });

        require('../../../backend/src/utils/logger');

        expect(mockConsoleTransport).toHaveBeenCalledWith({
          level: 'info',
          format: expect.any(Object)
        });
      });
    });
  });

  describe('Logger Creation', () => {
    it('should create logger with correct configuration', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(winston.createLogger).toHaveBeenCalledWith({
        level: 'info',
        format: expect.objectContaining({
          type: 'combined',
          formats: expect.arrayContaining([
            expect.objectContaining({ type: 'timestamp' }),
            expect.objectContaining({ type: 'errors' }),
            expect.objectContaining({ type: 'json' })
          ])
        }),
        transports: expect.any(Array)
      });
    });

    it('should configure error format with stack traces', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(winston.format.errors).toHaveBeenCalledWith({ stack: true });
    });

    it('should return the configured logger instance', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      const logger = require('../../../backend/src/utils/logger');

      expect(logger).toBe(mockLogger);
    });
  });

  describe('Environment-Specific Behavior', () => {
    it('should handle undefined NODE_ENV', () => {
      delete process.env.NODE_ENV;
      
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      // Should not crash and should create logger
      expect(winston.createLogger).toHaveBeenCalled();
    });

    it('should handle test environment', () => {
      process.env.NODE_ENV = 'test';
      
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(winston.createLogger).toHaveBeenCalled();
    });

    it('should handle custom environment values', () => {
      process.env.NODE_ENV = 'staging';
      
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(winston.createLogger).toHaveBeenCalled();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle winston createLogger errors', () => {
      winston.createLogger.mockImplementation(() => {
        throw new Error('Winston configuration error');
      });

      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      expect(() => require('../../../backend/src/utils/logger')).toThrow('Winston configuration error');
    });

    it('should handle path resolution errors', () => {
      path.join.mockImplementation(() => {
        throw new Error('Path resolution failed');
      });

      expect(() => require('../../../backend/src/utils/logger')).toThrow('Path resolution failed');
    });

    it('should handle fs.existsSync errors', () => {
      fs.existsSync.mockImplementation(() => {
        throw new Error('File system error');
      });

      expect(() => require('../../../backend/src/utils/logger')).toThrow('File system error');
    });

    it('should handle winston transport creation errors', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      mockDailyRotateFile.mockImplementation(() => {
        throw new Error('Transport creation failed');
      });

      expect(() => require('../../../backend/src/utils/logger')).toThrow('Transport creation failed');
    });

    it('should handle winston format errors', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      winston.format.combine.mockImplementation(() => {
        throw new Error('Format configuration error');
      });

      expect(() => require('../../../backend/src/utils/logger')).toThrow('Format configuration error');
    });
  });

  describe('Path Handling', () => {
    it('should handle absolute LOG_DIR paths', () => {
      process.env.LOG_DIR = '/var/log/app';
      
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(fs.existsSync).toHaveBeenCalledWith('/var/log/app');
    });

    it('should handle relative LOG_DIR paths', () => {
      process.env.LOG_DIR = './logs';
      
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(fs.existsSync).toHaveBeenCalledWith('./logs');
    });

    it('should handle Windows-style paths', () => {
      process.env.LOG_DIR = 'C:\\app\\logs';
      
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(fs.existsSync).toHaveBeenCalledWith('C:\\app\\logs');
    });

    it('should handle paths with special characters', () => {
      process.env.LOG_DIR = '/tmp/app logs/special-chars_123';
      
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(fs.existsSync).toHaveBeenCalledWith('/tmp/app logs/special-chars_123');
    });
  });

  describe('Multiple Require Calls', () => {
    it('should return same logger instance on multiple requires', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      const logger1 = require('../../../backend/src/utils/logger');
      const logger2 = require('../../../backend/src/utils/logger');

      expect(logger1).toBe(logger2);
      expect(winston.createLogger).toHaveBeenCalledTimes(1);
    });
  });

  describe('Configuration Constants', () => {
    it('should use logging constants from config', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info'
        })
      );

      expect(mockDailyRotateFile).toHaveBeenCalledWith(
        expect.objectContaining({
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d'
        })
      );
    });

    it('should handle missing constants gracefully', () => {
      // Mock missing constants
      jest.doMock('../../../backend/src/config/constants', () => ({
        LOGGING: {}
      }));

      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      // Should not crash
      expect(() => require('../../../backend/src/utils/logger')).not.toThrow();
    });
  });

  describe('Transport Array Management', () => {
    it('should properly manage transports array', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      const createLoggerCall = winston.createLogger.mock.calls[0][0];
      expect(createLoggerCall.transports).toBeInstanceOf(Array);
      expect(createLoggerCall.transports.length).toBeGreaterThan(0);
    });

    it('should include only console transport when files not writable', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Cannot write');
      });

      require('../../../backend/src/utils/logger');

      expect(mockConsoleTransport).toHaveBeenCalledTimes(1);
      expect(mockDailyRotateFile).not.toHaveBeenCalled();
    });

    it('should include file and console transports in production when files writable', () => {
      process.env.NODE_ENV = 'production';
      
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      require('../../../backend/src/utils/logger');

      expect(mockDailyRotateFile).toHaveBeenCalledTimes(2);
      expect(mockConsoleTransport).toHaveBeenCalledTimes(1);
    });
  });
});