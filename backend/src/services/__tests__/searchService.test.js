const SearchService = require('../searchService');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');

describe('SearchService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('buildItemIdCondition (pure)', () => {
    it('should return IS NULL for "null" string', () => {
      const result = SearchService.buildItemIdCondition('null', 1);
      expect(result.condition).toBe('l.itemid IS NULL');
      expect(result.param).toBeUndefined();
    });

    it('should return IS NOT NULL for "notnull" string', () => {
      const result = SearchService.buildItemIdCondition('notnull', 1);
      expect(result.condition).toBe('l.itemid IS NOT NULL');
    });

    it('should return parameterized condition for numeric id', () => {
      const result = SearchService.buildItemIdCondition('5', 3);
      expect(result.condition).toBe('l.itemid = $3');
      expect(result.param).toBe(5);
    });

    it('should return null condition for undefined', () => {
      const result = SearchService.buildItemIdCondition(undefined, 1);
      expect(result.condition).toBeNull();
    });
  });

  describe('buildModIdCondition (pure)', () => {
    it('should handle null string', () => {
      expect(SearchService.buildModIdCondition('null')).toContain('IS NULL');
    });

    it('should handle notnull string', () => {
      expect(SearchService.buildModIdCondition('notnull')).toContain('IS NOT NULL');
    });

    it('should return null for undefined', () => {
      expect(SearchService.buildModIdCondition(undefined)).toBeNull();
    });
  });

  describe('buildValueConditions (pure)', () => {
    it('should handle null value filter', () => {
      const result = SearchService.buildValueConditions('null', null, null, 1);
      expect(result.conditions).toEqual(['l.value IS NULL']);
      expect(result.params).toEqual([]);
    });

    it('should handle notnull value filter', () => {
      const result = SearchService.buildValueConditions('notnull', null, null, 1);
      expect(result.conditions).toEqual(['l.value IS NOT NULL']);
    });

    it('should handle min_value', () => {
      const result = SearchService.buildValueConditions(null, '100', null, 3);
      expect(result.conditions[0]).toContain('l.value >= $3');
      expect(result.params).toEqual([100]);
    });

    it('should handle max_value', () => {
      const result = SearchService.buildValueConditions(null, null, '500', 3);
      expect(result.conditions[0]).toContain('l.value <= $3');
      expect(result.params).toEqual([500]);
    });

    it('should handle both min and max', () => {
      const result = SearchService.buildValueConditions(null, '100', '500', 3);
      expect(result.conditions).toHaveLength(2);
      expect(result.params).toEqual([100, 500]);
    });

    it('should return empty for no value filters', () => {
      const result = SearchService.buildValueConditions(null, null, null, 1);
      expect(result.conditions).toEqual([]);
      expect(result.params).toEqual([]);
    });
  });

  describe('buildSearchConditions (pure)', () => {
    it('should build text search condition', () => {
      const { conditions, params } = SearchService.buildSearchConditions({ query: 'sword' });
      expect(conditions[0]).toContain('ILIKE');
      expect(params[0]).toBe('%sword%');
    });

    it('should build status condition', () => {
      const { conditions, params } = SearchService.buildSearchConditions({ status: 'Sold' });
      expect(conditions[0]).toContain('l.status = $1');
      expect(params[0]).toBe('Sold');
    });

    it('should build type condition', () => {
      const { conditions, params } = SearchService.buildSearchConditions({ type: 'weapon' });
      expect(conditions[0]).toContain('l.type = $1');
      expect(params[0]).toBe('weapon');
    });

    it('should build character_id condition', () => {
      const { conditions, params } = SearchService.buildSearchConditions({ character_id: 5 });
      expect(conditions[0]).toContain('l.whohas = $1');
      expect(params[0]).toBe(5);
    });

    it('should build boolean filters', () => {
      const { conditions } = SearchService.buildSearchConditions({ unidentified: 'true', cursed: 'false' }, { isDM: true });
      expect(conditions).toHaveLength(2);
    });

    it('should combine multiple filters', () => {
      const { conditions, params } = SearchService.buildSearchConditions({
        query: 'sword', status: 'Sold', type: 'weapon',
      });
      expect(conditions).toHaveLength(3);
      expect(params).toHaveLength(3);
    });

    it('should return empty for no filters', () => {
      const { conditions, params } = SearchService.buildSearchConditions({});
      expect(conditions).toHaveLength(0);
      expect(params).toHaveLength(0);
    });
  });

  describe('buildSearchQuery (pure)', () => {
    it('should build complete query with WHERE and pagination', () => {
      const { sql, countSql, paginationParams } = SearchService.buildSearchQuery(
        { query: 'sword' }, 20, 0
      );

      expect(sql).toContain('FROM loot l');
      expect(sql).toContain('WHERE');
      expect(sql).toContain('LIMIT');
      expect(sql).toContain('OFFSET');
      expect(countSql).toContain('COUNT(*)');
      expect(countSql).toContain('WHERE');
      expect(paginationParams[paginationParams.length - 2]).toBe(20); // limit
      expect(paginationParams[paginationParams.length - 1]).toBe(0);  // offset
    });

    it('should omit WHERE when no filters', () => {
      const { sql, countSql } = SearchService.buildSearchQuery({}, 20, 0);

      expect(sql).not.toContain('WHERE');
      expect(countSql).not.toContain('WHERE');
    });
  });

  describe('executeSearch', () => {
    it('should return items and total count', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ count: '42' }] });

      const result = await SearchService.executeSearch({}, 20, 0);

      expect(result.items).toHaveLength(1);
      expect(result.totalCount).toBe(42);
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('player redaction and limits (F-0759)', () => {
    const secretRow = {
      id: 1, name: 'Ring (unknown)', unidentified: true, itemid: 77, modids: [3], value: 18000,
      cursed: true, dm_notes: 'it is cursed', spellcraft_dc: 25, base_item_name: 'Ring of Wishes',
      item_type: 'ring', subtype: 'wondrous', notes: 'found in a vault',
    };
    const knownRow = { id: 2, name: 'Longsword', unidentified: false, itemid: 5, value: 315, dm_notes: 'DM only', base_item_name: 'Longsword' };

    it('strips the hidden columns of unidentified rows (and dm_notes everywhere) for a non-DM caller', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ ...secretRow }, { ...knownRow }] })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const { items } = await SearchService.executeSearch({}, 20, 0, { isDM: false });

      expect(items[0]).toMatchObject({ id: 1, name: 'Ring (unknown)', notes: 'found in a vault', itemid: null, modids: null, value: null, cursed: null, spellcraft_dc: null, base_item_name: null, item_type: null, subtype: null });
      expect(items[0]).not.toHaveProperty('dm_notes');
      expect(items[1]).toMatchObject({ itemid: 5, value: 315, base_item_name: 'Longsword' });
      expect(items[1]).not.toHaveProperty('dm_notes');
    });

    it('is redacted by default when the caller does not say it is a DM', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ ...secretRow }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const { items } = await SearchService.executeSearch({}, 20, 0);

      expect(items[0].itemid).toBeNull();
    });

    it('returns everything untouched to a DM', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ ...secretRow }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const { items } = await SearchService.executeSearch({}, 20, 0, { isDM: true });

      expect(items[0]).toMatchObject({ itemid: 77, value: 18000, dm_notes: 'it is cursed', base_item_name: 'Ring of Wishes' });
    });

    it.each([
      ['cursed', { cursed: 'true' }],
      ['itemid', { itemid: '77' }],
      ['itemid notnull', { itemid: 'notnull' }],
      ['modids', { modids: 'notnull' }],
      ['value', { value: 'notnull' }],
      ['min_value', { min_value: '100' }],
      ['max_value', { max_value: '100' }],
      ['subtype', { subtype: 'wondrous' }],
    ])('a non-DM %s filter cannot match unidentified rows (no oracle for the hidden fields)', (name, filters) => {
      const { conditions } = SearchService.buildSearchConditions(filters, { isDM: false });
      expect(conditions).toContain('l.unidentified IS NOT TRUE');
      const dm = SearchService.buildSearchConditions(filters, { isDM: true });
      expect(dm.conditions).not.toContain('l.unidentified IS NOT TRUE');
    });

    it('a non-DM text search does not match the true item name of unidentified loot', () => {
      const { conditions } = SearchService.buildSearchConditions({ query: 'wishes' }, { isDM: false });
      expect(conditions[0]).toBe('(l.name ILIKE $1 OR (l.unidentified IS NOT TRUE AND i.name ILIKE $1))');
      const dm = SearchService.buildSearchConditions({ query: 'wishes' }, { isDM: true });
      expect(dm.conditions[0]).toBe('(l.name ILIKE $1 OR i.name ILIKE $1)');
    });

    it('clamps limit to 100 and offset to >= 0', () => {
      const { paginationParams } = SearchService.buildSearchQuery({}, 10000000, -5);
      expect(paginationParams).toEqual([100, 0]);
    });

    it('falls back to 20 for a non-numeric limit', () => {
      const { paginationParams } = SearchService.buildSearchQuery({}, 'abc', 'x');
      expect(paginationParams).toEqual([20, 0]);
    });

    it('rejects a non-numeric itemid instead of sending NaN to the database', () => {
      const { conditions, params } = SearchService.buildSearchConditions({ itemid: 'abc' }, { isDM: true });
      expect(conditions).toEqual([]);
      expect(params).toEqual([]);
    });

    it('never interpolates user input into the SQL text', () => {
      const evil = "'; DROP TABLE loot; --";
      const { sql, countSql, params } = SearchService.buildSearchQuery(
        { query: evil, status: evil, type: evil, subtype: evil, character_id: evil, itemid: evil, min_value: evil }, 20, 0, { isDM: true }
      );
      expect(sql + countSql).not.toContain('DROP');
      expect(params).toContain(evil);
    });
  });
});
