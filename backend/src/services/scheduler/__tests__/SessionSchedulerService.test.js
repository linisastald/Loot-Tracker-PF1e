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
  getAutoReminderRecipients: jest.fn(),
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

// The real campaignContext is used (so validation and nesting cannot drift
// from production); runWithCampaign is only spied on to record the ids.
// Collaborators read the active context with campaignContext.getCampaignId().

const contextIds = () => campaignContext.runWithCampaign.mock.calls.map(call => call[0]);

describe('SessionSchedulerService campaign context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteQuery.mockReset();
    jest.spyOn(campaignContext, 'runWithCampaign');
  });

  afterEach(() => {
    campaignContext.runWithCampaign.mockRestore();
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
        seenContexts.push(campaignContext.getCampaignId());
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
        seenContexts.push(campaignContext.getCampaignId());
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
        confirmContext = campaignContext.getCampaignId();
      });

      await scheduler.checkSessionConfirmations();

      expect(contextIds()).toEqual(['all', '4']);
      expect(sessionService.confirmSession).toHaveBeenCalledWith(20);
      expect(confirmContext).toBe('4');
    });

    it('runs the reminder-age check inside the row campaign before cancelling', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce({ rows: [{ id: 21, minimum_players: 4, campaign_id: 2 }] }) // find work
        .mockImplementationOnce(async () => {
          // reminder check query runs under the row's campaign
          expect(campaignContext.getCampaignId()).toBe('2');
          return { rows: [{ sent_count: '1', recent_count: '0' }] }; // reminder old enough
        });

      attendanceService.getConfirmedAttendanceCount.mockResolvedValue(1);
      sessionDiscordService.getAutoReminderRecipients.mockResolvedValue([{ id: 7, discord_id: '777' }]);
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
  // Auto-cancel rules (F-0752, F-0753)
  // ==========================================================================
  describe('checkSessionConfirmations auto-cancel rules', () => {
    const underAttended = { id: 30, minimum_players: 4, campaign_id: 1 };
    const somebodyToRemind = [{ id: 7, discord_id: '777' }];

    const arrange = ({ confirmed, recipients, reminder }) => {
      mockExecuteQuery.mockResolvedValueOnce({ rows: [underAttended] }); // find work
      if (reminder) mockExecuteQuery.mockResolvedValueOnce({ rows: [reminder] });
      attendanceService.getConfirmedAttendanceCount.mockResolvedValue(confirmed);
      sessionDiscordService.getAutoReminderRecipients.mockResolvedValue(recipients);
      sessionService.cancelSession.mockResolvedValue({});
      sessionService.confirmSession.mockResolvedValue({});
      sessionDiscordService.sendSessionReminder.mockResolvedValue(undefined);
    };

    it('does not cancel while the reminder is younger than 12 hours', async () => {
      arrange({ confirmed: 1, recipients: somebodyToRemind, reminder: { sent_count: '1', recent_count: '1' } });

      await scheduler.checkSessionConfirmations();

      expect(sessionService.cancelSession).not.toHaveBeenCalled();
      expect(sessionDiscordService.sendSessionReminder).not.toHaveBeenCalled();
    });

    it('cancels when the newest reminder is at least 12 hours old', async () => {
      arrange({ confirmed: 1, recipients: somebodyToRemind, reminder: { sent_count: '2', recent_count: '0' } });

      await scheduler.checkSessionConfirmations();

      expect(sessionService.cancelSession).toHaveBeenCalledWith(30, expect.stringContaining('1 of 4'));
    });

    it('asks the database for reminders newer than the named 12 hour constant', async () => {
      arrange({ confirmed: 1, recipients: somebodyToRemind, reminder: { sent_count: '1', recent_count: '0' } });

      await scheduler.checkSessionConfirmations();

      const [, params] = mockExecuteQuery.mock.calls[1];
      expect(params).toEqual([30, 12]);
    });

    it('cancels at the normal check when every expected player has responded and no reminder was sent', async () => {
      arrange({ confirmed: 1, recipients: [], reminder: null });

      await scheduler.checkSessionConfirmations();

      expect(sessionService.cancelSession).toHaveBeenCalledWith(30, expect.stringContaining('1 of 4'));
      expect(sessionDiscordService.sendSessionReminder).not.toHaveBeenCalled();
    });

    it('does not cancel when some players have not responded and no reminder was sent; it sends the reminder', async () => {
      arrange({ confirmed: 1, recipients: somebodyToRemind, reminder: { sent_count: '0', recent_count: '0' } });

      await scheduler.checkSessionConfirmations();

      expect(sessionService.cancelSession).not.toHaveBeenCalled();
      expect(sessionDiscordService.sendSessionReminder).toHaveBeenCalledWith(30, 'auto', { isManual: false });
    });

    it('never cancels a session with enough confirmed players', async () => {
      arrange({ confirmed: 4, recipients: [], reminder: null });

      await scheduler.checkSessionConfirmations();

      expect(sessionService.confirmSession).toHaveBeenCalledWith(30);
      expect(sessionService.cancelSession).not.toHaveBeenCalled();
      expect(sessionDiscordService.getAutoReminderRecipients).not.toHaveBeenCalled();
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
        completeContext = campaignContext.getCampaignId();
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
        seenContexts.push(campaignContext.getCampaignId());
        return { rows: [], rowCount: 0 };
      });

      await scheduler.cleanupExpiredData();

      expect(campaignContext.runWithCampaign).toHaveBeenCalledWith('all', expect.any(Function));
      // All cleanup statements (expired locks, invites, appraisals)
      // execute inside the 'all' context
      expect(seenContexts.length).toBeGreaterThanOrEqual(3);
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

// ============================================================================
// W12: job table, initialize/restart failure handling, cleanup rules
// ============================================================================
describe('SessionSchedulerService scheduling (W12)', () => {
  const cron = require('node-cron');
  const timezoneUtils = require('../../../utils/timezoneUtils');
  const defaultSchedule = (...args) => ({ stop: jest.fn(), args });

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteQuery.mockReset();
    mockExecuteQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    cron.schedule.mockImplementation(defaultSchedule);
    timezoneUtils.getCampaignTimezone.mockResolvedValue('America/New_York');
    scheduler.scheduledJobs.clear();
    scheduler.isInitialized = false;
    scheduler.isRestarting = false;
  });

  afterEach(() => {
    cron.schedule.mockImplementation(defaultSchedule);
    scheduler.scheduledJobs.clear();
    scheduler.isInitialized = false;
  });

  it('schedules exactly the seven expected jobs, all in the campaign timezone', async () => {
    const ok = await scheduler.initialize();

    expect(ok).toBe(true);
    expect(cron.schedule.mock.calls.map(c => c[0])).toEqual([
      '*/15 * * * *',   // announcements
      '0 * * * *',      // reminders
      '0 12 * * *',     // confirmations noon
      '0 17 * * *',     // confirmations 5pm
      '0 22 * * *',     // confirmations 10pm
      '0 * * * *',      // completions
      '0 * * * *',      // system cleanup
    ]);
    expect(cron.schedule.mock.calls.every(c => c[2].timezone === 'America/New_York')).toBe(true);
    expect([...scheduler.scheduledJobs.keys()].sort()).toEqual([
      'confirmationChecks10PM', 'confirmationChecks5PM', 'confirmationChecksNoon',
      'reminderChecks', 'sessionAnnouncements', 'sessionCompletions', 'systemCleanup',
    ].sort());
  });

  it('a throwing job callback is logged, not propagated', async () => {
    await scheduler.initialize();
    const reminderCb = cron.schedule.mock.calls[1][1];
    mockExecuteQuery.mockRejectedValue(new Error('db down'));

    await expect(reminderCb()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('initialize reports failure, stops the partial job set and stays uninitialized', async () => {
    let calls = 0;
    const stops = [];
    cron.schedule.mockImplementation(() => {
      calls += 1;
      if (calls === 3) throw new Error('invalid timezone');
      const job = { stop: jest.fn() };
      stops.push(job);
      return job;
    });

    const ok = await scheduler.initialize();

    expect(ok).toBe(false);
    expect(scheduler.isInitialized).toBe(false);
    expect(scheduler.scheduledJobs.size).toBe(0);
    expect(stops).toHaveLength(2);
    stops.forEach(job => expect(job.stop).toHaveBeenCalled());
  });

  it('restart falls back to the previous timezone when the new one cannot be scheduled', async () => {
    await scheduler.initialize();
    expect(scheduler.campaignTimezone).toBe('America/New_York');

    timezoneUtils.getCampaignTimezone.mockResolvedValueOnce('Bad/Zone');
    cron.schedule.mockImplementation((expr, fn, opts) => {
      if (opts.timezone === 'Bad/Zone') throw new Error('invalid timezone');
      return { stop: jest.fn() };
    });

    const ok = await scheduler.restart();

    expect(ok).toBe(true);
    expect(scheduler.isInitialized).toBe(true);
    expect(scheduler.campaignTimezone).toBe('America/New_York');
    expect(scheduler.scheduledJobs.size).toBe(7);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize'), expect.anything());
  });

  it('restart does not claim success when initialization fails completely', async () => {
    await scheduler.initialize();
    cron.schedule.mockImplementation(() => { throw new Error('nope'); });

    const ok = await scheduler.restart();

    expect(ok).toBe(false);
    expect(scheduler.isInitialized).toBe(false);
    expect(logger.info).not.toHaveBeenCalledWith('Session scheduler restarted successfully');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('restart failed'));
  });
});

describe('SessionSchedulerService cleanup rules (W12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteQuery.mockReset();
    mockExecuteQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  const issuedSql = () => mockExecuteQuery.mock.calls.map(c => c[0].replace(/\s+/g, ' ').trim());

  it('does not blanket-reset failed login counters of unlocked accounts (F-0756, F-0757)', async () => {
    await scheduler.cleanupExpiredData();

    const userUpdates = issuedSql().filter(sql => sql.startsWith('UPDATE users'));
    expect(userUpdates).toHaveLength(1);
    expect(userUpdates[0]).toContain('locked_until < NOW()');
  });

  it('never purges identify attempts by real-world age (F-0755)', async () => {
    await scheduler.cleanupExpiredData();

    expect(issuedSql().some(sql => /DELETE FROM identify/i.test(sql))).toBe(false);
  });

  it('still removes expired locks, expires invites and drops orphaned appraisals', async () => {
    await scheduler.cleanupExpiredData();

    const sql = issuedSql();
    expect(sql.some(q => q.startsWith('UPDATE invites SET is_used = TRUE'))).toBe(true);
    expect(sql.some(q => q.startsWith('DELETE FROM appraisal'))).toBe(true);
  });
});
