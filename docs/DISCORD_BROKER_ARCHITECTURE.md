# Discord Broker/Router Architecture

## Overview

The Discord handler acts as a lightweight message broker/router between multiple Pathfinder app instances and a single Discord bot. This architecture reduces the number of Discord bots needed while supporting multiple campaign instances.

```
┌─────────────────┐
│  Discord Server │
└────────┬────────┘
         │ Events (reactions, commands)
         ↓
┌─────────────────┐
│ Discord Handler │ ← Single Bot Connection
│    (Broker)     │
└────────┬────────┘
         │ Routes to appropriate app
    ┌────┴────┬────────┬───────┐
    ↓         ↓        ↓       ↓
┌────────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  RoTR  │ │ S&S  │ │ Test │ │Future│
│  App   │ │ App  │ │ App  │ │ Apps │
└────────┘ └──────┘ └──────┘ └──────┘
```

## Core Components

### 1. Discord Handler (Broker)

**Responsibilities:**
- Maintain single Discord bot connection
- Route Discord events to registered apps
- Track app registrations and health
- Manage message-to-app mappings
- Handle app lifecycle (registration/deregistration)

**What it does NOT do:**
- Process game logic
- Access game databases directly
- Make decisions about game content
- Store game state

### 2. App Registration

When a Pathfinder app starts, it registers with the handler:

```json
POST /register
{
  "app_id": "rotr",
  "app_name": "Rise of the Runelords",
  "callback_url": "http://rotr-app:5000/api/discord/webhook",
  "channels": {
    "session": "123456789",
    "announcement": "987654321"
  },
  "heartbeat_interval": 30000
}
```

Response:
```json
{
  "registration_id": "uuid-here",
  "status": "registered",
  "heartbeat_endpoint": "/heartbeat/uuid-here"
}
```

### 3. Event Routing

When Discord events occur:

1. **Message Reaction Added:**
```javascript
// Handler receives Discord event
client.on('messageReactionAdd', async (reaction, user) => {
  // Look up which app owns this message
  const app = await getAppByMessageId(reaction.message.id);

  // Forward to the appropriate app
  await forwardToApp(app.callback_url, {
    event: 'reaction_added',
    message_id: reaction.message.id,
    user_id: user.id,
    emoji: reaction.emoji.name,
    timestamp: new Date()
  });
});
```

2. **Slash Command:**
```javascript
// Handler receives command
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  // Determine target app from channel or command context
  const app = await getAppByChannel(interaction.channelId);

  // Forward to app
  await forwardToApp(app.callback_url, {
    event: 'command',
    command: interaction.commandName,
    options: interaction.options.data,
    user_id: interaction.user.id,
    channel_id: interaction.channelId
  });
});
```

### 4. Lightweight State Management

Use SQLite for embedded storage:

```sql
-- registrations.db

CREATE TABLE app_registrations (
    id TEXT PRIMARY KEY,
    app_id TEXT UNIQUE NOT NULL,
    app_name TEXT,
    callback_url TEXT NOT NULL,
    channels TEXT, -- JSON
    registered_at INTEGER,
    last_heartbeat INTEGER,
    active INTEGER DEFAULT 1
);

CREATE TABLE message_mappings (
    message_id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    channel_id TEXT,
    message_type TEXT,
    created_at INTEGER,
    metadata TEXT, -- JSON
    FOREIGN KEY (app_id) REFERENCES app_registrations(app_id)
);

CREATE INDEX idx_message_app ON message_mappings(app_id);
CREATE INDEX idx_registration_active ON app_registrations(active);
```

## Implementation

### Discord Handler Structure

```
discord-handler/
├── index.js              # Main entry point
├── package.json
├── config.json           # Bot configuration
├── src/
│   ├── broker.js         # Main broker logic
│   ├── registry.js       # App registration management
│   ├── router.js         # Event routing logic
│   ├── health.js         # Health check management
│   └── db.js            # SQLite wrapper
├── data/
│   └── registrations.db  # SQLite database
└── logs/
```

### Core Implementation Files

**index.js** - Entry point:
```javascript
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const Registry = require('./src/registry');
const Router = require('./src/router');
const Health = require('./src/health');

const app = express();
app.use(express.json());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ]
});

const registry = new Registry();
const router = new Router(registry);
const health = new Health(registry);

// Registration endpoint
app.post('/register', async (req, res) => {
  const registration = await registry.register(req.body);
  res.json(registration);
});

// Heartbeat endpoint
app.post('/heartbeat/:id', async (req, res) => {
  await health.heartbeat(req.params.id);
  res.json({ status: 'ok' });
});

// Message tracking endpoint (apps inform handler about messages they create)
app.post('/track-message', async (req, res) => {
  const { message_id, app_id, metadata } = req.body;
  await registry.trackMessage(message_id, app_id, metadata);
  res.json({ status: 'tracked' });
});

// Discord event handlers
client.on('ready', () => {
  console.log(`Discord broker logged in as ${client.user.tag}`);
  health.startHealthChecks();
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  await router.routeReaction(reaction, user);
});

// Start services
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Broker API listening on port ${PORT}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
```

**src/registry.js** - Registration management:
```javascript
const Database = require('better-sqlite3');

class Registry {
  constructor() {
    this.db = new Database('./data/registrations.db');
    this.initDatabase();
  }

  initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_registrations (
        id TEXT PRIMARY KEY,
        app_id TEXT UNIQUE NOT NULL,
        app_name TEXT,
        callback_url TEXT NOT NULL,
        channels TEXT,
        registered_at INTEGER,
        last_heartbeat INTEGER,
        active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS message_mappings (
        message_id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        channel_id TEXT,
        message_type TEXT,
        created_at INTEGER,
        metadata TEXT
      );
    `);
  }

  async register(appInfo) {
    const id = generateUUID();
    const stmt = this.db.prepare(`
      INSERT INTO app_registrations
      (id, app_id, app_name, callback_url, channels, registered_at, last_heartbeat, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(
      id,
      appInfo.app_id,
      appInfo.app_name,
      appInfo.callback_url,
      JSON.stringify(appInfo.channels),
      Date.now(),
      Date.now()
    );

    return {
      registration_id: id,
      status: 'registered',
      heartbeat_endpoint: `/heartbeat/${id}`
    };
  }

  async getAppByMessageId(messageId) {
    const stmt = this.db.prepare(`
      SELECT ar.* FROM app_registrations ar
      JOIN message_mappings mm ON ar.app_id = mm.app_id
      WHERE mm.message_id = ? AND ar.active = 1
    `);

    return stmt.get(messageId);
  }

  async trackMessage(messageId, appId, metadata) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO message_mappings
      (message_id, app_id, channel_id, message_type, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      messageId,
      appId,
      metadata.channel_id,
      metadata.type,
      Date.now(),
      JSON.stringify(metadata)
    );
  }
}

module.exports = Registry;
```

## App-Side Implementation

Apps need to implement:

### 1. Registration on Startup

```javascript
// In app's initialization
async function registerWithDiscordBroker() {
  const registration = await fetch('http://discord-handler:3002/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.APP_ID || 'rotr',
      app_name: process.env.APP_NAME || 'Rise of the Runelords',
      callback_url: `http://${process.env.HOSTNAME}:5000/api/discord/webhook`,
      channels: {
        session: process.env.DISCORD_SESSION_CHANNEL,
        announcement: process.env.DISCORD_ANNOUNCEMENT_CHANNEL
      },
      heartbeat_interval: 30000
    })
  });

  // Start heartbeat
  setInterval(() => {
    fetch(`http://discord-handler:3002${registration.heartbeat_endpoint}`, {
      method: 'POST'
    });
  }, 30000);
}
```

### 2. Webhook Endpoint for Events

```javascript
// POST /api/discord/webhook
app.post('/api/discord/webhook', async (req, res) => {
  const { event, ...data } = req.body;

  switch(event) {
    case 'reaction_added':
      await handleReactionAdded(data);
      break;
    case 'command':
      await handleCommand(data);
      break;
    // ... other events
  }

  res.json({ status: 'processed' });
});
```

### 3. Notify Broker of Created Messages

```javascript
// When app posts to Discord via webhook
async function postSessionToDiscord(sessionData) {
  // Post directly to Discord via webhook
  const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `New session: ${sessionData.title}`,
      embeds: [/* ... */]
    })
  });

  const message = await response.json();

  // Inform broker about this message
  await fetch('http://discord-handler:3002/track-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message_id: message.id,
      app_id: process.env.APP_ID,
      metadata: {
        type: 'session',
        session_id: sessionData.id,
        channel_id: process.env.DISCORD_SESSION_CHANNEL
      }
    })
  });
}
```

## Docker Compose Setup

```yaml
version: '3.8'

services:
  discord-handler:
    container_name: discord-handler
    build:
      context: ./discord-handler
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
      - PORT=3002
    volumes:
      - ./discord-handler/data:/app/data  # Persist SQLite
      - discord-logs:/app/logs
    ports:
      - "3002:3002"  # API port
    networks:
      - pathfinder-network
    restart: unless-stopped

  pathfinder-rotr:
    container_name: pathfinder-rotr
    # ... existing config ...
    environment:
      - APP_ID=rotr
      - APP_NAME=Rise of the Runelords
      - DISCORD_BROKER_URL=http://discord-handler:3002
      - DISCORD_WEBHOOK_URL=${ROTR_WEBHOOK_URL}
      - DISCORD_SESSION_CHANNEL=${ROTR_SESSION_CHANNEL}
    depends_on:
      - discord-handler
    networks:
      - pathfinder-network

  pathfinder-sns:
    container_name: pathfinder-sns
    # ... existing config ...
    environment:
      - APP_ID=sns
      - APP_NAME=Skull and Shackles
      - DISCORD_BROKER_URL=http://discord-handler:3002
      - DISCORD_WEBHOOK_URL=${SNS_WEBHOOK_URL}
      - DISCORD_SESSION_CHANNEL=${SNS_SESSION_CHANNEL}
    depends_on:
      - discord-handler
    networks:
      - pathfinder-network

networks:
  pathfinder-network:
    driver: bridge
```

## Monitoring & Debugging

### Health Check Endpoint

```javascript
// GET /health
app.get('/health', async (req, res) => {
  const apps = await registry.getActiveApps();
  res.json({
    status: 'healthy',
    discord: client.ws.status === 0 ? 'connected' : 'disconnected',
    registered_apps: apps.length,
    apps: apps.map(app => ({
      id: app.app_id,
      name: app.app_name,
      last_heartbeat: app.last_heartbeat,
      status: Date.now() - app.last_heartbeat < 60000 ? 'healthy' : 'stale'
    }))
  });
});
```

### Debug Logging

```javascript
// Enable debug mode
const debug = process.env.DEBUG === 'true';

function logEvent(event, data) {
  if (debug) {
    console.log(`[${new Date().toISOString()}] ${event}:`, data);
  }
}
```

## Benefits of This Architecture

1. **Single Bot Connection**: Only need one Discord bot token/registration
2. **Scalability**: Easy to add new app instances
3. **Isolation**: Apps remain independent
4. **Flexibility**: Apps can still post directly via webhooks
5. **Maintainability**: Central point for Discord API changes
6. **Debugging**: Single place to monitor Discord interactions

## Security Considerations

1. **Authentication**: Add shared secret between apps and broker
2. **Rate Limiting**: Implement per-app rate limits
3. **Validation**: Verify app registrations before routing
4. **Timeouts**: Set timeouts on app callbacks
5. **Circuit Breaking**: Disable routing to unresponsive apps