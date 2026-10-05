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
