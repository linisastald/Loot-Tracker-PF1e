const logger = require('../../utils/logger');
const { parseAllowedOrigins, createOriginCheck, hasWildcard } = require('../cors');

describe('parseAllowedOrigins', () => {
  it('defaults to the local dev origin', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:3000']);
    expect(parseAllowedOrigins('')).toEqual(['http://localhost:3000']);
  });

  it('trims whitespace around entries and drops empty ones', () => {
    expect(parseAllowedOrigins('https://a.example, https://b.example ,,')).toEqual(['https://a.example', 'https://b.example']);
  });
});

describe('createOriginCheck', () => {
  const check = createOriginCheck(['https://a.example', 'https://b.example']);
  const run = (origin) => new Promise(resolve => check(origin, (err, ok) => resolve({ err, ok })));

  it('allows requests without an Origin header (same-origin, curl, server-to-server)', async () => {
    expect(await run(undefined)).toEqual({ err: null, ok: true });
  });

  it('allows listed origins, including the one that follows a comma-space separator', async () => {
    expect((await run('https://a.example')).ok).toBe(true);
    expect((await run('https://b.example')).ok).toBe(true);
  });

  it('rejects other origins with a 403 error that has a public message, and logs it', async () => {
    const { err } = await run('https://evil.example');
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.publicMessage).toBe('Not allowed by CORS');
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('wildcard entry (no longer honoured)', () => {
  const run = (check, origin) => new Promise(resolve => check(origin, (err, ok) => resolve({ err, ok })));

  it('rejects a cross-origin request even when * is listed', async () => {
    const { err, ok } = await run(createOriginCheck(['*']), 'https://anything.example');
    expect(ok).toBeUndefined();
    expect(err.status).toBe(403);
  });

  it('still allows a listed origin alongside a stray *', async () => {
    expect((await run(createOriginCheck(['*', 'https://a.example']), 'https://a.example')).ok).toBe(true);
  });

  it('still allows requests with no Origin header when * is listed', async () => {
    expect(await run(createOriginCheck(['*']), undefined)).toEqual({ err: null, ok: true });
  });

  it('hasWildcard still reports the entry so startup checks can refuse it', () => {
    expect(hasWildcard(['*'])).toBe(true);
    expect(hasWildcard(['https://a.example'])).toBe(false);
  });
});
