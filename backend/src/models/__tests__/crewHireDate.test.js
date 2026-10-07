const Crew = require('../Crew');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');

const existing = {
  id: 1, name: 'Bosun', race: 'Human', age: 30, description: 'Gruff',
  location_type: 'ship', location_id: 4, ship_position: 'bosun', hire_date: '4722-01-15',
};

describe('Crew model hire_date', () => {
  beforeEach(() => jest.clearAllMocks());

  it('create stores the hire date as the last insert value', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });
    await Crew.create({ name: 'A', location_type: 'ship', location_id: 1, hire_date: '4722-02-03' });
    const [query, values] = dbUtils.executeQuery.mock.calls[0];
    expect(query).toMatch(/INSERT INTO crew \([^)]*hire_date\)/);
    expect(values[8]).toBe('4722-02-03');
  });

  it('create stores NULL when there is no hire date', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });
    await Crew.create({ name: 'A', location_type: 'ship', location_id: 1 });
    expect(dbUtils.executeQuery.mock.calls[0][1][8]).toBeNull();
  });

  it('update changes the hire date when one is supplied', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [existing] }).mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await Crew.update(1, { hire_date: '4722-09-09' });
    const [query, values] = dbUtils.executeQuery.mock.calls[1];
    expect(query).toContain('hire_date = $8');
    expect(values[7]).toBe('4722-09-09');
  });

  it('update keeps the stored hire date when the field is omitted', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [existing] }).mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await Crew.update(1, { name: 'Renamed' });
    expect(dbUtils.executeQuery.mock.calls[1][1][7]).toBe('4722-01-15');
  });

  it('update clears the hire date when null is supplied', async () => {
    dbUtils.executeQuery.mockResolvedValueOnce({ rows: [existing] }).mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await Crew.update(1, { hire_date: null });
    expect(dbUtils.executeQuery.mock.calls[1][1][7]).toBeNull();
  });

  it('every read and returned row gives hire_date as a plain YYYY-MM-DD string', async () => {
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });
    await Crew.getAllWithLocation();
    await Crew.getByLocation('ship', 1);
    await Crew.getDeceased();
    await Crew.findById(1);
    await Crew.create({ name: 'A', location_type: 'ship', location_id: 1 });
    await Crew.markDead(1, new Date());
    await Crew.markDeparted(1, new Date(), 'x');
    await Crew.moveToLocation(1, 'ship', 2, 'Crew');
    expect(dbUtils.executeQuery).toHaveBeenCalledTimes(8);
    for (const [query] of dbUtils.executeQuery.mock.calls) {
      expect(query).toContain("to_char(");
      expect(query).toContain("'YYYY-MM-DD') AS hire_date");
    }
  });
});
