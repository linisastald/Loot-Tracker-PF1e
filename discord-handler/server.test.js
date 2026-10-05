// Tests for the broker control-endpoint authentication (S1).
// Run with: npm test  (uses the built-in node:test runner; no extra deps)

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_PUBLIC_KEY = 'a'.repeat(64);
const app = require('./server');

let server;
let base;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => {
  app.registeredApps.clear();
  process.env.DISCORD_BROKER_SECRET = 'test-secret';
  process.env.NODE_ENV = 'test';
  delete process.env.BROKER_ALLOWED_ENDPOINT_HOSTS;
});

const post = (path, body, secret) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'X-Broker-Secret': secret } : {})
    },
    body: JSON.stringify(body)
  });

const registration = (overrides = {}) => ({
  appId: 'app-1',
  name: 'App One',
  endpoint: 'http://backend.local:5000/api/discord/interactions',
  channels: { '123456789012345678': { type: 'session-attendance' } },
  ...overrides
});

for (const path of ['/register', '/unregister', '/heartbeat']) {
  test(`${path} rejects a request without the secret`, async () => {
    const res = await post(path, registration());
    assert.equal(res.status, 401);
  });

  test(`${path} rejects a wrong secret`, async () => {
    const res = await post(path, registration(), 'wrong');
    assert.equal(res.status, 401);
  });

  test(`${path} fails closed in production when no secret is configured`, async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DISCORD_BROKER_SECRET;
    const res = await post(path, registration(), 'anything');
    assert.equal(res.status, 401);
  });
}

test('register / heartbeat / unregister succeed with the right secret', async () => {
  let res = await post('/register', registration(), 'test-secret');
  assert.equal(res.status, 200);
  res = await post('/heartbeat', { appId: 'app-1' }, 'test-secret');
  assert.equal(res.status, 200);
  res = await post('/unregister', { appId: 'app-1' }, 'test-secret');
  assert.equal(res.status, 200);
});

test('transition mode lets a pre-secret backend through, but never a wrong secret or /status', async () => {
  process.env.NODE_ENV = 'production';
  process.env.BROKER_ALLOW_UNAUTHENTICATED_CONTROL = 'true';
  try {
    let res = await post('/register', registration());
    assert.equal(res.status, 200);
    res = await post('/heartbeat', { appId: 'app-1' });
    assert.equal(res.status, 200);
    res = await post('/heartbeat', { appId: 'app-1' }, 'wrong');
    assert.equal(res.status, 401);
    res = await fetch(`${base}/status`);
    assert.equal(res.status, 401);
    res = await post('/unregister', { appId: 'app-1' });
    assert.equal(res.status, 200);
  } finally {
    delete process.env.BROKER_ALLOW_UNAUTHENTICATED_CONTROL;
  }
  const res = await post('/register', registration());
  assert.equal(res.status, 401);
});

test('control endpoints are open outside production when no secret is set (local dev)', async () => {
  delete process.env.DISCORD_BROKER_SECRET;
  const res = await post('/register', registration());
  assert.equal(res.status, 200);
});

test('register rejects non-http endpoints and malformed URLs', async () => {
  let res = await post('/register', registration({ endpoint: 'file:///etc/passwd' }), 'test-secret');
  assert.equal(res.status, 400);
  res = await post('/register', registration({ endpoint: 'not a url' }), 'test-secret');
  assert.equal(res.status, 400);
});

test('register enforces the endpoint host allowlist when configured', async () => {
  process.env.BROKER_ALLOWED_ENDPOINT_HOSTS = 'backend.local, other.local:5000';
  let res = await post('/register', registration({ endpoint: 'http://evil.example/x' }), 'test-secret');
  assert.equal(res.status, 400);
  res = await post('/register', registration({ endpoint: 'http://backend.local:5000/api/discord/interactions' }), 'test-secret');
  assert.equal(res.status, 200);
});

test('register refuses to take over a channel owned by another app', async () => {
  let res = await post('/register', registration(), 'test-secret');
  assert.equal(res.status, 200);
  res = await post('/register', registration({ appId: 'attacker' }), 'test-secret');
  assert.equal(res.status, 409);
  // the same app may re-register its own channels
  res = await post('/register', registration(), 'test-secret');
  assert.equal(res.status, 200);
});

test('/webhook no longer exists', async () => {
  const res = await post('/webhook', { t: 'MESSAGE_REACTION_ADD', d: {} });
  assert.equal(res.status, 404);
});

test('/status requires the secret; /health does not disclose endpoints', async () => {
  let res = await fetch(`${base}/status`);
  assert.equal(res.status, 401);
  res = await fetch(`${base}/status`, { headers: { 'X-Broker-Secret': 'test-secret' } });
  assert.equal(res.status, 200);

  await post('/register', registration(), 'test-secret');
  res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.campaigns, undefined);
  assert.ok(!JSON.stringify(body).includes('backend.local'));
});
