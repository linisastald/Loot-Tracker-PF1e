# Service Refactoring Plan

## Overview

Refactor `sessionService.js` (2051 lines) into 5 focused services to improve maintainability, testability, and separation of concerns.

## Current State

**File**: `backend/src/services/sessionService.js`
**Lines**: 2051
**Issues**:
- Single Responsibility Principle violation
- Hard to test
- High cognitive load
- Difficult to maintain

## Target Architecture

```
services/
├── SessionService.js          (Main orchestrator - 300-400 lines)
├── attendance/
│   └── AttendanceService.js   (Attendance tracking - 250 lines)  ✅ CREATED
├── discord/
│   └── SessionDiscordService.js (Discord operations - 600 lines)
├── scheduler/
│   └── SessionSchedulerService.js (Cron jobs - 400 lines)
├── recurring/
│   └── RecurringSessionService.js (Recurring logic - 350 lines)
└── tasks/
    └── SessionTaskService.js  (Task generation - 150 lines)
```

## Service Responsibilities

### 1. AttendanceService ✅ COMPLETED
**Location**: `backend/src/services/attendance/AttendanceService.js`
**Responsibilities**:
- Record/update attendance
- Get attendance records
- Get attendance counts
- Get non-responders
- Get detailed attendance breakdowns

**Methods** (7 methods, ~260 lines):
- `recordAttendance(sessionId, userId, responseType, additionalData)`
- `getAttendanceCounts(client, sessionId)`
- `getSessionAttendance(sessionId)`
- `getConfirmedAttendanceCount(sessionId)`
- `getNonResponders(sessionId)`
- `getSessionAttendanceDetails(sessionId)`

**Dependencies**:
- `discordOutboxService` (for queueing Discord updates)
- `pool` (database)
- `logger`
- `sessionConstants`

---

### 2. SessionDiscordService
**Location**: `backend/src/services/discord/SessionDiscordService.js`
**Responsibilities**:
- Format Discord embeds
- Send Discord messages
- Update Discord messages
- Handle Discord reactions
- Manage Discord settings

**Methods** (12 methods, ~600 lines):
- `postSessionAnnouncement(sessionId)`
- `sendSessionReminder(sessionId, reminderType)`
- `updateSessionMessage(sessionId)`
- `sendSessionCompletionNotification(session, attendance)`
- `sendTaskAssignmentsToDiscord(session, assignments)`
- `processDiscordReaction(messageId, userId, emoji, action)`
- `createSessionEmbed(session, attendance)`
- `createReminderEmbed(session, targetUsers)`
- `createAttendanceButtons()`
- `getDiscordSettings()`
- `getReactionMap()`
- `recordReminder(sessionId, reminderType, targetUsers)`

**Dependencies**:
- `discordBrokerService`
- `discordOutboxService`
- `pool` (database)
- `logger`
- `AttendanceService` (for attendance data)

---

### 3. SessionSchedulerService
**Location**: `backend/src/services/scheduler/SessionSchedulerService.js`
**Responsibilities**:
- Initialize cron jobs
- Stop cron jobs
- Check for pending operations

**Methods** (13 methods, ~400 lines):
- `initialize()` - Set up all cron jobs
- `stop()` - Stop all cron jobs
- `scheduleSessionAnnouncements()`
- `scheduleReminderChecks()`
- `scheduleConfirmationChecks()`
- `scheduleTaskGeneration()`
- `scheduleSessionCompletions()`
- `scheduleAutoCancelChecks()`
- `checkPendingAnnouncements()`
- `checkPendingReminders()`
- `checkSessionConfirmations()`
- `checkAutoCancelSessions()`
- `checkTaskGeneration()`
- `checkSessionCompletions()`

**Dependencies**:
- `cron`
- `SessionService` (for session operations)
- `SessionDiscordService` (for notifications)
- `SessionTaskService` (for task generation)
- `pool` (database)
- `logger`

---

### 4. RecurringSessionService
**Location**: `backend/src/services/recurring/RecurringSessionService.js`
**Responsibilities**:
- Create recurring session templates
- Generate instances from templates
- Update/delete templates
- Calculate next occurrences

**Methods** (8 methods, ~350 lines):
- `createRecurringSession(sessionData)`
- `generateRecurringInstances(client, template)`
- `getRecurringSessionInstances(templateId, filters)`
- `updateRecurringSession(templateId, updateData)`
- `deleteRecurringSession(templateId, deleteFutureInstances)`
- `generateAdditionalInstances(templateId, count)`
- `calculateNextOccurrence(currentDate, pattern, interval, targetDayOfWeek)`
- `formatDateForTitle(date)`

**Dependencies**:
- `SessionService` (for creating actual sessions)
- `pool` (database)
- `logger`
- `sessionConstants`

---

### 5. SessionTaskService
**Location**: `backend/src/services/tasks/SessionTaskService.js`
**Responsibilities**:
- Generate session tasks
- Assign tasks to players
- Send task notifications

**Methods** (2 methods, ~150 lines):
- `generateSessionTasks(session)`
- `sendTaskAssignmentsToDiscord(session, assignments)` (shared with Discord service)

**Dependencies**:
- `SessionDiscordService`
- `pool` (database)
- `logger`

---

### 6. SessionService (Refactored Main Service)
**Location**: `backend/src/services/sessionService.js`
**Responsibilities**:
- Session CRUD operations
- Orchestrate other services
- Session state transitions (confirm, cancel, complete)
- High-level session logic

**Methods** (15 methods, ~400 lines):
- `createSession(sessionData)`
- `updateSession(sessionId, updateData)`
- `deleteSession(sessionId)`
- `getSession(sessionId)`
- `getEnhancedSessions(filters)`
- `confirmSession(sessionId)`
- `cancelSession(sessionId, reason)`
- `completeSession(sessionId)`
- `checkAutoCancel(sessionId)`
- `formatSessionDate(dateTime)`
- `scheduleSessionEvents(session)`
- `rescheduleSessionEvents(session)`
- `cancelSessionEvents(sessionId)`

**Dependencies**:
- `AttendanceService`
- `SessionDiscordService`
- `SessionSchedulerService`
- `RecurringSessionService`
- `SessionTaskService`
- `pool` (database)
- `logger`

---

## Migration Strategy

### Phase 1: Create New Services ✅ AttendanceService DONE
1. Create directory structure
2. Extract code to new services
3. Update imports
4. Ensure all dependencies are injected properly

### Phase 2: Update Main SessionService
1. Remove extracted code from sessionService.js
2. Import new services
3. Update method calls to delegate to new services
4. Keep backward-compatible API

### Phase 3: Update Controllers & Routes
1. Update imports in controllers
2. Update any direct service calls
3. Ensure no breaking changes

### Phase 4: Testing
1. Verify all endpoints still work
2. Test cron jobs
3. Test Discord integration
4. Test attendance tracking

---

## Breaking Changes

**None** - The refactoring maintains backward compatibility. All existing endpoints and method signatures remain the same.

---

## Benefits

1. **Improved Maintainability**: Each service has a single, well-defined responsibility
2. **Better Testability**: Smaller services are easier to unit test
3. **Reduced Cognitive Load**: Developers can focus on one concern at a time
4. **Easier Debugging**: Clear boundaries make it easier to locate bugs
5. **Better Reusability**: Services can be used independently

---

## Estimated Impact

### Before:
- `sessionService.js`: 2051 lines
- Cognitive Complexity: Very High
- Test Coverage: 0%

### After:
- `SessionService.js`: ~400 lines
- `AttendanceService.js`: ~260 lines
- `SessionDiscordService.js`: ~600 lines
- `SessionSchedulerService.js`: ~400 lines
- `RecurringSessionService.js`: ~350 lines
- `SessionTaskService.js`: ~150 lines
- **Total**: ~2160 lines (slight increase due to exports/imports)
- Cognitive Complexity: Low-Medium per service
- Test Coverage: Easier to achieve 80%+

---

## Implementation Status

- ✅ **AttendanceService**: Created and functional
- ⏳ **SessionDiscordService**: Pending
- ⏳ **SessionSchedulerService**: Pending
- ⏳ **RecurringSessionService**: Pending
- ⏳ **SessionTaskService**: Pending
- ⏳ **SessionService (refactor)**: Pending

---

## Next Steps

1. Complete creation of remaining 4 services
2. Update sessionService.js to use new services
3. Update controllers to import from new services
4. Test all functionality
5. Commit refactoring

---

**Document Created**: 2025-11-16
**Status**: In Progress
**Estimated Completion**: 4-6 hours of focused work
