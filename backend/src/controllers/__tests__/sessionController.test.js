/**
 * Unit tests for the non-Discord handlers of sessionController
 * (the interaction handler is covered by sessionControllerInteractions.test.js).
 */

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

jest.mock('axios', () => ({ post: jest.fn(), patch: jest.fn(), delete: jest.fn() }));

jest.mock('../../models/Session', () => ({
  getUpcomingSessions: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findSessionsNeedingNotifications: jest.fn(),
}));

jest.mock('../../services/sessionService', () => ({
  createSession: jest.fn(),
  recordAttendance: jest.fn(),
  updateSessionMessage: jest.fn(),
  getDiscordSettings: jest.fn(),
  postSessionAnnouncement: jest.fn(),
}));

jest.mock('../../services/discordBrokerService', () => ({ sendMessage: jest.fn(), deleteMessage: jest.fn() }));

const Session = require('../../models/Session');
const sessionService = require('../../services/sessionService');
const discordBroker = require('../../services/discordBrokerService');
const controller = require('../sessionController');

const makeRes = () => ({
  json: jest.fn(),
  success: jest.fn(),
  validationError: jest.fn(),
  notFound: jest.fn(),
  error: jest.fn(),
});

const makeReq = (body, extra = {}) => ({ body, params: {}, query: {}, user: { id: 7 }, ...extra });

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getUpcomingSessions limit handling', () => {
  const run = async (limit) => {
    Session.getUpcomingSessions.mockResolvedValue([]);
    await controller.getUpcomingSessions(makeReq({}, { query: limit === undefined ? {} : { limit } }), makeRes());
    return Session.getUpcomingSessions.mock.calls[0][0];
  };

  it('defaults to 5 when absent', async () => {
    expect(await run(undefined)).toBe(5);
  });

  it.each([['abc'], ['-3'], ['0'], ['']])('falls back to 5 for %p', async (value) => {
    expect(await run(value)).toBe(5);
  });

  it('accepts a valid number and clamps huge values to 100', async () => {
    expect(await run('12')).toBe(12);
    Session.getUpcomingSessions.mockClear();
    expect(await run('999999')).toBe(100);
  });
});

describe('createSession', () => {
  const body = { title: 'Game', start_time: '2030-01-01T18:00:00Z', end_time: '2030-01-01T22:00:00Z' };

  it('attributes the session to the authenticated user', async () => {
    sessionService.createSession.mockResolvedValue({ id: 1 });
    await controller.createSession(makeReq(body), makeRes());
    expect(sessionService.createSession.mock.calls[0][0].created_by).toBe(7);
  });

  it('does not fall back to user 1 when there is no user', async () => {
    const res = makeRes();
    await controller.createSession(makeReq(body, { user: undefined }), res);
    expect(sessionService.createSession).not.toHaveBeenCalled();
    expect(res.error).toHaveBeenCalled();
  });
});

describe('updateSession', () => {
  const existing = {
    id: 5, start_time: '2030-01-01T18:00:00Z', end_time: '2030-01-01T22:00:00Z', discord_message_id: null,
  };
  const run = async (body) => {
    Session.findById.mockResolvedValue(existing);
    Session.update.mockResolvedValue({ id: 5, ...body });
    const res = makeRes();
    await controller.updateSession(makeReq(body, { params: { id: '5' } }), res);
    return res;
  };

  it('rejects an end_time before the stored start_time', async () => {
    const res = await run({ end_time: '2030-01-01T10:00:00Z' });
    expect(res.validationError).toHaveBeenCalledWith('End time must be after start time');
    expect(Session.update).not.toHaveBeenCalled();
  });

  it('rejects a start_time after the stored end_time', async () => {
    const res = await run({ start_time: '2030-01-02T10:00:00Z' });
    expect(res.validationError).toHaveBeenCalledWith('End time must be after start time');
    expect(Session.update).not.toHaveBeenCalled();
  });

  it('accepts a title-only change and a consistent single time change', async () => {
    expect((await run({ title: 'New' })).validationError).not.toHaveBeenCalled();
    expect((await run({ end_time: '2030-01-01T23:00:00Z' })).validationError).not.toHaveBeenCalled();
    expect(Session.update).toHaveBeenCalledTimes(2);
  });

  it('sends one cancellation ping when an announced session is cancelled', async () => {
    Session.findById.mockResolvedValue({ ...existing, discord_message_id: '123', status: 'scheduled' });
    Session.update.mockResolvedValue({ id: 5, title: 'Game' });
    sessionService.getDiscordSettings.mockResolvedValue({ campaign_role_id: 'r1', discord_channel_id: 'c1' });
    await controller.updateSession(
      makeReq({ status: 'cancelled', cancel_reason: 'sick' }, { params: { id: '5' } }), makeRes()
    );
    expect(sessionService.updateSessionMessage).toHaveBeenCalledWith(5);
    expect(discordBroker.sendMessage).toHaveBeenCalledTimes(1);
    expect(discordBroker.sendMessage.mock.calls[0][0].content).toContain('<@&r1>');
    expect(discordBroker.sendMessage.mock.calls[0][0].content).toContain('Reason: sick');
    expect(discordBroker.sendMessage.mock.calls[0][0].allowedMentions).toEqual({ parse: [], roles: ['r1'] });
  });

  it('does not claim the cancellation ping was sent when Discord refused it (L-6)', async () => {
    const logger = require('../../utils/logger');
    const ServiceResult = require('../../utils/ServiceResult');
    Session.findById.mockResolvedValue({ ...existing, discord_message_id: '123', status: 'scheduled' });
    Session.update.mockResolvedValue({ id: 5, title: 'Game' });
    sessionService.getDiscordSettings.mockResolvedValue({ campaign_role_id: 'r1', discord_channel_id: 'c1' });
    discordBroker.sendMessage.mockResolvedValue(ServiceResult.failure('rate limited', null, 'DISCORD_RATE_LIMITED'));

    await controller.updateSession(
      makeReq({ status: 'cancelled', cancel_reason: 'sick' }, { params: { id: '5' } }), makeRes()
    );

    expect(logger.info).not.toHaveBeenCalledWith('Discord cancellation ping sent', expect.anything());
    expect(logger.warn).toHaveBeenCalledWith('Discord cancellation ping was not delivered', expect.objectContaining({ sessionId: 5 }));
    discordBroker.sendMessage.mockReset();
  });
});

describe('updateAttendance (legacy endpoint)', () => {
  it('records through recordAttendance for the caller, so response_type is set', async () => {
    sessionService.recordAttendance.mockResolvedValue({ attendance: { id: 9, status: 'accepted' }, counts: {} });
    const res = makeRes();
    await controller.updateAttendance(
      makeReq({ status: 'accepted', character_id: '3' }, { params: { id: '5' } }), res
    );
    expect(sessionService.recordAttendance).toHaveBeenCalledWith(5, 7, 'accepted', { character_id: 3 });
    expect(res.success).toHaveBeenCalledWith({ id: 9, status: 'accepted' }, 'Attendance updated successfully');
  });

  it.each([['late'], ['early']])('accepts the %s status the Sessions page fallback sends', async (status) => {
    sessionService.recordAttendance.mockResolvedValue({ attendance: {}, counts: {} });
    await controller.updateAttendance(makeReq({ status }, { params: { id: '5' } }), makeRes());
    expect(sessionService.recordAttendance).toHaveBeenCalledWith(5, 7, status, { character_id: null });
  });

  it('rejects an unknown status and a non-numeric character id', async () => {
    const res = makeRes();
    await controller.updateAttendance(makeReq({ status: 'bogus' }, { params: { id: '5' } }), res);
    await controller.updateAttendance(makeReq({ status: 'accepted', character_id: 'x' }, { params: { id: '5' } }), res);
    expect(res.validationError).toHaveBeenCalledTimes(2);
    expect(sessionService.recordAttendance).not.toHaveBeenCalled();
  });

  it('answers 400 for a foreign character (ownership is enforced by recordAttendance)', async () => {
    const err = new Error('Character must be one of your active characters in this campaign');
    err.name = 'ValidationError';
    sessionService.recordAttendance.mockRejectedValue(err);
    const res = makeRes();
    await controller.updateAttendance(
      makeReq({ status: 'accepted', character_id: 99 }, { params: { id: '5' } }), res
    );
    expect(res.validationError).toHaveBeenCalledWith(err.message);
  });
});

describe('checkAndSendSessionNotifications', () => {
  it('reports per-session results and keeps going after a failure', async () => {
    Session.findSessionsNeedingNotifications.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    sessionService.postSessionAnnouncement.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce();
    const res = makeRes();
    await controller.checkAndSendSessionNotifications(makeReq({}), res);
    expect(res.success).toHaveBeenCalledWith({
      message: 'Processed 2 sessions',
      results: [
        { sessionId: 1, status: 'error', error: 'boom' },
        { sessionId: 2, status: 'success' },
      ],
    }, 'Operation successful');
  });

  it('returns a generic 500 when the lookup fails', async () => {
    Session.findSessionsNeedingNotifications.mockRejectedValue(new Error('db down'));
    const res = makeRes();
    await controller.checkAndSendSessionNotifications(makeReq({}), res);
    expect(res.error).toHaveBeenCalled();
  });
});

describe('deleteSession', () => {
  const dbUtils = require('../../utils/dbUtils');

  it('answers not found for an unknown session without deleting anything', async () => {
    Session.findById.mockResolvedValue(null);
    const res = makeRes();
    await controller.deleteSession(makeReq({}, { params: { id: '9' } }), res);
    expect(res.notFound).toHaveBeenCalled();
    expect(Session.delete).not.toHaveBeenCalled();
  });

  it('deletes a session that has no Discord message', async () => {
    Session.findById.mockResolvedValue({ id: 5, discord_message_id: null });
    Session.delete.mockResolvedValue();
    const res = makeRes();
    await controller.deleteSession(makeReq({}, { params: { id: '5' } }), res);
    expect(Session.delete).toHaveBeenCalledWith(5);
    expect(res.success).toHaveBeenCalled();
  });

  it('removes the Discord announcement through the broker service', async () => {
    Session.findById.mockResolvedValue({ id: 5, discord_message_id: 'm1', discord_channel_id: 'c1' });
    discordBroker.deleteMessage.mockResolvedValue({ success: true });
    Session.delete.mockResolvedValue();
    const res = makeRes();
    await controller.deleteSession(makeReq({}, { params: { id: '5' } }), res);
    expect(discordBroker.deleteMessage).toHaveBeenCalledWith({ channelId: 'c1', messageId: 'm1' });
    expect(Session.delete).toHaveBeenCalledWith(5);
  });

  it('still deletes the session when removing the Discord message fails', async () => {
    Session.findById.mockResolvedValue({ id: 5, discord_message_id: 'm1', discord_channel_id: 'c1' });
    discordBroker.deleteMessage.mockResolvedValue({ success: false, message: 'Missing Access' });
    Session.delete.mockResolvedValue();
    const res = makeRes();
    await controller.deleteSession(makeReq({}, { params: { id: '5' } }), res);
    expect(Session.delete).toHaveBeenCalledWith(5);
    expect(res.success).toHaveBeenCalled();
  });
});
