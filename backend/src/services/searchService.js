// src/services/searchService.js
const dbUtils = require('../utils/dbUtils');

// Columns that identification hides: for a non-DM caller they are blanked on
// unidentified rows. dm_notes is DM-only on every row.
const HIDDEN_WHEN_UNIDENTIFIED = [
  'itemid', 'modids', 'value', 'cursed', 'spellcraft_dc',
  'base_item_name', 'item_type', 'subtype'
];

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * Service for handling complex loot search operations
 * Refactored from itemController to improve maintainability
 */
class SearchService {
  /**
   * Build search query conditions
   * @param {Object} filters - Search filters
   * @param {Object} [options]
   * @param {boolean} [options.isDM=false] - Callers without DM rights cannot filter on, or
   *   text-match, what identification hides: those filters only see identified loot.
   * @returns {Object} - { conditions, params, paramIndex }
   */
  static buildSearchConditions(filters, { isDM = false } = {}) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    const {
      query, status, type, subtype, character_id,
      unidentified, cursed, min_value, max_value,
      itemid, modids, value
    } = filters;

    // Text search
    if (query) {
      conditions.push(isDM
        ? `(l.name ILIKE $${paramIndex} OR i.name ILIKE $${paramIndex})`
        : `(l.name ILIKE $${paramIndex} OR (l.unidentified IS NOT TRUE AND i.name ILIKE $${paramIndex}))`);
      params.push(`%${query}%`);
      paramIndex++;
    }

    // Status filter
    if (status) {
      conditions.push(`l.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    // Type filters
    if (type) {
      conditions.push(`l.type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    if (subtype) {
      conditions.push(`i.subtype = $${paramIndex}`);
      params.push(subtype);
      paramIndex++;
    }

    // Character filter
    if (character_id) {
      conditions.push(`l.whohas = $${paramIndex}`);
      params.push(character_id);
      paramIndex++;
    }

    // Boolean filters
    if (unidentified !== undefined) {
      conditions.push(`l.unidentified = $${paramIndex}`);
      params.push(unidentified === 'true');
      paramIndex++;
    }

    if (cursed !== undefined) {
      conditions.push(`l.cursed = $${paramIndex}`);
      params.push(cursed === 'true');
      paramIndex++;
    }

    // Item ID filters
    const itemIdResult = this.buildItemIdCondition(itemid, paramIndex);
    if (itemIdResult.condition) {
      conditions.push(itemIdResult.condition);
      if (itemIdResult.param !== undefined) {
        params.push(itemIdResult.param);
        paramIndex++;
      }
    }

    // Mod ID filters
    const modIdCondition = this.buildModIdCondition(modids);
    if (modIdCondition) {
      conditions.push(modIdCondition);
    }

    // Value filters
    const valueResult = this.buildValueConditions(value, min_value, max_value, paramIndex);
    conditions.push(...valueResult.conditions);
    params.push(...valueResult.params);
    paramIndex += valueResult.params.length;

    // A non-DM filtering on a hidden attribute would otherwise learn it for unidentified rows
    const usesHiddenFilter = cursed !== undefined || subtype || itemIdResult.condition
      || modIdCondition || valueResult.conditions.length > 0;
    if (!isDM && usesHiddenFilter) {
      conditions.push('l.unidentified IS NOT TRUE');
    }

    return { conditions, params, paramIndex };
  }

  /**
   * Build item ID condition
   * @param {string} itemid - Item ID filter
   * @param {number} paramIndex - Current parameter index
   * @returns {Object} - { condition, param }
   */
  static buildItemIdCondition(itemid, paramIndex) {
    if (itemid === 'null') {
      return { condition: 'l.itemid IS NULL' };
    }
    
    if (itemid === 'notnull') {
      return { condition: 'l.itemid IS NOT NULL' };
    }
    
    const itemIdNumber = parseInt(itemid, 10);
    if (Number.isInteger(itemIdNumber)) {
      return {
        condition: `l.itemid = $${paramIndex}`,
        param: itemIdNumber
      };
    }

    return { condition: null };
  }

  /**
   * Build mod ID condition
   * @param {string} modids - Mod IDs filter
   * @returns {string|null} - SQL condition
   */
  static buildModIdCondition(modids) {
    if (modids === 'null') {
      return `(l.modids IS NULL OR l.modids = '{}')`;
    }
    
    if (modids === 'notnull') {
      return `(l.modids IS NOT NULL AND l.modids != '{}')`;
    }

    return null;
  }

  /**
   * Build value conditions
   * @param {string} value - Value filter type
   * @param {string} min_value - Minimum value
   * @param {string} max_value - Maximum value
   * @param {number} paramIndex - Current parameter index
   * @returns {Object} - { conditions, params }
   */
  static buildValueConditions(value, min_value, max_value, paramIndex) {
    const conditions = [];
    const params = [];

    if (value === 'null') {
      conditions.push('l.value IS NULL');
      return { conditions, params };
    }
    
    if (value === 'notnull') {
      conditions.push('l.value IS NOT NULL');
      return { conditions, params };
    }

    // Range filters
    const min = parseFloat(min_value);
    if (Number.isFinite(min)) {
      conditions.push(`l.value >= $${paramIndex}`);
      params.push(min);
      paramIndex++;
    }

    const max = parseFloat(max_value);
    if (Number.isFinite(max)) {
      conditions.push(`l.value <= $${paramIndex}`);
      params.push(max);
      paramIndex++;
    }

    return { conditions, params };
  }

  /**
   * Build complete search query
   * @param {Object} filters - Search filters
   * @param {number} limit - Results limit
   * @param {number} offset - Results offset
   * @returns {Object} - { sql, countSql, params }
   */
  static buildSearchQuery(filters, limit, offset, options = {}) {
    const baseSelect = `
      SELECT l.*, i.name as base_item_name, i.type as item_type, i.subtype
      FROM loot l
      LEFT JOIN item i ON l.itemid = i.id
    `;

    const { conditions, params, paramIndex } = this.buildSearchConditions(filters, options);

    let sql = baseSelect;
    let countSql = `
      SELECT COUNT(*)
      FROM loot l
      LEFT JOIN item i ON l.itemid = i.id
    `;

    // Add WHERE clause if conditions exist
    if (conditions.length > 0) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      sql += whereClause;
      countSql += whereClause;
    }

    // Add ordering and pagination
    sql += ' ORDER BY l.lastupdate DESC';
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const safeLimit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
    params.push(safeLimit, safeOffset);

    return { sql, countSql, params: params.slice(0, -2), paginationParams: params };
  }

  /**
   * Blank what identification hides on one loot row (non-DM callers).
   * @param {Object} row - A search result row
   * @returns {Object} - A copy without dm_notes and, when unidentified, without the hidden columns
   */
  static redactForPlayer(row) {
    const { dm_notes: _dmNotes, ...rest } = row;
    if (rest.unidentified === true) {
      for (const column of HIDDEN_WHEN_UNIDENTIFIED) {
        if (column in rest) rest[column] = null;
      }
    }
    return rest;
  }

  /**
   * Execute search with pagination
   * @param {Object} filters - Search filters
   * @param {number} limit - Results limit
   * @param {number} offset - Results offset
   * @param {Object} [options]
   * @param {boolean} [options.isDM=false] - Only DMs get unredacted rows and hidden-field filters
   * @returns {Object} - { items, totalCount }
   */
  static async executeSearch(filters, limit = DEFAULT_LIMIT, offset = 0, options = {}) {
    const { sql, countSql, params, paginationParams } = this.buildSearchQuery(filters, limit, offset, options);

    // Execute both queries
    const [dataResult, countResult] = await Promise.all([
      dbUtils.executeQuery(sql, paginationParams),
      dbUtils.executeQuery(countSql, params)
    ]);

    return {
      items: options.isDM === true ? dataResult.rows : dataResult.rows.map(row => this.redactForPlayer(row)),
      totalCount: parseInt(countResult.rows[0].count, 10),
      // the values actually applied (limit is clamped), for the caller's pagination block
      limit: paginationParams[paginationParams.length - 2],
      offset: paginationParams[paginationParams.length - 1]
    };
  }
}

module.exports = SearchService;