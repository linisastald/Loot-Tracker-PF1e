const os = require('os');
const path = require('path');
const fs = require('fs');

// The global unit-test setup replaces the logger with stubs; this suite
// exercises the real module.
jest.unmock('../logger');

describe('logger transports', () => {
  const realEnv = { ...process.env };
  let logDir;

  const load = (env) => {
    let logger;
    jest.isolateModules(() => {
      Object.assign(process.env, env);
      logger = jest.requireActual('../logger');
    });
    return logger;
  };

  beforeEach(() => {
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-logger-'));
  });

  afterEach(() => {
    process.env = { ...realEnv };
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  const consoleTransports = (logger) =>
    logger.transports.filter(t => t.constructor.name === 'Console');

  it('has exactly one console transport at debug level in development', () => {
    const logger = load({ LOG_DIR: logDir, NODE_ENV: 'development' });
    const consoles = consoleTransports(logger);
    expect(consoles).toHaveLength(1);
    expect(consoles[0].level).toBe('debug');
    expect(logger.transports.length).toBe(3); // error file, combined file, console
  });

  it('has exactly one console transport at info level in production', () => {
    const logger = load({ LOG_DIR: logDir, NODE_ENV: 'production' });
    const consoles = consoleTransports(logger);
    expect(consoles).toHaveLength(1);
    expect(consoles[0].level).toBe('info');
  });

  it('falls back to the console alone when the log directory is not writable', () => {
    const blocker = path.join(logDir, 'file');
    fs.writeFileSync(blocker, 'x');
    const logger = load({ LOG_DIR: path.join(blocker, 'logs'), NODE_ENV: 'development' });
    expect(logger.transports).toHaveLength(1);
    expect(consoleTransports(logger)).toHaveLength(1);
  });
});
