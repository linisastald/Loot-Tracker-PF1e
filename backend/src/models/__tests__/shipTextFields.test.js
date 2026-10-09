const Ship = require('../Ship');

jest.mock('../../utils/dbUtils', () => ({ executeQuery: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');

describe('Ship model captain / notes / flag', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 7, name: 'x' }] });
  });

  it('update writes all three when sent', async () => {
    await Ship.update(7, { captain_name: 'Cap', ship_notes: 'Notes', flag_description: 'Flag' });
    const [query, values] = dbUtils.executeQuery.mock.calls[0];
    expect(query).toContain('captain_name = $');
    expect(query).toContain('ship_notes = $');
    expect(query).toContain('flag_description = $');
    expect(values).toEqual(expect.arrayContaining(['Cap', 'Notes', 'Flag']));
  });

  it('update leaves the columns out of the statement when they are omitted', async () => {
    await Ship.update(7, { name: 'Renamed' });
    const query = dbUtils.executeQuery.mock.calls[0][0];
    expect(query).not.toContain('captain_name');
    expect(query).not.toContain('ship_notes');
    expect(query).not.toContain('flag_description');
  });

  it('update stores NULL for a blank value', async () => {
    await Ship.update(7, { ship_notes: '', flag_description: null });
    expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([null, null, 7]);
  });

  it('create stores all three', async () => {
    await Ship.create({ name: 'N', captain_name: 'Cap', ship_notes: 'Notes', flag_description: 'Flag' });
    const values = dbUtils.executeQuery.mock.calls[0][1];
    expect(values).toEqual(expect.arrayContaining(['Cap', 'Notes', 'Flag']));
  });
});
