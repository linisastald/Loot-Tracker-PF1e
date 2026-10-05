/**
 * Unit tests for SessionService
 *
 * Tests core CRUD operations, state transitions, scheduling helpers,
 * and delegation methods. External services (Discord, attendance, etc.)
 * are mocked since they are tested independently.
 */

// ---- Mocks (must be defined before require) ----

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

// Mock all delegated sub-services
jest.mock('../attendance/AttendanceService', () => ({
  recordAttendance: jest.fn(),
  getSessionAttendance: jest.fn(),
}));

jest.mock('../discord/SessionDiscordService', () => ({
  postSessionAnnouncement: jest.fn(),
  sendSessionReminder: jest.fn(),
  updateSessionMessage: jest.fn(),
  getDiscordSettings: jest.fn(),
}));

jest.mock('../recurring/RecurringSessionService', () => ({
  createRecurringSession: jest.fn(),
}));

jest.mock('../discordBrokerService', () => ({
  sendMessage: jest.fn(),
}));

// ---- Load modules under test ----
const sessionService = require('../sessionService');
const dbUtils = require('../../utils/dbUtils');
const attendanceService = require('../attendance/AttendanceService');
const sessionDiscordService = require('../discord/SessionDiscordService');
const recurringSessionService = require('../recurring/RecurringSessionService');
const discordBroker = require('../discordBrokerService');

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
    dbUtils.executeQuery.mockReset();
    dbUtils.executeTransaction.mockReset();
    // executeTransaction invokes its callback with a mock client
    // (BEGIN/COMMIT/ROLLBACK/release are handled internally by the real implementation)
    dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));
  });

  // ========================================================================
  // createSession
  // ========================================================================
  describe('createSession', () => {
    it('should create a session and return the result', async () => {
      const session = buildSession();
      // INSERT session, INSERT automation x3 (announce, reminder, confirm)
      mockClient.query
        .mockResolvedValueOnce({ rows: [session] }) // INSERT game_sessions
        .mockResolvedValueOnce({}) // INSERT automation (announcement)
        .mockResolvedValueOnce({}) // INSERT automation (reminder)
        .mockResolvedValueOnce({}); // INSERT automation (confirmation)

      const result = await sessionService.createSession({
        title: 'Session 42',
        start_time: session.start_time,
        end_time: session.end_time,
        description: 'Storming the castle',
        created_by: 1,
      });

      expect(result).toEqual(session);
      expect(dbUtils.executeTransaction).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO game_sessions'),
        expect.any(Array)
      );
    });

    it('should use default values for optional fields', async () => {
      const session = buildSession();
      mockClient.query
        .mockResolvedValueOnce({ rows: [session] }) // INSERT
        .mockResolvedValueOnce({}) // automation
        .mockResolvedValueOnce({}) // automation
        .mockResolvedValueOnce({}); // automation

      await sessionService.createSession({
        title: 'Session 42',
        start_time: session.start_time,
        created_by: 1,
      });

      // The first call is the INSERT; check params include defaults
      const insertCall = mockClient.query.mock.calls[0];
      const params = insertCall[1];
      // minimum_players = 3 (DEFAULT_VALUES.MINIMUM_PLAYERS)
      expect(params[4]).toBe(3);
      // maximum_players = 6
      expect(params[5]).toBe(6);
    });

    it('should propagate errors through the transaction (rollback handled by executeTransaction)', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('DB error')); // INSERT fails

      await expect(
        sessionService.createSession({ title: 'Fail', start_time: futureDate(), created_by: 1 })
      ).rejects.toThrow('DB error');

      expect(dbUtils.executeTransaction).toHaveBeenCalled();
    });

    it('should skip announcement automation if auto_announce_hours is 0', async () => {
      const session = buildSession({ auto_announce_hours: 0 });
      mockClient.query
        .mockResolvedValueOnce({ rows: [session] }) // INSERT session
        .mockResolvedValueOnce({}) // reminder automation
        .mockResolvedValueOnce({}); // confirmation automation

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

    it('schedules announcement, reminder and confirmation with the matching type and time', async () => {
      const session = buildSession();
      const start = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      mockClient.query
        .mockResolvedValueOnce({ rows: [session] })
        .mockResolvedValue({});

      await sessionService.createSession({
        title: 'Session 42',
        start_time: start.toISOString(),
        auto_announce_hours: 72,
        reminder_hours: 24,
        confirmation_hours: 48,
        created_by: 1,
      });

      const inserts = mockClient.query.mock.calls.filter(c => c[0].includes('session_automations'));
      expect(inserts.map(c => c[1][1])).toEqual(['announcement', 'reminder', 'confirmation']);
      expect(inserts[0][1][2].getTime()).toBe(start.getTime() - 72 * 3600 * 1000);
      expect(inserts[1][1][2].getTime()).toBe(start.getTime() - 24 * 3600 * 1000);
    });

    it('skips automations whose scheduled time is already in the past', async () => {
      const session = buildSession();
      const start = new Date(Date.now() + 10 * 3600 * 1000);
      mockClient.query.mockResolvedValueOnce({ rows: [session] }).mockResolvedValue({});

      await sessionService.createSession({
        title: 'Soon',
        start_time: start.toISOString(),
        auto_announce_hours: 72,
        reminder_hours: 24,
        confirmation_hours: 48,
        created_by: 1,
      });

      expect(mockClient.query.mock.calls.filter(c => c[0].includes('session_automations'))).toHaveLength(0);
    });
  });

  // ========================================================================
  // getSession
  // ========================================================================
  describe('getSession', () => {
    it('should return session by ID', async () => {
      const session = buildSession();
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [session] });

      const result = await sessionService.getSession(1);

      expect(result).toEqual(session);
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM game_sessions WHERE id = $1'),
        [1],
        expect.any(String)
      );
    });

    it('should return null when session not found', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      const result = await sessionService.getSession(999);

      expect(result).toBeNull();
    });
  });

  // ========================================================================
  // confirmSession
  // ========================================================================
  describe('confirmSession', () => {
    it('should set status to confirmed and update Discord', async () => {
      const session = buildSession({ status: 'confirmed' });
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [session] });
      sessionDiscordService.updateSessionMessage.mockResolvedValueOnce();

      const result = await sessionService.confirmSession(1);

      expect(result.status).toBe('confirmed');
      expect(sessionDiscordService.updateSessionMessage).toHaveBeenCalledWith(1);
    });

    it('should not update Discord if session not found', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

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
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [session] });
      sessionDiscordService.updateSessionMessage.mockResolvedValueOnce();
      sessionDiscordService.getDiscordSettings.mockResolvedValueOnce({
        campaign_role_id: '123',
        discord_channel_id: '456',
      });
      discordBroker.sendMessage.mockResolvedValueOnce();

      const result = await sessionService.cancelSession(1, 'DM sick');

      expect(result.status).toBe('cancelled');
      expect(sessionDiscordService.updateSessionMessage).toHaveBeenCalledWith(1);
      expect(discordBroker.sendMessage).toHaveBeenCalledTimes(1);
      const ping = discordBroker.sendMessage.mock.calls[0][0];
      expect(ping.channelId).toBe('456');
      expect(ping.content).toContain('<@&123>');
      expect(ping.content).toContain('Reason: DM sick');
      // A role id typed into the reason must not ping: only the campaign role may
      expect(ping.allowedMentions).toEqual({ parse: [], roles: ['123'] });
      const [updateSql, updateParams] = dbUtils.executeQuery.mock.calls[0];
      expect(updateSql).toContain("status = 'cancelled'");
      expect(updateParams).toEqual([1, 'DM sick']);
    });

    it('should return null if session not found', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      const result = await sessionService.cancelSession(999, 'reason');

      expect(result).toBeNull();
    });

    it('should not throw if Discord notification fails', async () => {
      const session = buildSession({ status: 'cancelled' });
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [session] });
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
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [cancelledSession] }) // check
        .mockResolvedValueOnce({ rows: [restoredSession] }); // update
      sessionDiscordService.updateSessionMessage.mockResolvedValueOnce();
      sessionDiscordService.getDiscordSettings.mockResolvedValueOnce({});

      const result = await sessionService.uncancelSession(1);

      expect(result.status).toBe('scheduled');
    });

    it('pings the campaign role that the session was reinstated', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [buildSession({ status: 'cancelled' })] })
        .mockResolvedValueOnce({ rows: [buildSession({ status: 'scheduled' })] });
      sessionDiscordService.updateSessionMessage.mockResolvedValueOnce();
      sessionDiscordService.getDiscordSettings.mockResolvedValueOnce({
        campaign_role_id: '123',
        discord_channel_id: '456',
      });
      discordBroker.sendMessage.mockResolvedValueOnce();

      await sessionService.uncancelSession(1);

      const ping = discordBroker.sendMessage.mock.calls[0][0];
      expect(ping.channelId).toBe('456');
      expect(ping.content).toContain('<@&123>');
      expect(ping.content).toContain('has been reinstated');
      expect(ping.allowedMentions).toEqual({ parse: [], roles: ['123'] });
    });

    it('should return null if session not found', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      const result = await sessionService.uncancelSession(999);

      expect(result).toBeNull();
    });

    it('should throw if session is not cancelled', async () => {
      const session = buildSession({ status: 'scheduled' });
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [session] });

      await expect(sessionService.uncancelSession(1)).rejects.toThrow(
        'Session is not cancelled (current status: scheduled)'
      );
    });

    it('should throw if session is in the past', async () => {
      const session = buildSession({ status: 'cancelled', start_time: pastDate() });
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [session] });

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
        .mockResolvedValueOnce({ rows: [session] }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ confirmed_count: 4, declined_count: 1, maybe_count: 0, attendee_names: ['Alice', 'Bob'] }] }) // attendance
        .mockResolvedValueOnce({}); // INSERT completion

      const result = await sessionService.completeSession(1);

      expect(result.status).toBe('completed');
      expect(dbUtils.executeTransaction).toHaveBeenCalled();
    });

    it('counts attendance by status so late/early/in-app RSVPs are confirmed', async () => {
      const session = buildSession({ status: 'completed' });
      mockClient.query
        .mockResolvedValueOnce({ rows: [session] })
        .mockResolvedValueOnce({ rows: [{ confirmed_count: 2, declined_count: 0, maybe_count: 0, attendee_names: [] }] })
        .mockResolvedValueOnce({});

      await sessionService.completeSession(1);

      const summarySql = mockClient.query.mock.calls[1][0];
      expect(summarySql).toContain("status = 'accepted'");
      expect(summarySql).toContain("status = 'declined'");
      expect(summarySql).toContain("status = 'tentative'");
      expect(summarySql).not.toContain('response_type');
    });

    it('should throw a not-found error for an unknown session', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // UPDATE returns nothing
        .mockResolvedValueOnce({ rows: [] }); // lookup finds nothing

      await expect(sessionService.completeSession(999)).rejects.toThrow('Session not found');
      expect(dbUtils.executeTransaction).toHaveBeenCalled();
    });

    it('names the current status when the session cannot be completed', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ status: 'cancelled' }] });

      await expect(sessionService.completeSession(1)).rejects.toThrow(
        'Session cannot be completed (current status: cancelled)'
      );
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
  });

  // ========================================================================
  // scheduleSessionEvents
  // ========================================================================
  describe('scheduleSessionEvents', () => {
    it('should insert three default reminders', async () => {
      dbUtils.executeQuery.mockResolvedValue({});

      await sessionService.scheduleSessionEvents(buildSession());

      const reminderInserts = dbUtils.executeQuery.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('session_reminders')
      );
      expect(reminderInserts).toHaveLength(3);
    });

    it('should not throw on db error (logs and swallows)', async () => {
      dbUtils.executeQuery.mockRejectedValueOnce(new Error('DB fail'));

      // Should not throw
      await sessionService.scheduleSessionEvents(buildSession());
    });
  });

});
