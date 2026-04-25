/**
 * Unit tests for SessionSchedulerService.
 *
 * Focused on the auto-task-generation flag flow and the corrected
 * session_task_assignments JOIN — both of which were causing the morning-time
 * "tasks generated for X" Discord spam regression.
 */

const mockPoolQuery = jest.fn();
const mockClient = { query: jest.fn(), release: jest.fn() };

jest.mock('../../../config/db', () => ({
  query: (...args) => mockPoolQuery(...args),
  connect: jest.fn(() => Promise.resolve(mockClient)),
}));

jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const mockGenerateSessionTasks = jest.fn();
jest.mock('../../tasks/SessionTaskService', () => ({
  generateSessionTasks: (...args) => mockGenerateSessionTasks(...args),
}));

// node-cron's schedule() is invoked at construction time inside other paths
// we don't exercise here — keep it inert.
jest.mock('node-cron', () => ({ schedule: jest.fn(() => ({ stop: jest.fn() })) }));

const sessionSchedulerService = require('../SessionSchedulerService');

const setSettingValue = (value) => {
  // Default: every other call returns no rows. Only the
  // auto_task_generation_enabled lookup returns a value.
  mockPoolQuery.mockImplementation((sql) => {
    if (sql.includes("WHERE name = 'auto_task_generation_enabled'")) {
      return Promise.resolve({
        rows: value === undefined ? [] : [{ value }],
      });
    }
    // The "find sessions" lookup — empty by default unless overridden.
    return Promise.resolve({ rows: [] });
  });
};

describe('SessionSchedulerService.checkTaskGeneration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when auto_task_generation_enabled is "0"', async () => {
    setSettingValue('0');

    await sessionSchedulerService.checkTaskGeneration();

    // Only the settings lookup should fire — no session query, no generation.
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    expect(mockPoolQuery.mock.calls[0][0]).toContain(
      "WHERE name = 'auto_task_generation_enabled'"
    );
    expect(mockGenerateSessionTasks).not.toHaveBeenCalled();
  });

  it('does nothing when the setting row is missing entirely (default off)', async () => {
    setSettingValue(undefined);

    await sessionSchedulerService.checkTaskGeneration();

    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    expect(mockGenerateSessionTasks).not.toHaveBeenCalled();
  });

  it('queries session_task_assignments (NOT session_tasks) so the cron does not re-fire every hour', async () => {
    // Enabled flag + one session pending generation
    mockPoolQuery.mockImplementation((sql) => {
      if (sql.includes("WHERE name = 'auto_task_generation_enabled'")) {
        return Promise.resolve({ rows: [{ value: '1' }] });
      }
      // The session lookup
      return Promise.resolve({
        rows: [{ id: 42, title: 'Test Session', status: 'confirmed' }],
      });
    });

    await sessionSchedulerService.checkTaskGeneration();

    // Settings query + session lookup
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);

    const sessionQuery = mockPoolQuery.mock.calls[1][0];
    expect(sessionQuery).toContain('session_task_assignments');
    // The previous (buggy) query joined session_tasks; we must not regress.
    expect(sessionQuery).not.toMatch(/LEFT JOIN session_tasks\b/);
    expect(sessionQuery).toContain("status = 'confirmed'");

    // The session was passed through to the task service
    expect(mockGenerateSessionTasks).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 })
    );
  });

  it('skips generation entirely when no eligible sessions are returned', async () => {
    mockPoolQuery.mockImplementation((sql) => {
      if (sql.includes("WHERE name = 'auto_task_generation_enabled'")) {
        return Promise.resolve({ rows: [{ value: '1' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    await sessionSchedulerService.checkTaskGeneration();

    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    expect(mockGenerateSessionTasks).not.toHaveBeenCalled();
  });
});
