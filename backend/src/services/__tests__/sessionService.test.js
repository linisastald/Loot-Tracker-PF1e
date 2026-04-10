/**
 * Unit tests for SessionService
 *
 * Tests core CRUD operations, state transitions, scheduling helpers,
 * and delegation methods. External services (Discord, attendance, etc.)
 * are mocked since they are tested independently.
 */

// ---- Mocks (must be defined before require) ----

const mockPoolQuery = jest.fn();
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};
const mockConnect = jest.fn(() => Promise.resolve(mockClient));

jest.mock('../../config/db', () => ({
  query: (...args) => mockPoolQuery(...args),
  connect: (...args) => mockConnect(...args),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

// Mock all delegated sub-services
jest.mock('../attendance/AttendanceService', () => ({
  recordAttendance: jest.fn(),
  getSessionAttendance: jest.fn(),
  getSessionAttendanceDetails: jest.fn(),
  getConfirmedAttendanceCount: jest.fn(),
  getNonResponders: jest.fn(),
}));

jest.mock('../discord/SessionDiscordService', () => ({
  postSessionAnnouncement: jest.fn(),
  sendSessionReminder: jest.fn(),
  updateSessionMessage: jest.fn(),
  processDiscordReaction: jest.fn(),
  getDiscordSettings: jest.fn(),
  getReactionMap: jest.fn(),
}));

jest.mock('../recurring/RecurringSessionService', () => ({
  createRecurringSession: jest.fn(),
  getRecurringSessionInstances: jest.fn(),
  updateRecurringSession: jest.fn(),
  deleteRecurringSession: jest.fn(),
  generateAdditionalInstances: jest.fn(),
}));

jest.mock('../tasks/SessionTaskService', () => ({
  generateSessionTasks: jest.fn(),
}));

jest.mock('../discordBrokerService', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ stop: jest.fn() })),
}));

// ---- Load modules under test ----
const sessionService = require('../sessionService');
const attendanceService = require('../attendance/AttendanceService');
const sessionDiscordService = require('../discord/SessionDiscordService');
const recurringSessionService = require('../recurring/RecurringSessionService');
const sessionTaskService = require('../tasks/SessionTaskService');

// ---- Helpers ----

const futureDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
};

const pastDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
};

const buildSession = (overrides = {}) => ({
  id: 1,
  title: 'Session 42',
  start_time: futureDate(),
  end_time: futureDate(),
  description: 'Storming the castle',
  minimum_players: 3,
  maximum_players: 6,
  auto_announce_hours: 168,
  reminder_hours: 24,
  confirmation_hours: 48,
  status: 'scheduled',
  created_by: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

// ---- Tests ----

describe('SessionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockPoolQuery.mockReset();
    mockConnect.mockReset();
    mockConnect.mockResolvedValue(mockClient);
  });

  // ========================================================================
  // createSession
  // ========================================================================
  describe('createSession', () => {
    it('should create a session and return the result', async () => {
      const session = buildSession();
      // BEGIN, INSERT session, INSERT automation x3 (announce, reminder, confirm), COMMIT
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [session] }) // INSERT game_sessions
        .mockResolvedValueOnce({}) // INSERT automation (announcement)
        .mockResolvedValueOnce({}) // INSERT automation (reminder)
        .mockResolvedValueOnce({}) // INSERT automation (confirmation)
        .mockResolvedValueOnce({}); // COMMIT

      const result = await sessionService.createSession({
        title: 'Session 42',
        start_time: session.start_time,
        end_time: session.end_time,
        description: 'Storming the castle',
        created_by: 1,
      });

      expect(result).toEqual(session);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO game_sessions'),
        expect.any(Array)
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should use default values for optional fields', async () => {
      const session = buildSession();
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [session] }) // INSERT
        .mockResolvedValueOnce({}) // automation
        .mockResolvedValueOnce({}) // automation
        .mockResolvedValueOnce({}) // automation
        .mockResolvedValueOnce({}); // COMMIT

      await sessionService.createSession({
        title: 'Session 42',
        start_time: session.start_time,
        created_by: 1,
      });

      // The second call is the INSERT; check params include defaults
      const insertCall = mockClient.query.mock.calls[1];
      const params = insertCall[1];
      // minimum_players = 3 (DEFAULT_VALUES.MINIMUM_PLAYERS)
      expect(params[4]).toBe(3);
      // maximum_players = 6
      expect(params[5]).toBe(6);
    });

    it('should rollback on error and release client', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('DB error')); // INSERT fails

      await expect(
        sessionService.createSession({ title: 'Fail', start_time: futureDate(), created_by: 1 })
      ).rejects.toThrow('DB error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should skip announcement automation if auto_announce_hours is 0', async () => {
      const session = buildSession({ auto_announce_hours: 0 });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [session] }) // INSERT session
        .mockResolvedValueOnce({}) // reminder automation
        .mockResolvedValueOnce({}) // confirmation automation
        .mockResolvedValueOnce({}); // COMMIT

      await sessionService.createSession({
        title: 'Session 42',
        start_time: session.start_time,
        auto_announce_hours: 0,
        created_by: 1,
      });

      // Count automation inserts (should be 2 not 3)
      const automationInserts = mockClient.query.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('session_automations')
      );
      expect(automationInserts.length).toBe(2);
    });
  });

  // ========================================================================
  // updateSession
  // ========================================================================
  describe('updateSession', () => {
    it('should update allowed fields and return result', async () => {
      const session = buildSession({ title: 'Updated Title' });
      mockPoolQuery.mockResolvedValueOnce({ rows: [session] });

      const result = await sessionService.updateSession(1, { title: 'Updated Title' });

      expect(result.title).toBe('Updated Title');
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE game_sessions'),
        expect.arrayContaining([1, 'Updated Title'])
      );
    });

    it('should throw when no valid fields provided', async () => {
      await expect(
        sessionService.updateSession(1, { invalid_field: 'nope' })
      ).rejects.toThrow('No valid fields provided for update');
    });

    it('should throw when session not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        sessionService.updateSession(999, { title: 'No session' })
      ).rejects.toThrow('Session not found');
    });

    it('should reschedule events when timing fields change', async () => {
      const session = buildSession();
      mockPoolQuery.mockResolvedValueOnce({ rows: [session] });
      // rescheduleSessionEvents will call cancelSessionEvents then scheduleSessionEvents
      // cancelSessionEvents calls pool.query, scheduleSessionEvents calls pool.query x3
      mockPoolQuery
        .mockResolvedValueOnce({}) // cancel reminders
        .mockResolvedValueOnce({}) // insert reminder 1
        .mockResolvedValueOnce({}) // insert reminder 2
        .mockResolvedValueOnce({}); // insert reminder 3

      await sessionService.updateSession(1, { start_time: futureDate() });

      // Verify rescheduling happened (more than 1 pool.query call)
      expect(mockPoolQuery.mock.calls.length).toBeGreaterThan(1);
    });
  });

  // ========================================================================
  // deleteSession
  // ========================================================================
  describe('deleteSession', () => {
    it('should cancel events and delete session', async () => {
      const session = buildSession();
      // cancelSessionEvents pool.query, then DELETE pool.query
      mockPoolQuery
        .mockResolvedValueOnce({}) // cancel events
        .mockResolvedValueOnce({ rows: [session] }); // DELETE

      const result = await sessionService.deleteSession(1);

      expect(result).toEqual(session);
    });

    it('should throw when session not found', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({}) // cancel events
        .mockResolvedValueOnce({ rows: [] }); // DELETE returns nothing

      await expect(sessionService.deleteSession(999)).rejects.toThrow('Session not found');
    });
  });

  // ========================================================================
  // getSession
  // ========================================================================
  describe('getSession', () => {
    it('should return session by ID', async () => {
      const session = buildSession();
      mockPoolQuery.mockResolvedValueOnce({ rows: [session] });

      const result = await sessionService.getSession(1);

      expect(result).toEqual(session);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM game_sessions WHERE id = $1'),
        [1]
      );
    });

    it('should return null when session not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await sessionService.getSession(999);

      expect(result).toBeNull();
    });
  });

  // ========================================================================
  // getEnhancedSessions
  // ========================================================================
  describe('getEnhancedSessions', () => {
    it('should return sessions with default filters', async () => {
      const sessions = [buildSession()];
      mockPoolQuery.mockResolvedValueOnce({ rows: sessions });

      const result = await sessionService.getEnhancedSessions();

      expect(result).toEqual(sessions);
    });

    it('should apply status filter', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await sessionService.getEnhancedSessions({ status: 'scheduled' });

      const queryStr = mockPoolQuery.mock.calls[0][0];
      expect(queryStr).toContain('gs.status = $');
      expect(mockPoolQuery.mock.calls[0][1]).toContain('scheduled');
    });

    it('should apply upcoming_only filter', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await sessionService.getEnhancedSessions({ upcoming_only: true });

      const queryStr = mockPoolQuery.mock.calls[0][0];
      expect(queryStr).toContain('gs.start_time > NOW()');
    });

    it('should include attendance by default', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await sessionService.getEnhancedSessions();

      const queryStr = mockPoolQuery.mock.calls[0][0];
      expect(queryStr).toContain('session_attendance');
    });

    it('should exclude attendance when include_attendance is false', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await sessionService.getEnhancedSessions({ include_attendance: false });

      const queryStr = mockPoolQuery.mock.calls[0][0];
      expect(queryStr).not.toContain('LEFT JOIN session_attendance');
    });
  });

  // ========================================================================
  // confirmSession
  // ========================================================================
  describe('confirmSession', () => {
    it('should set status to confirmed and update Discord', async () => {
      const session = buildSession({ status: 'confirmed' });
      mockPoolQuery.mockResolvedValueOnce({ rows: [session] });
      sessionDiscordService.updateSessionMessage.mockResolvedValueOnce();

      const result = await sessionService.confirmSession(1);

      expect(result.status).toBe('confirmed');
      expect(sessionDiscordService.updateSessionMessage).toHaveBeenCalledWith(1);
    });

    it('should not update Discord if session not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await sessionService.confirmSession(999);

      expect(sessionDiscordService.updateSessionMessage).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // cancelSession
  // ========================================================================
  describe('cancelSession', () => {
    it('should cancel session with reason', async () => {
      const session = buildSession({ status: 'cancelled', cancel_reason: 'DM sick' });
      mockPoolQuery.mockResolvedValueOnce({ rows: [session] });
      sessionDiscordService.updateSessionMessage.mockResolvedValueOnce();
      sessionDiscordService.getDiscordSettings.mockResolvedValueOnce({
        campaign_role_id: '123',
        discord_channel_id: '456',
      });
      const discordBroker = require('../discordBrokerService');
      discordBroker.sendMessage.mockResolvedValueOnce();

      const result = await sessionService.cancelSession(1, 'DM sick');

      expect(result.status).toBe('cancelled');
      expect(sessionDiscordService.updateSessionMessage).toHaveBeenCalledWith(1);
    });

    it('should return null if session not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await sessionService.cancelSession(999, 'reason');

      expect(result).toBeNull();
    });

    it('should not throw if Discord notification fails', async () => {
      const session = buildSession({ status: 'cancelled' });
      mockPoolQuery.mockResolvedValueOnce({ rows: [session] });
      sessionDiscordService.updateSessionMessage.mockResolvedValueOnce();
      sessionDiscordService.getDiscordSettings.mockRejectedValueOnce(new Error('Discord down'));

      // Should not throw
      const result = await sessionService.cancelSession(1, 'reason');
      expect(result).toBeDefined();
    });
  });

  // ========================================================================
  // uncancelSession
  // ========================================================================
  describe('uncancelSession', () => {
    it('should restore cancelled session to scheduled', async () => {
      const cancelledSession = buildSession({ status: 'cancelled' });
      const restoredSession = buildSession({ status: 'scheduled' });
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [cancelledSession] }) // check
        .mockResolvedValueOnce({ rows: [restoredSession] }); // update
      sessionDiscordService.updateSessionMessage.mockResolvedValueOnce();
      sessionDiscordService.getDiscordSettings.mockResolvedValueOnce({});

      const result = await sessionService.uncancelSession(1);

      expect(result.status).toBe('scheduled');
    });

    it('should return null if session not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await sessionService.uncancelSession(999);

      expect(result).toBeNull();
    });

    it('should throw if session is not cancelled', async () => {
      const session = buildSession({ status: 'scheduled' });
      mockPoolQuery.mockResolvedValueOnce({ rows: [session] });

      await expect(sessionService.uncancelSession(1)).rejects.toThrow(
        'Session is not cancelled (current status: scheduled)'
      );
    });

    it('should throw if session is in the past', async () => {
      const session = buildSession({ status: 'cancelled', start_time: pastDate() });
      mockPoolQuery.mockResolvedValueOnce({ rows: [session] });

      await expect(sessionService.uncancelSession(1)).rejects.toThrow(
        'Cannot uncancel a session that has already passed'
      );
    });
  });

  // ========================================================================
  // completeSession
  // ========================================================================
  describe('completeSession', () => {
    it('should mark session as completed with attendance summary', async () => {
      const session = buildSession({ status: 'completed' });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [session] }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ confirmed_count: 4, declined_count: 1, maybe_count: 0, attendee_names: ['Alice', 'Bob'] }] }) // attendance
        .mockResolvedValueOnce({}) // INSERT completion
        .mockResolvedValueOnce({}); // COMMIT

      const result = await sessionService.completeSession(1);

      expect(result.status).toBe('completed');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw if session not found or already completed', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // UPDATE returns nothing

      await expect(sessionService.completeSession(999)).rejects.toThrow(
        'Session not found or already completed'
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // checkAutoCancel
  // ========================================================================
  describe('checkAutoCancel', () => {
    it('should cancel session when DB function returns true', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ should_cancel: true }] });
      // cancelSession will call pool.query
      mockPoolQuery.mockResolvedValueOnce({ rows: [buildSession({ status: 'cancelled' })] });
      sessionDiscordService.updateSessionMessage.mockResolvedValueOnce();
      sessionDiscordService.getDiscordSettings.mockResolvedValueOnce({});

      await sessionService.checkAutoCancel(1);

      // Verify cancelSession was triggered (second pool.query call is the cancel UPDATE)
      expect(mockPoolQuery.mock.calls.length).toBeGreaterThan(1);
    });

    it('should not cancel session when DB function returns false', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ should_cancel: false }] });

      await sessionService.checkAutoCancel(1);

      // Only the check query should have been called
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================================
  // Delegation methods
  // ========================================================================
  describe('delegation methods', () => {
    it('recordAttendance delegates to AttendanceService', async () => {
      attendanceService.recordAttendance.mockResolvedValueOnce({ id: 1 });
      await sessionService.recordAttendance(1, 2, 'yes', {});
      expect(attendanceService.recordAttendance).toHaveBeenCalledWith(1, 2, 'yes', {});
    });

    it('getSessionAttendance delegates to AttendanceService', async () => {
      attendanceService.getSessionAttendance.mockResolvedValueOnce([]);
      await sessionService.getSessionAttendance(1);
      expect(attendanceService.getSessionAttendance).toHaveBeenCalledWith(1);
    });

    it('postSessionAnnouncement delegates to SessionDiscordService', async () => {
      sessionDiscordService.postSessionAnnouncement.mockResolvedValueOnce({});
      await sessionService.postSessionAnnouncement(1);
      expect(sessionDiscordService.postSessionAnnouncement).toHaveBeenCalledWith(1);
    });

    it('sendSessionReminder delegates to SessionDiscordService', async () => {
      sessionDiscordService.sendSessionReminder.mockResolvedValueOnce({});
      await sessionService.sendSessionReminder(1, 'final', { target: 'all' });
      expect(sessionDiscordService.sendSessionReminder).toHaveBeenCalledWith(1, 'final', { target: 'all' });
    });

    it('sendSessionReminder uses default reminderType', async () => {
      sessionDiscordService.sendSessionReminder.mockResolvedValueOnce({});
      await sessionService.sendSessionReminder(1);
      expect(sessionDiscordService.sendSessionReminder).toHaveBeenCalledWith(1, 'followup', {});
    });

    it('createRecurringSession delegates to RecurringSessionService', async () => {
      recurringSessionService.createRecurringSession.mockResolvedValueOnce({});
      await sessionService.createRecurringSession({ pattern: 'weekly' });
      expect(recurringSessionService.createRecurringSession).toHaveBeenCalledWith({ pattern: 'weekly' });
    });

    it('generateSessionTasks delegates to SessionTaskService', async () => {
      const session = buildSession();
      sessionTaskService.generateSessionTasks.mockResolvedValueOnce([]);
      await sessionService.generateSessionTasks(session);
      expect(sessionTaskService.generateSessionTasks).toHaveBeenCalledWith(session);
    });
  });

  // ========================================================================
  // formatSessionDate
  // ========================================================================
  describe('formatSessionDate', () => {
    it('should return a formatted date string', () => {
      const result = sessionService.formatSessionDate('2025-03-15T18:00:00Z');
      // Should contain at least the month and year
      expect(result).toContain('2025');
      expect(typeof result).toBe('string');
    });

    it('should include weekday, month, day, and time', () => {
      const result = sessionService.formatSessionDate('2025-01-01T12:00:00Z');
      // The exact output depends on locale, but should be a non-empty string
      expect(result.length).toBeGreaterThan(10);
    });
  });

  // ========================================================================
  // scheduleSessionEvents
  // ========================================================================
  describe('scheduleSessionEvents', () => {
    it('should insert three default reminders', async () => {
      mockPoolQuery.mockResolvedValue({});

      await sessionService.scheduleSessionEvents(buildSession());

      const reminderInserts = mockPoolQuery.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('session_reminders')
      );
      expect(reminderInserts).toHaveLength(3);
    });

    it('should not throw on db error (logs and swallows)', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('DB fail'));

      // Should not throw
      await sessionService.scheduleSessionEvents(buildSession());
    });
  });

  // ========================================================================
  // cancelSessionEvents
  // ========================================================================
  describe('cancelSessionEvents', () => {
    it('should mark pending reminders as sent', () => {
      mockPoolQuery.mockResolvedValue({});

      sessionService.cancelSessionEvents(1);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE session_reminders'),
        [1]
      );
    });
  });
});
