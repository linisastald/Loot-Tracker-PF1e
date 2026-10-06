// Exercises the real config/db.js and config/adminDb.js with pg mocked, to pin
// down which credentials each pool is built with and that both share one
// pool-config helper.
jest.unmock('../db');
jest.unmock('../adminDb');

const ENV_KEYS = ['DB_USER', 'DB_PASSWORD', 'DB_APP_USER', 'DB_APP_PASSWORD', 'DB_HOST', 'DB_NAME', 'DB_PORT'];

describe('database pool configuration', () => {
  const realEnv = { ...process.env };
  let Pool;
  let logger;

  const load = (modulePath, env = {}) => {
    ENV_KEYS.forEach(k => delete process.env[k]);
    Object.assign(process.env, { DB_HOST: 'db', DB_NAME: 'loot', DB_PORT: '5432', ...env });
    let mod;
    jest.isolateModules(() => {
      Pool = jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({}), release: jest.fn() }),
        end: jest.fn().mockResolvedValue(undefined)
      }));
      jest.doMock('pg', () => ({ Pool }));
      logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
      jest.doMock('../../utils/logger', () => logger);
      jest.doMock('dotenv', () => ({ config: jest.fn() }));
      mod = jest.requireActual(modulePath);
    });
    return mod;
  };

  afterEach(() => {
    process.env = { ...realEnv };
  });

  it('uses the dedicated app role when both DB_APP_USER and DB_APP_PASSWORD are set', () => {
    load('../db', { DB_USER: 'owner', DB_PASSWORD: 'ownerpw', DB_APP_USER: 'loot_app', DB_APP_PASSWORD: 'apppw' });
    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
      user: 'loot_app', password: 'apppw', host: 'db', database: 'loot', port: '5432'
    }));
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('falls back to the owner credentials and warns loudly that RLS is not enforced', () => {
    load('../db', { DB_USER: 'owner', DB_PASSWORD: 'ownerpw', DB_APP_USER: 'loot_app' });
    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ user: 'owner', password: 'ownerpw' }));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/RLS is NOT enforced/));
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('ownerpw');
  });

  it('no longer exports getPoolStatus', () => {
    const pool = load('../db', { DB_USER: 'owner', DB_PASSWORD: 'ownerpw' });
    expect(pool.getPoolStatus).toBeUndefined();
  });

  it('builds the admin pool lazily, always with the owner credentials', () => {
    const admin = load('../adminDb', { DB_USER: 'owner', DB_PASSWORD: 'ownerpw', DB_APP_USER: 'loot_app', DB_APP_PASSWORD: 'apppw' });
    expect(Pool).not.toHaveBeenCalled();
    admin.getAdminPool();
    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
      user: 'owner', password: 'ownerpw', host: 'db', database: 'loot', port: '5432', max: 3
    }));
  });

  it('gives both pools the same timeout settings from the shared helper', () => {
    load('../db', { DB_USER: 'owner', DB_PASSWORD: 'x' });
    const appCfg = Pool.mock.calls[0][0];
    const admin = load('../adminDb', { DB_USER: 'owner', DB_PASSWORD: 'x' });
    admin.getAdminPool();
    const adminCfg = Pool.mock.calls[0][0];
    expect(adminCfg.connectionTimeoutMillis).toBe(appCfg.connectionTimeoutMillis);
    expect(adminCfg.idleTimeoutMillis).toBe(appCfg.idleTimeoutMillis);
    expect(appCfg.max).toBeGreaterThan(adminCfg.max);
  });
});
