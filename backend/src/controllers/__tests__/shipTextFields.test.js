/**
 * Ship captain, notes and flag are editable (owner decision 2026-10-06): created and
 * updated through the API with length limits, and a partial update that omits them
 * leaves the stored values alone.
 */

jest.mock('../../models/Ship');
jest.mock('../../data/shipTypes', () => ({
  getShipTypesList: jest.fn(),
  getShipTypeData: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const Ship = require('../../models/Ship');
const shipController = require('../shipController');
const { createMockRes, createMockReq } = require('../../../tests/utils/mockHttp');

const stored = { id: 1, name: 'Wormwood', captain_name: 'Cap', ship_notes: 'n', flag_description: 'f' };
const text = { captain_name: 'Cap Kettle', ship_notes: 'Leaks in a storm', flag_description: 'A red skull on black' };

describe('ship captain / notes / flag', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    Ship.getValidStatuses.mockReturnValue(['PC Active', 'Active', 'Docked', 'Lost', 'Sunk']);
    Ship.create.mockResolvedValue(stored);
    Ship.update.mockResolvedValue(stored);
  });

  const update = async (body) => {
    const res = createMockRes();
    await shipController.updateShip(createMockReq({ params: { id: '1' }, body, user: { id: 1 } }), res);
    return res;
  };
  const create = async (body) => {
    const res = createMockRes();
    await shipController.createShip(createMockReq({ body, user: { id: 1 } }), res);
    return res;
  };

  it('create passes all three to the model', async () => {
    await create({ name: 'Wormwood', ...text });
    expect(Ship.create).toHaveBeenCalledWith(expect.objectContaining(text));
  });

  it('update round-trips all three', async () => {
    await update(text);
    expect(Ship.update).toHaveBeenCalledWith(1, text);
  });

  it('update can change just one of them', async () => {
    await update({ captain_name: 'New Captain' });
    expect(Ship.update).toHaveBeenCalledWith(1, { captain_name: 'New Captain' });
  });

  it('update without them leaves them out, so the stored values stay', async () => {
    await update({ name: 'Renamed' });
    const sent = Ship.update.mock.calls[0][1];
    ['captain_name', 'ship_notes', 'flag_description'].forEach((k) => expect(sent).not.toHaveProperty(k));
  });

  it('update lets blank values clear them', async () => {
    await update({ captain_name: '', ship_notes: null, flag_description: '' });
    expect(Ship.update).toHaveBeenCalledWith(1, { captain_name: '', ship_notes: null, flag_description: '' });
  });

  it.each([
    ['captain_name', 256],
    ['ship_notes', 10001],
    ['flag_description', 10001],
  ])('rejects %s longer than its limit', async (field, length) => {
    const res = await update({ [field]: 'x'.repeat(length) });
    expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining(field));
    expect(Ship.update).not.toHaveBeenCalled();
  });

  it.each([['captain_name', 255], ['ship_notes', 10000], ['flag_description', 10000]])(
    'accepts %s at exactly its limit', async (field, length) => {
      await update({ [field]: 'x'.repeat(length) });
      expect(Ship.update).toHaveBeenCalled();
    });

  it('rejects a non-text value', async () => {
    const res = await update({ captain_name: 42 });
    expect(res.validationError).toHaveBeenCalled();
    expect(Ship.update).not.toHaveBeenCalled();
  });
});
