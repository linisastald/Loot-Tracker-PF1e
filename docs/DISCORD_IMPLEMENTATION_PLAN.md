# Discord Implementation Plan

## Current State Analysis

After reviewing the existing code, here's what we currently have:

### Discord Handler (Broker) - `discord-handler/`
✅ **Exists but needs refactoring**
- Current: Interaction handler for Discord slash commands/components
- Uses Discord verification middleware and routes to campaign instances
- Static channel-to-app mapping in environment variables
- Missing: Dynamic app registration, message tracking, health checks

### Backend Discord Integration - `backend/src/`
✅ **Substantial existing functionality**
- `discordController.js`: Send messages, events, manage settings
- Session interaction processing in `sessionController.js`
- Database table `session_messages` for tracking Discord messages
- Routes for `/api/discord/*` endpoints

### Issues with Current Architecture

1. **Static Configuration**: Channel mappings hardcoded in env vars
2. **No Registration System**: Apps don't register with handler
3. **Limited Message Tracking**: Only session messages tracked
4. **Missing Health Monitoring**: No heartbeat system
5. **Incomplete Broker Logic**: Handler doesn't route all Discord events
6. **Wrong Dependencies**: Using `discord-interactions` instead of `discord.js`

## Implementation Plan

### Phase 1: Refactor Discord Handler to True Broker/Router

#### 1.1 Update Dependencies
```bash
cd discord-handler
npm uninstall discord-interactions
npm install discord.js better-sqlite3 uuid
```

#### 1.2 Create Broker Architecture Components
```
discord-handler/
├── index.js              # Main entry point (existing server.js renamed)
├── src/
│   ├── broker.js         # Main broker logic
│   ├── registry.js       # App registration management
│   ├── router.js         # Event routing logic
│   ├── health.js         # Health check management
│   └── database.js       # SQLite wrapper
├── data/
│   └── registrations.db  # SQLite database (auto-created)
└── config.json           # Bot configuration
```

#### 1.3 Replace Interaction-Only Logic with Full Discord Bot
- Switch from Discord interaction verification to full bot
- Listen to message reactions, not just interactions
- Route based on message ownership, not just channel

### Phase 2: Add App Registration System

#### 2.1 Add Registration Endpoints to Handler
- `POST /register` - Apps register on startup
- `POST /heartbeat/:id` - Health monitoring
- `POST /track-message` - Apps inform handler of created messages
- `GET /health` - Handler status and registered apps

#### 2.2 Update Apps to Register with Broker
- Add registration logic to backend startup
- Include heartbeat mechanism
- Notify handler when posting messages to Discord

### Phase 3: Enhance Database Schema

#### 3.1 Add Broker Registration Tables
```sql
-- For discord-handler SQLite database
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
    metadata TEXT -- JSON
);
```

#### 3.2 Extend Backend Database (optional)
```sql
-- For app databases, extend existing session_messages
ALTER TABLE session_messages ADD COLUMN app_id TEXT DEFAULT 'rotr';
ALTER TABLE session_messages ADD COLUMN handler_registered BOOLEAN DEFAULT FALSE;
```

### Phase 4: Implement Event Routing

#### 4.1 Discord Event Handlers in Broker
- `messageReactionAdd` - Route to app that owns message
- `messageReactionRemove` - Route reaction removals
- `interactionCreate` - Route slash commands/buttons
- `messageCreate` - Route direct commands (optional)

#### 4.2 App Callback System
- Standardized webhook format for apps
- Timeout and retry logic
- Circuit breaker for failed apps

### Phase 5: Migration and Testing

#### 5.1 Backward Compatibility
- Maintain existing API endpoints
- Graceful fallback if broker unavailable
- Migration script for existing data

#### 5.2 Testing Strategy
- Unit tests for broker components
- Integration tests with mock apps
- Load testing with multiple app instances

## Detailed Implementation Steps

### Step 1: Refactor Discord Handler (Priority: High)

**Files to create/modify:**

1. **discord-handler/package.json** - Update dependencies
2. **discord-handler/index.js** - New main entry point with Discord.js
3. **discord-handler/src/broker.js** - Core broker logic
4. **discord-handler/src/registry.js** - App registration
5. **discord-handler/src/router.js** - Event routing
6. **discord-handler/src/database.js** - SQLite operations

**Implementation Order:**
1. Create SQLite database wrapper
2. Build registration system (registry.js)
3. Implement event routing (router.js)
4. Create main broker entry point (index.js)
5. Add health monitoring (health.js)

### Step 2: Update Backend Integration (Priority: High)

**Files to modify:**

1. **backend/index.js** - Add registration on startup
2. **backend/src/controllers/discordController.js** - Notify handler of messages
3. **backend/src/api/routes/discord.js** - Handle new event types
4. **backend/src/controllers/sessionController.js** - Updated interaction handling

**Key Changes:**
- Add broker registration in app startup
- Modify `sendEvent()` to notify broker of message creation
- Update interaction processing to handle broker format
- Add heartbeat mechanism

### Step 3: Environment Configuration (Priority: Medium)

**New Environment Variables:**

For Discord Handler:
```bash
# Discord Handler (Broker)
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_GUILD_ID=your-server-id
PORT=3002
SQLITE_DB_PATH=./data/registrations.db
```

For Apps:
```bash
# App Configuration
APP_ID=rotr  # or sns, test, etc.
APP_NAME="Rise of the Runelords"
DISCORD_BROKER_URL=http://discord-handler:3002
DISCORD_SESSION_CHANNEL=123456789
DISCORD_ANNOUNCEMENT_CHANNEL=987654321
```

### Step 4: Docker Configuration (Priority: Medium)

**Update docker-compose.yml:**
```yaml
services:
  discord-handler:
    build:
      context: ./discord-handler
      dockerfile: Dockerfile
    environment:
      - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
      - DISCORD_GUILD_ID=${DISCORD_GUILD_ID}
    volumes:
      - discord-data:/app/data  # Persist SQLite
    ports:
      - "3002:3002"
    networks:
      - pathfinder-network

  pathfinder-rotr:
    environment:
      - APP_ID=rotr
      - DISCORD_BROKER_URL=http://discord-handler:3002
    depends_on:
      - discord-handler
```

## Benefits of This Approach

### 1. **Maintains Existing Functionality**
- Current Discord integration continues working
- Backward compatibility during transition
- No breaking changes to frontend

### 2. **Enables Multi-Instance Support**
- Easy to add new campaign instances
- Dynamic registration system
- Centralized message routing

### 3. **Improves Reliability**
- Health monitoring and automatic cleanup
- Circuit breaker patterns for failed apps
- Graceful degradation

### 4. **Simplifies Management**
- Single Discord bot connection
- Centralized logging and monitoring
- Consistent event handling

## Implementation Timeline

### Week 1: Core Broker Infrastructure
- [ ] Refactor discord-handler to use Discord.js
- [ ] Implement SQLite database layer
- [ ] Build registration and health systems
- [ ] Create basic event routing

### Week 2: Backend Integration
- [ ] Add app registration to backend startup
- [ ] Modify Discord controller to notify broker
- [ ] Update interaction handling
- [ ] Test with single app instance

### Week 3: Multi-Instance Support
- [ ] Test with multiple app instances
- [ ] Add environment configuration
- [ ] Update Docker configuration
- [ ] Documentation and deployment guides

### Week 4: Polish and Production
- [ ] Error handling and edge cases
- [ ] Performance optimization
- [ ] Monitoring and alerting
- [ ] Production deployment

## Risk Mitigation

### **Risk**: Breaking existing Discord functionality
**Mitigation**: Implement behind feature flag, maintain backward compatibility

### **Risk**: SQLite performance with high message volume
**Mitigation**: Add cleanup routines, consider Redis for high-volume setups

### **Risk**: Network reliability between broker and apps
**Mitigation**: Implement retry logic, circuit breakers, and graceful degradation

### **Risk**: Discord rate limiting with multiple apps
**Mitigation**: Implement centralized rate limiting in broker

## Success Criteria

1. ✅ Multiple app instances can register with broker
2. ✅ Discord events route correctly to appropriate apps
3. ✅ Existing session attendance functionality preserved
4. ✅ Health monitoring detects and handles app failures
5. ✅ Performance equal or better than current implementation
6. ✅ Easy to add new campaign instances

This implementation plan provides a clear path from the current single-instance Discord integration to a scalable multi-instance broker architecture while maintaining backward compatibility.