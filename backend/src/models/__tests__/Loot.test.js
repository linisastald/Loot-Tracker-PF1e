const Loot = require('../Loot');

// Mock dependencies
jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');

describe('Loot model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should insert a new loot entry and return it', async () => {
      const entry = {
        sessionDate: '2024-01-15',
        quantity: 2,
        name: 'Longsword',
        unidentified: false,
        masterwork: true,
        type: 'weapon',
        size: 'Medium',
        itemid: 5,
        modids: '{1,2}',
        value: 315,
        whoupdated: 1,
        notes: 'Found in dungeon',
        charges: null,
        cursed: false,
      };

      const mockRow = { id: 1, ...entry };
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await Loot.create(entry);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('INSERT INTO loot');
      expect(values).toHaveLength(14);
      expect(values[0]).toBe('2024-01-15');
      expect(values[1]).toBe(2);
      expect(values[2]).toBe('Longsword');
      expect(result).toEqual(mockRow);
    });

    it('should default null for optional fields', async () => {
      const entry = {
        sessionDate: '2024-01-15',
        quantity: 1,
        name: 'Unknown Potion',
        unidentified: true,
        masterwork: false,
        type: 'potion',
        size: 'Small',
        whoupdated: 1,
        notes: '',
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ id: 2 }] });

      await Loot.create(entry);

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values[7]).toBeNull();  // itemid
      expect(values[8]).toBeNull();  // modids
      expect(values[9]).toBeNull();  // value
      expect(values[12]).toBeNull(); // charges
      expect(values[13]).toBe(false); // cursed default
    });
  });

  describe('findByStatus', () => {
    it('should query unprocessed items when status is null', async () => {
      const mockRows = [
        { id: 1, name: 'Sword', row_type: 'individual' },
        { id: 2, name: 'Weapons', row_type: 'summary' },
      ];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockRows });

      const result = await Loot.findByStatus(null);

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain("statuspage IS NULL OR statuspage = 'Pending Sale'");
      expect(params).toEqual([]);
      expect(result.summary).toHaveLength(1);
      expect(result.individual).toHaveLength(1);
    });

    it('should query specific status when provided', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Loot.findByStatus('Sold');

      const [query, params] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('statuspage = $1');
      expect(params).toEqual(['Sold']);
    });

    it('should extract character appraisal when activeCharacterId provided', async () => {
      const mockRows = [{
        id: 1,
        name: 'Ring',
        row_type: 'individual',
        appraisals: [
          { character_id: 5, believedvalue: 100 },
          { character_id: 3, believedvalue: 200 },
        ],
      }];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockRows });

      const result = await Loot.findByStatus(null, 5);

      expect(result.individual[0].believedvalue).toBe(100);
    });

    it('should not modify believedvalue when no matching appraisal', async () => {
      const mockRows = [{
        id: 1,
        name: 'Ring',
        row_type: 'individual',
        appraisals: [{ character_id: 99, believedvalue: 500 }],
      }];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockRows });

      const result = await Loot.findByStatus(null, 5);

      expect(result.individual[0].believedvalue).toBeUndefined();
    });

    it('should separate summary and individual rows', async () => {
      const mockRows = [
        { id: 1, row_type: 'summary' },
        { id: 2, row_type: 'summary' },
        { id: 3, row_type: 'individual' },
      ];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockRows });

      const result = await Loot.findByStatus(null);

      expect(result.summary).toHaveLength(2);
      expect(result.individual).toHaveLength(1);
    });
  });

  describe('updateStatus', () => {
    it('should update status for given IDs', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Loot.updateStatus([1, 2, 3], 'Sold', null);

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('UPDATE loot');
      expect(query).toContain('SET status = $1');
      expect(query).toContain('ANY($2::int[])');
      expect(values).toEqual(['Sold', [1, 2, 3]]);
    });

    it('should set whohas when status is Kept Self', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Loot.updateStatus([1], 'Kept Self', 5);

      const [query, values] = dbUtils.executeQuery.mock.calls[0];
      expect(query).toContain('whohas = $2');
      expect(values).toEqual(['Kept Self', 5, [1]]);
    });

    it('should not set whohas for non-Kept Self status even if provided', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Loot.updateStatus([1], 'Sold', null);

      const values = dbUtils.executeQuery.mock.calls[0][1];
      expect(values).toEqual(['Sold', [1]]);
    });
  });

  describe('splitStack', () => {
    it('should update original and insert new splits in a transaction', async () => {
      const mockClient = {
        query: jest.fn(),
      };

      // Original item query
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 1, session_date: '2024-01-15', name: 'Arrow', quantity: 20,
          unidentified: false, masterwork: false, type: 'ammunition', size: 'Medium',
          status: null, whohas: null, notes: '', itemid: null, modids: null,
          value: 1, charges: null, cursed: false,
        }],
      });
      // Update original
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Insert split
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        return await callback(mockClient);
      });

      const splits = [{ quantity: 10 }, { quantity: 10 }];
      await Loot.splitStack(1, splits, 42);

      // Should fetch original
      expect(mockClient.query).toHaveBeenCalledTimes(3);
      expect(mockClient.query.mock.calls[0][0]).toContain('SELECT * FROM loot WHERE id = $1');

      // Should update original with first split quantity
      expect(mockClient.query.mock.calls[1][1]).toEqual([10, 42, 1]);

      // Should insert second split
      expect(mockClient.query.mock.calls[2][0]).toContain('INSERT INTO loot');
      expect(mockClient.query.mock.calls[2][1][1]).toBe(10); // quantity
    });

    it('should only update original when single split', async () => {
      const mockClient = { query: jest.fn() };
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Potion', quantity: 5 }],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(mockClient));

      await Loot.splitStack(1, [{ quantity: 5 }], 1);

      // Only fetch + update, no insert
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateEntry', () => {
    it('should merge current entry with updates and save', async () => {
      const currentEntry = {
        id: 1, session_date: '2024-01-15', quantity: 2, name: 'Sword',
        unidentified: false, masterwork: true, type: 'weapon', size: 'Medium',
        itemId: null, modids: null, value: 100, whoupdated: 1,
        whohas: null, notes: '', cursed: false,
      };

      // First call: fetch current entry
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [currentEntry] });
      // Second call: update
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await Loot.updateEntry(1, { name: 'Longsword +1', value: 2315 });

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
      const updateValues = dbUtils.executeQuery.mock.calls[1][1];
      expect(updateValues).toContain('Longsword +1');
      expect(updateValues).toContain(2315);
      expect(updateValues[updateValues.length - 1]).toBe(1); // id
    });

    it('should throw when entry not found', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });

      await expect(Loot.updateEntry(999, { name: 'Test' }))
        .rejects.toThrow('Loot entry not found');
    });
  });

  describe('getItems', () => {
    it('should return all items', async () => {
      const mockItems = [
        { id: 1, name: 'Longsword' },
        { id: 2, name: 'Shield' },
      ];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockItems });

      const result = await Loot.getItems();

      expect(result.summary).toEqual(mockItems);
      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain('SELECT id, name, type, subtype, value, weight FROM item');
    });
  });
});
