# Discord Interaction Handler (broker)

This service receives Discord interactions (button clicks on session attendance messages) and routes each one to the backend that registered the channel it came from. One broker serves every campaign of every backend.

## Architecture

```
Discord -> Discord Handler (broker) -> Backend -> Database update -> Response to Discord
 (button click)     (route by channel)   (process)    (attendance)      (updated embed)
```

The backends tell the broker which channels they own by calling `POST /register` at startup (and `/heartbeat` afterwards). Nothing is configured per campaign in the broker itself.

## Features

- **Dynamic routing**: a backend registers its campaigns' channel ids and one callback URL; the broker forwards a click to the URL registered for the channel it happened in
- **Signature verification**: validates every Discord interaction with its Ed25519 signature
- **Shared secret**: control endpoints and every forward to a backend carry `X-Broker-Secret`
- **Error handling**: graceful ephemeral replies when a channel is unknown or a backend is unavailable
- **Bounded registry**: at most 20 registered apps, 50 channels per app, length-limited fields (the registry lives in memory)

## Configuration

### Environment Variables

Required:
- `DISCORD_PUBLIC_KEY` - your Discord application's public key, used for signature verification
- `DISCORD_BROKER_SECRET` - shared secret, the SAME value as on every backend (required when `NODE_ENV=production`; the broker rejects control requests while it is unset). Generate with `openssl rand -hex 32`

Optional:
- `PORT` - server port (default: 3000)
- `REQUEST_TIMEOUT` - milliseconds a backend has to answer a button click (default: 2500)
- `NODE_ENV` - `production` makes an unset `DISCORD_BROKER_SECRET` fail closed
- `BROKER_ALLOWED_ENDPOINT_HOSTS` - comma-separated hosts (or `host:port`) a registered callback URL may use; when unset any http(s) URL is accepted
- `BROKER_ALLOW_UNAUTHENTICATED_CONTROL` - rollout aid only: `true` lets a backend that predates the shared secret (it sends no `X-Broker-Secret` header at all) keep registering. A wrong secret is always rejected. Remove it once every backend is updated

### Discord Application Setup

1. **Create Discord Application**
   - Go to https://discord.com/developers/applications
   - Create a new application
   - Note the Application ID and Public Key

2. **Configure Interactions Endpoint URL**
   - In your Discord application settings, go to "General Information"
   - Set "Interactions Endpoint URL" to the public URL of this service's `/interactions`, for example `https://yourdomain.com/discord-handler/interactions`
   - Discord verifies the endpoint is reachable

3. **Channels**
   - Each campaign's Discord channel id is set in the app (campaign settings); the backend registers it with the broker automatically

## API Endpoints

### Discord
- `POST /interactions` - main Discord interaction endpoint (called by Discord, signature verified)

### Backend control (require `X-Broker-Secret`)
- `POST /register` - `{ appId, name, description?, endpoint, channels: { "<channelId>": {...} } }`. `endpoint` is the callback URL that receives the interactions (the backend registers `.../api/discord/interactions`). A channel already owned by another app is refused (409); too many apps is 429
- `POST /unregister` - `{ appId }`
- `POST /heartbeat` - `{ appId }`; 404 when the app is not registered (it should register again)
- `GET /status` - registered apps, routed channels, uptime and memory

### Monitoring
- `GET /health` - unauthenticated liveness check: `{ "status": "healthy", "timestamp": "..." }`. It deliberately reveals nothing else

## Local Development

```bash
cd discord-handler
npm install
npm run dev
npm test
```

The service starts on port 3000 with auto-reload enabled.

## Docker Deployment

The image is built from `discord-handler/Dockerfile` by `build_image.sh --discord-broker`. It is deployed from an app definition kept outside git (for example a TrueNAS app); `.env.discord-broker.example` in the repository root lists the settings it needs.

## Backend Communication

The broker forwards Discord interactions to the registered callback URL:

```
POST <registered endpoint>      e.g. /api/discord/interactions
Headers:
  Content-Type: application/json
  X-Forwarded-From: discord-handler
  X-Campaign-Instance: <registered app name>
  X-Broker-Secret: <DISCORD_BROKER_SECRET>
```

The backend responds with a valid Discord interaction response.

## Error Handling

- **Invalid signature**: 401 Unauthorized
- **Unknown channel**: ephemeral "not configured" message to the user
- **Backend unavailable or timeout**: ephemeral fallback message to the user
- **Missing or malformed JSON body on a control endpoint**: 400

## Security

- Every interaction is verified with Discord's Ed25519 signature
- `/register`, `/unregister`, `/heartbeat` and `/status` require the shared `DISCORD_BROKER_SECRET` in `X-Broker-Secret` (fail closed in production when unset); the backend requires the same secret on `/api/discord/interactions`
- `BROKER_ALLOWED_ENDPOINT_HOSTS` restricts which hosts a registered callback URL may use
- Registrations are size-limited and the number of apps is capped
- Bodies of interactions are not logged
- Requests to backends carry identifying headers and a timeout

## Troubleshooting

1. **"Unauthorized" from Discord's endpoint check**: verify `DISCORD_PUBLIC_KEY`
2. **"This channel is not configured"**: the channel is not registered; check the campaign's Discord channel setting and that the backend registered (`GET /status` with the secret)
3. **Backend "temporarily unavailable"**: check the backend container's health and its network path from the broker
4. **401 on `/register`**: `DISCORD_BROKER_SECRET` differs between the broker and the backend
5. **Discord verification fails**: ensure the endpoint URL in Discord matches exactly
