/**
 * crew.hire_date through the controller: validated as a calendar date (YYYY-MM-DD),
 * stored as that plain string, optional, clearable, and left alone when omitted.
 */

jest.mock('../../models/Crew');
jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const Crew = require('../../models/Crew');
const crewController = require('../crewController');
const { createMockRes, createMockReq } = require('../../../tests/utils/mockHttp');

const mockCrew = { id: 1, name: 'Hand', location_type: 'ship', location_id: 1, is_alive: true };

const createBody = (extra = {}) => ({
  name: 'Hired Hand', location_type: 'ship', location_id: 1, ship_position: 'Crew', ...extra,
});

const create = async (body) => {
  const res = createMockRes();
  await crewController.createCrew(createMockReq({ body, user: { id: 1 } }), res);
  return res;
};

const update = async (body) => {
  const res = createMockRes();
  await crewController.updateCrew(createMockReq({ params: { id: '1' }, body, user: { id: 1 } }), res);
  return res;
};

describe('crew hire_date', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Crew.locationExists.mockResolvedValue(true);
    Crew.create.mockResolvedValue({ ...mockCrew });
    Crew.update.mockResolvedValue({ ...mockCrew });
  });

  describe('createCrew', () => {
    it('stores a valid YYYY-MM-DD hire date', async () => {
      await create(createBody({ hire_date: '4722-01-15' }));
      expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({ hire_date: '4722-01-15' }));
    });

    it('accepts the {year, month, day} shape older clients send', async () => {
      await create(createBody({ hire_date: { year: 4722, month: 3, day: 9 } }));
      expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({ hire_date: '4722-03-09' }));
    });

    it('cuts a full ISO timestamp to its date part (no timezone shift)', async () => {
      await create(createBody({ hire_date: '4722-01-15T23:30:00.000Z' }));
      expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({ hire_date: '4722-01-15' }));
    });

    it('stores null when no hire date is given', async () => {
      await create(createBody());
      expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({ hire_date: null }));
    });

    it('stores null for a blank hire date', async () => {
      await create(createBody({ hire_date: '' }));
      expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({ hire_date: null }));
    });

    it.each([
      ['not-a-date'], ['4722-02-30'], ['4722-13-01'], ['15/01/4722'], [20240101], [{ year: 4722, month: 2 }],
    ])('rejects the invalid hire date %j', async (bad) => {
      const res = await create(createBody({ hire_date: bad }));
      expect(res.validationError).toHaveBeenCalledWith('Hire date must be a valid date (YYYY-MM-DD)');
      expect(Crew.create).not.toHaveBeenCalled();
    });
  });

  describe('updateCrew', () => {
    it('validates and passes on the hire date', async () => {
      await update({ hire_date: '4722-06-01' });
      expect(Crew.update).toHaveBeenCalledWith('1', { hire_date: '4722-06-01' });
    });

    it('lets a blank hire date clear it', async () => {
      await update({ hire_date: '' });
      expect(Crew.update).toHaveBeenCalledWith('1', { hire_date: null });
    });

    it('rejects an invalid hire date without touching the record', async () => {
      const res = await update({ hire_date: '4722-02-31' });
      expect(res.validationError).toHaveBeenCalledWith('Hire date must be a valid date (YYYY-MM-DD)');
      expect(Crew.update).not.toHaveBeenCalled();
    });

    it('leaves hire_date out of the update when the body omits it', async () => {
      await update({ name: 'Same' });
      expect(Crew.update.mock.calls[0][1]).not.toHaveProperty('hire_date');
    });
  });
});
