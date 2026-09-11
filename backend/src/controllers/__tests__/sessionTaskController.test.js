/**
 * Unit tests for sessionTaskController (DM-editable session task definitions).
 * Covers listing, payload validation, snack-master exclusivity, not-found
 * handling, reorder validation, and the reset-to-defaults action.
 */

jest.mock('../../models/SessionTask');
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const SessionTask = require('../../models/SessionTask');
const controller = require('../sessionTaskController');
const { DEFAULT_SESSION_TASKS } = require('../../constants/sessionTaskDefaults');

function createMockRes() {
  return {
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    forbidden: jest.fn(),
    error: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 7 },
    campaignId: 1,
    campaignRole: 'DM',
    ...overrides,
  };
}

const task = (over = {}) => ({
  id: 10,
  phase: 'during',
  name: 'Loot Master',
  quantity: 2,
  min_characters: null,
  is_snack_master: false,
  sort_order: 2,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getAll', () => {
  it('returns every task definition', async () => {
    SessionTask.getAll.mockResolvedValue([task()]);
    const req = createMockReq();
    const res = createMockRes();

    await controller.getAll(req, res);

    expect(res.success).toHaveBeenCalled();
    expect(res.success.mock.calls[0][0]).toEqual([task()]);
  });
});

describe('create', () => {
  it('creates a task with normalised fields and returns 201', async () => {
    SessionTask.create.mockResolvedValue(task({ id: 11, name: 'Snack Run', quantity: 1 }));
    const req = createMockReq({
      body: { phase: 'post', name: '  Snack Run  ', quantity: '1', min_characters: '' },
    });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.create).toHaveBeenCalledWith({
      phase: 'post',
      name: 'Snack Run',
      quantity: 1,
      min_characters: null,
      is_snack_master: false,
    });
    expect(SessionTask.clearSnackMasterExcept).not.toHaveBeenCalled();
    expect(res.created).toHaveBeenCalled();
  });

  it('clears the snack-master flag from other tasks when the new task is flagged', async () => {
    SessionTask.create.mockResolvedValue(task({ id: 12, is_snack_master: true }));
    const req = createMockReq({
      body: { phase: 'post', name: 'Snacks', is_snack_master: true },
    });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.clearSnackMasterExcept).toHaveBeenCalledWith(12);
  });

  it('rejects an unknown phase', async () => {
    const req = createMockReq({ body: { phase: 'midnight', name: 'X' } });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.create).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
  });

  it('rejects a blank name', async () => {
    const req = createMockReq({ body: { phase: 'pre', name: '   ' } });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.create).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
  });

  it('rejects an out-of-range quantity', async () => {
    const req = createMockReq({ body: { phase: 'pre', name: 'X', quantity: 0 } });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.create).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
  });

  it('rejects a non-integer min_characters', async () => {
    const req = createMockReq({ body: { phase: 'pre', name: 'X', min_characters: 'six' } });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.create).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
  });
});

describe('update', () => {
  it('updates and returns the task', async () => {
    SessionTask.update.mockResolvedValue(task({ name: 'Renamed' }));
    const req = createMockReq({
      params: { id: '10' },
      body: { phase: 'during', name: 'Renamed', quantity: 2 },
    });
    const res = createMockRes();

    await controller.update(req, res);

    expect(SessionTask.update).toHaveBeenCalledWith(10, {
      phase: 'during',
      name: 'Renamed',
      quantity: 2,
      min_characters: null,
      is_snack_master: false,
    });
    expect(res.success).toHaveBeenCalled();
  });

  it('returns 404 when the task is not visible in the campaign', async () => {
    SessionTask.update.mockResolvedValue(null);
    const req = createMockReq({ params: { id: '99' }, body: { phase: 'pre', name: 'X' } });
    const res = createMockRes();

    await controller.update(req, res);

    expect(res.notFound).toHaveBeenCalled();
  });

  it('rejects an invalid id', async () => {
    const req = createMockReq({ params: { id: 'abc' }, body: { phase: 'pre', name: 'X' } });
    const res = createMockRes();

    await controller.update(req, res);

    expect(SessionTask.update).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
  });
});

describe('remove', () => {
  it('deletes the task', async () => {
    SessionTask.remove.mockResolvedValue(true);
    const req = createMockReq({ params: { id: '10' } });
    const res = createMockRes();

    await controller.remove(req, res);

    expect(SessionTask.remove).toHaveBeenCalledWith(10);
    expect(res.success).toHaveBeenCalled();
  });

  it('returns 404 when nothing was deleted', async () => {
    SessionTask.remove.mockResolvedValue(false);
    const req = createMockReq({ params: { id: '10' } });
    const res = createMockRes();

    await controller.remove(req, res);

    expect(res.notFound).toHaveBeenCalled();
  });
});

describe('reorder', () => {
  it('re-sequences the phase and returns the fresh list', async () => {
    SessionTask.reorder.mockResolvedValue();
    SessionTask.getAll.mockResolvedValue([task()]);
    const req = createMockReq({ body: { phase: 'during', ids: ['3', 1, 2] } });
    const res = createMockRes();

    await controller.reorder(req, res);

    expect(SessionTask.reorder).toHaveBeenCalledWith('during', [3, 1, 2]);
    expect(res.success).toHaveBeenCalled();
  });

  it('rejects duplicate ids', async () => {
    const req = createMockReq({ body: { phase: 'during', ids: [1, 1] } });
    const res = createMockRes();

    await controller.reorder(req, res);

    expect(SessionTask.reorder).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
  });

  it('rejects an empty id list', async () => {
    const req = createMockReq({ body: { phase: 'pre', ids: [] } });
    const res = createMockRes();

    await controller.reorder(req, res);

    expect(SessionTask.reorder).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
  });
});

describe('resetDefaults', () => {
  it('restores the stock list for the active campaign', async () => {
    SessionTask.resetDefaults.mockResolvedValue(DEFAULT_SESSION_TASKS);
    const req = createMockReq({ campaignId: 4 });
    const res = createMockRes();

    await controller.resetDefaults(req, res);

    expect(SessionTask.resetDefaults).toHaveBeenCalledWith(4);
    expect(res.success).toHaveBeenCalled();
    expect(res.success.mock.calls[0][0]).toHaveLength(DEFAULT_SESSION_TASKS.length);
  });

  it('rejects when no campaign is resolved', async () => {
    const req = createMockReq({ campaignId: undefined });
    const res = createMockRes();

    await controller.resetDefaults(req, res);

    expect(SessionTask.resetDefaults).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
  });
});
