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

    expect(attendanceService.recordAttendance).toHaveBeenCalledWith(
      33, 9, 'yes', { discord_id: '222' }
    );
    expect(sessionDiscordService.updateSessionMessage).toHaveBeenCalledWith(33);
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
});
