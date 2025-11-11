# Discord Container Setup Guide

This guide explains how to set up and configure the Discord broker container for the Pathfinder Loot Tracker's enhanced Discord integration features.

## Overview

The Discord broker system provides:
- **Message Broker/Router**: Single Discord bot that routes events to multiple applications
- **Session Attendance Tracking**: Interactive buttons and reactions for session management
- **Dynamic App Registration**: Applications register with broker for event routing
- **Health Monitoring**: Automatic cleanup and heartbeat monitoring
- **Event Routing**: Reactions, interactions, and messages routed to appropriate apps
- **Multi-Channel Support**: Different channels for sessions, announcements, and loot

## Architecture

```
Discord Server
     ↓
Discord Broker (Single Bot)
     ↓
Router (Routes Events)
     ↓
Multiple Apps (Loot Tracker, etc.)
```

## Prerequisites

- Discord Bot created and invited to your server
- Bot token and server IDs
- Docker installed on your server
- PostgreSQL database access
- Branch: `discord-session-feature` (contains broker implementation)

## Step 1: Create Discord Bot

### Create Application and Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and name it (e.g., "Pathfinder Loot Bot")
3. Go to "Bot" section
4. Click "Add Bot"
5. Save the **Bot Token** (you'll need this)

### Configure Bot Settings

1. Under "Privileged Gateway Intents", enable:
   - **Server Members Intent** (for user management)
   - **Message Content Intent** (for reading commands)
   - **Presence Intent** (optional, for status)

2. Under "Bot Permissions", select:
   - Send Messages
   - Manage Messages
   - Read Message History
   - Add Reactions
   - View Channels
   - Embed Links
   - Use Slash Commands
   - Create Public Threads (optional)
   - Send Messages in Threads (optional)

### Invite Bot to Server

1. Go to "OAuth2" > "URL Generator"
2. Select scopes: `bot` and `applications.commands`
3. Select the permissions from above
4. Copy the generated URL and open it
5. Select your server and authorize

### Get Required IDs

```bash
# Enable Developer Mode in Discord:
# User Settings > App Settings > Advanced > Developer Mode

# Right-click your server name > Copy ID
DISCORD_GUILD_ID=your-guild-id

# Right-click the channel for session posts > Copy ID
DISCORD_CHANNEL_ID=your-channel-id
```

## Step 2: Build Discord Broker Images

### Development Image from Branch

To build a development image from the `discord-session-feature` branch:

```bash
# Clone the repository and switch to the feature branch
git clone <your-repo-url>
cd Loot-Tracker-PF1e
git checkout discord-session-feature

# Build the main application with Discord broker support
docker build -t loot-tracker-dev:discord-feature .

# Build the Discord broker service
docker build -f Dockerfile.discord -t discord-broker:dev .
```

### Create Dockerfile for Discord Broker

Create `Dockerfile.discord` in the project root:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    sqlite \
    curl \
    && rm -rf /var/cache/apk/*

# Create app directory structure
RUN mkdir -p /app/discord-handler/data /app/discord-handler/logs

# Copy package files first for better caching
COPY discord-handler/package*.json ./discord-handler/
WORKDIR /app/discord-handler
RUN npm ci --only=production && npm cache clean --force

# Copy Discord broker source code
COPY discord-handler/ .

# Create startup script with proper error handling
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo 'echo "Starting Discord Broker..."' >> /app/start.sh && \
    echo 'cd /app/discord-handler' >> /app/start.sh && \
    echo 'node index.js' >> /app/start.sh && \
    chmod +x /app/start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

EXPOSE 3002

# Run as non-root user
USER node

CMD ["/app/start.sh"]
```

### Production Image Build

For production deployment:

```bash
# Build production images
docker build -t loot-tracker:latest .
docker build -f Dockerfile.discord -t discord-broker:latest .

# Tag for registry (if using)
docker tag loot-tracker:latest your-registry/loot-tracker:latest
docker tag discord-broker:latest your-registry/discord-broker:latest
```

## Step 3: Docker Compose Configuration

### Production Docker Compose

Add Discord broker service to `docker-compose.yml`:

```yaml
version: '3.8'

services:
  # ... existing pathfinder service ...

  # Update pathfinder service to include broker settings
  pathfinder:
    # ... existing pathfinder config ...
    depends_on:
      - postgres
      - discord-broker  # Add dependency on broker

  discord-broker:
    container_name: discord-broker
    build:
      context: .
      dockerfile: Dockerfile.discord
    environment:
      - NODE_ENV=production
      - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
      - LOG_LEVEL=info
    volumes:
      - discord-broker-data:/app/discord-handler/data
      - discord-broker-logs:/app/discord-handler/logs
    ports:
      - "3002:3002"  # Expose broker API
    networks:
      - pathfinder-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

volumes:
  discord-broker-data:
  discord-broker-logs:

networks:
  pathfinder-network:
    driver: bridge
```

### Development Docker Compose

For development with live reloading:

```yaml
version: '3.8'

services:
  pathfinder-dev:
    build:
      context: .
      dockerfile: Dockerfile
      target: development
    container_name: pathfinder-dev
    volumes:
      - .:/app
      - /app/node_modules
      - /app/frontend/node_modules
    environment:
      - NODE_ENV=development
    ports:
      - "5000:5000"
    networks:
      - pathfinder-network
    depends_on:
      - postgres
      - discord-broker-dev

  discord-broker-dev:
    build:
      context: .
      dockerfile: Dockerfile.discord
    container_name: discord-broker-dev
    environment:
      - NODE_ENV=development
      - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
      - LOG_LEVEL=debug
    volumes:
      - ./discord-handler:/app/discord-handler
      - discord-dev-data:/app/discord-handler/data
      - discord-dev-logs:/app/discord-handler/logs
    ports:
      - "3002:3002"
    networks:
      - pathfinder-network
    restart: unless-stopped

  postgres:
    # ... existing postgres config ...

volumes:
  discord-dev-data:
  discord-dev-logs:

networks:
  pathfinder-network:
    driver: bridge
```

## Step 4: Configuration

### Environment Variables

Update `.env` file with minimal Discord settings (broker manages most settings):

```bash
# Discord Bot Configuration (Required)
DISCORD_BOT_TOKEN=your-bot-token-here

# Optional Environment Settings
NODE_ENV=production
LOG_LEVEL=info
```

### DM Settings Configuration

**Important**: Most Discord settings are now managed through the DM Settings UI, not environment variables.

1. Start the application containers
2. Log in as DM user
3. Navigate to Settings → System Settings → Discord Integration
4. Configure the following in the Discord Broker Settings section:

```
Broker URL: http://discord-broker:3002
App ID: rotr (or your campaign identifier)
App Name: Rise of the Runelords (or your campaign name)
Callback URL: http://pathfinder:5000/api/discord/webhook

Channel Mappings:
- Session Channel ID: [Discord channel for session attendance]
- Announcement Channel ID: [Discord channel for announcements]
- Loot Channel ID: [Discord channel for loot notifications]
```

### Development Configuration

For local development, use localhost URLs:

```
Broker URL: http://localhost:3002
Callback URL: http://localhost:5000/api/discord/webhook
```

## Step 5: Discord Broker Database

The Discord broker uses SQLite for local data storage and doesn't require additional configuration. The broker automatically creates these tables:

- `registrations` - App registration data
- `message_mappings` - Message ownership tracking
- `events` - Event logging

**No configuration files are needed** - the broker is self-configuring and uses embedded SQLite database.

## Step 6: Database Schema Updates

The main PostgreSQL database needs these Discord integration tables:

```sql
-- Session message tracking (for session attendance)
CREATE TABLE IF NOT EXISTS session_messages (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(32) UNIQUE NOT NULL,
    channel_id VARCHAR(32),
    session_date TIMESTAMP,
    session_time TIMESTAMP,
    responses JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Discord settings (already handled by existing settings table)
-- Add Discord broker settings to the settings table via DM UI:
-- discord_broker_url, discord_broker_app_id, discord_broker_app_name,
-- discord_broker_callback_url, discord_session_channel,
-- discord_announcement_channel, discord_loot_channel

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_session_messages_message_id ON session_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_session_messages_date ON session_messages(session_date);
```

### Migration Script

If updating an existing database, run this migration:

```sql
-- Check if session_messages table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables
                   WHERE table_name = 'session_messages') THEN
        CREATE TABLE session_messages (
            id SERIAL PRIMARY KEY,
            message_id VARCHAR(32) UNIQUE NOT NULL,
            channel_id VARCHAR(32),
            session_date TIMESTAMP,
            session_time TIMESTAMP,
            responses JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX idx_session_messages_message_id ON session_messages(message_id);
        CREATE INDEX idx_session_messages_date ON session_messages(session_date);
    END IF;
END
$$;

## Step 7: Building and Running

### Build Development Images from Branch

```bash
# Switch to the Discord feature branch
git checkout discord-session-feature

# Build development containers
docker-compose -f docker-compose.dev.yml up -d --build

# Or build specific containers
docker-compose up -d --build pathfinder
docker-compose up -d --build discord-broker
```

### Build Production Images

```bash
# Build production containers
docker-compose up -d --build

# Tag for deployment
docker tag discord-broker:latest your-registry/discord-broker:v1.0
docker tag loot-tracker:latest your-registry/loot-tracker:v1.0
```

### Monitor the Discord Broker

```bash
# View broker logs
docker logs discord-broker -f

# Check broker health
curl http://localhost:3002/health

# Check app registration status
curl http://localhost:3002/apps

# Access container for debugging
docker exec -it discord-broker /bin/sh
```

### Monitor Application Integration

```bash
# View main app logs for Discord integration
docker logs pathfinder -f | grep -i discord

# Check broker registration from app side
curl http://localhost:5000/api/discord/status
```

## Step 8: Testing Discord Broker Integration

### 1. Test Broker Connection

```bash
# Check broker health
curl http://localhost:3002/health

# Should return: {"status": "healthy", "bot_connected": true, ...}
```

### 2. Test App Registration

1. Start the main application
2. Check broker logs for registration message:
   ```
   [INFO] App registered: rotr (Rise of the Runelords)
   ```

### 3. Test Session Creation via API

```bash
# Create a session attendance message
curl -X POST http://localhost:5000/api/discord/send-event \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Session Tonight",
    "description": "Rise of the Runelords - Chapter 3",
    "start_time": "2024-01-20T19:00:00Z",
    "end_time": "2024-01-20T23:00:00Z"
  }'
```

### 4. Test Interactive Buttons

1. Session message should appear in Discord with attendance buttons
2. Click "Yes, I can attend" button
3. Check broker logs for interaction routing
4. Check main app logs for attendance processing

### 5. Test Event Routing

```bash
# Check message ownership in broker
docker exec discord-broker sqlite3 /app/discord-handler/data/registrations.db \
  "SELECT * FROM message_mappings;"

# Should show message_id mapped to app_id
```

## Step 9: Troubleshooting

### Broker Not Connecting to Discord

```bash
# Check Discord bot token
docker exec discord-broker printenv | grep DISCORD_BOT_TOKEN

# Check network connectivity to Discord
docker exec discord-broker ping -c 4 discord.com

# Verify bot permissions in Discord server
# Bot needs: Send Messages, Manage Messages, Add Reactions, View Channels

# Check broker startup logs
docker logs discord-broker --tail 50
```

### App Registration Issues

```bash
# Check if app registration succeeded
curl http://localhost:3002/apps

# Check app heartbeat
docker logs pathfinder | grep "heartbeat\|registration"

# Verify broker URL in DM settings
# Should be: http://discord-broker:3002 (production) or http://localhost:3002 (dev)
```

### Event Routing Problems

```bash
# Check message ownership mapping
docker exec discord-broker sqlite3 /app/discord-handler/data/registrations.db \
  "SELECT * FROM message_mappings ORDER BY created_at DESC LIMIT 10;"

# Check recent events
docker exec discord-broker sqlite3 /app/discord-handler/data/registrations.db \
  "SELECT * FROM events ORDER BY timestamp DESC LIMIT 10;"

# Verify webhook endpoint is accessible
curl -X POST http://localhost:5000/api/discord/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"ping","test":true}'
```

### Session Attendance Not Working

```bash
# Check if session message was tracked
docker exec pathfinder psql -h postgres -U $DB_USER -d $DB_NAME \
  -c "SELECT * FROM session_messages ORDER BY created_at DESC LIMIT 5;"

# Check broker event logs for button clicks
docker logs discord-broker | grep "button_click"

# Verify session controller is receiving interactions
docker logs pathfinder | grep "session.*interaction"
```

## Step 10: Production Considerations

### Security

1. **Never commit bot token** - Use environment variables
2. **Restrict bot permissions** - Only grant necessary permissions
3. **Rate limiting** - Discord has rate limits, implement queuing
4. **Error handling** - Log errors but don't expose sensitive data

### Monitoring

Create health check endpoint:

```javascript
// discord-handler/health.js
app.get('/health', (req, res) => {
    res.json({
        status: client.ws.status === 0 ? 'connected' : 'disconnected',
        uptime: client.uptime,
        guilds: client.guilds.cache.size,
        ping: client.ws.ping
    });
});
```

Add to Docker Compose:

```yaml
discord-handler:
  # ... other config ...
  healthcheck:
    test: ["CMD", "wget", "-q", "--spider", "http://localhost:3002/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

### Backup Strategy

```bash
# Backup session message data
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -t session_messages \
  -t settings \
  > discord_backup_$(date +%Y%m%d).sql

# Backup broker data
docker exec discord-broker cp /app/discord-handler/data/registrations.db \
  /app/discord-handler/data/backup_$(date +%Y%m%d).db
```

## Step 11: Deployment and Maintenance

### Deploying to Production

```bash
# Switch to discord feature branch on production server
git checkout discord-session-feature
git pull origin discord-session-feature

# Build production images
docker-compose down
docker-compose up -d --build

# Verify deployment
curl http://your-domain:3002/health
curl http://your-domain:5000/api/health
```

### Updating the Broker

```bash
# Pull latest changes from feature branch
git pull origin discord-session-feature

# Rebuild only the broker
docker-compose up -d --build discord-broker

# Check broker health
docker logs discord-broker -f
curl http://localhost:3002/health
```

### Monitoring and Maintenance

```bash
# Set up log rotation for broker
echo '0 0 * * * find /var/lib/docker/volumes/*discord-broker-logs*/_data -name "*.log" -mtime +7 -delete' | crontab -

# Monitor broker database size
docker exec discord-broker du -sh /app/discord-handler/data/

# Clean old broker events (run monthly)
docker exec discord-broker sqlite3 /app/discord-handler/data/registrations.db \
  "DELETE FROM events WHERE timestamp < datetime('now', '-30 days');"
```

### Health Monitoring

```bash
# Create monitoring script
cat > monitor_discord.sh << 'EOF'
#!/bin/bash
BROKER_HEALTH=$(curl -s http://localhost:3002/health | jq -r '.status')
APP_HEALTH=$(curl -s http://localhost:5000/api/health | jq -r '.status')

if [ "$BROKER_HEALTH" != "healthy" ]; then
    echo "Discord broker unhealthy - restarting"
    docker-compose restart discord-broker
fi

if [ "$APP_HEALTH" != "healthy" ]; then
    echo "Main app unhealthy"
    # Alert or restart as needed
fi
EOF

# Run every 5 minutes
echo '*/5 * * * * /path/to/monitor_discord.sh' | crontab -
```

## Common Issues and Solutions

### Issue: Bot appears offline
**Solution**: Check `DISCORD_BOT_TOKEN` environment variable and Discord API status

### Issue: App not registering with broker
**Solution**: Verify broker URL in DM settings and check network connectivity between containers

### Issue: Session buttons not working
**Solution**: Check Discord bot permissions (Use Slash Commands, Send Messages) and verify interaction routing in logs

### Issue: Events not routing to correct app
**Solution**: Check message ownership mapping in broker database and app heartbeat status

### Issue: High broker database size
**Solution**: Run periodic cleanup of old events and message mappings

### Issue: Broker container crashes
**Solution**: Check Discord API rate limits, verify bot token, and ensure sufficient container resources

## Quick Reference

### Essential URLs
- Broker Health: `http://localhost:3002/health`
- Broker Apps: `http://localhost:3002/apps`
- App Discord Status: `http://localhost:5000/api/discord/status`
- DM Settings: `http://localhost:5000/settings` (System Settings → Discord Integration)

### Key Log Locations
- Broker: `docker logs discord-broker`
- App Discord Integration: `docker logs pathfinder | grep -i discord`
- Session Interactions: `docker logs pathfinder | grep -i session`

### Database Quick Checks
```bash
# Check active registrations
docker exec discord-broker sqlite3 /app/discord-handler/data/registrations.db \
  "SELECT app_id, app_name, last_heartbeat FROM registrations;"

# Check recent session messages
docker exec pathfinder psql -h postgres -U $DB_USER -d $DB_NAME \
  -c "SELECT message_id, session_date FROM session_messages ORDER BY created_at DESC LIMIT 5;"
```

## Additional Resources

- [Discord.js Documentation](https://discord.js.org/)
- [Discord Developer Portal](https://discord.com/developers/docs)
- [Docker Compose Networking](https://docs.docker.com/compose/networking/)
- [Discord Bot Permissions Calculator](https://discordapi.com/permissions.html)
- [SQLite Documentation](https://sqlite.org/docs.html)