Change Log - Version 0.9.0

## Discord Session Attendance
- Interactive Discord embeds with player response buttons (Yes, No, Maybe, Late, Early)
- Real-time embed updates when players respond
- Automated session announcements, reminders, and confirmations
- Reliable message delivery with automatic retry on failures
- Rate limiting to prevent Discord API throttling

## Automated Session Management
- Auto-announcements configurable days before sessions (default: 7 days)
- Automatic reminders at configurable intervals (default: 24 hours before)
- 2-day-before confirmation requests
- Auto-cancellation if minimum player count not met (default: 3 players)
- Automatic session completion and status updates

## Recurring Sessions
- Create weekly, biweekly, monthly, or custom interval templates
- Auto-generate session instances up to 12 weeks ahead
- Bulk generation of up to 52 instances from templates
- Edit templates and regenerate future instances

## Session Task Management
- Auto-generate tasks based on attendance (GM Prep, Session Notes, Loot Entry)
- Automatic task assignment to attending players
- Task completion tracking per session
- Role-based task types for DM and players

## UI Improvements
- New Session Management page with Material-UI interface
- Enhanced session creation form with recurring session support
- Attendance tracking dashboard with response statistics
- Non-responder identification
- Quick actions for announce, remind, confirm, cancel
- Session notes with rich text support
- Discord manual controls for announcements and updates

## Technical
- Service-oriented architecture with 6 specialized services
- Standardized error handling across all endpoints
- Centralized frontend API error handling with retry logic
- PostgreSQL advisory locks prevent concurrent job execution
- Transaction safety for all multi-step operations

## Database
- New discord_outbox table for message delivery tracking
- Discord message ID tracking fields added to game_sessions
- Enhanced session status: Scheduled, Confirmed, Cancelled, Completed
- Support for multiple attendance response types

## Security & Performance
- Discord API rate limiting (45 req/sec safety margin)
- Input validation for all session endpoints
- SQL injection prevention with parameterized queries
- Error message sanitization

## Configuration Requirements
- `DISCORD_BOT_TOKEN` in settings table
- `DISCORD_CHANNEL_ID` in settings table
- Optional: `DISCORD_BROKER_URL`, `DISCORD_CALLBACK_URL`, `HOST_IP` environment variables

## Migration Notes
- Database migrations run automatically on deployment
- PostgreSQL 9.1+ required for advisory lock support
- No breaking changes - fully backward compatible

## Upgrade Instructions
1. Pull latest code from master branch
2. Rebuild Docker containers (migrations run automatically)
3. Configure Discord bot token and channel ID in DM Settings > Session Settings
4. Test Discord integration with a test session
5. Create recurring session templates as needed
