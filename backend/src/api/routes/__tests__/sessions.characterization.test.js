/**
 * Characterisation tests for the sessions router (finding F-0129).
 *
 * Updated by W09: the unused routes (upcoming-detailed, discord-mapping,
 * link-discord, GET /:id, recurring instances/update/delete/generate) were
 * removed, every express-validator chain is now enforced, and 400 messages are
 * plain strings.
 *
 * These pin the observable behaviour of the handlers that used to live inline
 * in routes/sessions.js (response shapes, status codes, messages, and the SQL
 * text/params sent to the database) so they can be moved to controllers and
 * models without changing behaviour. They deliberately record quirks as they
 * are today (for example express-validator chains whose results are never
 * checked) - they are not endorsements.
 */

jest.mock('../../../middleware/auth', () => {
  return (req, res, next) => {
    req.user = { id: 7, role: 'DM', username: 'testdm' };
    req.campaignId = 3;
    // Tests choose the per-campaign role with the x-test-role header.
    req.campaignRole = req.headers['x-test-role'] || 'DM';
    next();
  };
});
jest.mock('../../../middleware/checkRole', () => {
  return () => (req, res, next) => next();
});
jest.mock('../../../middleware/validation', () => ({
  createValidationMiddleware: () => (req, res, next) => next(),
  validate: () => (req, res, next) => next(),
}));
jest.mock('../../../controllers/sessionController', () => ({
  getUpcomingSessions: jest.fn((req, res) => res.json({ success: true, data: [] })),
  createSession: jest.fn((req, res) => res.status(201).json({ success: true })),
  updateSession: jest.fn((req, res) => res.json({ success: true })),
  deleteSession: jest.fn((req, res) => res.json({ success: true })),
  updateAttendance: jest.fn((req, res) => res.json({ success: true })),
  checkAndSendSessionNotifications: jest.fn((req, res) => res.json({ success: true })),
}));
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));
jest.mock('../../../models/SessionTask', () => ({
  getAll: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../services/sessionService', () => ({
  createRecurringSession: jest.fn(),
  postSessionAnnouncement: jest.fn(),
  sendSessionReminder: jest.fn(),
  uncancelSession: jest.fn(),
  recordAttendance: jest.fn(),
  getSessionAttendance: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const dbUtils = require('../../../utils/dbUtils');
const sessionService = require('../../../services/sessionService');
const SessionTask = require('../../../models/SessionTask');
const logger = require('../../../utils/logger');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
  });
  app.use('/sessions', require('../sessions'));
  return app;
}

let app;
beforeEach(() => {
  jest.clearAllMocks();
  SessionTask.getAll.mockResolvedValue([]);
  app = createApp();
});

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

describe('GET /sessions/enhanced (characterisation)', () => {
  it('issues one parameterised query and wraps rows in the ApiResponse envelope', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });
    const res = await request(app).get('/sessions/enhanced?status=scheduled&upcoming_only=true');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Sessions retrieved successfully', data: [{ id: 1 }] });
    const [sql, params] = dbUtils.executeQuery.mock.calls[0];
    expect(norm(sql)).toContain('FROM game_sessions gs LEFT JOIN session_attendance sa ON gs.id = sa.session_id');
    expect(norm(sql)).toContain('WHERE gs.status = $1 AND gs.start_time > NOW() GROUP BY gs.id ORDER BY gs.start_time');
    expect(params).toEqual(['scheduled']);
  });

  it('returns the standard 400 validation envelope for a bad status', async () => {
    const res = await request(app).get('/sessions/enhanced?status=bogus');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toEqual({
      general: [expect.stringMatching(/^Invalid status value\. Must be one of: /)],
    });
  });

  it('returns the ApiResponse 500 envelope and logs on failure', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/sessions/enhanced');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Failed to fetch sessions', errors: null });
    expect(logger.error).toHaveBeenCalledWith('Failed to fetch enhanced sessions:', expect.any(Error));
  });
});

describe('GET /sessions/next-with-attendance (characterisation)', () => {
  it('returns data:null when there is no upcoming session', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/sessions/next-with-attendance');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
    expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    const sql = norm(dbUtils.executeQuery.mock.calls[0][0]);
    // Same window as last-session-attendees: a session that started within the
    // last 12 hours is still "the session being dealt for" (F-0134).
    expect(sql).toContain("SELECT id, title, start_time, status FROM game_sessions WHERE start_time > NOW() - INTERVAL '12 hours'");
    expect(sql).toContain("(status IS NULL OR status != 'cancelled') ORDER BY start_time ASC LIMIT 1");
    expect(dbUtils.executeQuery.mock.calls[0][1]).toBeUndefined();
  });

  it('returns the session plus its attendance rows', async () => {
    const session = { id: 4, title: 'S4', start_time: 'x', status: 'scheduled' };
    const attendance = [{ user_id: 1, character_id: 9, status: 'accepted' }];
    dbUtils.executeQuery
      .mockResolvedValueOnce({ rows: [session] })
      .mockResolvedValueOnce({ rows: attendance });
    const res = await request(app).get('/sessions/next-with-attendance');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { session, attendance } });
    const [sql, params] = dbUtils.executeQuery.mock.calls[1];
    expect(norm(sql)).toContain('COALESCE(sa.character_id, ac.id) AS character_id');
    expect(norm(sql)).toContain('LEFT JOIN LATERAL');
    expect(norm(sql)).toContain('WHERE sa.session_id = $1');
    expect(params).toEqual([4]);
  });

  it('returns a bare 500 envelope on failure', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/sessions/next-with-attendance');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Failed to fetch next session' });
    expect(logger.error).toHaveBeenCalledWith('Failed to fetch next session with attendance:', expect.any(Error));
  });
});

describe('GET /sessions/last-session-attendees (characterisation)', () => {
  it('passes the current session id into the history query and skips the character lookup for DM-only history', async () => {
    dbUtils.executeQuery
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })
      .mockResolvedValueOnce({
        rows: [{ session_title: 'S', assignments: { pre: { DM: ['x'] } }, created_at: 'c' }],
      });
    const res = await request(app).get('/sessions/last-session-attendees');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        source: 'task_history', session_title: 'S', recorded_at: 'c',
        character_ids: [], assignments: { pre: { DM: ['x'] } },
      },
    });
    expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
    expect(dbUtils.executeQuery.mock.calls[1][1]).toEqual([11]);
    expect(norm(dbUtils.executeQuery.mock.calls[0][0])).toContain("start_time > NOW() - INTERVAL '12 hours'");
  });

  it('uses a null current id when none and looks characters up by distinct names', async () => {
    dbUtils.executeQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ session_title: 'S', assignments: { pre: { A: [] }, post: { A: [], B: [] } }, created_at: 'c' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
    const res = await request(app).get('/sessions/last-session-attendees');
    expect(res.body.data.character_ids).toEqual([1, 2]);
    expect(dbUtils.executeQuery.mock.calls[1][1]).toEqual([null]);
    expect(dbUtils.executeQuery.mock.calls[2][0]).toBe(
      'SELECT id FROM characters WHERE active = true AND name = ANY($1::text[])'
    );
    expect(dbUtils.executeQuery.mock.calls[2][1]).toEqual([['A', 'B']]);
  });

  it('RSVP fallback queries with attending response types and drops null ids', async () => {
    dbUtils.executeQuery
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 3, title: 'Old', start_time: 't' }] })
      .mockResolvedValueOnce({ rows: [{ character_id: 8 }, { character_id: null }] });
    const res = await request(app).get('/sessions/last-session-attendees');
    expect(res.body).toEqual({
      success: true,
      data: { source: 'rsvp', session_title: 'Old', recorded_at: 't', character_ids: [8], assignments: null },
    });
    expect(dbUtils.executeQuery.mock.calls[2][1]).toEqual([5]);
    const [, params] = dbUtils.executeQuery.mock.calls[3];
    expect(params[0]).toBe(3);
    expect(Array.isArray(params[1])).toBe(true);
    expect(params[1]).toEqual(expect.arrayContaining(['yes']));
    expect(params[2]).toBe('accepted');
  });

  it('returns the bare 500 envelope on failure', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/sessions/last-session-attendees');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Failed to fetch last session attendees' });
  });
});

describe('task-history (characterisation)', () => {
  it('POST returns 201 with message and the full INSERT params', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post('/sessions/task-history')
      .send({ session_id: 2, session_title: 'T', assignments: { pre: {} }, character_count: 4, late_count: 1 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, message: 'Task assignment saved', data: { id: 1 } });
    expect(SessionTask.getAll).toHaveBeenCalledWith(3);
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([2, 'T', '{"pre":{}}', 4, 1, null, null, 7]);
  });

  it('POST defaults counts to 0', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });
    await request(app).post('/sessions/task-history').send({ assignments: {} });
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([null, null, '{}', 0, 0, null, null, 7]);
  });

  it('POST still saves (warn only) when the task definition lookup fails', async () => {
    SessionTask.getAll.mockRejectedValue(new Error('lookup'));
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });
    const res = await request(app).post('/sessions/task-history').send({ assignments: {} });
    expect(res.status).toBe(201);
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to load session task definitions for announcement lookup', { error: 'lookup' }
    );
  });

  it('POST 400 and 500 bodies', async () => {
    let res = await request(app).post('/sessions/task-history').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('assignments are required');
    dbUtils.executeQuery.mockRejectedValue(new Error('x'));
    res = await request(app).post('/sessions/task-history').send({ assignments: {} });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Failed to save task assignment' });
  });

  it('GET defaults the limit to 50 and passes a parsed limit', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });
    await request(app).get('/sessions/task-history');
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([50]);
    expect(norm(dbUtils.executeQuery.mock.calls[0][0])).toContain(
      'LEFT JOIN users u ON sth.created_by = u.id ORDER BY sth.created_at DESC LIMIT $1'
    );
    await request(app).get('/sessions/task-history?limit=12');
    expect(dbUtils.executeQuery.mock.calls[1][1]).toEqual([12]);
  });

  it('GET rejects an out-of-range limit with 400 and the first message', async () => {
    const res = await request(app).get('/sessions/task-history?limit=500');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('limit must be 1-200');
    expect(dbUtils.executeQuery).not.toHaveBeenCalled();
  });

  it('GET 500 body', async () => {
    dbUtils.executeQuery.mockRejectedValue(new Error('x'));
    const res = await request(app).get('/sessions/task-history');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Failed to fetch task assignment history' });
  });
});

describe('recurring routes (characterisation)', () => {
  const valid = {
    title: 'Weekly', start_time: '2026-04-15T18:00:00Z', end_time: '2026-04-15T22:00:00Z',
    recurring_pattern: 'weekly', recurring_day_of_week: 3,
  };

  it('POST /recurring returns the standard 400 validation envelope for bad input', async () => {
    const res = await request(app).post('/sessions/recurring').send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // The message is the first failure's text, as a plain string.
    expect(res.body.message).toBe('Title is required');
    expect(res.body.errors.general.length).toBeGreaterThan(1);
    expect(sessionService.createRecurringSession).not.toHaveBeenCalled();
  });

  it('POST /recurring merges defaults, created_by, and replies 201 with message', async () => {
    sessionService.createRecurringSession.mockResolvedValue({ template: { id: 1 } });
    const res = await request(app).post('/sessions/recurring').send(valid);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true, message: 'Recurring session created successfully', data: { template: { id: 1 } },
    });
    // Defaults for omitted fields are applied by the service, not the route.
    expect(sessionService.createRecurringSession).toHaveBeenCalledWith({ ...valid, created_by: 7 });
  });

  it('POST /recurring 500 exposes error.message and omits details outside development', async () => {
    sessionService.createRecurringSession.mockRejectedValue(new Error('svc down'));
    const res = await request(app).post('/sessions/recurring').send(valid);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'svc down' });
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to create recurring session:',
      expect.objectContaining({ error: 'svc down', data: expect.any(Object) })
    );
  });

  it('POST /recurring 500 includes the stack as details in development', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      sessionService.createRecurringSession.mockRejectedValue(new Error('svc down'));
      const res = await request(app).post('/sessions/recurring').send(valid);
      expect(res.body.details).toEqual(expect.stringContaining('svc down'));
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('POST /recurring 500 falls back to the default message when the error has none', async () => {
    sessionService.createRecurringSession.mockRejectedValue(new Error(''));
    const res = await request(app).post('/sessions/recurring').send(valid);
    expect(res.body.message).toBe('Failed to create recurring session');
  });

  it('POST /recurring keeps an explicit 0 (no reminder) instead of replacing it with a default', async () => {
    sessionService.createRecurringSession.mockResolvedValue({});
    await request(app).post('/sessions/recurring').send({ ...valid, reminder_hours: 0 });
    expect(sessionService.createRecurringSession).toHaveBeenCalledWith({ ...valid, reminder_hours: 0, created_by: 7 });
  });

  it('POST /recurring rejects an unbounded recurring_end_count and non-integer hours', async () => {
    let res = await request(app).post('/sessions/recurring').send({ ...valid, recurring_end_count: 100000 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid end count (1-104)');
    res = await request(app).post('/sessions/recurring').send({ ...valid, reminder_hours: 'soon' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid reminder hours');
    expect(sessionService.createRecurringSession).not.toHaveBeenCalled();
  });
});

describe('discord routes (characterisation)', () => {
  it('announce: 200 body, 400 when no message, fixed 500', async () => {
    sessionService.postSessionAnnouncement.mockResolvedValue({ id: 'm1' });
    let res = await request(app).post('/sessions/9/announce');
    expect(res.body).toEqual({ success: true, message: 'Session announcement posted', data: { discordMessageId: 'm1' } });
    expect(sessionService.postSessionAnnouncement).toHaveBeenCalledWith('9');
    sessionService.postSessionAnnouncement.mockResolvedValue(null);
    res = await request(app).post('/sessions/9/announce');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Discord not configured' });
    sessionService.postSessionAnnouncement.mockRejectedValue(new Error('x'));
    res = await request(app).post('/sessions/9/announce');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Failed to post announcement' });
  });

  it('announce/remind/uncancel reject a non-integer id (validators are enforced)', async () => {
    for (const path of ['announce', 'remind', 'uncancel']) {
      const res = await request(app).post('/sessions/abc/' + path).send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Session ID must be an integer');
    }
    expect(sessionService.postSessionAnnouncement).not.toHaveBeenCalled();
    expect(sessionService.sendSessionReminder).not.toHaveBeenCalled();
    expect(sessionService.uncancelSession).not.toHaveBeenCalled();
  });

  it('remind rejects an unknown reminder_type', async () => {
    const res = await request(app).post('/sessions/9/remind').send({ reminder_type: 'everyone' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid reminder type');
    expect(sessionService.sendSessionReminder).not.toHaveBeenCalled();
  });

  it('remind: manual flag, default type, bodies', async () => {
    sessionService.sendSessionReminder.mockResolvedValue();
    let res = await request(app).post('/sessions/9/remind').send({ reminder_type: 'maybe_responders' });
    expect(res.body).toEqual({ success: true, message: 'Reminder sent successfully' });
    expect(sessionService.sendSessionReminder).toHaveBeenCalledWith('9', 'maybe_responders', { isManual: true });
    await request(app).post('/sessions/9/remind').send({});
    expect(sessionService.sendSessionReminder).toHaveBeenLastCalledWith('9', 'all', { isManual: true });
    sessionService.sendSessionReminder.mockRejectedValue(new Error('x'));
    res = await request(app).post('/sessions/9/remind').send({});
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Failed to send reminder' });
  });

  it('uncancel: bodies for success, not found, and error (400 with message / default)', async () => {
    sessionService.uncancelSession.mockResolvedValue({ id: 9 });
    let res = await request(app).post('/sessions/9/uncancel');
    expect(res.body).toEqual({ success: true, message: 'Session has been reinstated', data: { id: 9 } });
    expect(sessionService.uncancelSession).toHaveBeenCalledWith('9');
    sessionService.uncancelSession.mockResolvedValue(null);
    res = await request(app).post('/sessions/9/uncancel');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Session not found' });
    sessionService.uncancelSession.mockRejectedValue(new Error('Session is not cancelled'));
    res = await request(app).post('/sessions/9/uncancel');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Session is not cancelled' });
    sessionService.uncancelSession.mockRejectedValue(new Error(''));
    res = await request(app).post('/sessions/9/uncancel');
    expect(res.body).toEqual({ success: false, message: 'Failed to uncancel session' });
  });

});

describe('attendance/detailed and notes (characterisation)', () => {
  it('POST attendance/detailed passes (id, user id, response_type, body) and replies', async () => {
    sessionService.recordAttendance.mockResolvedValue({ id: 1 });
    const body = { response_type: 'late', late_arrival_time: '19:30', notes: 'n' };
    let res = await request(app).post('/sessions/9/attendance/detailed').send(body);
    expect(res.body).toEqual({ success: true, message: 'Attendance recorded successfully', data: { id: 1 } });
    expect(sessionService.recordAttendance).toHaveBeenCalledWith('9', 7, 'late', body);
    sessionService.recordAttendance.mockRejectedValue(new Error('x'));
    res = await request(app).post('/sessions/9/attendance/detailed').send(body);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Failed to record attendance' });
  });

  it('POST attendance/detailed returns the standard 400 envelope for a bad time', async () => {
    const res = await request(app)
      .post('/sessions/9/attendance/detailed').send({ response_type: 'yes', late_arrival_time: '25:99' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid time format');
    expect(res.body.errors.general).toHaveLength(1);
    expect(sessionService.recordAttendance).not.toHaveBeenCalled();
  });

  it('GET attendance/detailed bodies', async () => {
    sessionService.getSessionAttendance.mockResolvedValue([{ id: 1 }]);
    let res = await request(app).get('/sessions/9/attendance/detailed');
    expect(res.body).toEqual({ success: true, data: [{ id: 1 }] });
    expect(sessionService.getSessionAttendance).toHaveBeenCalledWith('9');
    sessionService.getSessionAttendance.mockRejectedValue(new Error('x'));
    res = await request(app).get('/sessions/9/attendance/detailed');
    expect(res.body).toEqual({ success: false, message: 'Failed to fetch attendance' });
  });
});

describe('W09 input validation and error mapping', () => {
  it('task-history POST rejects assignments that are not phase -> character -> task names', async () => {
    for (const assignments of ['text', [], { pre: [] }, { pre: { A: 'Snacks' } }, { pre: { A: [1] } }]) {
      const res = await request(app).post('/sessions/task-history').send({ assignments });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('assignments must map phase -> character -> list of task names');
    }
    expect(dbUtils.executeQuery).not.toHaveBeenCalled();
  });

  it('task-history POST rejects bad numeric fields', async () => {
    let res = await request(app).post('/sessions/task-history').send({ assignments: {}, character_count: -1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('character_count must be 0-1000');
    res = await request(app).post('/sessions/task-history').send({ assignments: {}, late_count: 'many' });
    expect(res.status).toBe(400);
    res = await request(app).post('/sessions/task-history').send({ assignments: {}, session_id: 'abc' });
    expect(res.status).toBe(400);
    expect(dbUtils.executeQuery).not.toHaveBeenCalled();
  });

  it('task-history POST accepts a real Tasks page payload', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });
    const res = await request(app).post('/sessions/task-history').send({
      session_id: null, session_title: null,
      assignments: { pre: { Valeros: ['Snacks'] }, during: {}, post: { DM: ['Recap'] } },
      character_count: 5, late_count: 0,
    });
    expect(res.status).toBe(201);
  });

  it('attendance/detailed maps service validation and not-found errors to 400 and 404', async () => {
    sessionService.recordAttendance.mockRejectedValueOnce(
      Object.assign(new Error('Character must be one of your active characters in this campaign'), { name: 'ValidationError' })
    );
    let res = await request(app).post('/sessions/9/attendance/detailed').send({ response_type: 'yes', character_id: 55 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Character must be one of your active characters in this campaign' });
    sessionService.recordAttendance.mockRejectedValueOnce(
      Object.assign(new Error('Session not found'), { name: 'NotFoundError' })
    );
    res = await request(app).post('/sessions/9/attendance/detailed').send({ response_type: 'yes' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Session not found' });
  });

  it('attendance/detailed accepts an empty character selection and rejects a non-numeric one', async () => {
    sessionService.recordAttendance.mockResolvedValue({ id: 1 });
    let res = await request(app).post('/sessions/9/attendance/detailed').send({ response_type: 'no', character_id: '' });
    expect(res.status).toBe(200);
    res = await request(app).post('/sessions/9/attendance/detailed').send({ response_type: 'yes', character_id: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid character');
  });

  it('attendance/detailed GET rejects a non-integer id', async () => {
    const res = await request(app).get('/sessions/abc/attendance/detailed');
    expect(res.status).toBe(400);
    expect(sessionService.getSessionAttendance).not.toHaveBeenCalled();
  });

  it('removed routes are gone (404)', async () => {
    const requests = [
      request(app).get('/sessions/upcoming-detailed'),
      request(app).get('/sessions/discord-mapping'),
      request(app).post('/sessions/link-discord').send({ discord_id: '1' }),
      request(app).get('/sessions/5'),
      request(app).get('/sessions/recurring/5/instances'),
      request(app).put('/sessions/recurring/5').send({}),
      request(app).delete('/sessions/recurring/5'),
      request(app).post('/sessions/recurring/5/generate').send({}),
    ];
    for (const pending of requests) {
      const res = await pending;
      expect(res.status).toBe(404);
    }
  });
});
