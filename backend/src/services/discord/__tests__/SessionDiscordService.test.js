/**
 * Unit tests for SessionDiscordService.processDiscordReaction
 * (multi-campaign Phase 3c)
 *
 * Inbound Discord reactions arrive over HTTP without verifyToken, so the
 * service must resolve the message to its session under the hardcoded
 * cross-campaign context ('all') and then act under the session's campaign.
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
  addReaction: jest.fn(),
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

describe('SessionDiscordService.processDiscordReaction campaign context', () => {
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

  it('resolves the session under "all" and records attendance under the session campaign', async () => {
    const seenContexts = [];
    mockExecuteQuery.mockImplementation(async (query) => {
      seenContexts.push({ query, context: activeCampaign });
      if (query.includes('FROM game_sessions')) {
        return { rows: [{ id: 33, campaign_id: 4 }] };
      }
      if (query.includes('FROM session_config')) {
        return { rows: [] }; // default reaction map
      }
      if (query.includes('FROM users')) {
        return { rows: [{ id: 9 }] };
      }
      return { rows: [], rowCount: 0 };
    });
    attendanceService.getActiveCharacterInCampaign.mockResolvedValue(77);
    attendanceService.recordAttendance.mockImplementation(async () => {
      expect(activeCampaign).toBe('4');
    });

    await sessionDiscordService.processDiscordReaction('111111111111111111', '222', '✅', 'add');

    // Cross-campaign resolution first, then the session's campaign
    expect(contextIds()).toEqual(['all', '4']);

    // The session lookup selects campaign_id explicitly and runs under 'all'
    const sessionLookup = seenContexts.find(c => c.query.includes('FROM game_sessions'));
    expect(sessionLookup.query).toContain('campaign_id');
    expect(sessionLookup.context).toBe('all');

    // session_config (RLS campaign-scoped) and the reaction tracking insert
    // run under the session's campaign
    const configRead = seenContexts.find(c => c.query.includes('FROM session_config'));
    expect(configRead.context).toBe('4');
    const trackingInsert = seenContexts.find(c => c.query.includes('discord_reaction_tracking'));
    expect(trackingInsert.context).toBe('4');

    // The membership gate is checked under the session's campaign
    expect(attendanceService.getActiveCharacterInCampaign).toHaveBeenCalledWith(9, 4);
    expect(attendanceService.recordAttendance).toHaveBeenCalledWith(
      33, 9, 'yes', { discord_id: '222', character_id: 77 }
    );
    expect(sessionDiscordService.updateSessionMessage).toHaveBeenCalledWith(33);
  });

  it('ignores a reaction from a user with no active character in the session campaign', async () => {
    mockExecuteQuery.mockImplementation(async (query) => {
      if (query.includes('FROM game_sessions')) {
        return { rows: [{ id: 33, campaign_id: 4 }] };
      }
      if (query.includes('FROM session_config')) {
        return { rows: [] };
      }
      if (query.includes('FROM users')) {
        return { rows: [{ id: 9 }] };
      }
      return { rows: [], rowCount: 0 };
    });
    // User belongs to no character in campaign 4 -> not a member
    attendanceService.getActiveCharacterInCampaign.mockResolvedValue(null);

    await sessionDiscordService.processDiscordReaction('111111111111111111', '222', '✅', 'add');

    expect(attendanceService.getActiveCharacterInCampaign).toHaveBeenCalledWith(9, 4);
    expect(attendanceService.recordAttendance).not.toHaveBeenCalled();
    // No reaction-tracking row written for a rejected response
    const trackingInsert = mockExecuteQuery.mock.calls.find(
      ([q]) => typeof q === 'string' && q.includes('discord_reaction_tracking')
    );
    expect(trackingInsert).toBeUndefined();
  });

  it('removes attendance under the session campaign on reaction removal', async () => {
    const removalContexts = [];
    mockExecuteQuery.mockImplementation(async (query) => {
      if (query.includes('FROM game_sessions')) {
        return { rows: [{ id: 33, campaign_id: 2 }] };
      }
      if (query.includes('FROM session_config')) {
        return { rows: [] };
      }
      if (query.includes('FROM users')) {
        return { rows: [{ id: 9 }] };
      }
      if (query.includes('DELETE')) {
        removalContexts.push(activeCampaign);
      }
      return { rows: [], rowCount: 0 };
    });

    await sessionDiscordService.processDiscordReaction('111111111111111111', '222', '❌', 'remove');

    expect(contextIds()).toEqual(['all', '2']);
    // Both DELETEs (session_attendance + discord_reaction_tracking) under campaign 2
    expect(removalContexts).toEqual(['2', '2']);
    expect(attendanceService.recordAttendance).not.toHaveBeenCalled();
  });

  it('does not establish a per-campaign context when no session matches', async () => {
    mockExecuteQuery.mockResolvedValueOnce({ rows: [] });

    await sessionDiscordService.processDiscordReaction('111111111111111111', '222', '✅', 'add');

    expect(contextIds()).toEqual(['all']);
    expect(logger.warn).toHaveBeenCalledWith('Session not found for message:', { messageId: '111111111111111111' });
    expect(attendanceService.recordAttendance).not.toHaveBeenCalled();
  });

  it('swallows errors without throwing (Discord must always get a 200)', async () => {
    mockExecuteQuery.mockRejectedValueOnce(new Error('DB down'));

    await expect(
      sessionDiscordService.processDiscordReaction('111111111111111111', '222', '✅', 'add')
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith('Failed to process Discord reaction:', expect.any(Error));
  });

  // -----------------------------------------------------------------
  // getDiscordSettings (Phase 4c: per-campaign channel/role split)
  // -----------------------------------------------------------------
  describe('getDiscordSettings', () => {
    it('reads the bot token globally and the channel/role ids from campaign_settings under the active campaign', async () => {
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
});
