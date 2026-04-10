/**
 * Unit tests for sessions route inline handlers
 *
 * These tests cover the inline route handlers in sessions.js that bypass
 * the controller pattern and use direct SQL via dbUtils or sessionService.
 *
 * Approach: Mount the router on a minimal Express app via supertest, with
 * auth/role middleware mocked to pass through, and dbUtils/sessionService
 * mocked to return controlled data.
 */

// ---------------------------------------------------------------------------
// Mocks - must be declared before any require() that triggers the route file
// ---------------------------------------------------------------------------

// Mock auth middleware to inject a test user and call next()
jest.mock('../../../middleware/auth', () => {
  return (req, res, next) => {
    req.user = req._testUser || { id: 1, role: 'DM', username: 'testdm' };
    next();
  };
});

// Mock checkRole to always pass (individual role tests belong in middleware tests)
jest.mock('../../../middleware/checkRole', () => {
  return () => (req, res, next) => next();
});

// Mock validation middleware to always pass (pass-through)
jest.mock('../../../middleware/validation', () => ({
  createValidationMiddleware: () => (req, res, next) => next(),
  validate: () => (req, res, next) => next(),
}));

// Mock the session controller (delegates used by non-inline routes)
jest.mock('../../../controllers/sessionController', () => ({
  getUpcomingSessions: jest.fn((req, res) => res.json({ success: true, data: [] })),
  getSession: jest.fn((req, res) => res.json({ success: true, data: {} })),
  createSession: jest.fn((req, res) => res.status(201).json({ success: true })),
  updateSession: jest.fn((req, res) => res.json({ success: true })),
  deleteSession: jest.fn((req, res) => res.json({ success: true })),
  updateAttendance: jest.fn((req, res) => res.json({ success: true })),
  checkAndSendSessionNotifications: jest.fn((req, res) => res.json({ success: true })),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Mock dbUtils
jest.mock('../../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

// Mock sessionService
jest.mock('../../../services/sessionService', () => ({
  createRecurringSession: jest.fn(),
  getRecurringSessionInstances: jest.fn(),
  updateRecurringSession: jest.fn(),
  deleteRecurringSession: jest.fn(),
  generateAdditionalInstances: jest.fn(),
  postSessionAnnouncement: jest.fn(),
  sendSessionReminder: jest.fn(),
  uncancelSession: jest.fn(),
  recordAttendance: jest.fn(),
  getSessionAttendance: jest.fn(),
}));

// Mock ApiResponse to use the real implementation (it's pure logic)
// We leave it unmocked so the actual formatting runs through.

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const express = require('express');
const request = require('supertest');
const dbUtils = require('../../../utils/dbUtils');
const sessionService = require('../../../services/sessionService');
const logger = require('../../../utils/logger');

// Build a minimal Express app with the sessions router
function createApp() {
  const app = express();
  app.use(express.json());
  // Mount the router at /sessions to mirror the real app
  const sessionsRouter = require('../sessions');
  app.use('/sessions', sessionsRouter);
  return app;
}

let app;

beforeEach(() => {
  jest.clearAllMocks();
  app = createApp();
});

// ===========================================================================
// GET /sessions/enhanced
// ===========================================================================
describe('GET /sessions/enhanced', () => {
  const mockSessions = [
    {
      id: 1,
      title: 'Session 1',
      status: 'scheduled',
      start_time: '2026-04-15T18:00:00Z',
      confirmed_count: '3',
      declined_count: '1',
      maybe_count: '0',
      confirmed_names: 'Valeros, Seelah, Merisiel',
      declined_names: 'Ezren',
      maybe_names: null,
    },
  ];

  it('should return all sessions when no filters are provided', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: mockSessions });

    const res = await request(app).get('/sessions/enhanced');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockSessions);
    expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    // No query params means the WHERE clause should just be '1=1'
    const sql = dbUtils.executeQuery.mock.calls[0][0];
    expect(sql).toContain('1=1');
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([]);
  });

  it('should filter by valid status', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/sessions/enhanced?status=scheduled');

    expect(res.status).toBe(200);
    expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    const sql = dbUtils.executeQuery.mock.calls[0][0];
    expect(sql).toContain('gs.status = $1');
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['scheduled']);
  });

  it('should reject an invalid status value', async () => {
    const res = await request(app).get('/sessions/enhanced?status=bogus');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Invalid status');
    expect(dbUtils.executeQuery).not.toHaveBeenCalled();
  });

  it('should add upcoming_only filter when set to true', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/sessions/enhanced?upcoming_only=true');

    expect(res.status).toBe(200);
    const sql = dbUtils.executeQuery.mock.calls[0][0];
    expect(sql).toContain('gs.start_time > NOW()');
  });

  it('should not add upcoming_only filter when set to false', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/sessions/enhanced?upcoming_only=false');

    expect(res.status).toBe(200);
    const sql = dbUtils.executeQuery.mock.calls[0][0];
    expect(sql).not.toContain('gs.start_time > NOW()');
  });

  it('should combine status and upcoming_only filters', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/sessions/enhanced?status=confirmed&upcoming_only=true');

    expect(res.status).toBe(200);
    const sql = dbUtils.executeQuery.mock.calls[0][0];
    expect(sql).toContain('gs.status = $1');
    expect(sql).toContain('gs.start_time > NOW()');
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['confirmed']);
  });

  it('should return 500 when the database query fails', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('DB connection lost'));

    const res = await request(app).get('/sessions/enhanced');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });
});

// ===========================================================================
// POST /sessions/recurring
// ===========================================================================
describe('POST /sessions/recurring', () => {
  const validBody = {
    title: 'Weekly Game Night',
    start_time: '2026-04-15T18:00:00Z',
    end_time: '2026-04-15T22:00:00Z',
    recurring_pattern: 'weekly',
    recurring_day_of_week: 3,
    description: 'Our regular Wednesday game',
  };

  it('should create a recurring session with defaults', async () => {
    const mockResult = { id: 'tmpl-1', ...validBody };
    sessionService.createRecurringSession.mockResolvedValue(mockResult);

    const res = await request(app)
      .post('/sessions/recurring')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockResult);

    // Verify defaults were applied
    const callArg = sessionService.createRecurringSession.mock.calls[0][0];
    expect(callArg.auto_announce_hours).toBe(168);
    expect(callArg.reminder_hours).toBe(48);
    expect(callArg.confirmation_hours).toBe(48);
    expect(callArg.maximum_players).toBe(6);
    expect(callArg.created_by).toBe(1); // from mocked req.user.id
  });

  it('should use provided values instead of defaults', async () => {
    const customBody = {
      ...validBody,
      auto_announce_hours: 72,
      reminder_hours: 24,
      confirmation_hours: 12,
      maximum_players: 4,
    };
    sessionService.createRecurringSession.mockResolvedValue({ id: 'tmpl-2' });

    const res = await request(app)
      .post('/sessions/recurring')
      .send(customBody);

    expect(res.status).toBe(201);
    const callArg = sessionService.createRecurringSession.mock.calls[0][0];
    expect(callArg.auto_announce_hours).toBe(72);
    expect(callArg.reminder_hours).toBe(24);
    expect(callArg.confirmation_hours).toBe(12);
    expect(callArg.maximum_players).toBe(4);
  });

  it('should return 500 when service throws', async () => {
    sessionService.createRecurringSession.mockRejectedValue(new Error('DB error'));

    const res = await request(app)
      .post('/sessions/recurring')
      .send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /sessions/recurring/:templateId/instances
// ===========================================================================
describe('GET /sessions/recurring/:templateId/instances', () => {
  it('should return instances for a template', async () => {
    const mockInstances = [
      { id: 1, template_id: 'tmpl-1', start_time: '2026-04-15T18:00:00Z' },
      { id: 2, template_id: 'tmpl-1', start_time: '2026-04-22T18:00:00Z' },
    ];
    sessionService.getRecurringSessionInstances.mockResolvedValue(mockInstances);

    const res = await request(app).get('/sessions/recurring/tmpl-1/instances');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockInstances);
    expect(sessionService.getRecurringSessionInstances).toHaveBeenCalledWith(
      'tmpl-1',
      { upcoming_only: false, limit: 10 }
    );
  });

  it('should pass upcoming_only and limit filters', async () => {
    sessionService.getRecurringSessionInstances.mockResolvedValue([]);

    const res = await request(app).get(
      '/sessions/recurring/tmpl-1/instances?upcoming_only=true&limit=5'
    );

    expect(res.status).toBe(200);
    expect(sessionService.getRecurringSessionInstances).toHaveBeenCalledWith(
      'tmpl-1',
      { upcoming_only: true, limit: 5 }
    );
  });

  it('should default limit to 10 when not provided', async () => {
    sessionService.getRecurringSessionInstances.mockResolvedValue([]);

    await request(app).get('/sessions/recurring/tmpl-1/instances');

    const filters = sessionService.getRecurringSessionInstances.mock.calls[0][1];
    expect(filters.limit).toBe(10);
  });

  it('should return 500 when service throws', async () => {
    sessionService.getRecurringSessionInstances.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/sessions/recurring/tmpl-1/instances');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Failed to get session instances');
  });
});

// ===========================================================================
// PUT /sessions/recurring/:templateId
// ===========================================================================
describe('PUT /sessions/recurring/:templateId', () => {
  it('should update a recurring session template', async () => {
    const mockTemplate = { id: 'tmpl-1', title: 'Updated Title' };
    sessionService.updateRecurringSession.mockResolvedValue(mockTemplate);

    const res = await request(app)
      .put('/sessions/recurring/tmpl-1')
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockTemplate);
    expect(sessionService.updateRecurringSession).toHaveBeenCalledWith(
      'tmpl-1',
      { title: 'Updated Title' }
    );
  });

  it('should return 500 when service throws', async () => {
    sessionService.updateRecurringSession.mockRejectedValue(new Error('not found'));

    const res = await request(app)
      .put('/sessions/recurring/tmpl-1')
      .send({ title: 'X' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// DELETE /sessions/recurring/:templateId
// ===========================================================================
describe('DELETE /sessions/recurring/:templateId', () => {
  it('should delete a recurring session and future instances by default', async () => {
    const mockResult = { id: 'tmpl-1', deleted: true };
    sessionService.deleteRecurringSession.mockResolvedValue(mockResult);

    const res = await request(app).delete('/sessions/recurring/tmpl-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(sessionService.deleteRecurringSession).toHaveBeenCalledWith('tmpl-1', true);
  });

  it('should preserve future instances when delete_instances is false', async () => {
    sessionService.deleteRecurringSession.mockResolvedValue({ id: 'tmpl-1' });

    const res = await request(app).delete(
      '/sessions/recurring/tmpl-1?delete_instances=false'
    );

    expect(res.status).toBe(200);
    expect(sessionService.deleteRecurringSession).toHaveBeenCalledWith('tmpl-1', false);
  });

  it('should return 500 when service throws', async () => {
    sessionService.deleteRecurringSession.mockRejectedValue(new Error('fail'));

    const res = await request(app).delete('/sessions/recurring/tmpl-1');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// GET /sessions/:id/attendance/detailed
// ===========================================================================
describe('GET /sessions/:id/attendance/detailed', () => {
  it('should return detailed attendance for a session', async () => {
    const mockAttendance = [
      { user_id: 1, username: 'player1', status: 'accepted', response_type: 'yes' },
      { user_id: 2, username: 'player2', status: 'declined', response_type: 'no' },
    ];
    sessionService.getSessionAttendance.mockResolvedValue(mockAttendance);

    const res = await request(app).get('/sessions/42/attendance/detailed');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockAttendance);
    expect(sessionService.getSessionAttendance).toHaveBeenCalledWith('42');
  });

  it('should return 500 when service throws', async () => {
    sessionService.getSessionAttendance.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/sessions/42/attendance/detailed');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Failed to fetch attendance');
  });
});

// ===========================================================================
// POST /sessions/:id/notes
// ===========================================================================
describe('POST /sessions/:id/notes', () => {
  it('should create a session note with default type', async () => {
    const mockNote = {
      id: 1,
      session_id: 10,
      user_id: 1,
      note_type: 'general',
      note: 'Remember to bring snacks',
    };
    dbUtils.executeQuery.mockResolvedValue({ rows: [mockNote] });

    const res = await request(app)
      .post('/sessions/10/notes')
      .send({ note: 'Remember to bring snacks' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockNote);
    // Verify SQL params: sessionId, userId, note_type, note
    expect(dbUtils.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO session_notes'),
      ['10', 1, 'general', 'Remember to bring snacks']
    );
  });

  it('should use provided note_type', async () => {
    const mockNote = { id: 2, note_type: 'prep_request', note: 'Level up characters' };
    dbUtils.executeQuery.mockResolvedValue({ rows: [mockNote] });

    const res = await request(app)
      .post('/sessions/10/notes')
      .send({ note: 'Level up characters', note_type: 'prep_request' });

    expect(res.status).toBe(201);
    expect(dbUtils.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO session_notes'),
      ['10', 1, 'prep_request', 'Level up characters']
    );
  });

  it('should return 500 when database insert fails', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('constraint violation'));

    const res = await request(app)
      .post('/sessions/10/notes')
      .send({ note: 'A note' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Failed to add note');
    expect(logger.error).toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /sessions/:id/notes
// ===========================================================================
describe('GET /sessions/:id/notes', () => {
  it('should return notes for a session', async () => {
    const mockNotes = [
      { id: 1, session_id: 10, note: 'First note', username: 'dm1', character_name: null },
      { id: 2, session_id: 10, note: 'Second note', username: 'player1', character_name: 'Valeros' },
    ];
    dbUtils.executeQuery.mockResolvedValue({ rows: mockNotes });

    const res = await request(app).get('/sessions/10/notes');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockNotes);
    expect(dbUtils.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM session_notes'),
      ['10']
    );
  });

  it('should return empty array when no notes exist', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/sessions/99/notes');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('should return 500 on database error', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('timeout'));

    const res = await request(app).get('/sessions/10/notes');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// GET /sessions/:id/tasks
// ===========================================================================
describe('GET /sessions/:id/tasks', () => {
  it('should return tasks for a session', async () => {
    const mockTasks = [
      { id: 1, session_id: 5, task: 'Prep maps', assigned_to_name: 'dm1' },
    ];
    dbUtils.executeQuery.mockResolvedValue({ rows: mockTasks });

    const res = await request(app).get('/sessions/5/tasks');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockTasks);
    expect(dbUtils.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM session_tasks'),
      ['5']
    );
  });

  it('should return 500 on database error', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/sessions/5/tasks');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// PATCH /sessions/:id/tasks/:taskId/complete
// ===========================================================================
describe('PATCH /sessions/:id/tasks/:taskId/complete', () => {
  it('should mark a task as completed', async () => {
    const mockTask = { id: 3, session_id: 5, status: 'completed', completed_at: '2026-04-10T12:00:00Z' };
    dbUtils.executeQuery.mockResolvedValue({ rows: [mockTask] });

    const res = await request(app).patch('/sessions/5/tasks/3/complete');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockTask);
    expect(dbUtils.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE session_tasks'),
      ['3', '5']
    );
  });

  it('should return 404 when task is not found', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).patch('/sessions/5/tasks/999/complete');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Task not found');
  });

  it('should return 500 on database error', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('fail'));

    const res = await request(app).patch('/sessions/5/tasks/3/complete');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// POST /sessions/:id/announce
// ===========================================================================
describe('POST /sessions/:id/announce', () => {
  it('should post an announcement and return discord message id', async () => {
    sessionService.postSessionAnnouncement.mockResolvedValue({ id: 'discord-msg-123' });

    const res = await request(app).post('/sessions/7/announce');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.discordMessageId).toBe('discord-msg-123');
  });

  it('should return 400 when Discord is not configured', async () => {
    sessionService.postSessionAnnouncement.mockResolvedValue(null);

    const res = await request(app).post('/sessions/7/announce');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Discord not configured');
  });

  it('should return 500 when announcement fails', async () => {
    sessionService.postSessionAnnouncement.mockRejectedValue(new Error('webhook error'));

    const res = await request(app).post('/sessions/7/announce');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// POST /sessions/:id/uncancel
// ===========================================================================
describe('POST /sessions/:id/uncancel', () => {
  it('should reinstate a cancelled session', async () => {
    const mockSession = { id: 5, status: 'scheduled', title: 'Game Night' };
    sessionService.uncancelSession.mockResolvedValue(mockSession);

    const res = await request(app).post('/sessions/5/uncancel');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Session has been reinstated');
    expect(res.body.data).toEqual(mockSession);
  });

  it('should return 404 when session is not found', async () => {
    sessionService.uncancelSession.mockResolvedValue(null);

    const res = await request(app).post('/sessions/999/uncancel');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Session not found');
  });

  it('should return 400 when uncancel fails with an error', async () => {
    sessionService.uncancelSession.mockRejectedValue(new Error('Session is not cancelled'));

    const res = await request(app).post('/sessions/5/uncancel');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Session is not cancelled');
  });
});

// ===========================================================================
// POST /sessions/link-discord
// ===========================================================================
describe('POST /sessions/link-discord', () => {
  it('should link a Discord account to the current user', async () => {
    const mockUser = { id: 1, username: 'testdm', discord_id: '123456', discord_username: 'TestDM#1234' };
    dbUtils.executeQuery.mockResolvedValue({ rows: [mockUser] });

    const res = await request(app)
      .post('/sessions/link-discord')
      .send({ discord_id: '123456', discord_username: 'TestDM#1234' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockUser);
    expect(dbUtils.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      ['123456', 'TestDM#1234', 1]
    );
  });

  it('should return 404 when user is not found', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post('/sessions/link-discord')
      .send({ discord_id: '123456' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found');
  });

  it('should return 400 on unique constraint violation (duplicate discord_id)', async () => {
    const uniqueError = new Error('duplicate key');
    uniqueError.code = '23505';
    dbUtils.executeQuery.mockRejectedValue(uniqueError);

    const res = await request(app)
      .post('/sessions/link-discord')
      .send({ discord_id: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('already linked');
  });

  it('should return 500 on generic database error', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('connection reset'));

    const res = await request(app)
      .post('/sessions/link-discord')
      .send({ discord_id: '123456' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// GET /sessions/upcoming-detailed
// ===========================================================================
describe('GET /sessions/upcoming-detailed', () => {
  it('should return upcoming sessions from the view', async () => {
    const mockRows = [{ id: 1, title: 'Next Session', start_time: '2026-04-15T18:00:00Z' }];
    dbUtils.executeQuery.mockResolvedValue({ rows: mockRows });

    const res = await request(app).get('/sessions/upcoming-detailed');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockRows);
  });

  it('should return 500 on database error', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/sessions/upcoming-detailed');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// GET /sessions/discord-mapping
// ===========================================================================
describe('GET /sessions/discord-mapping', () => {
  it('should return the current user discord mapping', async () => {
    const mockUser = { id: 1, username: 'testdm', discord_id: '123', discord_username: 'DM#1' };
    dbUtils.executeQuery.mockResolvedValue({ rows: [mockUser] });

    const res = await request(app).get('/sessions/discord-mapping');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockUser);
  });

  it('should return 404 when user is not found', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/sessions/discord-mapping');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found');
  });

  it('should return 500 on database error', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/sessions/discord-mapping');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// POST /sessions/recurring/:templateId/generate
// ===========================================================================
describe('POST /sessions/recurring/:templateId/generate', () => {
  it('should generate additional instances with default count', async () => {
    const mockInstances = [{ id: 1 }, { id: 2 }];
    sessionService.generateAdditionalInstances.mockResolvedValue(mockInstances);

    const res = await request(app).post('/sessions/recurring/tmpl-1/generate');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('2');
    expect(sessionService.generateAdditionalInstances).toHaveBeenCalledWith('tmpl-1', 12);
  });

  it('should use provided count', async () => {
    sessionService.generateAdditionalInstances.mockResolvedValue([{ id: 1 }]);

    const res = await request(app)
      .post('/sessions/recurring/tmpl-1/generate')
      .send({ count: 5 });

    expect(res.status).toBe(200);
    expect(sessionService.generateAdditionalInstances).toHaveBeenCalledWith('tmpl-1', 5);
  });

  it('should return 500 when service throws', async () => {
    sessionService.generateAdditionalInstances.mockRejectedValue(new Error('fail'));

    const res = await request(app).post('/sessions/recurring/tmpl-1/generate');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// POST /sessions/:id/remind
// ===========================================================================
describe('POST /sessions/:id/remind', () => {
  it('should send a reminder with default type', async () => {
    sessionService.sendSessionReminder.mockResolvedValue(undefined);

    const res = await request(app).post('/sessions/7/remind');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(sessionService.sendSessionReminder).toHaveBeenCalledWith('7', 'all', { isManual: true });
  });

  it('should use provided reminder_type', async () => {
    sessionService.sendSessionReminder.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/sessions/7/remind')
      .send({ reminder_type: 'non_responders' });

    expect(res.status).toBe(200);
    expect(sessionService.sendSessionReminder).toHaveBeenCalledWith('7', 'non_responders', { isManual: true });
  });

  it('should return 500 when service throws', async () => {
    sessionService.sendSessionReminder.mockRejectedValue(new Error('discord down'));

    const res = await request(app).post('/sessions/7/remind');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// POST /sessions/:id/attendance/detailed
// ===========================================================================
describe('POST /sessions/:id/attendance/detailed', () => {
  it('should record detailed attendance', async () => {
    const mockAttendance = { id: 1, session_id: 10, user_id: 1, status: 'accepted' };
    sessionService.recordAttendance.mockResolvedValue(mockAttendance);

    const res = await request(app)
      .post('/sessions/10/attendance/detailed')
      .send({ response_type: 'accepted', notes: 'Looking forward to it' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockAttendance);
    expect(sessionService.recordAttendance).toHaveBeenCalledWith(
      '10',
      1,
      'accepted',
      expect.objectContaining({ response_type: 'accepted', notes: 'Looking forward to it' })
    );
  });

  it('should return 500 when service throws', async () => {
    sessionService.recordAttendance.mockRejectedValue(new Error('fail'));

    const res = await request(app)
      .post('/sessions/10/attendance/detailed')
      .send({ response_type: 'declined' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
