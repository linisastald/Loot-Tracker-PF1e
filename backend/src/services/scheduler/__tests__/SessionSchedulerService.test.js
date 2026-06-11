/**
 * Unit tests for SessionSchedulerService (multi-campaign Phase 3c)
 *
 * Focus: every background job must run its find-work query under the
 * hardcoded cross-campaign context ('all') and act on each row under that
 * row's own campaign context, and a failure in one campaign's row must not
 * abort the remaining rows.
 */

const mockExecuteQuery = jest.fn();

jest.mock('../../../utils/dbUtils', () => ({
  executeQuery: (...args) => mockExecuteQuery(...args),
  executeTransaction: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

jest.mock('../../../utils/campaignContext', () => ({
  runWithCampaign: jest.fn(),
  getCampaignId: jest.fn(),
}));

jest.mock('../../../utils/timezoneUtils', () => ({
  getCampaignTimezone: jest.fn().mockResolvedValue('America/New_York'),
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ stop: jest.fn() })),
}));

// Lazy-loaded collaborators inside the jobs
jest.mock('../../discord/SessionDiscordService', () => ({
  postSessionAnnouncement: jest.fn(),
  sendSessionReminder: jest.fn(),
}));

jest.mock('../../sessionService', () => ({
  confirmSession: jest.fn(),
  cancelSession: jest.fn(),
  completeSession: jest.fn(),
}));

jest.mock('../../attendance/AttendanceService', () => ({
  getConfirmedAttendanceCount: jest.fn(),
}));

const logger = require('../../../utils/logger');
const campaignContext = require('../../../utils/campaignContext');
const sessionDiscordService = require('../../discord/SessionDiscordService');
const sessionService = require('../../sessionService');
const attendanceService = require('../../attendance/AttendanceService');

const scheduler = require('../SessionSchedulerService');

// Tracks the campaign context active when a collaborator is invoked, so we
// can assert per-row work really ran "inside" the row's campaign.
let activeCampaign;

const contextIds = () => campaignContext.runWithCampaign.mock.calls.map(call => call[0]);

describe('SessionSchedulerService campaign context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteQuery.mockReset();
    activeCampaign = null;

    // Pass-through mock that preserves real validation + nesting semantics
    campaignContext.runWithCampaign.mockImplementation((campaignId, fn) => {
      const id = String(campaignId);
      if (!/^\d+$|^all$/.test(id)) {
        throw new Error(`Invalid campaign id: ${id}`);
      }
      const previous = activeCampaign;
      activeCampaign = id;
      const restore = () => { activeCampaign = previous; };
      try {
        const result = fn();
        if (result && typeof result.finally === 'function') {
          return result.finally(restore);
        }
        restore();
        return result;
      } catch (error) {
        restore();
        throw error;
      }
    });
    campaignContext.getCampaignId.mockImplementation(() => activeCampaign || '1');
  });

  // ==========================================================================
  // checkPendingAnnouncements
  // ==========================================================================
  describe('checkPendingAnnouncements', () => {
    it('finds work under "all" and posts each announcement under its own campaign', async () => {
      mockExecuteQuery.mockResolvedValueOnce({
        rows: [
          { id: 10, campaign_id: 1 },
          { id: 11, campaign_id: 2 },
        ],
      });

      const seenContexts = [];
      sessionDiscordService.postSessionAnnouncement.mockImplementation(async () => {
        seenContexts.push(activeCampaign);
      });

      await scheduler.checkPendingAnnouncements();

      expect(contextIds()).toEqual(['all', '1', '2']);
      expect(sessionDiscordService.postSessionAnnouncement).toHaveBeenCalledWith(10);
      expect(sessionDiscordService.postSessionAnnouncement).toHaveBeenCalledWith(11);
      expect(seenContexts).toEqual(['1', '2']);
    });

    it('continues with later sessions when one campaign row fails', async () => {
      mockExecuteQuery.mockResolvedValueOnce({
        rows: [
          { id: 10, campaign_id: 1 },
          { id: 11, campaign_id: 2 },
        ],
      });

      sessionDiscordService.postSessionAnnouncement
        .mockRejectedValueOnce(new Error('Discord down'))
        .mockResolvedValueOnce({});

      await scheduler.checkPendingAnnouncements();

      expect(sessionDiscordService.postSessionAnnouncement).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to post announcement for session 10'),
        expect.any(Error)
      );
    });
  });

  // ==========================================================================
  // checkPendingReminders
  // ==========================================================================
  describe('checkPendingReminders', () => {
    it('selects campaign_id explicitly and sends each reminder under its row campaign', async () => {
      mockExecuteQuery.mockResolvedValueOnce({
        rows: [
          { session_id: 5, title: 'A', start_time: new Date().toISOString(), reminder_hours: 48, campaign_id: 3 },
          { session_id: 6, title: 'B', start_time: new Date().toISOString(), reminder_hours: 48, campaign_id: 1 },
        ],
      });

      const seenContexts = [];
      sessionDiscordService.sendSessionReminder.mockImplementation(async () => {
        seenContexts.push(activeCampaign);
      });

      await scheduler.checkPendingReminders();

      // Find-work query runs cross-campaign and selects campaign_id explicitly
      expect(contextIds()[0]).toBe('all');
      expect(mockExecuteQuery.mock.calls[0][0]).toContain('gs.campaign_id');

      expect(contextIds()).toEqual(['all', '3', '1']);
      expect(sessionDiscordService.sendSessionReminder).toHaveBeenCalledWith(5, 'auto', { isManual: false });
      expect(sessionDiscordService.sendSessionReminder).toHaveBeenCalledWith(6, 'auto', { isManual: false });
      expect(seenContexts).toEqual(['3', '1']);
    });

    it('continues with later reminders when one fails', async () => {
      mockExecuteQuery.mockResolvedValueOnce({
        rows: [
          { session_id: 5, title: 'A', start_time: new Date().toISOString(), reminder_hours: 48, campaign_id: 3 },
          { session_id: 6, title: 'B', start_time: new Date().toISOString(), reminder_hours: 48, campaign_id: 1 },
        ],
      });

      sessionDiscordService.sendSessionReminder
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({});

      await scheduler.checkPendingReminders();

      expect(sessionDiscordService.sendSessionReminder).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // checkSessionConfirmations
  // ==========================================================================
  describe('checkSessionConfirmations', () => {
    it('finds work under "all" and confirms each session under its own campaign', async () => {
      mockExecuteQuery.mockResolvedValueOnce({
        rows: [
          { id: 20, minimum_players: 3, campaign_id: 4 },
        ],
      });

      let confirmContext = null;
      attendanceService.getConfirmedAttendanceCount.mockResolvedValue(5);
      sessionService.confirmSession.mockImplementation(async () => {
        confirmContext = activeCampaign;
      });

      await scheduler.checkSessionConfirmations();

      expect(contextIds()).toEqual(['all', '4']);
      expect(sessionService.confirmSession).toHaveBeenCalledWith(20);
      expect(confirmContext).toBe('4');
    });

    it('runs the reminder-sent check inside the row campaign before cancelling', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce({ rows: [{ id: 21, minimum_players: 4, campaign_id: 2 }] }) // find work
        .mockImplementationOnce(async () => {
          // reminder check query runs under the row's campaign
          expect(activeCampaign).toBe('2');
          return { rows: [{ 1: 1 }] }; // reminder already sent
        });

      attendanceService.getConfirmedAttendanceCount.mockResolvedValue(1);
      sessionService.cancelSession.mockResolvedValue({});

      await scheduler.checkSessionConfirmations();

      expect(sessionService.cancelSession).toHaveBeenCalledWith(
        21,
        expect.stringContaining('Insufficient confirmed players')
      );
    });

    it('continues with later sessions when one campaign row fails', async () => {
      mockExecuteQuery.mockResolvedValueOnce({
        rows: [
          { id: 22, minimum_players: 3, campaign_id: 1 },
          { id: 23, minimum_players: 3, campaign_id: 2 },
        ],
      });

      attendanceService.getConfirmedAttendanceCount
        .mockRejectedValueOnce(new Error('attendance lookup failed'))
        .mockResolvedValueOnce(5);
      sessionService.confirmSession.mockResolvedValue({});

      await scheduler.checkSessionConfirmations();

      expect(sessionService.confirmSession).toHaveBeenCalledWith(23);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process confirmation for session 22'),
        expect.any(Error)
      );
    });
  });

  // ==========================================================================
  // checkSessionCompletions
  // ==========================================================================
  describe('checkSessionCompletions', () => {
    it('finds work under "all" and completes each session under its own campaign', async () => {
      mockExecuteQuery.mockResolvedValueOnce({
        rows: [
          { id: 30, title: 'Old session', campaign_id: 7 },
        ],
      });

      let completeContext = null;
      sessionService.completeSession.mockImplementation(async () => {
        completeContext = activeCampaign;
      });

      await scheduler.checkSessionCompletions();

      expect(contextIds()).toEqual(['all', '7']);
      expect(sessionService.completeSession).toHaveBeenCalledWith(30);
      expect(completeContext).toBe('7');
    });

    it('continues with later sessions when one completion fails', async () => {
      mockExecuteQuery.mockResolvedValueOnce({
        rows: [
          { id: 31, title: 'A', campaign_id: 1 },
          { id: 32, title: 'B', campaign_id: 2 },
        ],
      });

      sessionService.completeSession
        .mockRejectedValueOnce(new Error('nope'))
        .mockResolvedValueOnce({});

      await scheduler.checkSessionCompletions();

      expect(sessionService.completeSession).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // cleanupExpiredData
  // ==========================================================================
  describe('cleanupExpiredData', () => {
    it('runs the whole system sweep under hardcoded cross-campaign mode', async () => {
      mockExecuteQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const seenContexts = [];
      mockExecuteQuery.mockImplementation(async () => {
        seenContexts.push(activeCampaign);
        return { rows: [], rowCount: 0 };
      });

      await scheduler.cleanupExpiredData();

      expect(campaignContext.runWithCampaign).toHaveBeenCalledWith('all', expect.any(Function));
      // All five cleanup statements (users x2, invites, identify, appraisal)
      // execute inside the 'all' context
      expect(seenContexts.length).toBeGreaterThanOrEqual(5);
      expect(seenContexts.every(ctx => ctx === 'all')).toBe(true);
    });

    it('does not throw when a cleanup statement fails', async () => {
      mockExecuteQuery.mockRejectedValue(new Error('DB error'));

      await expect(scheduler.cleanupExpiredData()).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        'Error during system cleanup',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });
});
