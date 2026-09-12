/**
 * Unit tests for sessionTaskController (DM-editable session task definitions).
 * Covers listing, payload validation for every task option, not-found
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
const {
  DEFAULT_SESSION_TASKS,
  TASK_OPTION_DEFAULTS,
} = require('../../constants/sessionTaskDefaults');

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
  ...TASK_OPTION_DEFAULTS,
  quantity: 2,
  sort_order: 2,
  ...over,
});

/** What the controller hands the model for a minimal { phase, name } body. */
const normalised = (over = {}) => ({
  phase: 'post',
  name: 'Snack Run',
  ...TASK_OPTION_DEFAULTS,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  SessionTask.characterExists.mockResolvedValue(true);
});

describe('getAll', () => {
  it('returns every task definition scoped to the active campaign', async () => {
    SessionTask.getAll.mockResolvedValue([task()]);
    const req = createMockReq({ campaignId: 3 });
    const res = createMockRes();

    await controller.getAll(req, res);

    expect(SessionTask.getAll).toHaveBeenCalledWith(3);
    expect(res.success).toHaveBeenCalled();
    expect(res.success.mock.calls[0][0]).toEqual([task()]);
  });

  it('rejects when no campaign is resolved', async () => {
    const req = createMockReq({ campaignId: undefined });
    const res = createMockRes();

    await controller.getAll(req, res);

    expect(SessionTask.getAll).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
  });
});

describe('create', () => {
  it('creates a task with normalised fields and every option defaulted', async () => {
    SessionTask.create.mockResolvedValue(task({ id: 11, name: 'Snack Run', quantity: 1 }));
    const req = createMockReq({
      body: { phase: 'post', name: '  Snack Run  ', quantity: '1', min_characters: '' },
    });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.create).toHaveBeenCalledWith(1, normalised());
    expect(SessionTask.characterExists).not.toHaveBeenCalled();
    expect(res.created).toHaveBeenCalled();
  });

  it('accepts every option, as booleans or "true" strings', async () => {
    SessionTask.create.mockResolvedValue(task({ id: 13, name: 'Recap' }));
    const req = createMockReq({
      body: {
        phase: 'pre',
        name: 'Recap',
        requires_previous_attendance: 'true',
        exclude_late: true,
        exclude_early: 'true',
        dm_eligible: false,
        announce_label: '  Recap by  ',
        sticky: false,
        avoid_repeat: true,
        priority: '1',
        max_characters: '8',
        min_characters: 3,
        is_active: 'false',
        description: '  Summarise last session in two minutes  ',
        fixed_character_id: '77',
      },
    });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.characterExists).toHaveBeenCalledWith(77);
    expect(SessionTask.create).toHaveBeenCalledWith(1, normalised({
      phase: 'pre',
      name: 'Recap',
      requires_previous_attendance: true,
      exclude_late: true,
      exclude_early: true,
      announce_label: 'Recap by',
      avoid_repeat: true,
      priority: 1,
      max_characters: 8,
      min_characters: 3,
      is_active: false,
      description: 'Summarise last session in two minutes',
      fixed_character_id: 77,
    }));
    expect(res.created).toHaveBeenCalled();
  });

  it('keeps the legacy is_snack_master flag in sync with a "Snack Master" announce label', async () => {
    SessionTask.create.mockResolvedValue(task({ id: 12 }));
    const req = createMockReq({
      body: { phase: 'post', name: 'Snacks', announce_label: 'snack master' },
    });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.create).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ announce_label: 'snack master', is_snack_master: true })
    );
  });

  it('rejects a fixed character that is not in the campaign', async () => {
    SessionTask.characterExists.mockResolvedValue(false);
    const req = createMockReq({
      body: { phase: 'during', name: 'Loot Master', fixed_character_id: 999 },
    });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.create).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
  });

  it('rejects a task that is both sticky and avoid-repeat', async () => {
    const req = createMockReq({
      body: { phase: 'during', name: 'X', sticky: true, avoid_repeat: true },
    });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.create).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
  });

  it('rejects max_characters below min_characters', async () => {
    const req = createMockReq({
      body: { phase: 'during', name: 'X', min_characters: 6, max_characters: 4 },
    });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.create).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
  });

  it('rejects an out-of-range priority', async () => {
    const req = createMockReq({ body: { phase: 'during', name: 'X', priority: 3 } });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.create).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
  });

  it('rejects an over-long announce label', async () => {
    const req = createMockReq({
      body: { phase: 'during', name: 'X', announce_label: 'x'.repeat(101) },
    });
    const res = createMockRes();

    await controller.create(req, res);

    expect(SessionTask.create).not.toHaveBeenCalled();
    expect(res.validationError).toHaveBeenCalled();
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

  it('rejects an out-of-range min_characters', async () => {
    const req = createMockReq({ body: { phase: 'pre', name: 'X', min_characters: 99 } });
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

    expect(SessionTask.update).toHaveBeenCalledWith(1, 10, normalised({
      phase: 'during',
      name: 'Renamed',
      quantity: 2,
    }));
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

    expect(SessionTask.remove).toHaveBeenCalledWith(1, 10);
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

    expect(SessionTask.reorder).toHaveBeenCalledWith(1, 'during', [3, 1, 2]);
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
