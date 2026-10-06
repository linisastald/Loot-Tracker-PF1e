const SalesService = require('../salesService');

// Mock dependencies. The sale-value calculator is real: it is pure, and the
// tests below check the gold it produces (a mocked calculator hides money bugs).
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

jest.mock('../../models/Gold', () => ({
  lockLedger: jest.fn(),
  create: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const Gold = require('../../models/Gold');

// A recording pg client. The first SELECT is answered with `selectRows`; an
// UPDATE reports it touched as many rows as the id array it was given (or
// `updateRowCount`). `client.log` records every client call and every Gold call
// in order, so tests can check the sequence (lock first, then the writes).
const makeClient = (selectRows, { updateRowCount } = {}) => {
  const log = [];
  const client = {
    log,
    query: jest.fn(async (sql, params) => {
      const text = sql.replace(/\s+/g, ' ').trim();
      log.push({ kind: 'sql', text, params });
      if (/^SELECT l\.\*/.test(text)) return { rows: selectRows };
      if (/^UPDATE loot/.test(text)) {
        return { rows: [], rowCount: updateRowCount !== undefined ? updateRowCount : params[0].length };
      }
      return { rows: [], rowCount: 1 };
    }),
  };
  Gold.lockLedger.mockImplementation(async () => { log.push({ kind: 'lock' }); });
  Gold.create.mockImplementation(async (entry, c) => {
    log.push({ kind: 'gold', entry, client: c });
    return { id: 99, ...entry };
  });
  dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
  return client;
};

const sqlCalls = (client, re) => client.log.filter(c => c.kind === 'sql' && re.test(c.text));
const pendingItem = (over) => ({ status: 'Pending Sale', unidentified: false, quantity: 1, ...over });

// Asserts a sale ran as one ordered unit: ledger lock first, then the sold rows,
// the guarded status update and the gold credit, all through the same client.
const expectAtomicSale = (client) => {
  const kinds = client.log.map(c => (c.kind === 'sql' ? c.text.split(' ')[0] + ' ' + c.text.split(' ')[1] : c.kind));
  expect(client.log[0].kind).toBe('lock');
  expect(kinds.indexOf('lock')).toBeLessThan(kinds.findIndex(k => k.startsWith('SELECT')));
  expect(kinds.findIndex(k => k === 'INSERT INTO')).toBeLessThan(kinds.indexOf('gold'));
  const goldCall = client.log.find(c => c.kind === 'gold');
  expect(goldCall.client).toBe(client);
};

describe('SalesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('filterValidSaleItems (pure)', () => {
    it('should separate identified items with values from invalid items', () => {
      const items = [
        { id: 1, name: 'Sword', unidentified: false, value: 100 },
        { id: 2, name: 'Unknown Ring', unidentified: true, value: 50 },
        { id: 3, name: 'Gem', unidentified: false, value: null },
        { id: 4, name: 'Shield', unidentified: false, value: 200 },
      ];

      const { validItems, invalidItems } = SalesService.filterValidSaleItems(items);

      expect(validItems.map(i => i.id)).toEqual([1, 4]);
      expect(invalidItems.map(i => i.id)).toEqual([2, 3]);
    });

    it('treats NULL unidentified as sellable and undefined value as not sellable', () => {
      const { validItems, invalidItems } = SalesService.filterValidSaleItems([
        { id: 1, unidentified: null, value: 10 },
        { id: 2, unidentified: false, value: undefined },
      ]);

      expect(validItems.map(i => i.id)).toEqual([1]);
      expect(invalidItems.map(i => i.id)).toEqual([2]);
    });

    it('should handle empty array', () => {
      const { validItems, invalidItems } = SalesService.filterValidSaleItems([]);

      expect(validItems).toHaveLength(0);
      expect(invalidItems).toHaveLength(0);
    });
  });

  describe('createGoldEntry (pure)', () => {
    it('should split whole gold into gold/silver/copper', () => {
      const entry = SalesService.createGoldEntry(150, 'Test sale');

      expect(entry.transaction_type).toBe('Sale');
      expect(entry.platinum).toBe(0);
      expect(entry.gold).toBe(150);
      expect(entry.silver).toBe(0);
      expect(entry.copper).toBe(0);
      expect(entry.notes).toBe('Test sale');
      expect(entry.session_date).toBeInstanceOf(Date);
    });

    it('should handle fractional gold values', () => {
      const entry = SalesService.createGoldEntry(25.75, 'Partial sale');

      expect(entry.gold).toBe(25);
      expect(entry.silver).toBe(7);
      expect(entry.copper).toBe(5);
    });

    it('F-0736: does not lose silver or copper to floating-point error', () => {
      // 2.3 % 1 * 10 is 2.9999999999999982 in binary floating point
      const a = SalesService.createGoldEntry(2.3, 'x');
      expect([a.gold, a.silver, a.copper]).toEqual([2, 3, 0]);

      // 0.1 + 0.2 = 0.30000000000000004; 1.15 * 10 % 1 is also noisy
      const b = SalesService.createGoldEntry(0.1 + 0.2, 'x');
      expect([b.gold, b.silver, b.copper]).toEqual([0, 3, 0]);
      const c = SalesService.createGoldEntry(1.15, 'x');
      expect([c.gold, c.silver, c.copper]).toEqual([1, 1, 5]);
      const d = SalesService.createGoldEntry(4.35, 'x');
      expect([d.gold, d.silver, d.copper]).toEqual([4, 3, 5]);
    });

    it('should handle zero total', () => {
      const entry = SalesService.createGoldEntry(0, 'Empty');

      expect(entry.gold).toBe(0);
      expect(entry.silver).toBe(0);
      expect(entry.copper).toBe(0);
    });
  });

  describe('createSaleResponse', () => {
    it('should create response with sold items', () => {
      const soldItems = [{ id: 1, name: 'Sword', value: 100, soldFor: 50 }];
      const response = SalesService.createSaleResponse(soldItems, 50, { id: 1 });

      expect(response.sold.items).toEqual(soldItems);
      expect(response.sold.count).toBe(1);
      expect(response.sold.total).toBe(50);
      expect(response.gold).toEqual({ id: 1 });
      expect(response.kept).toBeUndefined();
      expect(response.skipped).toBeUndefined();
    });

    it('should include kept items when provided', () => {
      const response = SalesService.createSaleResponse([], 0, {}, [1, 2]);

      expect(response.kept.ids).toEqual([1, 2]);
      expect(response.kept.count).toBe(2);
    });

    it('should include skipped items when provided', () => {
      const invalidItems = [{ id: 5, name: 'Mystery Orb' }];
      const response = SalesService.createSaleResponse([], 0, {}, [], invalidItems);

      expect(response.skipped.count).toBe(1);
      expect(response.skipped.items[0].name).toBe('Mystery Orb');
      expect(response.skipped.reason).toContain('unidentified');
    });
  });

  describe('sellAllPendingItems', () => {
    it('sells a weapon and armor at half value: 100gp + 200gp = 150gp, with every write checked', async () => {
      const client = makeClient([
        pendingItem({ id: 1, name: 'Sword', value: 100, type: 'weapon' }),
        pendingItem({ id: 2, name: 'Shield', value: 200, type: 'armor' }),
      ]);

      const result = await SalesService.sellAllPendingItems();

      expect(result.sold.count).toBe(2);
      expect(result.sold.total).toBe(150);
      expect(result.sold.items.map(i => i.soldFor)).toEqual([50, 100]);

      const select = sqlCalls(client, /^SELECT l\.\*/)[0];
      expect(select.text).toContain("l.status = 'Pending Sale'");
      expect(select.text).toContain('FOR UPDATE OF l');

      const [insert] = sqlCalls(client, /^INSERT INTO sold/);
      expect(insert.params[0]).toEqual([1, 2]);
      expect(insert.params[1]).toEqual([50, 100]);

      const [update] = sqlCalls(client, /^UPDATE loot SET status = 'Sold'/);
      expect(update.params).toEqual([[1, 2]]);
      expect(update.text).toContain("status = 'Pending Sale'");

      const gold = client.log.find(c => c.kind === 'gold');
      expect(gold.entry).toMatchObject({ transactionType: 'Sale', gold: 150, silver: 0, copper: 0, platinum: 0 });
      expect(result.gold).toMatchObject({ id: 99, gold: 150 });
      expectAtomicSale(client);
    });

    it('sells trade goods at full value and credits quantity times unit value', async () => {
      const client = makeClient([
        pendingItem({ id: 1, name: 'Ruby', value: 50, type: 'trade good', quantity: 3 }),
        pendingItem({ id: 2, name: 'Dagger', value: 2, type: 'weapon', quantity: 10 }),
      ]);

      const result = await SalesService.sellAllPendingItems();

      // 50 x 3 (full) + 1 x 10 (half) = 160
      expect(result.sold.total).toBe(160);
      expect(client.log.find(c => c.kind === 'gold').entry.gold).toBe(160);
    });

    it('F-0737: records sold.soldfor as the line total (unit value x quantity) so sold rows sum to the gold entry', async () => {
      const client = makeClient([
        pendingItem({ id: 1, name: 'Dagger', value: 20, type: 'weapon', quantity: 10 }),
        pendingItem({ id: 2, name: 'Gem', value: 30, type: 'trade good', quantity: 2 }),
      ]);

      const result = await SalesService.sellAllPendingItems();

      const [insert] = sqlCalls(client, /^INSERT INTO sold/);
      expect(insert.params[1]).toEqual([100, 60]);
      expect(insert.params[1].reduce((a, b) => a + b, 0)).toBe(result.sold.total);
      expect(client.log.find(c => c.kind === 'gold').entry.gold).toBe(160);
    });

    it('credits the exact silver and copper for a 2.3gp sale', async () => {
      const client = makeClient([pendingItem({ id: 1, name: 'Bauble', value: 4.6, type: 'weapon' })]);

      await SalesService.sellAllPendingItems();

      const { entry } = client.log.find(c => c.kind === 'gold');
      expect([entry.gold, entry.silver, entry.copper]).toEqual([2, 3, 0]);
    });

    it('skips unidentified and valueless items and reports them', async () => {
      const client = makeClient([
        pendingItem({ id: 1, name: 'Sword', value: 100, type: 'weapon' }),
        pendingItem({ id: 2, name: 'Unknown Ring', value: 900, unidentified: true }),
        pendingItem({ id: 3, name: 'Odd Thing', value: null }),
      ]);

      const result = await SalesService.sellAllPendingItems();

      expect(result.sold.count).toBe(1);
      expect(result.skipped.items.map(i => i.id)).toEqual([2, 3]);
      expect(sqlCalls(client, /^UPDATE loot/)[0].params).toEqual([[1]]);
    });

    it('rolls back when the guarded status UPDATE touches fewer rows than expected (double sale)', async () => {
      const client = makeClient([pendingItem({ id: 1, name: 'Sword', value: 100, type: 'weapon' })], { updateRowCount: 0 });

      await expect(SalesService.sellAllPendingItems()).rejects.toMatchObject({ name: 'ValidationError' });
      // The gold credit is never reached after the failed update
      expect(client.log.some(c => c.kind === 'gold')).toBe(false);
    });

    it('should throw when no items pending', async () => {
      makeClient([]);

      await expect(SalesService.sellAllPendingItems())
        .rejects.toThrow('No items pending sale found');
    });

    it('should throw when all items are invalid', async () => {
      const client = makeClient([pendingItem({ id: 1, name: 'Unknown', unidentified: true, value: null })]);

      await expect(SalesService.sellAllPendingItems())
        .rejects.toThrow('No valid items to sell');
      expect(client.log.some(c => c.kind === 'gold')).toBe(false);
    });
  });

  describe('sellSelectedItems', () => {
    it('should throw for empty or non-array input', async () => {
      await expect(SalesService.sellSelectedItems([])).rejects.toThrow('Item IDs array is required');
      await expect(SalesService.sellSelectedItems(null)).rejects.toThrow('Item IDs array is required');
    });

    it('sells only the specified items, crediting the right gold atomically', async () => {
      const client = makeClient([
        pendingItem({ id: 1, name: 'Gem', value: 50, type: 'trade good' }),
      ]);

      const result = await SalesService.sellSelectedItems([1]);

      expect(result.sold.count).toBe(1);
      expect(result.sold.total).toBe(50);
      expect(sqlCalls(client, /^SELECT l\.\*/)[0].params).toEqual([[1]]);
      expect(sqlCalls(client, /^INSERT INTO sold/)[0].params[0]).toEqual([1]);
      expect(sqlCalls(client, /^UPDATE loot/)[0].params).toEqual([[1]]);
      expect(client.log.find(c => c.kind === 'gold').entry.gold).toBe(50);
      expectAtomicSale(client);
    });

    it('F-0740: rejects ids that are already sold, naming them, and sells nothing', async () => {
      const client = makeClient([
        pendingItem({ id: 1, name: 'Gem', value: 50, type: 'trade good' }),
        pendingItem({ id: 2, name: 'Ruby', status: 'Sold', value: 500, type: 'trade good' }),
      ]);

      await expect(SalesService.sellSelectedItems([1, 2, 77])).rejects.toMatchObject({
        name: 'ValidationError',
        message: expect.stringMatching(/Ruby \(id 2, status Sold\).*not found: 77/),
      });
      // Only the lock and the SELECT ran: no sold rows, no status update, no gold entry
      expect(client.log.filter(c => c.kind === 'sql')).toHaveLength(1);
      expect(client.log.some(c => c.kind === 'gold')).toBe(false);
      expect(sqlCalls(client, /^SELECT/)[0].text).toContain('FOR UPDATE');
    });

    it('F-0740: fails the whole sale when the guarded UPDATE affects fewer rows than expected', async () => {
      const client = makeClient([pendingItem({ id: 1, name: 'Gem', value: 50, type: 'trade good' })], { updateRowCount: 0 });

      await expect(SalesService.sellSelectedItems([1])).rejects.toMatchObject({ name: 'ValidationError' });
      expect(sqlCalls(client, /^UPDATE loot/)[0].text).toContain("status = 'Pending Sale'");
      expect(client.log.some(c => c.kind === 'gold')).toBe(false);
    });

    it('should throw when no items found with given IDs', async () => {
      makeClient([]);

      await expect(SalesService.sellSelectedItems([999]))
        .rejects.toThrow('No items found with the specified IDs');
    });
  });

  describe('sellAllExceptItems', () => {
    it('should throw for non-array keepIds', async () => {
      await expect(SalesService.sellAllExceptItems('not-array'))
        .rejects.toThrow('Keep IDs must be an array');
    });

    it('sells pending items excluding kept ones and credits the sold total', async () => {
      const client = makeClient([
        pendingItem({ id: 3, name: 'Potion', value: 50, type: 'potion' }),
      ]);

      const result = await SalesService.sellAllExceptItems([1, 2]);

      expect(result.sold.count).toBe(1);
      expect(result.sold.total).toBe(25);
      expect(result.kept.ids).toEqual([1, 2]);
      const select = sqlCalls(client, /^SELECT l\.\*/)[0];
      expect(select.text).toContain("l.status = 'Pending Sale'");
      expect(select.text).toContain('!= ALL($1::int[])');
      expect(select.params).toEqual([[1, 2]]);
      expect(sqlCalls(client, /^UPDATE loot/)[0].params).toEqual([[3]]);
      expect(client.log.find(c => c.kind === 'gold').entry.gold).toBe(25);
      expectAtomicSale(client);
    });

    it('sells every pending item when keepIds is empty', async () => {
      const client = makeClient([pendingItem({ id: 1, name: 'Sword', value: 100, type: 'weapon' })]);

      const result = await SalesService.sellAllExceptItems([]);

      expect(result.sold.count).toBe(1);
      expect(sqlCalls(client, /^SELECT l\.\*/)[0].params).toEqual([[]]);
      expect(result.kept).toBeUndefined();
      expectAtomicSale(client);
    });

    it('rolls back when an item was sold by a concurrent request', async () => {
      const client = makeClient([pendingItem({ id: 1, name: 'Sword', value: 100, type: 'weapon' })], { updateRowCount: 0 });

      await expect(SalesService.sellAllExceptItems([])).rejects.toMatchObject({ name: 'ValidationError' });
      expect(client.log.some(c => c.kind === 'gold')).toBe(false);
    });
  });

  describe('sellUpToAmount', () => {
    it('should throw for invalid amount', async () => {
      await expect(SalesService.sellUpToAmount(0)).rejects.toThrow('positive number');
      await expect(SalesService.sellUpToAmount(-5)).rejects.toThrow('positive number');
    });

    it('selects items up to the max amount and credits exactly what it sold', async () => {
      const client = makeClient([
        pendingItem({ id: 1, name: 'Small Gem', value: 20, type: 'trade good' }),
        pendingItem({ id: 2, name: 'Medium Gem', value: 50, type: 'trade good' }),
        pendingItem({ id: 3, name: 'Big Gem', value: 200, type: 'trade good' }),
      ]);

      const result = await SalesService.sellUpToAmount(75);

      // 20gp + 50gp = 70gp; the 200gp gem would exceed 75
      expect(result.sold.count).toBe(2);
      expect(result.sold.total).toBe(70);
      expect(sqlCalls(client, /^UPDATE loot/)[0].params).toEqual([[1, 2]]);
      expect(client.log.find(c => c.kind === 'gold').entry.gold).toBe(70);
      expectAtomicSale(client);
    });

    it('F-0744: counts quantity against the cap, so a stack cannot overshoot it', async () => {
      const client = makeClient([
        pendingItem({ id: 1, name: 'Gem stack', value: 20, type: 'trade good', quantity: 10 }), // 200gp
        pendingItem({ id: 2, name: 'Gem', value: 30, type: 'trade good' }),
      ]);

      const result = await SalesService.sellUpToAmount(75);

      expect(result.sold.total).toBe(30);
      expect(sqlCalls(client, /^UPDATE loot/)[0].params).toEqual([[2]]);
    });

    it('F-0743: includes rows whose unidentified flag is NULL, like the other sale paths', async () => {
      const client = makeClient([pendingItem({ id: 1, name: 'Gem', value: 20, type: 'trade good', unidentified: null })]);

      await SalesService.sellUpToAmount(100);

      const select = sqlCalls(client, /^SELECT l\.\*/)[0];
      expect(select.text).toContain('l.unidentified IS NOT TRUE');
      expect(select.text).not.toContain('!= true');
    });

    it('throws when nothing fits under the cap', async () => {
      makeClient([pendingItem({ id: 1, name: 'Big Gem', value: 500, type: 'trade good' })]);

      await expect(SalesService.sellUpToAmount(10)).rejects.toThrow('No items found within the specified amount limit');
    });
  });

  describe('getPendingSaleItems', () => {
    it('should return items with Pending Sale status', async () => {
      const mockItems = [{ id: 1, name: 'Dagger', status: 'Pending Sale' }];
      dbUtils.executeQuery.mockResolvedValue({ rows: mockItems });

      const result = await SalesService.getPendingSaleItems();

      expect(result).toEqual(mockItems);
      expect(dbUtils.executeQuery.mock.calls[0][0]).toContain("status = 'Pending Sale'");
    });
  });
});
