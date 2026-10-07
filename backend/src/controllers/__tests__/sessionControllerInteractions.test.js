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

  it('refuses a linked user with no active character in the session campaign', async () => {
    mockExecuteQuery.mockImplementation(async (query) => {
      if (query.includes('FROM game_sessions')) {
        return { rows: [{ id: 50, campaign_id: 6 }] };
      }
      if (query.includes('FROM users')) {
        return { rows: [{ id: 7, username: 'bob' }] };
      }
      if (query.includes('FROM characters')) {
        return { rows: [] }; // user has no character in this campaign
      }
      return { rows: [], rowCount: 0 };
    });

    const res = makeRes();
    await sessionController.processSessionInteraction(buttonRequest(), res);

    // No attendance recorded, ephemeral refusal returned
    expect(sessionService.recordAttendance).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 4,
        data: expect.objectContaining({
          content: expect.stringContaining("not in this campaign"),
          flags: 64,
        }),
      })
    );
  });

  it('offers only this campaign characters and refuses when the campaign has none', async () => {
    const seenQueries = [];
    mockExecuteQuery.mockImplementation(async (query, params) => {
      seenQueries.push({ query, params });
      if (query.includes('FROM game_sessions')) {
        return { rows: [{ id: 50, campaign_id: 6 }] };
      }
      if (query.includes('FROM users WHERE discord_id')) {
        return { rows: [] }; // unlinked Discord account
      }
      if (query.includes('FROM characters')) {
        return { rows: [] }; // no characters in this campaign
      }
      return { rows: [], rowCount: 0 };
    });

    const res = makeRes();
    await sessionController.processSessionInteraction(buttonRequest(), res);

    // The offered-characters lookup is campaign-scoped
    const charLookup = seenQueries.find(q => q.query.includes('FROM characters'));
    expect(charLookup.query).toContain('campaign_id');
    expect(charLookup.params).toEqual(['6']);
    // Opus review M-7: only characters whose owning account has no Discord id yet
    expect(charLookup.query).toMatch(/u\.discord_id IS NULL/);

    expect(sessionService.recordAttendance).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 4,
        data: expect.objectContaining({
          // tells the player to ask the DM or link from User Settings
          content: expect.stringMatching(/ask your DM.*User Settings/i),
          flags: 64,
        }),
      })
    );
  });

  it('lists only the character names (no owner usernames) in the link menu', async () => {
    mockExecuteQuery.mockImplementation(async (query) => {
      if (query.includes('FROM game_sessions')) return { rows: [{ id: 50, campaign_id: 6 }] };
      if (query.includes('FROM users WHERE discord_id')) return { rows: [] };
      if (query.includes('FROM characters')) {
        return { rows: [{ id: 5, name: 'Valeros', username: 'secret_player_name' }] };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = makeRes();
    await sessionController.processSessionInteraction(buttonRequest(), res);

    const payload = res.json.mock.calls[0][0];
    const options = payload.data.components[0].components[0].options;
    expect(options).toEqual([{ label: 'Valeros', value: '5' }]);
    expect(JSON.stringify(payload)).not.toContain('secret_player_name');
  });

  it('answers a button on a message that is not a current session with an ephemeral "no longer active" reply', async () => {
    const seenQueries = [];
    mockExecuteQuery.mockImplementation(async (query) => {
      seenQueries.push(query);
      return { rows: [], rowCount: 0 };
    });

    // session_yes / session_no / session_maybe were the retired announcement buttons
    for (const customId of ['session_yes', 'session_no', 'session_maybe', 'session_attend_yes']) {
      const res = makeRes();
      await sessionController.processSessionInteraction(buttonRequest(customId), res);
      expect(res.json).toHaveBeenCalledWith({
        type: 4,
        data: { content: 'This session announcement is no longer active.', flags: 64 },
      });
    }
    expect(seenQueries.some(q => q.includes('session_messages'))).toBe(false);
    expect(sessionService.recordAttendance).not.toHaveBeenCalled();
  });

  it('replies "no longer active" without entering a per-campaign context when nothing matches', async () => {
    mockExecuteQuery.mockResolvedValue({ rows: [] });

    const res = makeRes();
    await sessionController.processSessionInteraction(buttonRequest(), res);

    expect(contextIds()).toEqual(['all']);
    expect(res.json).toHaveBeenCalledWith({
      type: 4,
      data: { content: 'This session announcement is no longer active.', flags: 64 },
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
      if (query.includes('UPDATE users SET discord_id')) {
        return { rows: [], rowCount: 1 };
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

  it('refuses to relink when the character owner already has a different Discord id', async () => {
    mockExecuteQuery.mockImplementation(async (query) => {
      if (query.includes('FROM game_sessions')) {
        return { rows: [{ id: 50, campaign_id: 4 }] };
      }
      if (query.includes('FROM characters')) {
        return { rows: [{ user_id: 7, name: 'Valeros' }] };
      }
      if (query.includes('SELECT discord_id FROM users WHERE id')) {
        return { rows: [{ discord_id: '111111111111111111' }] };
      }
      if (query.includes('FROM users WHERE discord_id')) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    const req = {
      headers: {},
      body: {
        type: 3,
        data: { custom_id: `link_character_${ENHANCED_MESSAGE_ID}_999888777666555444`, values: ['3'] },
        member: { user: { id: '999888777666555444' } },
      },
    };
    const res = makeRes();
    await sessionController.processSessionInteraction(req, res);

    expect(mockExecuteQuery.mock.calls.some(c => String(c[0]).includes('UPDATE users SET discord_id'))).toBe(false);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: expect.stringContaining('already linked') }),
      })
    );
  });

  it('refuses to link when the originating session message cannot be resolved to a campaign', async () => {
    mockExecuteQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const req = {
      headers: {},
      body: {
        type: 3,
        data: { custom_id: `link_character_${ENHANCED_MESSAGE_ID}_999888777666555444`, values: ['3'] },
        member: { user: { id: '999888777666555444' } },
      },
    };
    const res = makeRes();
    await sessionController.processSessionInteraction(req, res);

    expect(res.json.mock.calls[0][0].data.content).toContain('Could not determine the campaign');
    expect(mockExecuteQuery.mock.calls.some(c => String(c[0]).includes('UPDATE users SET discord_id'))).toBe(false);
  });

  it('does not report success when the linked character has no owner account', async () => {
    mockExecuteQuery.mockImplementation(async (query) => {
      if (query.includes('FROM game_sessions')) return { rows: [{ id: 50, campaign_id: 4 }] };
      if (query.includes('FROM characters')) return { rows: [{ user_id: null, name: 'Orphan' }] };
      return { rows: [], rowCount: 0 };
    });
    const req = {
      headers: {},
      body: {
        type: 3,
        data: { custom_id: `link_character_${ENHANCED_MESSAGE_ID}_999888777666555444`, values: ['3'] },
        member: { user: { id: '999888777666555444' } },
      },
    };
    const res = makeRes();
    await sessionController.processSessionInteraction(req, res);

    expect(mockExecuteQuery.mock.calls.some(c => String(c[0]).includes('UPDATE users SET discord_id'))).toBe(false);
    expect(res.json.mock.calls[0][0].data.content).toContain('no player account');
  });

  it('reports failure when the guarded link UPDATE changes no row', async () => {
    mockExecuteQuery.mockImplementation(async (query) => {
      if (query.includes('FROM game_sessions')) return { rows: [{ id: 50, campaign_id: 4 }] };
      if (query.includes('FROM characters')) return { rows: [{ user_id: 7, name: 'Valeros' }] };
      if (query.includes('SELECT discord_id FROM users WHERE id')) return { rows: [{ discord_id: null }] };
      if (query.includes('UPDATE users SET discord_id')) {
        expect(query).toContain('discord_id IS NULL');
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const req = {
      headers: {},
      body: {
        type: 3,
        data: { custom_id: `link_character_${ENHANCED_MESSAGE_ID}_999888777666555444`, values: ['3'] },
        member: { user: { id: '999888777666555444' } },
      },
    };
    const res = makeRes();
    await sessionController.processSessionInteraction(req, res);
    expect(res.json.mock.calls[0][0].data.content).toContain('could not be linked');
  });

  it('replaces other reaction rows when they switch response', async () => {
    mockExecuteQuery.mockImplementation(async (query) => {
      if (query.includes('FROM game_sessions')) return { rows: [{ id: 50, campaign_id: 6 }] };
      if (query.includes('FROM users')) return { rows: [{ id: 7, username: 'bob' }] };
      if (query.includes('FROM characters')) return { rows: [{ id: 3 }] };
      return { rows: [], rowCount: 0 };
    });
    sessionService.recordAttendance.mockResolvedValue({});
    sessionService.getSession.mockResolvedValue({ id: 50 });
    sessionService.getSessionAttendance.mockResolvedValue([]);
    sessionDiscordService.createSessionEmbed.mockResolvedValue({});
    sessionDiscordService.createAttendanceButtons.mockReturnValue([]);

    await sessionController.processSessionInteraction(buttonRequest('session_attend_no'), makeRes());

    const del = mockExecuteQuery.mock.calls.find(c => String(c[0]).includes('DELETE FROM discord_reaction_tracking'));
    expect(del[1]).toEqual([ENHANCED_MESSAGE_ID, '999888777666555444', '❌']);
  });
});
