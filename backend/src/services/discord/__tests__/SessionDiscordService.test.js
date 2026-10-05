/**
 * Unit tests for SessionDiscordService (settings split, session embed).
 *
 * The legacy processDiscordReaction path (unauthenticated /api/discord/reactions)
 * was removed in the S1 security fix; attendance now arrives only via buttons.
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

jest.mock('../../discordBrokerService', () => ({
  sendMessage: jest.fn(),
  updateMessage: jest.fn(),
  getBotToken: jest.fn(),
}));

// Lazy-loaded collaborators
jest.mock('../../attendance/AttendanceService', () => ({
  recordAttendance: jest.fn(),
  getSessionAttendance: jest.fn(),
  getNonResponders: jest.fn(),
  getActiveCharacterInCampaign: jest.fn(),
}));

jest.mock('../../sessionService', () => ({
  getSession: jest.fn(),
}));

const logger = require('../../../utils/logger');
const campaignContext = require('../../../utils/campaignContext');
const attendanceService = require('../../attendance/AttendanceService');

const sessionDiscordService = require('../SessionDiscordService');

let activeCampaign;

const contextIds = () => campaignContext.runWithCampaign.mock.calls.map(call => call[0]);

describe('SessionDiscordService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteQuery.mockReset();
    activeCampaign = null;

    // Pass-through mock preserving real validation + nesting semantics
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

    // Suppress the trailing embed refresh (separately tested behavior)
    jest.spyOn(sessionDiscordService, 'updateSessionMessage').mockResolvedValue();
  });

  // -----------------------------------------------------------------
  // getDiscordSettings (Phase 4c: per-campaign channel/role split)
  // -----------------------------------------------------------------
  describe('getDiscordSettings', () => {
    it('reads the bot token via the broker service and the channel/role ids from campaign_settings under the active campaign', async () => {
      require('../../discordBrokerService').getBotToken.mockResolvedValue('global-token');
      const seenQueries = [];
      mockExecuteQuery.mockImplementation(async (query, params) => {
        seenQueries.push({ query, params, context: activeCampaign });
        if (query.includes('FROM campaign_settings')) {
          return {
            rows: [
              { name: 'discord_channel_id', value: '111111111111111111' },
              { name: 'campaign_role_id', value: '222222222222222222' },
            ],
          };
        }
        // Global settings read (bot token only — campaign_name is no longer read)
        return { rows: [{ name: 'discord_bot_token', value: 'global-token' }] };
      });

      const settings = await campaignContext.runWithCampaign('5', () =>
        sessionDiscordService.getDiscordSettings()
      );

      expect(settings).toEqual({
        discord_bot_token: 'global-token',
        discord_channel_id: '111111111111111111',
        campaign_role_id: '222222222222222222',
      });

      // The per-campaign read is scoped to the active campaign ('5')
      const perCampaignRead = seenQueries.find(q => q.query.includes('FROM campaign_settings'));
      expect(perCampaignRead.params).toEqual(['5', ['discord_channel_id', 'campaign_role_id']]);
    });

    it('falls back to the deprecated global rows when the campaign has no Discord settings', async () => {
      require('../../discordBrokerService').getBotToken.mockResolvedValue('global-token');
      mockExecuteQuery.mockImplementation(async (query, params) => {
        if (query.includes('FROM campaign_settings')) {
          return { rows: [] };
        }
        if (Array.isArray(params) && Array.isArray(params[0])) {
          // Global fallback batch for the missing per-campaign names
          return { rows: [{ name: 'discord_channel_id', value: 'legacy-channel' }] };
        }
        return { rows: [{ name: 'discord_bot_token', value: 'global-token' }] };
      });

      const settings = await campaignContext.runWithCampaign('9', () =>
        sessionDiscordService.getDiscordSettings()
      );

      expect(settings.discord_bot_token).toBe('global-token');
      expect(settings.discord_channel_id).toBe('legacy-channel');
      expect(settings.campaign_role_id).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------
  // createSessionEmbed snack master lookup
  //
  // The snack master shown on a session announcement is whoever got the
  // post-session "snacks for next session" task in the most recent task
  // assignment made BEFORE this session starts. The lookup keys off the
  // assignment's created_at (not its linked session_id), because the DM
  // typically runs the Tasks page at the table after a session has already
  // started, which links that row to the FOLLOWING upcoming session and would
  // otherwise make the announcement lag one session behind.
  // -----------------------------------------------------------------
  describe('createSessionEmbed snack master', () => {
    const baseSession = {
      id: 50,
      title: 'Rise of the Runelords - Jun 28',
      description: 'Pathfinder session',
      status: 'scheduled',
      minimum_players: 4,
      start_time: '2026-06-28T18:00:00.000Z',
    };

    // Pass attendance explicitly so createSessionEmbed does not lazy-load the
    // AttendanceService; the only query left is the snack-master lookup.
    const noAttendance = [];

    const findSnackField = (embed) =>
      embed.fields.find(f => f.name === '🍿 Snack Master');

    it('shows the most recent pre-session assignment and queries by created_at < start_time', async () => {
      const seen = [];
      mockExecuteQuery.mockImplementation(async (query, params) => {
        seen.push({ query, params });
        return { rows: [{ snack_master_name: 'Zolgrak Pyrebeard' }] };
      });

      const embed = await sessionDiscordService.createSessionEmbed(baseSession, noAttendance);

      expect(findSnackField(embed)).toEqual({
        name: '🍿 Snack Master',
        value: 'Zolgrak Pyrebeard',
        inline: false,
      });

      // Keys off created_at (newest first), bounded by this session's start.
      const lookup = seen.find(s => s.query.includes('FROM session_task_history'));
      expect(lookup).toBeDefined();
      expect(lookup.query).toContain('created_at < $1');
      expect(lookup.query).toContain('ORDER BY created_at DESC');
      expect(lookup.query).not.toContain('JOIN game_sessions');
      expect(lookup.params).toEqual([baseSession.start_time]);
    });

    it('omits the Snack Master field when no assignment exists yet', async () => {
      mockExecuteQuery.mockResolvedValue({ rows: [] });

      const embed = await sessionDiscordService.createSessionEmbed(baseSession, noAttendance);

      expect(findSnackField(embed)).toBeUndefined();
    });

    it('still builds the embed (without a Snack Master) when the lookup errors', async () => {
      mockExecuteQuery.mockRejectedValue(new Error('DB down'));

      const embed = await sessionDiscordService.createSessionEmbed(baseSession, noAttendance);

      expect(findSnackField(embed)).toBeUndefined();
      expect(embed.title).toContain(baseSession.title);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to look up snack master name',
        { error: 'DB down' }
      );
    });
  });

  // -----------------------------------------------------------------
  // Send results: sendMessage/updateMessage return ServiceResult.failure
  // instead of throwing, so success must be checked (F-0649).
  // -----------------------------------------------------------------
  describe('sendSessionReminder send result handling', () => {
    const discordBroker = require('../../discordBrokerService');
    const sessionService = require('../../sessionService');

    beforeEach(() => {
      sessionService.getSession.mockResolvedValue({
        id: 5, created_by: null, start_time: new Date('2026-11-01T19:00:00Z'), title: 'S'
      });
      attendanceService.getSessionAttendance.mockResolvedValue([]);
      attendanceService.getNonResponders.mockResolvedValue([{ discord_id: '111' }]);
      jest.spyOn(sessionDiscordService, 'getDiscordSettings')
        .mockResolvedValue({ discord_channel_id: 'chan', campaign_role_id: null });
      jest.spyOn(sessionDiscordService, 'recordReminder').mockResolvedValue();
    });

    it('does not record the reminder and throws when Discord rejects the send', async () => {
      discordBroker.sendMessage.mockResolvedValue({ success: false, error: { message: 'Missing Access' } });

      await expect(sessionDiscordService.sendSessionReminder(5, 'auto', { isManual: false }))
        .rejects.toThrow(/Missing Access/);
      expect(sessionDiscordService.recordReminder).not.toHaveBeenCalled();
    });

    it('records the reminder only after a confirmed send', async () => {
      discordBroker.sendMessage.mockResolvedValue({ success: true, data: { id: 'm1' } });

      await sessionDiscordService.sendSessionReminder(5, 'auto', { isManual: false });

      expect(sessionDiscordService.recordReminder).toHaveBeenCalledTimes(1);
    });

    it('throws before sending when no channel is configured', async () => {
      sessionDiscordService.getDiscordSettings.mockResolvedValue({ discord_channel_id: null });

      await expect(sessionDiscordService.sendSessionReminder(5, 'auto', { isManual: false }))
        .rejects.toThrow(/channel not configured/);
      expect(discordBroker.sendMessage).not.toHaveBeenCalled();
      expect(sessionDiscordService.recordReminder).not.toHaveBeenCalled();
    });
  });

  // The scheduler cancels early only when this is empty (F-0752).
  describe('getAutoReminderRecipients', () => {
    const sessionService = require('../../sessionService');

    beforeEach(() => {
      sessionService.getSession.mockResolvedValue({ id: 5, created_by: 9 });
      mockExecuteQuery.mockResolvedValue({ rows: [{ discord_id: 'dm' }] });
    });

    it('is the non-responders plus maybes, without the DM and without users lacking a Discord id', async () => {
      attendanceService.getSessionAttendance.mockResolvedValue([
        { user_id: 1, response_type: 'yes', discord_id: 'a' },
        { user_id: 2, response_type: 'maybe', discord_id: 'b' },
        { user_id: 3, response_type: 'no', discord_id: 'c' },
      ]);
      attendanceService.getNonResponders.mockResolvedValue([
        { id: 4, discord_id: 'd' },
        { id: 9, discord_id: 'dm' },
        { id: 5, discord_id: null },
      ]);

      const recipients = await sessionDiscordService.getAutoReminderRecipients(5);

      expect(recipients.map(u => u.discord_id)).toEqual(['d', 'b']);
    });

    it('is empty when everyone has answered yes/no and only the DM is outstanding', async () => {
      attendanceService.getSessionAttendance.mockResolvedValue([
        { user_id: 1, response_type: 'yes', discord_id: 'a' },
        { user_id: 3, response_type: 'no', discord_id: 'c' },
      ]);
      attendanceService.getNonResponders.mockResolvedValue([{ id: 9, discord_id: 'dm' }]);

      await expect(sessionDiscordService.getAutoReminderRecipients(5)).resolves.toEqual([]);
    });
  });

  describe('sendSessionReminder targets and mentions (F-0645, F-0646, F-0647)', () => {
    const discordBroker = require('../../discordBrokerService');
    const sessionService = require('../../sessionService');
    const when = new Date('2026-11-01T19:00:00Z');
    const stamp = `<t:${Math.floor(when.getTime() / 1000)}:F>`;

    const arrange = ({ attendance = [], nonResponders = [], role = null }) => {
      sessionService.getSession.mockResolvedValue({ id: 5, created_by: 9, start_time: when, title: 'S' });
      mockExecuteQuery.mockResolvedValue({ rows: [{ discord_id: 'dm' }] });
      attendanceService.getSessionAttendance.mockResolvedValue(attendance);
      attendanceService.getNonResponders.mockResolvedValue(nonResponders);
      jest.spyOn(sessionDiscordService, 'getDiscordSettings')
        .mockResolvedValue({ discord_channel_id: 'chan', campaign_role_id: role });
      jest.spyOn(sessionDiscordService, 'recordReminder').mockResolvedValue();
      discordBroker.sendMessage.mockResolvedValue({ success: true, data: { id: 'm' } });
    };

    it('throws a NotFoundError for an unknown session instead of a TypeError', async () => {
      sessionService.getSession.mockResolvedValue(null);

      await expect(sessionDiscordService.sendSessionReminder(404, 'all', { isManual: true }))
        .rejects.toMatchObject({ name: 'NotFoundError' });
    });

    it('auto reminder pings non-responders and maybes, never the DM or responders who said yes', async () => {
      arrange({
        attendance: [
          { response_type: 'yes', discord_id: 'yes1' },
          { response_type: 'maybe', discord_id: 'maybe1' },
        ],
        nonResponders: [{ discord_id: 'non1' }, { discord_id: 'dm' }],
      });

      await sessionDiscordService.sendSessionReminder(5, 'auto', { isManual: false });

      const args = discordBroker.sendMessage.mock.calls[0][0];
      expect(args.content).toBe(`<@non1> <@maybe1> Session reminder: Please respond if you plan to attend on ${stamp}`);
      expect(args.allowedMentions).toEqual({ parse: [], users: ['non1', 'maybe1'] });
    });

    it('remind all without a role pings responders AND non-responders, once each', async () => {
      arrange({
        attendance: [
          { response_type: 'yes', discord_id: 'yes1' },
          { response_type: 'no', discord_id: 'no1' },
        ],
        nonResponders: [{ discord_id: 'non1' }, { discord_id: 'yes1' }],
      });

      await sessionDiscordService.sendSessionReminder(5, 'all', { isManual: true });

      const args = discordBroker.sendMessage.mock.calls[0][0];
      expect(args.allowedMentions.users).toEqual(['yes1', 'no1', 'non1']);
      expect(sessionDiscordService.recordReminder).toHaveBeenCalledWith(5, 'all', expect.any(Array), { isManual: true });
    });

    it('remind all pings the campaign role (and only that role) even when nobody has responded', async () => {
      arrange({ attendance: [], nonResponders: [], role: '222222222222222222' });

      await sessionDiscordService.sendSessionReminder(5, 'all', { isManual: true });

      const args = discordBroker.sendMessage.mock.calls[0][0];
      expect(args.content).toBe(`<@&222222222222222222> Session reminder for everyone: ${stamp}`);
      expect(args.allowedMentions).toEqual({ parse: [], roles: ['222222222222222222'] });
    });

    it('sends nothing and records nothing when no one can be pinged', async () => {
      arrange({ attendance: [], nonResponders: [{ discord_id: 'dm' }] });

      await sessionDiscordService.sendSessionReminder(5, 'non_responders', { isManual: true });

      expect(discordBroker.sendMessage).not.toHaveBeenCalled();
      expect(sessionDiscordService.recordReminder).not.toHaveBeenCalled();
    });
  });

  describe('postSessionAnnouncement (F-0645)', () => {
    const discordBroker = require('../../discordBrokerService');
    const sessionService = require('../../sessionService');

    beforeEach(() => {
      sessionDiscordService.updateSessionMessage.mockRestore();
      sessionService.getSession.mockResolvedValue({
        id: 1, discord_message_id: null, title: 'T', status: 'scheduled', minimum_players: 3,
        start_time: '2026-11-01T19:00:00Z',
      });
      jest.spyOn(sessionDiscordService, 'createSessionEmbed').mockResolvedValue({ color: 1, fields: [] });
    });

    it('posts with the role ping limited to that role and stores message and channel ids', async () => {
      jest.spyOn(sessionDiscordService, 'getDiscordSettings').mockResolvedValue({
        discord_channel_id: '111111111111111111', discord_bot_token: 't', campaign_role_id: '222222222222222222',
      });
      discordBroker.sendMessage.mockResolvedValue({ success: true, data: { id: '333333333333333333' } });
      mockExecuteQuery.mockResolvedValue({ rowCount: 1, rows: [{ id: 1 }] });

      const result = await sessionDiscordService.postSessionAnnouncement(1);

      expect(result).toEqual({ id: '333333333333333333' });
      const args = discordBroker.sendMessage.mock.calls[0][0];
      expect(args.content).toBe('<@&222222222222222222> next session!');
      expect(args.allowedMentions).toEqual({ parse: [], roles: ['222222222222222222'] });
      expect(args.components[0].components.map(b => b.custom_id)).toEqual([
        'session_attend_yes', 'session_attend_no', 'session_attend_maybe', 'session_attend_late',
      ]);
      expect(mockExecuteQuery.mock.calls[0][1]).toEqual(['333333333333333333', '111111111111111111', 1]);
    });

    it('returns null without sending when Discord is not configured', async () => {
      jest.spyOn(sessionDiscordService, 'getDiscordSettings').mockResolvedValue({});

      await expect(sessionDiscordService.postSessionAnnouncement(1)).resolves.toBeNull();
      expect(discordBroker.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('updateSessionMessage channel (F-0652)', () => {
    const discordBroker = require('../../discordBrokerService');
    const sessionService = require('../../sessionService');

    beforeEach(() => {
      sessionDiscordService.updateSessionMessage.mockRestore();
      attendanceService.getSessionAttendance.mockResolvedValue([]);
      jest.spyOn(sessionDiscordService, 'createSessionEmbed').mockResolvedValue({ color: 1, fields: [] });
      discordBroker.updateMessage.mockResolvedValue({ success: true, data: {} });
    });

    it('edits the message in the channel it was posted to, not the current campaign setting', async () => {
      jest.spyOn(sessionDiscordService, 'getDiscordSettings')
        .mockResolvedValue({ discord_channel_id: 'new-channel', discord_bot_token: 't' });
      sessionService.getSession.mockResolvedValue({
        id: 1, discord_message_id: 'm', discord_channel_id: 'old-channel', status: 'scheduled',
      });

      await sessionDiscordService.updateSessionMessage(1);

      expect(discordBroker.updateMessage.mock.calls[0][0].channelId).toBe('old-channel');
    });

    it('falls back to the campaign channel for sessions announced before the channel was stored', async () => {
      jest.spyOn(sessionDiscordService, 'getDiscordSettings')
        .mockResolvedValue({ discord_channel_id: 'campaign-channel', discord_bot_token: 't' });
      sessionService.getSession.mockResolvedValue({
        id: 1, discord_message_id: 'm', discord_channel_id: null, status: 'scheduled',
      });

      await sessionDiscordService.updateSessionMessage(1);

      expect(discordBroker.updateMessage.mock.calls[0][0].channelId).toBe('campaign-channel');
    });

    it('removes the buttons from a cancelled session message', async () => {
      jest.spyOn(sessionDiscordService, 'getDiscordSettings')
        .mockResolvedValue({ discord_channel_id: 'c', discord_bot_token: 't' });
      sessionService.getSession.mockResolvedValue({ id: 1, discord_message_id: 'm', status: 'cancelled' });

      await sessionDiscordService.updateSessionMessage(1);

      expect(discordBroker.updateMessage.mock.calls[0][0].components).toEqual([]);
    });
  });

  describe('createSessionEmbed attendance and status (F-0645, F-0658)', () => {
    const { DISCORD_EMBED_COLORS } = require('../../../constants/discordConstants');
    const session = {
      id: 7, title: 'T', description: null, status: 'confirmed', minimum_players: 4,
      start_time: '2026-11-01T19:00:00Z',
    };

    beforeEach(() => {
      mockExecuteQuery.mockResolvedValue({ rows: [] });
    });

    it('groups responses, labels late/early and falls back to the username', async () => {
      const embed = await sessionDiscordService.createSessionEmbed(session, [
        { response_type: 'yes', character_name: 'Valeros', username: 'a' },
        { response_type: 'late', character_name: null, username: 'bob' },
        { response_type: 'early', character_name: 'Seoni', username: 'c' },
        { response_type: 'late_and_early', character_name: 'Kyra', username: 'd' },
        { response_type: 'maybe', character_name: 'Ezren', username: 'e' },
        { response_type: 'no', character_name: null, username: 'f' },
      ]);

      const field = (prefix) => embed.fields.find(f => f.name.includes(prefix));
      expect(field('Attending (4)').value).toBe('Valeros\nbob (late)\nSeoni (early)\nKyra (late/early)');
      expect(field('Maybe (1)').value).toBe('Ezren');
      expect(field('Not Attending (1)').value).toBe('f');
      expect(embed.color).toBe(DISCORD_EMBED_COLORS.CONFIRMED);
    });

    it('uses the scheduled and cancelled colours', async () => {
      const scheduled = await sessionDiscordService.createSessionEmbed({ ...session, status: 'scheduled' }, []);
      const cancelled = await sessionDiscordService.createSessionEmbed(
        { ...session, status: 'cancelled', cancel_reason: 'Illness' }, []);

      expect(scheduled.color).toBe(DISCORD_EMBED_COLORS.SCHEDULED);
      expect(cancelled.color).toBe(DISCORD_EMBED_COLORS.CANCELLED);
      expect(cancelled.description).toContain('Illness');
    });
  });

  describe('recordReminder (F-0663)', () => {
    const cases = [
      ['auto', false, 'auto', 'non_responders'],
      ['non_responders', true, 'manual', 'non_responders'],
      ['maybe_responders', true, 'manual', 'maybe_responders'],
      ['all', true, 'manual', 'all'],
      ['followup', true, 'manual', 'all'],
    ];

    it.each(cases)('maps %s (manual=%s) to reminder_type %s and audience %s', async (type, isManual, recordType, audience) => {
      mockExecuteQuery.mockResolvedValue({ rows: [] });

      await sessionDiscordService.recordReminder(5, type, [{}, {}], { isManual });

      expect(mockExecuteQuery.mock.calls[0][1]).toEqual([5, recordType, isManual, audience]);
    });
  });

  describe('getDiscordSettings token (W06 follow-up)', () => {
    it('takes the bot token from the broker service, the single place that reads it', async () => {
      const discordBroker = require('../../discordBrokerService');
      discordBroker.getBotToken.mockResolvedValue('tok');
      mockExecuteQuery.mockResolvedValue({ rows: [] });

      const settings = await sessionDiscordService.getDiscordSettings();

      expect(settings.discord_bot_token).toBe('tok');
      expect(mockExecuteQuery.mock.calls.some(([q]) => String(q).includes('discord_bot_token'))).toBe(false);
    });

    it('leaves the token out when none is configured', async () => {
      const discordBroker = require('../../discordBrokerService');
      discordBroker.getBotToken.mockRejectedValue(new Error('Discord bot token not configured'));
      mockExecuteQuery.mockResolvedValue({ rows: [] });

      const settings = await sessionDiscordService.getDiscordSettings();

      expect(settings.discord_bot_token).toBeUndefined();
    });
  });

  describe('announcement/update result handling (F-0677)', () => {
    const discordBroker = require('../../discordBrokerService');
    const sessionService = require('../../sessionService');

    beforeEach(() => {
      sessionDiscordService.updateSessionMessage.mockRestore();
      jest.spyOn(sessionDiscordService, 'getDiscordSettings')
        .mockResolvedValue({ discord_channel_id: 'chan', discord_bot_token: 't' });
      jest.spyOn(sessionDiscordService, 'createSessionEmbed').mockResolvedValue({ color: 1, fields: [] });
      attendanceService.getSessionAttendance.mockResolvedValue([]);
    });

    it('updateSessionMessage resolves false when updateMessage returns a failure result', async () => {
      sessionService.getSession.mockResolvedValue({ id: 1, discord_message_id: 'm', status: 'scheduled' });
      discordBroker.updateMessage.mockResolvedValue({ success: false, error: { message: 'boom' } });

      await expect(sessionDiscordService.updateSessionMessage(1)).resolves.toBe(false);
    });

    it('updateSessionMessage resolves true on success', async () => {
      sessionService.getSession.mockResolvedValue({ id: 1, discord_message_id: 'm', status: 'scheduled' });
      discordBroker.updateMessage.mockResolvedValue({ success: true, data: {} });

      await expect(sessionDiscordService.updateSessionMessage(1)).resolves.toBe(true);
    });

    it('postSessionAnnouncement resolves null when sendMessage fails', async () => {
      sessionService.getSession.mockResolvedValue({ id: 1, discord_message_id: null });
      discordBroker.sendMessage.mockResolvedValue({ success: false, error: { message: 'boom' } });

      await expect(sessionDiscordService.postSessionAnnouncement(1)).resolves.toBeNull();
      expect(mockExecuteQuery).not.toHaveBeenCalled();
    });
  });
});
