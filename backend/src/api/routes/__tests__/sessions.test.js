/**
 * Unit tests for sessions route inline handlers
 *
 * These tests cover the inline route handlers in sessions.js that bypass
 * the controller pattern and use direct SQL via dbUtils or sessionService.
 *
 * Approach: Mount the router on a minimal Express app via supertest, with
 * the auth middleware mocked (the per-campaign role comes from the
 * x-test-role header, default DM), the REAL checkRole so DM-only gating is
 * asserted, and dbUtils/sessionService mocked to return controlled data.
 */

// ---------------------------------------------------------------------------
// Mocks - must be declared before any require() that triggers the route file
// ---------------------------------------------------------------------------

// Mock auth middleware to inject a test user and the per-campaign role that
// the real checkRole reads (req.campaignRole), then call next()
jest.mock('../../../middleware/auth', () => {
  return (req, res, next) => {
    req.user = { id: 1, role: 'DM', username: 'testdm' };
    req.campaignRole = req.headers['x-test-role'] || 'DM';
    next();
  };
});

// Mock validation middleware to always pass (pass-through)
jest.mock('../../../middleware/validation', () => ({
  createValidationMiddleware: () => (req, res, next) => next(),
  validate: () => (req, res, next) => next(),
}));

// Mock the session controller (delegates used by non-inline routes)
jest.mock('../../../controllers/sessionController', () => ({
  getUpcomingSessions: jest.fn((req, res) => res.json({ success: true, data: [] })),
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

// Task definitions (DM Settings -> Task Management); default: none carry an
// announce label, so nothing is announced.
jest.mock('../../../models/SessionTask', () => ({
  getAll: jest.fn().mockResolvedValue([]),
}));

// Mock sessionService
jest.mock('../../../services/sessionService', () => ({
  createRecurringSession: jest.fn(),
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
const SessionTask = require('../../../models/SessionTask');
const sessionController = require('../../../controllers/sessionController');
const logger = require('../../../utils/logger');

// Build a minimal Express app with the sessions router
function createApp() {
  const app = express();
  app.use(express.json());
  // Mirror the real app: Express 5 leaves req.body undefined on bodyless
  // requests, so default it to {} (index.js does the same).
  app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
  });
  // Mount the router at /sessions to mirror the real app
  const sessionsRouter = require('../sessions');
  app.use('/sessions', sessionsRouter);
  return app;
}

let app;

beforeEach(() => {
  jest.clearAllMocks();
  // resetMocks wipes the factory default, so restore "no task has an announce
  // label" explicitly; otherwise getAll resolves undefined and every task-history
  // test would silently exercise the lookup-failure path.
  SessionTask.getAll.mockResolvedValue([]);
  // Same for the mocked controller handlers: without an implementation a
  // request would never get a response.
  for (const handler of Object.values(sessionController)) {
    handler.mockImplementation((req, res) => res.json({ success: true }));
  }
  app = createApp();
});

// ===========================================================================
// DM-only gating (real checkRole)
// ===========================================================================
describe('DM-only session routes', () => {
  const dmOnly = [
    ['post', '/sessions'],
    ['put', '/sessions/5'],
    ['delete', '/sessions/5'],
    ['post', '/sessions/check-notifications'],
    ['post', '/sessions/recurring'],
    ['post', '/sessions/5/announce'],
    ['post', '/sessions/5/remind'],
    ['post', '/sessions/5/uncancel'],
  ];

  it.each(dmOnly)('%s %s rejects a Player with 403 and never reaches the handler', async (method, path) => {
    const res = await request(app)[method](path).set('x-test-role', 'Player').send({});

    expect(res.status).toBe(403);
    expect(sessionService.createRecurringSession).not.toHaveBeenCalled();
    expect(sessionService.postSessionAnnouncement).not.toHaveBeenCalled();
    expect(sessionService.sendSessionReminder).not.toHaveBeenCalled();
    expect(sessionService.uncancelSession).not.toHaveBeenCalled();
    expect(sessionController.createSession).not.toHaveBeenCalled();
    expect(sessionController.updateSession).not.toHaveBeenCalled();
    expect(sessionController.deleteSession).not.toHaveBeenCalled();
    expect(sessionController.checkAndSendSessionNotifications).not.toHaveBeenCalled();
  });

  it.each(dmOnly)('%s %s is allowed through for a DM (not 403)', async (method, path) => {
    const res = await request(app)[method](path).set('x-test-role', 'DM').send({});

    expect(res.status).not.toBe(403);
  });

  it.each([
    ['get', '/sessions'],
    ['get', '/sessions/enhanced'],
    ['post', '/sessions/5/attendance'],
  ])('%s %s stays open to a Player', async (method, path) => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    const res = await request(app)[method](path).set('x-test-role', 'Player').send({});

    expect(res.status).not.toBe(403);
  });
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
    // No query params means there is no WHERE clause at all
    const sql = dbUtils.executeQuery.mock.calls[0][0];
    expect(sql).not.toMatch(/^[ \t]*WHERE\b/m);
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([1]);
  });

  it('should filter by valid status', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/sessions/enhanced?status=scheduled');

    expect(res.status).toBe(200);
    expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    const sql = dbUtils.executeQuery.mock.calls[0][0];
    expect(sql).toContain('gs.status = $1');
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['scheduled', 1]);
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
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual(['confirmed', 1]);
  });

  it("should include the caller's own attendance on every session (F-1412)", async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    await request(app).get('/sessions/enhanced?status=confirmed');

    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    const normalized = sql.replace(/\s+/g, ' ');
    // status filter keeps $1, the caller's id is the next placeholder
    expect(normalized).toContain('sa2.user_id = $2');
    expect(normalized).toMatch(/AS user_status/);
    expect(normalized).toMatch(/AS user_response_type/);
    expect(normalized).toMatch(/AS user_character_id/);
    expect(params).toEqual(['confirmed', 1]);
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

  it('should create a recurring session and leave defaults to the service', async () => {
    const mockResult = { id: 'tmpl-1', ...validBody };
    sessionService.createRecurringSession.mockResolvedValue(mockResult);

    const res = await request(app)
      .post('/sessions/recurring')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockResult);

    // The route only adds created_by; omitted fields stay undefined so the
    // service applies DEFAULT_VALUES (one source of truth).
    const callArg = sessionService.createRecurringSession.mock.calls[0][0];
    expect(callArg.auto_announce_hours).toBeUndefined();
    expect(callArg.reminder_hours).toBeUndefined();
    expect(callArg.maximum_players).toBeUndefined();
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
// POST /sessions/task-history
// ===========================================================================
describe('POST /sessions/task-history', () => {
  it('should save a task assignment and return the created row', async () => {
    const savedRow = {
      id: 1,
      session_id: 5,
      session_title: 'Session 12',
      assignments: { pre: {}, during: {}, post: {} },
      character_count: 4,
      late_count: 1,
      created_by: 1,
    };
    dbUtils.executeQuery.mockResolvedValue({ rows: [savedRow] });

    const res = await request(app)
      .post('/sessions/task-history')
      .send({
        session_id: 5,
        session_title: 'Session 12',
        assignments: { pre: {}, during: {}, post: {} },
        character_count: 4,
        late_count: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(savedRow);
    expect(dbUtils.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO session_task_history'),
      expect.arrayContaining([5, 'Session 12'])
    );
    // created_by comes from the authenticated user (id 1 from the auth mock)
    const callArgs = dbUtils.executeQuery.mock.calls[0][1];
    expect(callArgs[callArgs.length - 1]).toBe(1);
  });

  it('should default session_id/title to null when not provided', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 2 }] });

    const res = await request(app)
      .post('/sessions/task-history')
      .send({ assignments: { pre: {}, during: {}, post: {} } });

    expect(res.status).toBe(201);
    const callArgs = dbUtils.executeQuery.mock.calls[0][1];
    expect(callArgs[0]).toBeNull(); // session_id
    expect(callArgs[1]).toBeNull(); // session_title
  });

  it('records an announcement for every task with an announce label, across phases', async () => {
    const SessionTask = require('../../../models/SessionTask');
    SessionTask.getAll.mockResolvedValueOnce([
      { id: 1, phase: 'post', name: 'Bring snacks next week', announce_label: 'Snack Master' },
      { id: 2, phase: 'pre', name: 'Recap', announce_label: 'Recap by' },
      { id: 3, phase: 'during', name: 'Loot Master', announce_label: 'Loot Masters' },
      { id: 4, phase: 'post', name: 'Trash', announce_label: null },
    ]);
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 9 }] });

    await request(app)
      .post('/sessions/task-history')
      .send({
        assignments: {
          pre: { Imogen: ['Recap'] },
          during: { Imogen: ['Loot Master'], Wokwok: ['Loot Master'], Zolgrak: ['Lore Master'] },
          post: { Wokwok: ['Bring snacks next week'], Zolgrak: ['Trash'] },
        },
      });

    const [sql, callArgs] = dbUtils.executeQuery.mock.calls[0];
    expect(sql).toContain('snack_master_name, announcements, created_by');
    // The legacy column still carries whoever holds the "Snack Master" label.
    expect(callArgs[5]).toBe('Wokwok');
    expect(JSON.parse(callArgs[6])).toEqual({
      'Snack Master': 'Wokwok',
      'Recap by': 'Imogen',
      'Loot Masters': 'Imogen, Wokwok',
    });
  });

  it('matches the Snack Master label case-insensitively for the legacy column', async () => {
    const SessionTask = require('../../../models/SessionTask');
    SessionTask.getAll.mockResolvedValueOnce([
      { id: 1, phase: 'post', name: 'Snacks', announce_label: 'snack master' },
    ]);
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 9 }] });

    await request(app)
      .post('/sessions/task-history')
      .send({ assignments: { pre: {}, during: {}, post: { Imogen: ['Snacks'] } } });

    const callArgs = dbUtils.executeQuery.mock.calls[0][1];
    expect(callArgs[5]).toBe('Imogen');
    expect(JSON.parse(callArgs[6])).toEqual({ 'snack master': 'Imogen' });
  });

  it('stores null snack_master_name and null announcements when nothing announced was dealt', async () => {
    const SessionTask = require('../../../models/SessionTask');
    SessionTask.getAll.mockResolvedValueOnce([
      { id: 1, phase: 'post', name: 'Snacks', announce_label: 'Snack Master' },
    ]);
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 4 }] });

    await request(app)
      .post('/sessions/task-history')
      .send({
        assignments: {
          pre: {},
          during: {},
          post: { Wokwok: ['Food, Drink, and Trash Clear Check'] },
        },
      });

    const callArgs = dbUtils.executeQuery.mock.calls[0][1];
    expect(callArgs[5]).toBeNull();
    expect(callArgs[6]).toBeNull();
  });

  it('should return 400 when assignments are missing', async () => {
    const res = await request(app)
      .post('/sessions/task-history')
      .send({ session_id: 5 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(dbUtils.executeQuery).not.toHaveBeenCalled();
  });

  it('should return 500 on database error', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('fail'));

    const res = await request(app)
      .post('/sessions/task-history')
      .send({ assignments: { pre: {}, during: {}, post: {} } });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// GET /sessions/task-history
// ===========================================================================
describe('GET /sessions/task-history', () => {
  it('should return history rows (most recent first)', async () => {
    const rows = [
      { id: 2, session_title: 'Session 13', created_by_name: 'testdm' },
      { id: 1, session_title: 'Session 12', created_by_name: 'testdm' },
    ];
    dbUtils.executeQuery.mockResolvedValue({ rows });

    const res = await request(app).get('/sessions/task-history');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(rows);
    expect(dbUtils.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM session_task_history'),
      [50] // default limit
    );
  });

  it('should honor a custom limit', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/sessions/task-history?limit=10');

    expect(res.status).toBe(200);
    expect(dbUtils.executeQuery).toHaveBeenCalledWith(
      expect.any(String),
      [10]
    );
  });

  it('should return 500 on database error', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/sessions/task-history');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// GET /sessions/last-session-attendees
// ===========================================================================
describe('GET /sessions/last-session-attendees', () => {
  // Query order in the route: upcoming session -> task history ->
  // (history hit: character lookup) | (miss: past session -> RSVPs)

  it('uses the most recent assignment dealt for a different session and maps names to active character ids', async () => {
    const assignments = {
      pre: { 'Fighter Bob': ['Recap'] },
      during: { 'Fighter Bob': ['Loot Master'], 'Wizard Alice': ['Lore Master'] },
      post: { 'Wizard Alice': ['Trash'], DM: ['Snacks'] },
    };
    dbUtils.executeQuery
      .mockResolvedValueOnce({ rows: [{ id: 30 }] }) // session being dealt for
      .mockResolvedValueOnce({
        rows: [{ session_title: 'Session 12', created_at: '2026-09-04T01:00:00Z', assignments }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }); // character lookup

    const res = await request(app).get('/sessions/last-session-attendees');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      source: 'task_history',
      session_title: 'Session 12',
      recorded_at: '2026-09-04T01:00:00Z',
      character_ids: [1, 2],
      assignments,
    });

    // "Current" = first session that started < 12h ago or is still to come;
    // each record is attributed to a session the same way from its created_at,
    // and the stored session_id is deliberately ignored.
    const [currentSql] = dbUtils.executeQuery.mock.calls[0];
    expect(currentSql).toContain("start_time > NOW() - INTERVAL '12 hours'");
    expect(currentSql).toContain('ORDER BY start_time ASC');
    const [historySql, historyParams] = dbUtils.executeQuery.mock.calls[1];
    expect(historySql).toContain("gs.start_time > sth.created_at - INTERVAL '12 hours'");
    expect(historySql).toContain('dealt_for_session_id IS DISTINCT FROM $1::int');
    expect(historySql).not.toContain('sth.session_id');
    expect(historyParams).toEqual([30]);

    // The DM pseudo-entry is never looked up; only active characters count.
    const [charSql, charParams] = dbUtils.executeQuery.mock.calls[2];
    expect(charSql).toContain('active = true');
    expect(charParams[0].sort()).toEqual(['Fighter Bob', 'Wizard Alice']);
  });

  it('falls back to attending RSVPs on the most recent past session when there is no usable history', async () => {
    dbUtils.executeQuery
      .mockResolvedValueOnce({ rows: [] }) // no upcoming session
      .mockResolvedValueOnce({ rows: [] }) // no history
      .mockResolvedValueOnce({ rows: [{ id: 12, title: 'Session 12', start_time: '2026-09-03T23:00:00Z' }] })
      .mockResolvedValueOnce({ rows: [{ character_id: 5 }, { character_id: null }, { character_id: 7 }] });

    const res = await request(app).get('/sessions/last-session-attendees');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      source: 'rsvp',
      session_title: 'Session 12',
      recorded_at: '2026-09-03T23:00:00Z',
      character_ids: [5, 7],
      assignments: null,
    });

    // Null upcoming id is bound (not interpolated) and the RSVP match accepts
    // either a Discord response_type or an in-app accepted status.
    expect(dbUtils.executeQuery.mock.calls[1][1]).toEqual([null]);
    const [rsvpSql, rsvpParams] = dbUtils.executeQuery.mock.calls[3];
    expect(rsvpSql).toContain('sa.response_type = ANY($2::text[]) OR sa.status = $3');
    expect(rsvpParams[0]).toBe(12);
    expect(rsvpParams[1]).toEqual(expect.arrayContaining(['yes', 'late', 'early', 'late_and_early']));
    expect(rsvpParams[1]).not.toContain('no');
    expect(rsvpParams[2]).toBe('accepted');
  });

  it('returns null data when there is neither history nor a past session', async () => {
    dbUtils.executeQuery
      .mockResolvedValueOnce({ rows: [{ id: 30 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/sessions/last-session-attendees');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
    expect(dbUtils.executeQuery).toHaveBeenCalledTimes(3);
  });

  it('returns 500 on database error', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/sessions/last-session-attendees');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(logger.error).toHaveBeenCalled();
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
  it('should record detailed attendance with canonical response_type', async () => {
    const mockAttendance = { id: 1, session_id: 10, user_id: 1, status: 'accepted' };
    sessionService.recordAttendance.mockResolvedValue(mockAttendance);

    const res = await request(app)
      .post('/sessions/10/attendance/detailed')
      .send({ response_type: 'yes', notes: 'Looking forward to it' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockAttendance);
    expect(sessionService.recordAttendance).toHaveBeenCalledWith(
      '10',
      1,
      'yes',
      expect.objectContaining({ response_type: 'yes', notes: 'Looking forward to it' })
    );
  });

  it('should accept legacy status aliases for response_type', async () => {
    sessionService.recordAttendance.mockResolvedValue({ id: 1 });
    const res = await request(app)
      .post('/sessions/10/attendance/detailed')
      .send({ response_type: 'accepted' });
    expect(res.status).toBe(200);
  });

  it('should reject unknown response_type values', async () => {
    const res = await request(app)
      .post('/sessions/10/attendance/detailed')
      .send({ response_type: 'banana' });
    expect(res.status).toBe(400);
    expect(sessionService.recordAttendance).not.toHaveBeenCalled();
  });

  it('should return 500 when service throws', async () => {
    sessionService.recordAttendance.mockRejectedValue(new Error('fail'));

    const res = await request(app)
      .post('/sessions/10/attendance/detailed')
      .send({ response_type: 'no' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// task-history: announcement lookup failure (F-0092)
// ===========================================================================
describe('POST /sessions/task-history when the task definition lookup fails', () => {
  it('still saves the row, with null announcements and a warning', async () => {
    SessionTask.getAll.mockRejectedValue(new Error('definitions unavailable'));
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 9 }] });

    const res = await request(app)
      .post('/sessions/task-history')
      .send({ assignments: { pre: { Valeros: ['Snacks'] } } });

    expect(res.status).toBe(201);
    const params = dbUtils.executeQuery.mock.calls[0][1];
    expect(params[5]).toBeNull(); // snack_master_name
    expect(params[6]).toBeNull(); // announcements
    expect(logger.warn).toHaveBeenCalled();
  });
});
