// src/controllers/reportsController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const ValidationService = require('../services/validationService');
const { hasDmRights } = require('../utils/roleUtils');

/**
 * Resolve paging for a report request. The report pages never send page/limit
 * (they render the whole list), so by default NO LIMIT is applied; a mixed
 * summary+individual row list silently capped at 50 was dropping data
 * (F-0382). Paging only happens when the caller explicitly asks for it.
 */
const resolvePaging = (query) => {
  if (query.page === undefined && query.limit === undefined) {
    return { paginate: false };
  }
  return { paginate: true, ...ValidationService.validatePagination(query.page, query.limit) };
};

/**
 * Build the pagination block for the response. When unpaginated the whole set
 * was returned, so limit equals the total and there is nothing more to fetch.
 */
const buildPagination = (paging, total) => {
  if (!paging.paginate) {
    return { total, limit: total, offset: 0, page: 1, totalPages: 1, hasMore: false };
  }
  return {
    total,
    limit: paging.limit,
    offset: paging.offset,
    page: paging.page,
    totalPages: Math.ceil(total / paging.limit),
    hasMore: (paging.offset + paging.limit) < total
  };
};

/**
 * Players must not see what identification hides: the true item, its mods and
 * its value. loot_view exposes them on every row, so blank them for unidentified
 * rows unless the caller has DM rights in this campaign.
 */
const redactUnidentified = (req, rows) => {
  if (hasDmRights(req)) return rows;
  return rows.map(row => (
    row.unidentified === true ? { ...row, itemid: null, modids: null, value: null } : row
  ));
};

/**
 * loot_view rows belonging to one character. loot_view only has `character_name`
 * (summary rows carry the first holder's name); there is no character_names column.
 */
const characterLootFilter = (paramIndex) =>
  `character_name = (SELECT name FROM characters WHERE id = $${paramIndex})`;

/**
 * One paged read of loot_view for the three kept/trashed reports.
 * `statuses` and `orderBy` come from the handlers below, never from the request.
 */
const fetchLootViewPage = async (req, { statuses, orderBy, characterId }) => {
  const paging = resolvePaging(req.query);

  const params = [statuses];
  let where = 'statuspage = ANY($1::text[])';
  if (characterId) {
    params.push(characterId);
    where += ` AND ${characterLootFilter(params.length)}`;
  }

  let query = `SELECT * FROM loot_view WHERE ${where} ORDER BY ${orderBy}`;
  const queryParams = [...params];
  if (paging.paginate) {
    query += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(paging.limit, paging.offset);
  }

  const [itemsResult, countResult] = await Promise.all([
    dbUtils.executeQuery(query, queryParams),
    dbUtils.executeQuery(`SELECT COUNT(*) FROM loot_view WHERE ${where}`, params)
  ]);

  const allItems = redactUnidentified(req, itemsResult.rows);

  return {
    summary: allItems.filter(item => item.row_type === 'summary'),
    individual: allItems.filter(item => item.row_type === 'individual'),
    count: allItems.length,
    pagination: buildPagination(paging, parseInt(countResult.rows[0].count))
  };
};

/**
 * Get party kept loot items
 */
const getKeptPartyLoot = async (req, res) => {
  const page = await fetchLootViewPage(req, { statuses: ['Kept Party'], orderBy: 'name' });

  return controllerFactory.sendSuccessResponse(res, page, `Found ${page.count} party kept items`);
};

/**
 * Get character kept loot items
 */
const getKeptCharacterLoot = async (req, res) => {
  const { character_id } = req.query;
  if (character_id) {
    ValidationService.validateCharacterId(parseInt(character_id));
  }

  const page = await fetchLootViewPage(req, {
    statuses: ['Kept Character'],
    orderBy: 'character_name, name',
    characterId: character_id
  });

  return controllerFactory.sendSuccessResponse(res, {
    ...page,
    filters: { character_id }
  }, `Found ${page.count} character kept items`);
};

/**
 * Get trashed/given away loot items
 */
const getTrashedLoot = async (req, res) => {
  const page = await fetchLootViewPage(req, {
    statuses: ['Trash', 'Trashed', 'Given Away'],
    orderBy: 'statuspage, name'
  });

  return controllerFactory.sendSuccessResponse(res, page, `Found ${page.count} trashed/given away items`);
};

/**
 * Get character loot ledger
 */
const getCharacterLedger = async (req, res) => {
  // Aggregate loot and gold separately before joining. Joining the raw loot
  // and gold rows directly would fan out (loot rows x gold rows per character)
  // and multiply every sum, which only stayed hidden while gold.character_id
  // was rarely populated. Pre-aggregating keeps each total correct.
  // Loot value is per unit, so the loot sum is value * quantity, over the same
  // statuses the kept-character report lists. For players unidentified loot is
  // left out: its value is hidden from them.
  const ledgerQuery = `
    SELECT c.name AS character,
           c.active,
           COALESCE(lv.loot_value, 0)  AS lootValue,
           COALESCE(gt.payments, 0)    AS payments,
           COALESCE(gt.withdrawn, 0)   AS withdrawn
    FROM characters c
             LEFT JOIN (
                 SELECT whohas, SUM(value * quantity) AS loot_value
                 FROM loot
                 WHERE status = 'Kept Character'
                   AND (unidentified IS NOT TRUE OR $1::boolean)
                 GROUP BY whohas
             ) lv ON lv.whohas = c.id
             LEFT JOIN (
                 SELECT character_id,
                        SUM(CASE
                                WHEN transaction_type = 'Party Payment'
                                    THEN (copper::decimal / 100 + silver::decimal / 10 + gold::decimal +
                                          platinum::decimal * 10)
                                ELSE 0
                            END) AS payments,
                        SUM(CASE
                                WHEN transaction_type = 'Withdrawal'
                                    THEN -(copper::decimal / 100 + silver::decimal / 10 + gold::decimal +
                                           platinum::decimal * 10)
                                ELSE 0
                            END) AS withdrawn
                 FROM gold
                 WHERE character_id IS NOT NULL
                 GROUP BY character_id
             ) gt ON gt.character_id = c.id
    ORDER BY c.active DESC, lootValue DESC
  `;

  const result = await dbUtils.executeQuery(ledgerQuery, [hasDmRights(req)]);

  const ledger = result.rows.map(row => ({
    character: row.character,
    active: row.active,
    lootValue: parseFloat(row.lootvalue) || 0,
    payments: parseFloat(row.payments) || 0,
    withdrawn: parseFloat(row.withdrawn) || 0,
    balance: (parseFloat(row.lootvalue) || 0) - (parseFloat(row.payments) || 0)
  }));

  const totals = {
    totalLootValue: ledger.reduce((sum, char) => sum + char.lootValue, 0),
    totalPayments: ledger.reduce((sum, char) => sum + char.payments, 0),
    totalWithdrawn: ledger.reduce((sum, char) => sum + char.withdrawn, 0),
    totalBalance: ledger.reduce((sum, char) => sum + char.balance, 0)
  };

  return controllerFactory.sendSuccessResponse(res, {
    ledger,
    totals,
    characterCount: ledger.length
  }, `Character ledger retrieved for ${ledger.length} characters`);
};

/**
 * Get unidentified items count
 */
const getUnidentifiedCount = async (req, res) => {
  const countResult = await dbUtils.executeQuery(
    "SELECT COUNT(*) as count FROM loot WHERE unidentified = true AND (itemid IS NOT NULL OR (modids IS NOT NULL AND modids != '{}'))"
  );

  const count = parseInt(countResult.rows[0].count);

  return controllerFactory.sendSuccessResponse(res, {
    count,
    hasUnidentified: count > 0
  }, `${count} unidentified items found`);
};

/**
 * Get unprocessed items count
 */
const getUnprocessedCount = async (req, res) => {
  const countResult = await dbUtils.executeQuery(
    "SELECT COUNT(*) as count FROM loot WHERE status IS NULL"
  );

  const count = parseInt(countResult.rows[0].count);

  return controllerFactory.sendSuccessResponse(res, {
    count,
    hasUnprocessed: count > 0
  }, `${count} unprocessed items found`);
};

// Export controller functions with factory wrappers
module.exports = {
  getKeptPartyLoot: controllerFactory.createHandler(getKeptPartyLoot, {
    errorMessage: 'Error fetching party kept loot'
  }),

  getKeptCharacterLoot: controllerFactory.createHandler(getKeptCharacterLoot, {
    errorMessage: 'Error fetching character kept loot'
  }),

  getTrashedLoot: controllerFactory.createHandler(getTrashedLoot, {
    errorMessage: 'Error fetching trashed loot'
  }),

  getCharacterLedger: controllerFactory.createHandler(getCharacterLedger, {
    errorMessage: 'Error fetching character ledger'
  }),

  getUnidentifiedCount: controllerFactory.createHandler(getUnidentifiedCount, {
    errorMessage: 'Error fetching unidentified count'
  }),

  getUnprocessedCount: controllerFactory.createHandler(getUnprocessedCount, {
    errorMessage: 'Error fetching unprocessed count'
  })
};
