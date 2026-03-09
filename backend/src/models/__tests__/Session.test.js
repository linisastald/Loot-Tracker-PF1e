const dbUtils = require('../../utils/dbUtils');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
  insert: jest.fn(),
  getById: jest.fn(),
  getMany: jest.fn(),
  updateById: jest.fn(),
  deleteById: jest.fn(),
  rowExists: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const Session = require('../Session');

describe('Session model', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getUpcomingSessions', () => {
    it('should return upcoming sessions with default limit', async () => {
      const mockSessions = [{ id: 1, title: 'Game Night' }];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockSessions });

      const result = await Session.getUpcomingSessions();

      expect(result).toEqual(mockSessions);
      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('start_time > NOW()');
      expect(query).toContain('ORDER BY start_time ASC');
      expect(values).toEqual([5]); // default limit
    });

    it('should accept custom limit', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Session.getUpcomingSessions(10);

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([10]);
    });
  });

  describe('getSessionWithAttendance', () => {
    it('should return session with grouped attendance', async () => {
      // Session query
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [{ id: 1, title: 'Session 1' }],
      });
      // Attendance query
      dbUtils.executeQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, status: 'accepted', user_id: 1, username: 'player1', character_id: 1, character_name: 'Valeros' },
          { id: 2, status: 'declined', user_id: 2, username: 'player2', character_id: null, character_name: null },
          { id: 3, status: 'tentative', user_id: 3, username: 'player3', character_id: 2, character_name: 'Merisiel' },
        ],
      });

      const result = await Session.getSessionWithAttendance(1);

      expect(result.title).toBe('Session 1');
      expect(result.attendance.accepted).toHaveLength(1);
      expect(result.attendance.declined).toHaveLength(1);
      expect(result.attendance.tentative).toHaveLength(1);
      expect(result.attendance.accepted[0].username).toBe('player1');
    });

    it('should return null when session not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Session.getSessionWithAttendance(999);

      expect(result).toBeNull();
    });

    it('should handle empty attendance', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, title: 'Empty Session' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await Session.getSessionWithAttendance(1);

      expect(result.attendance.accepted).toHaveLength(0);
      expect(result.attendance.declined).toHaveLength(0);
      expect(result.attendance.tentative).toHaveLength(0);
    });
  });

  describe('updateAttendance', () => {
    it('should upsert attendance record', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1, status: 'accepted' }] });

      const result = await Session.updateAttendance(1, 2, 3, 'accepted');

      expect(result.status).toBe('accepted');
      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('ON CONFLICT');
      expect(query).toContain('DO UPDATE');
    });
  });

  describe('createSession', () => {
    it('should create session within a transaction', async () => {
      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValue({
        rows: [{ id: 1, title: 'New Session' }],
      });
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      const sessionData = {
        title: 'New Session',
        start_time: '2024-03-15T18:00:00Z',
        end_time: '2024-03-15T22:00:00Z',
        description: 'Adventure continues',
        discord_message_id: null,
        discord_channel_id: null,
      };

      const result = await Session.createSession(sessionData);

      expect(result.title).toBe('New Session');
      expect(mockClient.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateDiscordMessage', () => {
    it('should update discord message and channel IDs', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      await Session.updateDiscordMessage(1, 'msg-123', 'ch-456');

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values).toEqual([1, 'msg-123', 'ch-456']);
    });
  });

  describe('findSessionsNeedingNotifications', () => {
    it('should query for scheduled sessions without discord messages', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Session.findSessionsNeedingNotifications();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain("status = 'scheduled'");
      expect(query).toContain('discord_message_id IS NULL');
      expect(query).toContain('auto_announce_hours');
    });
  });
});
