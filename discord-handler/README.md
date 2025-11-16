# Discord Interaction Handler

This service routes Discord interactions (button clicks) from session attendance messages to the appropriate campaign instance (ROTR, SNS, or TEST).

## Architecture

```
Discord → Discord Handler → Campaign Instance → Database Update → Response to Discord
     (button click)      (route)           (process)         (attendance)      (updated embed)
```

## Features

- **Multi-Instance Routing**: Routes interactions to the correct campaign based on Discord channel ID
- **Signature Verification**: Validates all incoming Discord interactions using Ed25519 signatures
- **Health Monitoring**: Provides health check and status endpoints
- **Error Handling**: Graceful fallbacks when campaign instances are unavailable
- **Docker Ready**: Containerized for production deployment

## Configuration

### Environment Variables

Required:
- `DISCORD_PUBLIC_KEY` - Your Discord application's public key for signature verification
- `ROTR_CHANNEL_ID` - Discord channel ID for Rise of the Runelords campaign
- `SNS_CHANNEL_ID` - Discord channel ID for Skulls & Shackles campaign
- `TEST_CHANNEL_ID` - Discord channel ID for test/development campaign

Optional:
- `PORT` - Server port (default: 3000)
- `REQUEST_TIMEOUT` - Timeout for requests to campaign instances (default: 2500ms)
- `NODE_ENV` - Environment mode (development/production)

Campaign endpoints (auto-configured in Docker):
- `ROTR_API_ENDPOINT` - ROTR campaign API endpoint
- `SNS_API_ENDPOINT` - SNS campaign API endpoint
- `TEST_API_ENDPOINT` - Test campaign API endpoint

### Discord Application Setup

1. **Create Discord Application**
   - Go to https://discord.com/developers/applications
   - Create a new application
   - Note the Application ID and Public Key

2. **Configure Interactions Endpoint URL**
   - In your Discord application settings, go to "General Information"
   - Set "Interactions Endpoint URL" to: `https://yourdomain.com/discord-handler/interactions`
   - Discord will verify this endpoint is reachable

3. **Get Channel IDs**
   - Enable Discord Developer Mode in your Discord client
   - Right-click on the channels where you want session attendance
   - Copy the Channel ID for each campaign

## API Endpoints

### Main Endpoint
- `POST /interactions` - Main Discord interaction endpoint (called by Discord)

### Monitoring
- `GET /health` - Health check with campaign configuration status
- `GET /status` - Detailed status including uptime and memory usage

## Local Development

```bash
cd discord-handler
npm install
npm run dev
```

The service will start on port 3000 with auto-reload enabled.

## Docker Deployment

The service is included in the main docker-compose.yml:

```bash
docker-compose up discord-handler
```

## Campaign Instance Communication

The handler forwards Discord interactions to campaign instances via:

```
POST /api/discord/interactions
Headers:
  Content-Type: application/json
  X-Forwarded-From: discord-handler
  X-Campaign-Instance: ROTR|SNS|TEST
```

Campaign instances should respond with valid Discord interaction responses.

## Error Handling

- **Invalid Signature**: Returns 401 Unauthorized
- **Unknown Channel**: Returns ephemeral error message to user
- **Instance Unavailable**: Returns fallback error message to user
- **Timeout**: Graceful fallback with user notification

## Monitoring

Health check response example:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-09T21:00:00.000Z",
  "configuredCampaigns": 3,
  "campaigns": [
    {
      "name": "ROTR",
      "channelId": "1234567890",
      "endpoint": "http://rotr_app:5000/api"
    }
  ]
}
```

## Security

- All interactions are verified using Discord's Ed25519 signature verification
- No sensitive data is logged in production mode
- Requests to campaign instances include identifying headers
- Timeouts prevent hanging requests

## Troubleshooting

1. **"Unauthorized" errors**: Check DISCORD_PUBLIC_KEY configuration
2. **"Channel not configured"**: Verify channel ID environment variables
3. **"Instance unavailable"**: Check campaign container health and network connectivity
4. **Discord verification fails**: Ensure endpoint URL in Discord matches exactly