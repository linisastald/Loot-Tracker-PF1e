/**
 * Tests for the shared-secret middleware guarding the broker-to-backend
 * Discord routes (S1: F-0113..F-0116, F-0410, F-0414).
 */
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const { verifyBrokerSecret, secretsMatch } = require('../brokerAuth');

const makeReq = (secret) => ({
  path: '/interactions',
  get: (name) => (name.toLowerCase() === 'x-broker-secret' ? secret : undefined),
});
const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('verifyBrokerSecret', () => {
  const origSecret = process.env.DISCORD_BROKER_SECRET;
  const origEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (origSecret === undefined) delete process.env.DISCORD_BROKER_SECRET;
    else process.env.DISCORD_BROKER_SECRET = origSecret;
    process.env.NODE_ENV = origEnv;
  });

  it('rejects a request without the secret header when a secret is configured', () => {
    process.env.DISCORD_BROKER_SECRET = 's3cret';
    const res = makeRes();
    const next = jest.fn();
    verifyBrokerSecret(makeReq(undefined), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', () => {
    process.env.DISCORD_BROKER_SECRET = 's3cret';
    const res = makeRes();
    const next = jest.fn();
    verifyBrokerSecret(makeReq('wrong'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts the correct secret', () => {
    process.env.DISCORD_BROKER_SECRET = 's3cret';
    const res = makeRes();
    const next = jest.fn();
    verifyBrokerSecret(makeReq('s3cret'), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('fails closed in production when the secret is unset', () => {
    delete process.env.DISCORD_BROKER_SECRET;
    process.env.NODE_ENV = 'production';
    const res = makeRes();
    const next = jest.fn();
    verifyBrokerSecret(makeReq('anything'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows requests outside production when the secret is unset (local dev)', () => {
    delete process.env.DISCORD_BROKER_SECRET;
    process.env.NODE_ENV = 'development';
    const res = makeRes();
    const next = jest.fn();
    verifyBrokerSecret(makeReq(undefined), res, next);
    expect(next).toHaveBeenCalled();
  });

  it('secretsMatch handles different lengths and non-strings', () => {
    expect(secretsMatch('a', 'abcdef')).toBe(false);
    expect(secretsMatch(undefined, 'abc')).toBe(false);
    expect(secretsMatch('abc', 'abc')).toBe(true);
  });
});
