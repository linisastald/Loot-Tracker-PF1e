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

test('register lets an authenticated app replace an owner that stopped sending heartbeats', async () => {
  let res = await post('/register', registration({ appId: 'old-id' }), 'test-secret');
  assert.equal(res.status, 200);
  app.registeredApps.get('old-id').lastHeartbeat = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  res = await post('/register', registration({ appId: 'new-id' }), 'test-secret');
  assert.equal(res.status, 200);
  assert.ok(app.registeredApps.has('new-id'));
  assert.ok(!app.registeredApps.has('old-id'));
});

test('register never lets an unauthenticated caller replace a silent owner', async () => {
  await post('/register', registration({ appId: 'old-id' }), 'test-secret');
  app.registeredApps.get('old-id').lastHeartbeat = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  process.env.BROKER_ALLOW_UNAUTHENTICATED_CONTROL = 'true';
  try {
    const res = await post('/register', registration({ appId: 'new-id' }));
    assert.equal(res.status, 409);
  } finally {
    delete process.env.BROKER_ALLOW_UNAUTHENTICATED_CONTROL;
  }
  assert.ok(app.registeredApps.has('old-id'));
  assert.ok(!app.registeredApps.has('new-id'));
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

// ---------------------------------------------------------------------------
// W07: interaction routing, input validation, bare /health
// ---------------------------------------------------------------------------
const crypto = require('node:crypto');
const http = require('node:http');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyHex = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');

const signedInteraction = (interaction) => {
  const body = JSON.stringify(interaction);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.sign(null, Buffer.from(timestamp + body), privateKey).toString('hex');
  return fetch(`${base}/interactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-Ed25519': signature,
      'X-Signature-Timestamp': timestamp
    },
    body
  });
};

const startBackend = (handler) => new Promise((resolve) => {
  const received = [];
  const srv = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      received.push({ url: req.url, headers: req.headers, body: data });
      handler(res);
    });
  });
  srv.listen(0, '127.0.0.1', () => resolve({ srv, received, port: srv.address().port }));
});

const CHANNEL = '123456789012345678';
const click = (channelId) => ({ type: 3, id: 'i1', channel_id: channelId, data: { custom_id: 'session_attend_yes' } });

test('a button click is forwarded verbatim to the registered endpoint with the broker secret', async () => {
  process.env.DISCORD_PUBLIC_KEY = publicKeyHex;
  const backend = await startBackend((res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ type: 4, data: { content: 'recorded' } }));
  });
  try {
    await post('/register', registration({ endpoint: `http://127.0.0.1:${backend.port}/api/discord/interactions` }), 'test-secret');

    const res = await signedInteraction(click(CHANNEL));

    assert.equal((await res.json()).data.content, 'recorded');
    assert.equal(backend.received[0].url, '/api/discord/interactions');
    assert.equal(backend.received[0].headers['x-broker-secret'], 'test-secret');
    assert.equal(JSON.parse(backend.received[0].body).channel_id, CHANNEL);
  } finally {
    backend.srv.close();
  }
});

test('an unknown channel, a missing channel id and prototype names are answered as not configured', async () => {
  process.env.DISCORD_PUBLIC_KEY = publicKeyHex;
  for (const channelId of ['999999999999999999', undefined, '__proto__', 'undefined']) {
    const res = await signedInteraction(click(channelId));
    const body = await res.json();
    assert.equal(body.type, 4);
    assert.equal(body.data.flags, 64);
    assert.match(body.data.content, /not configured/);
  }
});

test('an unreachable backend gets the ephemeral fallback reply', async () => {
  process.env.DISCORD_PUBLIC_KEY = publicKeyHex;
  const backend = await startBackend(() => {});
  const { port } = backend;
  backend.srv.close();
  await post('/register', registration({ endpoint: `http://127.0.0.1:${port}/api/discord/interactions` }), 'test-secret');

  const res = await signedInteraction(click(CHANNEL));

  const body = await res.json();
  assert.equal(body.data.flags, 64);
  assert.match(body.data.content, /temporarily unavailable/);
});

test('a forged signature is rejected', async () => {
  process.env.DISCORD_PUBLIC_KEY = publicKeyHex;
  const res = await fetch(`${base}/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature-Ed25519': 'ab'.repeat(32), 'X-Signature-Timestamp': '1' },
    body: JSON.stringify(click(CHANNEL))
  });
  assert.equal(res.status, 401);
});

for (const path of ['/register', '/unregister', '/heartbeat']) {
  test(`${path} answers 400, not 500, to a request without a JSON body`, async () => {
    const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'X-Broker-Secret': 'test-secret' } });
    assert.equal(res.status, 400);
  });
}

test('register bounds the registry: field types, channel count and number of apps', async () => {
  let res = await post('/register', registration({ name: 42 }), 'test-secret');
  assert.equal(res.status, 400);
  res = await post('/register', registration({ appId: 'x'.repeat(201) }), 'test-secret');
  assert.equal(res.status, 400);

  const manyChannels = Object.fromEntries(Array.from({ length: 51 }, (_, i) => ['10000000000000' + String(i).padStart(4, '0'), {}]));
  res = await post('/register', registration({ channels: manyChannels }), 'test-secret');
  assert.equal(res.status, 400);

  for (let i = 0; i < 20; i += 1) {
    res = await post('/register', registration({
      appId: `app-${i}`, channels: { ['20000000000000' + String(i).padStart(4, '0')]: {} }
    }), 'test-secret');
    assert.equal(res.status, 200);
  }
  res = await post('/register', registration({ appId: 'one-too-many', channels: { '300000000000000000': {} } }), 'test-secret');
  assert.equal(res.status, 429);
  // an app that is already registered may still re-register
  res = await post('/register', registration({ appId: 'app-0', channels: { '200000000000000000': {} } }), 'test-secret');
  assert.equal(res.status, 200);
});

test('/health is a bare liveness answer', async () => {
  await post('/register', registration(), 'test-secret');
  const body = await (await fetch(`${base}/health`)).json();
  assert.deepEqual(Object.keys(body).sort(), ['status', 'timestamp']);
});

// ---------------------------------------------------------------------------
// Opus review H-2: transition mode must not let an unauthenticated caller
// replace, remove or keep alive an authenticated registration, and the shared
// secret is only ever forwarded to an authenticated registration.
// ---------------------------------------------------------------------------
const withTransition = async (fn) => {
  process.env.BROKER_ALLOW_UNAUTHENTICATED_CONTROL = 'true';
  try {
    await fn();
  } finally {
    delete process.env.BROKER_ALLOW_UNAUTHENTICATED_CONTROL;
  }
};

test('transition mode: an unauthenticated /register cannot replace an authenticated registration', async () => {
  await post('/register', registration(), 'test-secret');
  await withTransition(async () => {
    const res = await post('/register', registration({ endpoint: 'http://attacker.example/steal' }));
    assert.equal(res.status, 403);
  });
  assert.equal(app.registeredApps.get('app-1').endpoint, 'http://backend.local:5000/api/discord/interactions');
});

test('transition mode: an unauthenticated /unregister cannot remove an authenticated registration', async () => {
  await post('/register', registration(), 'test-secret');
  await withTransition(async () => {
    const res = await post('/unregister', { appId: 'app-1' });
    assert.equal(res.status, 403);
  });
  assert.ok(app.registeredApps.has('app-1'));
});

test('transition mode: an unauthenticated /heartbeat neither refreshes nor alters an authenticated registration', async () => {
  await post('/register', registration(), 'test-secret');
  const before = app.registeredApps.get('app-1').lastHeartbeat;
  await new Promise((r) => setTimeout(r, 15));
  await withTransition(async () => {
    const res = await post('/heartbeat', { appId: 'app-1' });
    assert.equal(res.status, 403);
  });
  assert.equal(app.registeredApps.get('app-1').lastHeartbeat, before);
});

test('transition mode: an authenticated /register may still replace an unauthenticated one', async () => {
  await withTransition(async () => {
    assert.equal((await post('/register', registration())).status, 200);
    assert.equal(app.registeredApps.get('app-1').authenticated, false);
  });
  const res = await post('/register', registration(), 'test-secret');
  assert.equal(res.status, 200);
  assert.equal(app.registeredApps.get('app-1').authenticated, true);
});

test('the broker secret is not forwarded to an unauthenticated registration', async () => {
  process.env.DISCORD_PUBLIC_KEY = publicKeyHex;
  const backend = await startBackend((res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ type: 4, data: { content: 'ok' } }));
  });
  try {
    await withTransition(async () => {
      await post('/register', registration({ endpoint: `http://127.0.0.1:${backend.port}/x` }));
    });
    await signedInteraction(click(CHANNEL));
    assert.equal(backend.received.length, 1);
    assert.equal(backend.received[0].headers['x-broker-secret'], undefined);
  } finally {
    backend.srv.close();
  }
});

// ---------------------------------------------------------------------------
// Opus review M-3: /heartbeat carries the endpoint; a different endpoint under
// the same appId means the registration was overwritten.
// ---------------------------------------------------------------------------
test('heartbeat answers 404 when the caller endpoint differs from the registered one', async () => {
  await post('/register', registration(), 'test-secret');
  const res = await post('/heartbeat', { appId: 'app-1', endpoint: 'http://other.local:5000/api/discord/interactions' }, 'test-secret');
  assert.equal(res.status, 404);
  assert.match((await res.json()).message, /not registered/i);
});

test('heartbeat with the matching endpoint, or without one (older backend), still succeeds', async () => {
  await post('/register', registration(), 'test-secret');
  let res = await post('/heartbeat', { appId: 'app-1', endpoint: 'http://backend.local:5000/api/discord/interactions' }, 'test-secret');
  assert.equal(res.status, 200);
  res = await post('/heartbeat', { appId: 'app-1' }, 'test-secret');
  assert.equal(res.status, 200);
});

test('re-registering an appId from a different endpoint is logged clearly and replaces it', async () => {
  await post('/register', registration(), 'test-secret');
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const res = await post('/register', registration({ endpoint: 'http://other.local:5000/api/discord/interactions' }), 'test-secret');
    assert.equal(res.status, 200);
  } finally {
    console.warn = original;
  }
  assert.ok(warnings.some((w) => /app-1/.test(w) && /different endpoint/i.test(w)));
  assert.equal(app.registeredApps.get('app-1').endpoint, 'http://other.local:5000/api/discord/interactions');
});

// ---------------------------------------------------------------------------
// Opus review M-4: the broker image must run with NODE_ENV=production, or the
// fail-closed branch for an unset secret never triggers.
// ---------------------------------------------------------------------------
test('the broker Dockerfile sets NODE_ENV=production', () => {
  const dockerfile = require('node:fs').readFileSync(`${__dirname}/Dockerfile`, 'utf8').split(/\r?\n/);
  assert.ok(dockerfile.some((line) => /^ENV NODE_ENV=production\s*$/.test(line)));
});

test('.env.discord-broker.example shows NODE_ENV=production as a real setting', () => {
  const example = require('node:fs').readFileSync(`${__dirname}/../.env.discord-broker.example`, 'utf8').split(/\r?\n/);
  assert.ok(example.some((line) => /^NODE_ENV=production\s*$/.test(line)));
  assert.ok(!example.some((line) => /^#\s*NODE_ENV=production/.test(line)));
});
