const dbUtils = require('../../utils/dbUtils');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
  insert: jest.fn(),
  getById: jest.fn(),
  updateById: jest.fn(),
  deleteById: jest.fn(),
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
