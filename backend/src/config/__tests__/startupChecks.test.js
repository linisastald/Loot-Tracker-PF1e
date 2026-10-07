const { checkStartupConfig, enforceStartupChecks, MIN_SECRET_LENGTH } = require('../startupChecks');

const good = () => ({
  NODE_ENV: 'production',
  JWT_SECRET: 'j'.repeat(32),
  CSRF_SECRET: 'c'.repeat(32),
  DB_APP_USER: 'loot_app',
  DB_APP_PASSWORD: 'secret',
  ALLOWED_ORIGINS: 'https://loot.example.com'
});

describe('checkStartupConfig', () => {
  it('returns no problems for a complete production configuration', () => {
    expect(checkStartupConfig(good())).toEqual([]);
  });

  it('accepts several comma-separated origins with spaces', () => {
    expect(checkStartupConfig({ ...good(), ALLOWED_ORIGINS: 'https://a.example, http://10.0.0.5:5000' })).toEqual([]);
  });

  it('requires 32 characters for the secrets', () => {
    expect(MIN_SECRET_LENGTH).toBe(32);
    expect(checkStartupConfig({ ...good(), JWT_SECRET: 'j'.repeat(31) })).toEqual([expect.stringContaining('JWT_SECRET')]);
    expect(checkStartupConfig({ ...good(), JWT_SECRET: 'j'.repeat(32) })).toEqual([]);
  });

  it.each([
    ['JWT_SECRET', undefined],
    ['JWT_SECRET', ''],
    ['JWT_SECRET', 'short'],
    ['CSRF_SECRET', undefined],
    ['CSRF_SECRET', 'short'],
    ['DB_APP_USER', undefined],
    ['DB_APP_PASSWORD', undefined],
    ['DB_APP_PASSWORD', ''],
    ['ALLOWED_ORIGINS', undefined],
    ['ALLOWED_ORIGINS', ''],
    ['ALLOWED_ORIGINS', ' , '],
    ['ALLOWED_ORIGINS', '*'],
    ['ALLOWED_ORIGINS', 'https://a.example,*']
  ])('reports a problem naming %s when it is %j', (name, value) => {
    const env = { ...good(), [name]: value };
    const problems = checkStartupConfig(env);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(name);
  });

  it('lists every problem at once, one line each', () => {
    const problems = checkStartupConfig({ NODE_ENV: 'production' });
    expect(problems).toHaveLength(5);
    for (const name of ['JWT_SECRET', 'CSRF_SECRET', 'DB_APP_USER', 'DB_APP_PASSWORD', 'ALLOWED_ORIGINS']) {
      expect(problems.some(p => p.includes(name))).toBe(true);
    }
    problems.forEach(p => expect(p).not.toMatch(/\n/));
  });

  it('never echoes a secret value', () => {
    const problems = checkStartupConfig({ ...good(), JWT_SECRET: 'abc-secret-value' });
    expect(problems.join(' ')).not.toContain('abc-secret-value');
  });

  it('does nothing outside production', () => {
    expect(checkStartupConfig({ NODE_ENV: 'development' })).toEqual([]);
    expect(checkStartupConfig({ NODE_ENV: 'test', ALLOWED_ORIGINS: '*' })).toEqual([]);
    expect(checkStartupConfig({})).toEqual([]);
  });
});

describe('enforceStartupChecks', () => {
  it('exits with code 1 and prints each problem when production is misconfigured', () => {
    const exit = jest.fn();
    const write = jest.fn();
    enforceStartupChecks({ NODE_ENV: 'production' }, { exit, write });
    expect(exit).toHaveBeenCalledWith(1);
    const printed = write.mock.calls.map(c => c[0]).join('');
    expect(printed).toContain('JWT_SECRET');
    expect(printed).toContain('ALLOWED_ORIGINS');
    expect(printed.split('\n').filter(l => l.includes('- ')).length).toBe(5);
  });

  it('does not exit for a good configuration or outside production', () => {
    const exit = jest.fn();
    const write = jest.fn();
    enforceStartupChecks(good(), { exit, write });
    enforceStartupChecks({ NODE_ENV: 'development' }, { exit, write });
    expect(exit).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
