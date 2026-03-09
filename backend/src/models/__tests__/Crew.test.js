const Crew = require('../Crew');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');

describe('Crew model', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getAllWithLocation', () => {
    it('should return living crew with location names', async () => {
      const mockCrew = [
        { id: 1, name: 'Jack', location_type: 'ship', location_name: 'Wormwood' },
      ];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockCrew });

      const result = await Crew.getAllWithLocation();

      expect(result).toEqual(mockCrew);
      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('is_alive = true');
      expect(query).toContain('location_name');
    });
  });

  describe('getByLocation', () => {
    it('should query by location type and id', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Crew.getByLocation('ship', 5);

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('location_type = $1');
      expect(query).toContain('location_id = $2');
      expect(values).toEqual(['ship', 5]);
    });

    it('should order by ship position (captain first)', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Crew.getByLocation('ship', 1);

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain("'captain' THEN 1");
      expect(query).toContain("'first mate' THEN 2");
    });
  });

  describe('getDeceased', () => {
    it('should return non-living crew', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1, is_alive: false }] });

      const result = await Crew.getDeceased();

      expect(result).toHaveLength(1);
      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('is_alive = false');
    });
  });

  describe('create', () => {
    it('should create crew with ship position when on ship', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1, name: 'Bosun' }] });

      await Crew.create({
        name: 'Bosun', race: 'Human', age: 35,
        description: 'Gruff sailor', location_type: 'ship',
        location_id: 1, ship_position: 'bosun',
      });

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[0]).toBe('Bosun');
      expect(values[4]).toBe('ship');
      expect(values[6]).toBe('bosun'); // ship_position
      expect(values[7]).toBe(true);    // is_alive
    });

    it('should set ship_position to null when on outpost', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 2 }] });

      await Crew.create({
        name: 'Guard', location_type: 'outpost',
        location_id: 1, ship_position: 'captain',
      });

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[6]).toBeNull(); // ship_position cleared
    });

    it('should default optional fields to null', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 3 }] });

      await Crew.create({ name: 'Nameless', location_type: 'ship', location_id: 1 });

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[1]).toBeNull(); // race
      expect(values[2]).toBeNull(); // age
      expect(values[3]).toBeNull(); // description
    });
  });

  describe('update', () => {
    it('should clear ship_position when moving to outpost', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      await Crew.update(1, {
        name: 'Guard', race: 'Human', age: 30,
        description: '', location_type: 'outpost', location_id: 2,
        ship_position: 'captain',
      });

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[6]).toBeNull(); // ship_position
    });

    it('should return null when crew not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Crew.update(999, { name: 'Ghost', location_type: 'ship', location_id: 1 });

      expect(result).toBeNull();
    });
  });

  describe('markDead', () => {
    it('should set is_alive to false with death date', async () => {
      const deathDate = new Date('2024-06-15');
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1, is_alive: false }] });

      await Crew.markDead(1, deathDate);

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('is_alive = false');
      expect(query).toContain('death_date = $1');
      expect(values[0]).toEqual(deathDate);
    });

    it('should return null when crew not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      expect(await Crew.markDead(999)).toBeNull();
    });
  });

  describe('markDeparted', () => {
    it('should set departure date and reason', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      await Crew.markDeparted(1, new Date(), 'Mutiny');

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[1]).toBe('Mutiny');
    });
  });

  describe('moveToLocation', () => {
    it('should set ship position when moving to ship', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      await Crew.moveToLocation(1, 'ship', 2, 'first mate');

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[0]).toBe('ship');
      expect(values[2]).toBe('first mate');
    });

    it('should clear ship position when moving to outpost', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      await Crew.moveToLocation(1, 'outpost', 3, 'captain');

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[2]).toBeNull(); // ship_position cleared
    });
  });

  describe('findById', () => {
    it('should return crew member when found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 1, name: 'Jack' }] });
      expect(await Crew.findById(1)).toEqual({ id: 1, name: 'Jack' });
    });

    it('should return null when not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      expect(await Crew.findById(999)).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return true on success', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 1 });
      expect(await Crew.delete(1)).toBe(true);
    });

    it('should return false when not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 0 });
      expect(await Crew.delete(999)).toBe(false);
    });
  });
});
