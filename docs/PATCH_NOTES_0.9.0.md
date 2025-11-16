Change Log - Version 0.9.0

Major Feature - Discord Session Attendance Integration
Discord Bot Integration: Automated session attendance tracking via Discord interactions
Interactive Embeds: Rich session announcements with player response buttons (Yes, No, Maybe, Late, Early)
Real-Time Updates: Instant embed updates when players respond to attendance requests
Attendance Dashboard: View all player responses with timestamps and status tracking
Discord Webhooks: Automatic notifications for session announcements, reminders, and confirmations
Reliable Delivery: Automatic retry system ensures messages are delivered even during Discord outages

Major Feature - Automated Session Management
Session Scheduler: Automated cron jobs for announcements, reminders, and confirmations
Auto-Announcements: Configure when sessions are automatically posted to Discord (default: 7 days before)
Session Reminders: Automatic follow-up reminders at configurable intervals (default: 24 hours before)
Auto-Confirmation: 2-day-before confirmation requests to verify player attendance
Auto-Cancellation: Automatically cancel sessions if minimum player count not met (default: 3 players)
Session Completion: Automatic status updates when sessions end with attendance finalization

Major Feature - Recurring Session Templates
Template System: Create recurring session patterns (weekly, biweekly, monthly, custom intervals)
Instance Generation: Automatically generate session instances from templates up to 12 weeks ahead
Schedule Management: Configure day of week, interval, and end conditions (date or count)
Bulk Operations: Generate up to 52 session instances from a single template
Template Editing: Modify recurring patterns and regenerate future instances

Major Feature - Session Task Management
Automated Tasks: Generate session tasks based on attendance (GM Prep, Session Notes, Loot Entry, etc.)
Task Assignment: Automatically assign tasks to attending players
Task Tracking: Monitor completion status and track task assignments per session
Role-Based Tasks: Different tasks for DM vs player roles

Major Feature - Enhanced Session Management UI
Session Management Page: Complete Material-UI interface for managing all session aspects
Session Creation: Enhanced form with recurring session support and full configuration options
Attendance Tracking: View and manually record player responses with notes
Discord Controls: Manual triggers for announcements, reminders, and message updates
Session Notes: Integrated note-taking with rich text support
Status Management: Scheduled, Confirmed, Cancelled, Completed status tracking

UI Improvement - Session Dashboard
Enhanced Session List: Filter by upcoming/past sessions with attendance counts
Response Statistics: View confirmed, declined, maybe, late, and early responses at a glance
Non-Responder Tracking: Identify players who haven't responded to session requests
Session Details: Comprehensive view of all session metadata and configuration
Quick Actions: One-click actions for common operations (announce, remind, confirm, cancel)

UI Improvement - Session Settings Page
Unified Settings: New Session Settings page replacing previous Session Management interface
Configuration Options: Set default auto-announce hours, reminder intervals, and player count requirements
Discord Integration: Configure Discord channel and bot settings from the UI
Template Management: Create, edit, and delete recurring session templates
Better Organization: Cleaner interface with logical grouping of related settings

Technical Improvements - Backend Architecture
Service-Oriented Design: Clean separation of concerns across 6 specialized services:
  - AttendanceService: All attendance tracking operations
  - SessionDiscordService: Discord integration and message formatting
  - SessionSchedulerService: Cron job scheduling and automation
  - RecurringSessionService: Recurring session template management
  - SessionTaskService: Task generation and assignment
  - SessionService: Core CRUD operations and orchestration
Standardized Error Handling: Consistent error responses across all session endpoints
Rate Limiting: Smart Discord API rate limiting prevents throttling and service interruptions
Transaction Safety: Proper database transaction handling for all multi-step operations

Technical Improvements - Frontend Architecture
Error Handling Wrapper: Centralized API error handling with automatic retry for network failures
Loading States: Better user feedback during async operations
Form Validation: Enhanced validation with clear error messages
Modular Components: Reusable session components for better maintainability

Data Management - Session Enhancement
Discord Message Tracking: Store Discord message IDs for updates and reference
Attendance History: Complete audit trail of player responses with timestamps
Session Templates: Recurring session metadata with pattern, interval, and end conditions
Task Assignments: Link session tasks to users with completion tracking
Configurable Automation: Per-session control over announcement and reminder timing

Data Management - Database Migrations
Session Schema: Added Discord integration fields (message IDs, announcement tracking)
Outbox System: New discord_outbox table for reliable message delivery tracking
Session Status: Enhanced status tracking with Scheduled, Confirmed, Cancelled, Completed
Attendance Types: Support for Yes, No, Maybe, Late, Early, Late_and_Early responses

Security & Performance
Rate Limiting: Discord API rate limiter prevents throttling and bans (45 req/sec safety margin)
Input Validation: Comprehensive validation for all session and attendance inputs
SQL Injection Prevention: Parameterized queries throughout all session endpoints
Transaction Safety: Proper BEGIN/COMMIT/ROLLBACK for all multi-step operations
Advisory Locks: PostgreSQL locks prevent concurrent execution of scheduled jobs
Error Sanitization: Proper error message sanitization prevents information leakage

Known Limitations
Discord Configuration: Requires manual setup of Discord bot and channel configuration
Test Coverage: Session features currently lack automated test coverage
Scheduler Visibility: No UI for viewing scheduled job history or failed automation attempts

Breaking Changes
None - All changes are backward compatible with existing functionality

Migration Notes
Database migrations run automatically on deployment
New columns added to game_sessions table for Discord integration
New discord_outbox table created for message delivery tracking
Discord bot token and channel ID must be configured in settings for Discord features
PostgreSQL 9.1+ required for advisory lock support

Configuration Requirements
DISCORD_BOT_TOKEN: Discord bot token in settings table (name: 'discord_bot_token')
DISCORD_CHANNEL_ID: Discord channel ID for announcements (name: 'discord_channel_id')
DISCORD_BROKER_URL: Optional Discord broker service URL (environment variable)
DISCORD_CALLBACK_URL: Full URL for Discord interaction callbacks (environment variable)
HOST_IP: Server IP address for callback URL construction (environment variable)

Upgrade Instructions
1. Pull latest code from master branch
2. Rebuild Docker containers (migrations run automatically)
3. Configure Discord bot token and channel ID in DM Settings > Session Settings
4. Test Discord integration with a test session announcement
5. Create recurring session templates as needed
6. Configure default auto-announce and reminder hours in settings
