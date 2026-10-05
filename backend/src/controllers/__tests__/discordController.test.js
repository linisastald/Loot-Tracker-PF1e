/**
 * Unit tests for discordController.sendMessage
 *
 * The controller posts to the requesting campaign's configured channel through
 * discordBrokerService (bot token lookup, rate limiting and the REST call live
 * there). The channel id is per-campaign (campaignSettings helper, with a
 * global fallback when no per-campaign row exists).
 */

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../services/discordBrokerService', () => ({
  getBotToken: jest.fn(),
  sendMessage: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const logger = require('../../utils/logger');
const discordService = require('../../services/discordBrokerService');
const discordController = require('../discordController');

function createMockRes() {
  return {
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    forbidden: jest.fn(),
    error: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

function createMockReq(overrides = {}) {
  const req = {
    body: {},
    params: {},
    query: {},
    cookies: {},
    user: { role: 'Player' },
    ...overrides,
  };
  if (req.campaignRole === undefined && req.user) req.campaignRole = req.user.role;
  return req;
}

/** Per-campaign channel read: one campaign_settings row (or none, then no global row). */
function mockChannel(channel) {
  dbUtils.executeQuery.mockResolvedValueOnce({ rows: channel !== undefined ? [{ value: channel }] : [] });
  if (channel === undefined) {
    // Helper consults the deprecated global row when the campaign has none
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
  }
}

const failure = (status, data = {}) => ({
  success: false,
  message: 'discord said no',
  error: { code: 'DISCORD_API_ERROR', originalError: { response: { status, data } } },
});

describe('discordController.sendMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    discordService.getBotToken.mockResolvedValue('bot-token-123');
  });

  it('lets a Player post to the campaign channel, ignoring a supplied channel_id', async () => {
    const req = createMockReq({ body: { content: 'hi', channel_id: '999999999999999999' } });
    const res = createMockRes();
    mockChannel('123456789012345678');
    discordService.sendMessage.mockResolvedValueOnce({ success: true, data: { id: 'msg-1' } });

    await discordController.sendMessage(req, res);

    expect(res.forbidden).not.toHaveBeenCalled();
    expect(discordService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: '123456789012345678', content: 'hi' })
    );
    expect(res.success).toHaveBeenCalledWith(
      { message_id: 'msg-1', channel_id: '123456789012345678' },
      'Message sent to Discord successfully'
    );
  });

  it('sends with allowed_mentions that parse nothing', async () => {
    const req = createMockReq({ body: { content: '@everyone hi' } });
    mockChannel('123456789012345678');
    discordService.sendMessage.mockResolvedValueOnce({ success: true, data: { id: 'msg-1' } });

    await discordController.sendMessage(req, createMockRes());

    expect(discordService.sendMessage.mock.calls[0][0].allowedMentions).toEqual({ parse: [] });
  });

  it('reads the channel id from campaign_settings (per-campaign scope)', async () => {
    const req = createMockReq({ body: { content: 'Hello!' } });
    mockChannel('123456789012345678');
    discordService.sendMessage.mockResolvedValueOnce({ success: true, data: { id: 'msg-1' } });

    await discordController.sendMessage(req, createMockRes());

    expect(dbUtils.executeQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM campaign_settings'),
      ['1', 'discord_channel_id']
    );
  });

  it('falls back to the global channel row when the campaign has none', async () => {
    const req = createMockReq({ body: { content: 'Hello!' } });
    dbUtils.executeQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ value: '223456789012345678' }] });
    discordService.sendMessage.mockResolvedValueOnce({ success: true, data: { id: 'msg-2' } });

    await discordController.sendMessage(req, createMockRes());

    expect(discordService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: '223456789012345678' })
    );
  });

  it('passes a flat array of embeds through', async () => {
    const embeds = [{ title: 'Test Embed', description: 'Desc' }];
    const req = createMockReq({ body: { embeds } });
    const res = createMockRes();
    mockChannel('123456789012345678');
    discordService.sendMessage.mockResolvedValueOnce({ success: true, data: { id: 'msg-001' } });

    await discordController.sendMessage(req, res);

    expect(discordService.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ embeds }));
    expect(res.success).toHaveBeenCalled();
  });

  it('returns a validation error when neither content nor embeds are provided', async () => {
    const res = createMockRes();

    await discordController.sendMessage(createMockReq({ body: {} }), res);

    expect(res.validationError).toHaveBeenCalledWith('Either message content or embeds are required');
    expect(discordService.sendMessage).not.toHaveBeenCalled();
  });

  it('returns a validation error when embeds is an empty array and there is no content', async () => {
    const res = createMockRes();

    await discordController.sendMessage(createMockReq({ body: { embeds: [] } }), res);

    expect(res.validationError).toHaveBeenCalledWith('Either message content or embeds are required');
  });

  it('returns a validation error when the bot token is not configured', async () => {
    const res = createMockRes();
    discordService.getBotToken.mockRejectedValueOnce(new Error('Discord bot token not configured'));

    await discordController.sendMessage(createMockReq({ body: { content: 'Hello' } }), res);

    expect(res.validationError).toHaveBeenCalledWith('Discord bot token is not configured');
    expect(discordService.sendMessage).not.toHaveBeenCalled();
  });

  it('returns a validation error when no channel is configured', async () => {
    const res = createMockRes();
    mockChannel(undefined);

    await discordController.sendMessage(createMockReq({ body: { content: 'Hello' } }), res);

    expect(res.validationError).toHaveBeenCalledWith('Discord channel ID is not configured');
    expect(discordService.sendMessage).not.toHaveBeenCalled();
  });

  it('returns forbidden on a Discord 403', async () => {
    const res = createMockRes();
    mockChannel('123456789012345678');
    discordService.sendMessage.mockResolvedValueOnce(failure(403));

    await discordController.sendMessage(createMockReq({ body: { content: 'Hello' } }), res);

    expect(res.forbidden).toHaveBeenCalledWith('Bot lacks permission to send messages to this channel');
  });

  it('returns not found on a Discord 404', async () => {
    const res = createMockRes();
    mockChannel('123456789012345678');
    discordService.sendMessage.mockResolvedValueOnce(failure(404));

    await discordController.sendMessage(createMockReq({ body: { content: 'Hello' } }), res);

    expect(res.notFound).toHaveBeenCalledWith('Discord channel not found');
  });

  it('reports a Discord 429 as a 429, not a validation error', async () => {
    const res = createMockRes();
    mockChannel('123456789012345678');
    discordService.sendMessage.mockResolvedValueOnce(failure(429));

    await discordController.sendMessage(createMockReq({ body: { content: 'Hello' } }), res);

    expect(res.error).toHaveBeenCalledWith(expect.stringContaining('rate limiting'), 429);
    expect(res.validationError).not.toHaveBeenCalled();
  });

  it('does not echo Discord error bodies or log the payload on a 400', async () => {
    const res = createMockRes();
    mockChannel('123456789012345678');
    discordService.sendMessage.mockResolvedValueOnce(
      failure(400, { code: 50035, message: 'secret-detail', errors: { embeds: 'x' } })
    );

    await discordController.sendMessage(createMockReq({ body: { content: 'sensitive text' } }), res);

    expect(res.validationError).toHaveBeenCalledWith('Discord rejected the message');
    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).not.toContain('secret-detail');
    expect(logged).not.toContain('sensitive text');
    expect(logged).toContain('50035');
  });

  it('returns a generic error on an unknown Discord failure', async () => {
    const res = createMockRes();
    mockChannel('123456789012345678');
    discordService.sendMessage.mockResolvedValueOnce({
      success: false, message: 'Network Error', error: { code: 'DISCORD_API_ERROR', originalError: new Error('Network Error') },
    });

    await discordController.sendMessage(createMockReq({ body: { content: 'Hello' } }), res);

    expect(res.error).toHaveBeenCalledWith('Internal server error');
  });
});
