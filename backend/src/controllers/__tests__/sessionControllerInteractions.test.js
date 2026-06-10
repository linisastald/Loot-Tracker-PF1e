/**
 * Unit tests for sessionController.processSessionInteraction
 * (multi-campaign Phase 3c)
 *
 * The /api/discord/interactions endpoint is called by the Discord broker
 * WITHOUT verifyToken, so no request campaign context exists. The controller
 * must resolve the referenced Discord message to its campaign under the
 * hardcoded cross-campaign context ('all') and process the interaction under
 * that campaign.
 */

const mockExecuteQuery = jest.fn();

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: (...args) => mockExecuteQuery(...args),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

jest.mock('../../utils/campaignContext', () => ({
  runWithCampaign: jest.fn(),
  getCampaignId: jest.fn(),
}));

jest.mock('../../models/Session', () => ({}));

jest.mock('../../services/sessionService', () => ({
  recordAttendance: jest.fn(),
  getSession: jest.fn(),
  getSessionAttendance: jest.fn(),
}));

jest.mock('../../services/discord/SessionDiscordService', () => ({
  createSessionEmbed: jest.fn(),
  createAttendanceButtons: jest.fn(),
}));

jest.mock('axios', () => ({
  post: jest.fn(),
  patch: jest.fn(),
}));

const campaignContext = require('../../utils/campaignContext');
const sessionService = require('../../services/sessionService');
const sessionDiscordService = require('../../services/discord/SessionDiscordService');

const sessionController = require('../sessionController');

const ENHANCED_MESSAGE_ID = '123456789012345678';

let activeCampaign;

const contextIds = () => campaignContext.runWithCampaign.mock.calls.map(call => call[0]);

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const buttonRequest = (customId = 'session_attend_yes') => ({
  headers: {},
  body: {
    type: 3,
    data: { custom_id: customId },
    member: { user: { id: '999888777666555444', username: 'bob' }, nick: 'Bob' },
    message: { id: ENHANCED_MESSAGE_ID },
  },
});

describe('processSessionInteraction campaign context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteQuery.mockReset();
    activeCampaign = null;

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

  it('resolves an enhanced session under "all" and records attendance under its campaign', async () => {
    const seenQueries = [];
    mockExecuteQuery.mockImplementation(async (query, params) => {
      seenQueries.push({ query, context: activeCampaign });
      if (query.includes('FROM game_sessions')) {
        return { rows: [{ id: 50, campaign_id: 6 }] };
      }
      if (query.includes('FROM users')) {
        return { rows: [{ id: 7, username: 'bob' }] };
      }
      if (query.includes('FROM characters')) {
        return { rows: [{ id: 3 }] };
      }
      return { rows: [], rowCount: 0 };
    });

    sessionService.recordAttendance.mockImplementation(async () => {
      expect(activeCampaign).toBe('6');
    });
    sessionService.getSession.mockResolvedValue({ id: 50, status: 'scheduled' });
    sessionService.getSessionAttendance.mockResolvedValue([]);
    sessionDiscordService.createSessionEmbed.mockResolvedValue({ title: 'embed' });
    sessionDiscordService.createAttendanceButtons.mockReturnValue([]);

    const res = makeRes();
    await sessionController.processSessionInteraction(buttonRequest(), res);

    // Resolution under 'all', then all processing under the session's campaign
    expect(contextIds()).toEqual(['all', '6']);

    // Session lookup ran cross-campaign and selects campaign_id explicitly
    const sessionLookup = seenQueries.find(q => q.query.includes('FROM game_sessions'));
    expect(sessionLookup.context).toBe('all');
    expect(sessionLookup.query).toContain('campaign_id');

    // Campaign-scoped reads/writes ran under campaign 6
    const characterLookup = seenQueries.find(q => q.query.includes('FROM characters'));
    expect(characterLookup.context).toBe('6');
    const trackingInsert = seenQueries.find(q => q.query.includes('discord_reaction_tracking'));
    expect(trackingInsert.context).toBe('6');

    expect(sessionService.recordAttendance).toHaveBeenCalledWith(
      50, 7, 'yes', { discord_id: '999888777666555444', character_id: 3 }
    );

    // Immediate embed update returned
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ type: 7 })
    );
  });

  it('processes a legacy session_messages interaction under the legacy row campaign', async () => {
    const seenQueries = [];
    mockExecuteQuery.mockImplementation(async (query) => {
      seenQueries.push({ query, context: activeCampaign });
      if (query.includes('FROM game_sessions')) {
        return { rows: [] }; // no enhanced session
      }
      if (query.includes('FROM session_messages')) {
        return {
          rows: [{
            session_date: new Date().toISOString(),
            session_time: new Date().toISOString(),
            responses: '{}',
            campaign_id: 3,
          }],
        };
      }
      if (query.includes('FROM users')) {
        return { rows: [{ id: 7, username: 'bob' }] };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = makeRes();
    await sessionController.processSessionInteraction(buttonRequest('session_yes'), res);

    expect(contextIds()).toEqual(['all', '3']);

    // Legacy fallback lookup selects campaign_id and runs under 'all'
    const legacyLookup = seenQueries.find(q => q.query.includes('FROM session_messages'));
    expect(legacyLookup.context).toBe('all');
    expect(legacyLookup.query).toContain('campaign_id');

    // The legacy responses UPDATE runs under campaign 3
    const responsesUpdate = seenQueries.find(q => q.query.includes('UPDATE session_messages'));
    expect(responsesUpdate.context).toBe('3');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ type: 4 })
    );
  });

  it('returns "Session not found." without entering a per-campaign context when nothing matches', async () => {
    mockExecuteQuery.mockResolvedValue({ rows: [] });

    const res = makeRes();
    await sessionController.processSessionInteraction(buttonRequest(), res);

    expect(contextIds()).toEqual(['all']);
    expect(res.json).toHaveBeenCalledWith({
      type: 4,
      data: { content: 'Session not found.', flags: 64 },
    });
    expect(sessionService.recordAttendance).not.toHaveBeenCalled();
  });

  it('resolves the character-link select menu campaign from the embedded message id', async () => {
    const seenQueries = [];
    mockExecuteQuery.mockImplementation(async (query) => {
      seenQueries.push({ query, context: activeCampaign });
      if (query.includes('FROM game_sessions')) {
        return { rows: [{ id: 50, campaign_id: 4 }] };
      }
      if (query.includes('FROM characters')) {
        return { rows: [{ user_id: 7, name: 'Valeros' }] };
      }
      if (query.includes('FROM users WHERE discord_id')) {
        return { rows: [] }; // not yet linked
      }
      return { rows: [], rowCount: 0 };
    });

    const req = {
      headers: {},
      body: {
        type: 3,
        data: {
          custom_id: `link_character_${ENHANCED_MESSAGE_ID}_999888777666555444`,
          values: ['3'],
        },
        member: { user: { id: '999888777666555444' } },
      },
    };

    const res = makeRes();
    await sessionController.processSessionInteraction(req, res);

    expect(contextIds()).toEqual(['all', '4']);

    // The campaign-scoped characters lookup ran under the resolved campaign
    const characterLookup = seenQueries.find(q => q.query.includes('FROM characters'));
    expect(characterLookup.context).toBe('4');

    // Link succeeded
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 4,
        data: expect.objectContaining({
          content: expect.stringContaining('linked'),
        }),
      })
    );
  });
});
