const mockCreate = jest.fn();
const mockConstructor = jest.fn();

jest.mock('openai', () => ({
  OpenAI: jest.fn(),
}));

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const { OpenAI } = require('openai');
const dbUtils = require('../../utils/dbUtils');
const logger = require('../../utils/logger');
const { parseItemDescriptionWithGPT, ItemParsingUnavailableError, REQUEST_TIMEOUT_MS } = require('../parseItemDescriptionWithGPT');

const completion = (content) => ({ choices: [{ message: { content } }] });
const allLogged = () => JSON.stringify(
  ['error', 'warn', 'info', 'debug'].map((level) => logger[level].mock.calls)
);

describe('parseItemDescriptionWithGPT', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    OpenAI.mockImplementation(function (options) {
      mockConstructor(options);
      return { chat: { completions: { create: mockCreate } } };
    });
    dbUtils.executeQuery.mockResolvedValue({
      rows: [{ value: Buffer.from('sk-test-secret-key').toString('base64'), value_type: 'encrypted' }],
    });
  });

  it('returns the parsed JSON reply', async () => {
    mockCreate.mockResolvedValueOnce(completion('{"mods":["+1","Flaming"],"item":"Longsword"}'));

    await expect(parseItemDescriptionWithGPT('+1 Flaming Longsword')).resolves.toEqual({
      mods: ['+1', 'Flaming'],
      item: 'Longsword',
    });
  });

  it('creates the client with a bounded timeout and no automatic retries', async () => {
    mockCreate.mockResolvedValueOnce(completion('{"mods":[],"item":"Rope"}'));

    await parseItemDescriptionWithGPT('Rope');

    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    expect(mockConstructor).toHaveBeenCalledWith({
      apiKey: 'sk-test-secret-key',
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 0,
    });
  });

  it('asks for a JSON object and leaves room for several mods', async () => {
    mockCreate.mockResolvedValueOnce(completion('{"mods":[],"item":"Rope"}'));

    await parseItemDescriptionWithGPT('Rope');

    const params = mockCreate.mock.calls[0][0];
    expect(params.model).toBe('gpt-3.5-turbo');
    expect(params.response_format).toEqual({ type: 'json_object' });
    expect(params.max_tokens).toBeGreaterThanOrEqual(256);
  });

  it('turns a timeout into a clean, user-presentable error', async () => {
    const timeout = new Error('Request timed out.');
    timeout.name = 'APIConnectionTimeoutError';
    mockCreate.mockRejectedValueOnce(timeout);

    const error = await parseItemDescriptionWithGPT('+1 Sword').catch((e) => e);

    expect(error).toBeInstanceOf(ItemParsingUnavailableError);
    expect(error.status).toBe(504);
    expect(error.message).toMatch(/timed out/i);
    expect(error.message).not.toMatch(/sk-/);
  });

  it('turns an upstream failure into a clean error without the provider message', async () => {
    mockCreate.mockRejectedValueOnce(new Error('401 Incorrect API key provided: sk-test-secret-key'));

    const error = await parseItemDescriptionWithGPT('+1 Sword').catch((e) => e);

    expect(error).toBeInstanceOf(ItemParsingUnavailableError);
    expect(error.status).toBe(502);
    expect(error.message).not.toContain('sk-test-secret-key');
  });

  it('turns an unparseable reply into a clean error instead of a SyntaxError', async () => {
    mockCreate.mockResolvedValueOnce(completion('{"mods":["+1","Flam'));

    const error = await parseItemDescriptionWithGPT('+1 Flaming Sword').catch((e) => e);

    expect(error).toBeInstanceOf(ItemParsingUnavailableError);
    expect(error.status).toBe(502);
    expect(error.name).not.toBe('SyntaxError');
  });

  it('accepts a reply wrapped in a markdown code fence', async () => {
    mockCreate.mockResolvedValueOnce(completion('```json\n{"mods":["+1"],"item":"Dagger"}\n```'));

    await expect(parseItemDescriptionWithGPT('+1 Dagger')).resolves.toEqual({ mods: ['+1'], item: 'Dagger' });
  });

  it('reports a missing key as unavailable without calling OpenAI', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

    const error = await parseItemDescriptionWithGPT('Rope').catch((e) => e);

    expect(error).toBeInstanceOf(ItemParsingUnavailableError);
    expect(error.status).toBe(503);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('never logs the user text above debug level, nor the API key anywhere', async () => {
    mockCreate.mockResolvedValueOnce(completion('{"mods":["+1"],"item":"Secret Blade"}'));

    await parseItemDescriptionWithGPT('+1 Secret Blade of my campaign');

    for (const level of ['error', 'warn', 'info']) {
      expect(JSON.stringify(logger[level].mock.calls)).not.toContain('Secret Blade');
    }
    expect(allLogged()).not.toContain('sk-test-secret-key');
  });
});
