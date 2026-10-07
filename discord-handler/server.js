// Discord Interaction Handler Server
// Routes Discord interactions to the appropriate campaign instance

// Silence dotenv 17's promotional startup banner (must precede require('dotenv')).
process.env.DOTENV_CONFIG_QUIET = 'true';

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { verifyKey } = require('discord-interactions');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON with raw body for signature verification
app.use('/interactions', express.raw({ type: 'application/json' }));
app.use(express.json());

// Dynamic campaign registry - apps register/unregister at runtime. The registry
// lives in memory and is bounded: a registration needs the broker secret, and
// these limits cap what even a holder of the secret can make the process keep.
const registeredApps = new Map();
const MAX_REGISTERED_APPS = 20;
const MAX_CHANNELS_PER_APP = 50;
const MAX_TEXT_LENGTH = 200;
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_CHANNEL_ID_LENGTH = 32;
// Backends heartbeat every 30 s. One that has been silent this long is gone
// (crashed, or restarted under a new appId) and may be replaced on its channels.
const STALE_APP_MS = 90 * 1000;

// Ephemeral (only the clicking user sees it) reply to a Discord interaction
const ephemeral = (content) => ({
  type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
  data: { content, flags: 64 } // 64 = EPHEMERAL
});

// ---------------------------------------------------------------------------
// Broker authentication (DISCORD_BROKER_SECRET)
//
// /register, /unregister, /heartbeat and /status are control endpoints for the
// backend(s) and must not be callable by anyone else. The backend sends the
// shared secret in X-Broker-Secret; this service sends the same header on every
// forward to a backend. Fail closed: in production an unset secret rejects every
// control request. Outside production an unset secret is allowed (local dev).
// ---------------------------------------------------------------------------
const BROKER_SECRET_HEADER = 'X-Broker-Secret';

const secretsMatch = (provided, expected) => {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
};

// Rollout aid: with BROKER_ALLOW_UNAUTHENTICATED_CONTROL=true, a backend that
// predates the shared secret (sends no X-Broker-Secret header at all) may still
// register / heartbeat / unregister. A wrong secret is always rejected, and
// /status always needs the secret. Turn this off once every backend is updated.
const TRANSITION_PATHS = new Set(['/register', '/unregister', '/heartbeat']);
const transitionModeEnabled = () => process.env.BROKER_ALLOW_UNAUTHENTICATED_CONTROL === 'true';

const requireBrokerSecret = (req, res, next) => {
  const expected = process.env.DISCORD_BROKER_SECRET;

  if (transitionModeEnabled() && TRANSITION_PATHS.has(req.path) && req.get(BROKER_SECRET_HEADER) === undefined) {
    console.warn(`Transition mode: allowing unauthenticated control request to ${req.path} (appId: ${req.body?.appId})`);
    req.brokerAuthenticated = false;
    return next();
  }

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      console.error('DISCORD_BROKER_SECRET is not set; rejecting control request');
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    req.brokerAuthenticated = false;
    return next();
  }

  if (!secretsMatch(req.get(BROKER_SECRET_HEADER), expected)) {
    console.warn(`Rejected control request to ${req.path}: missing or invalid broker secret`);
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  req.brokerAuthenticated = true;
  return next();
};

// An unauthenticated caller (transition mode, or dev without a secret) may
// never touch a registration that was made with the secret.
const refuseUnauthenticatedOverAuthenticated = (req, res, existing, action) => {
  if (existing && existing.authenticated && !req.brokerAuthenticated) {
    console.warn(`Refused unauthenticated ${action} of authenticated registration ${existing.appId}`);
    res.status(403).json({
      success: false,
      message: `An authenticated registration cannot be changed without the broker secret`,
      appId: existing.appId
    });
    return true;
  }
  return false;
};

// Allowlist of hosts a registered callback endpoint may point at.
// BROKER_ALLOWED_ENDPOINT_HOSTS is a comma-separated list of hostnames (or
// host:port). When unset the endpoint only has to be a valid http(s) URL.
const getAllowedEndpointHosts = () =>
  (process.env.BROKER_ALLOWED_ENDPOINT_HOSTS || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);

/**
 * Validate a registration callback endpoint.
 * @param {*} endpoint - Value supplied to /register
 * @return {string|null} Error message, or null when acceptable
 */
const validateEndpoint = (endpoint) => {
  if (typeof endpoint !== 'string') return 'endpoint must be a URL string';
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return 'endpoint is not a valid URL';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'endpoint must use http or https';
  }
  if (url.username || url.password) return 'endpoint must not contain credentials';
  const allowed = getAllowedEndpointHosts();
  if (allowed.length > 0
      && !allowed.includes(url.host.toLowerCase())
      && !allowed.includes(url.hostname.toLowerCase())) {
    return 'endpoint host is not allowed';
  }
  return null;
};

// Channel id -> registered app, built from the registry. A Map, so a channel id
// such as "__proto__" or a missing one can never match anything.
const getChannelRoutes = () => {
  const routes = new Map();
  registeredApps.forEach((appConfig) => {
    Object.keys(appConfig.channels).forEach(channelId => {
      routes.set(channelId, {
        name: appConfig.name,
        endpoint: appConfig.endpoint,
        channelId,
        appId: appConfig.appId,
        authenticated: appConfig.authenticated === true
      });
    });
  });
  return routes;
};

// Discord signature verification middleware
// NOTE: verifyKey is ASYNC as of discord-interactions v4 (it now uses
// SubtleCrypto's Ed25519), so this middleware must await it. Without the await,
// the returned Promise is always truthy and EVERY request would pass
// verification — a security hole. Keep this async.
const verifyDiscordRequest = async (req, res, next) => {
  const signature = req.get('X-Signature-Ed25519');
  const timestamp = req.get('X-Signature-Timestamp');
  const rawBody = req.body;

  if (!signature || !timestamp || !process.env.DISCORD_PUBLIC_KEY) {
    console.error('Missing Discord verification headers or public key');
    return res.status(401).send('Unauthorized');
  }

  try {
    const isValidRequest = await verifyKey(rawBody, signature, timestamp, process.env.DISCORD_PUBLIC_KEY);
    if (!isValidRequest) {
      console.error('Invalid Discord signature');
      return res.status(401).send('Unauthorized');
    }

    // Parse the JSON after verification
    req.body = JSON.parse(rawBody);
    next();
  } catch (error) {
    console.error('Discord verification error:', error);
    return res.status(401).send('Unauthorized');
  }
};

// Route Discord interactions to appropriate campaign instance
const routeToInstance = async (interaction, campaignConfig) => {
  try {
    console.log(`Routing interaction to ${campaignConfig.name} campaign at ${campaignConfig.endpoint}`);

    const response = await axios.post(
      campaignConfig.endpoint,
      interaction,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-From': 'discord-handler',
          'X-Campaign-Instance': campaignConfig.name,
          // The secret only goes to a registration that proved it knows it
          ...(process.env.DISCORD_BROKER_SECRET && campaignConfig.authenticated
            ? { [BROKER_SECRET_HEADER]: process.env.DISCORD_BROKER_SECRET }
            : {})
        },
        timeout: parseInt(process.env.REQUEST_TIMEOUT) || 2500
      }
    );

    return response.data;
  } catch (error) {
    console.error(`Failed to route to ${campaignConfig.name}:`, error.message);

    // Return a fallback response for Discord
    return ephemeral(`⚠️ Sorry, the ${campaignConfig.name} campaign system is temporarily unavailable. Please try again later.`);
  }
};

// Main Discord interactions endpoint
app.post('/interactions', verifyDiscordRequest, async (req, res) => {
  const interaction = req.body;

  console.log('Received Discord interaction:', {
    type: interaction.type,
    id: interaction.id,
    channelId: interaction.channel_id,
    timestamp: new Date().toISOString()
  });

  // Handle Discord ping (type 1)
  if (interaction.type === 1) {
    console.log('Responding to Discord ping');
    return res.json({ type: 1 });
  }

  // Handle component interactions (button clicks) - type 3
  if (interaction.type === 3) {
    const campaignConfig = getChannelRoutes().get(interaction.channel_id);

    if (!campaignConfig) {
      console.error(`No campaign configuration found for channel ${interaction.channel_id}`);
      return res.json(ephemeral('⚠️ This channel is not configured for session attendance tracking.'));
    }

    // routeToInstance never throws: it answers with a fallback reply instead
    return res.json(await routeToInstance(interaction, campaignConfig));
  }

  // Handle other interaction types (application commands, etc.)
  console.log(`Unhandled interaction type: ${interaction.type}`);
  return res.json(ephemeral('❓ Unknown interaction type.'));
});

const isText = (value, maxLength) => typeof value === 'string' && value.length > 0 && value.length <= maxLength;

// Control endpoints take a JSON body; without one req.body is undefined (Express 5)
const requireAppId = (req, res, next) => {
  req.body = req.body || {};
  if (!req.body.appId) {
    return res.status(400).json({
      success: false,
      message: 'Missing required field: appId'
    });
  }
  return next();
};

// App registration endpoint
app.post('/register', requireBrokerSecret, (req, res) => {
  const { appId, name, description, endpoint, channels } = req.body || {};

  if (!appId || !name || !endpoint || !channels) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: appId, name, endpoint, channels'
    });
  }

  if (!isText(appId, MAX_TEXT_LENGTH) || !isText(name, MAX_TEXT_LENGTH)
      || (description !== undefined && typeof description !== 'string')
      || (typeof description === 'string' && description.length > MAX_TEXT_LENGTH)
      || !isText(endpoint, MAX_ENDPOINT_LENGTH)) {
    return res.status(400).json({
      success: false,
      message: `appId, name, description and endpoint must be strings of at most ${MAX_TEXT_LENGTH} characters (endpoint ${MAX_ENDPOINT_LENGTH})`
    });
  }

  if (typeof channels !== 'object' || Array.isArray(channels)) {
    return res.status(400).json({ success: false, message: 'channels must be an object keyed by channel id' });
  }

  const channelIds = Object.keys(channels);
  if (channelIds.length > MAX_CHANNELS_PER_APP || channelIds.some(id => id.length > MAX_CHANNEL_ID_LENGTH)) {
    return res.status(400).json({
      success: false,
      message: `channels may hold at most ${MAX_CHANNELS_PER_APP} channel ids of at most ${MAX_CHANNEL_ID_LENGTH} characters`
    });
  }

  const endpointError = validateEndpoint(endpoint);
  if (endpointError) {
    console.warn(`Rejected registration from ${appId}: ${endpointError}`);
    return res.status(400).json({ success: false, message: endpointError });
  }

  // A channel already owned by a different app cannot be taken over, unless that
  // app has stopped sending heartbeats and the caller presented the shared secret.
  const staleOwners = new Set();
  for (const channelId of channelIds) {
    for (const [otherId, other] of registeredApps) {
      if (otherId !== appId && other.channels[channelId]) {
        const silentFor = Date.now() - new Date(other.lastHeartbeat).getTime();
        if (req.brokerAuthenticated === true && silentFor > STALE_APP_MS) {
          staleOwners.add(otherId);
          continue;
        }
        return res.status(409).json({
          success: false,
          message: `Channel ${channelId} is already registered by another app`
        });
      }
    }
  }

  const existing = registeredApps.get(appId);
  if (refuseUnauthenticatedOverAuthenticated(req, res, existing, 'register')) return;
  for (const staleId of staleOwners) {
    console.warn(`Registration for ${appId} replaces ${staleId}, which has sent no heartbeat for over ${STALE_APP_MS / 1000}s`);
    registeredApps.delete(staleId);
  }
  if (existing && existing.endpoint !== endpoint) {
    console.warn(`Registration for ${appId} replaces a different endpoint (${existing.endpoint} -> ${endpoint}); two backends sharing one appId overwrite each other. Give each deployment its own GROUP_NAME.`);
  }

  if (!existing && registeredApps.size >= MAX_REGISTERED_APPS) {
    return res.status(429).json({
      success: false,
      message: `At most ${MAX_REGISTERED_APPS} apps may be registered`
    });
  }

  const appConfig = {
    appId,
    name,
    description: description || '',
    endpoint,
    channels,
    authenticated: req.brokerAuthenticated === true,
    registeredAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString()
  };

  registeredApps.set(appId, appConfig);

  console.log(`Registered app: ${name} (${appId}) with channels:`, channelIds);

  res.json({
    success: true,
    message: 'App registered successfully',
    appId,
    registeredChannels: channelIds
  });
});

// App unregistration endpoint
app.post('/unregister', requireBrokerSecret, requireAppId, (req, res) => {
  const { appId } = req.body;

  if (refuseUnauthenticatedOverAuthenticated(req, res, registeredApps.get(appId), 'unregister')) return;

  const wasRegistered = registeredApps.delete(appId);

  if (wasRegistered) {
    console.log(`Unregistered app: ${appId}`);
    res.json({
      success: true,
      message: 'App unregistered successfully',
      appId
    });
  } else {
    res.status(404).json({
      success: false,
      message: 'App not found',
      appId
    });
  }
});

// Heartbeat endpoint
app.post('/heartbeat', requireBrokerSecret, requireAppId, (req, res) => {
  const { appId, endpoint } = req.body;

  const registered = registeredApps.get(appId);
  if (!registered) {
    return res.status(404).json({
      success: false,
      message: 'App not registered',
      appId
    });
  }

  if (refuseUnauthenticatedOverAuthenticated(req, res, registered, 'heartbeat')) return;

  // A heartbeat from an endpoint other than the registered one means this
  // caller's registration was overwritten by another backend under the same
  // appId: answer "not registered" so it registers again (older backends send
  // no endpoint and keep the previous behaviour).
  if (typeof endpoint === 'string' && endpoint !== registered.endpoint) {
    console.warn(`Heartbeat for ${appId} came from ${endpoint} but the registered endpoint is ${registered.endpoint}; answering not registered`);
    return res.status(404).json({
      success: false,
      message: 'App not registered',
      appId
    });
  }

  registered.lastHeartbeat = new Date().toISOString();

  res.json({
    success: true,
    message: 'Heartbeat received',
    appId,
    lastHeartbeat: registered.lastHeartbeat
  });
});

// Health check endpoint: liveness only (it is unauthenticated and is what the
// compose healthcheck calls; /status has the details behind the secret)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Status endpoint for debugging (authenticated: discloses endpoints and channel ids)
app.get('/status', requireBrokerSecret, (req, res) => {
  res.json({
    service: 'Discord Interaction Handler',
    version: '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: PORT,
      discordKeyConfigured: !!process.env.DISCORD_PUBLIC_KEY,
      requestTimeout: process.env.REQUEST_TIMEOUT || '2500ms'
    },
    registeredApps: Array.from(registeredApps.values()),
    campaigns: Array.from(getChannelRoutes().values())
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server (only when run directly, so tests can import the app)
const startServer = () => app.listen(PORT, () => {
  console.log(`Discord Interaction Handler running on port ${PORT}`);
  console.log('Channels are registered by the backends at runtime (POST /register)');

  if (!process.env.DISCORD_PUBLIC_KEY) {
    console.warn('⚠️  DISCORD_PUBLIC_KEY not configured - signature verification will fail');
  }

  if (transitionModeEnabled()) {
    console.warn('⚠️  BROKER_ALLOW_UNAUTHENTICATED_CONTROL is on - /register, /unregister and /heartbeat accept requests without the broker secret. Turn it off once every backend sends the secret.');
  }

  if (!process.env.DISCORD_BROKER_SECRET) {
    console.warn(process.env.NODE_ENV === 'production'
      ? '⚠️  DISCORD_BROKER_SECRET not configured - /register, /unregister, /heartbeat and /status will reject all requests'
      : '⚠️  DISCORD_BROKER_SECRET not configured - control endpoints are unauthenticated (non-production only)');
  }
});

if (require.main === module) {
  startServer();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    process.exit(0);
  });
}

module.exports = app;
module.exports.registeredApps = registeredApps;
module.exports.validateEndpoint = validateEndpoint;
