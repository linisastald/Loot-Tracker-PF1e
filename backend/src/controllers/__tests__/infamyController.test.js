/**
 * Unit tests for infamyController
 *
 * The controller delegates SQL to models/Infamy.js and runs every mutation in
 * one transaction. Both dbUtils.executeQuery and the transaction client are
 * routed through one fake database (route()) keyed on the SQL text, so the
 * tests do not depend on query order.
 */

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

jest.mock('../../utils/partyLevel', () => ({
  getPartyLevelInfo: jest.fn(),
}));

jest.mock('../../utils/campaignSettings', () => ({
  getCampaignSetting: jest.fn(),
}));

const dbUtils = require('../../utils/dbUtils');
const partyLevel = require('../../utils/partyLevel');
const campaignSettings = require('../../utils/campaignSettings');
const infamyController = require('../infamyController');
const { createMockRes, createMockReq } = require('../../../tests/utils/mockHttp');

/**
 * Fake database. `db` holds the canned rows; `writes` records every
 * mutating statement (sql + params) in order; `client` is the transaction
 * client handed to callbacks.
 */
let db;
let writes;
let client;
let order;

function freshDb(overrides = {}) {
  return {
    ship: { infamy: 5, disrepute: 5 },        // null -> no row
    date: { year: 4715, month: 6, day: 15 },  // null -> calendar missing
    todayAttempts: [],
    todayRerolls: [],
    portTotal: 0,
    plunder: [],
    favoredBonus: undefined,
    favoredPorts: [],
    imposition: null,
    sacrificeDates: [],
    history: [],
    historyTotal: 0,
    portTotals: [],
    impositions: [],
    ...overrides,
  };
}

function route(sql, params = []) {
  order.push(sql);
  if (sql.includes('FROM ship_infamy')) return { rows: db.ship ? [{ ...db.ship }] : [] };
  if (sql.includes('INSERT INTO ship_infamy')) {
    db.ship = db.ship || { infamy: 0, disrepute: 0 };
    return { rows: [] };
  }
  if (sql.includes('UPDATE ship_infamy')) {
    writes.push({ sql, params });
    db.ship = {
      infamy: Math.max(0, db.ship.infamy + params[0]),
      disrepute: Math.max(0, db.ship.disrepute + params[1]),
    };
    return { rows: [{ ...db.ship }] };
  }
  if (sql.includes('golarion_current_date')) return { rows: db.date ? [db.date] : [] };
  if (sql.includes('FROM infamy_history') && sql.includes('Sacrificed crew member')) {
    return { rows: db.sacrificeDates.map((golarion_date) => ({ golarion_date })) };
  }
  if (sql.includes('FROM infamy_history ih')) return { rows: db.history };
  if (sql.includes('COUNT(*)')) return { rows: [{ total: String(db.historyTotal) }] };
  if (sql.includes('FROM infamy_history WHERE reason = $1')) {
    return { rows: params[0] === 'Boasting at port' ? db.todayAttempts : db.todayRerolls };
  }
  if (sql.includes('FROM port_visits') && sql.includes('GROUP BY')) return { rows: db.portTotals };
  if (sql.includes('FROM port_visits')) return { rows: [{ total_gained: db.portTotal }] };
  if (sql.includes('FROM loot')) return { rows: db.plunder };
  if (sql.includes('SELECT bonus FROM favored_ports')) {
    return { rows: db.favoredBonus === undefined ? [] : [{ bonus: db.favoredBonus }] };
  }
  if (sql.includes('SELECT * FROM favored_ports')) return { rows: db.favoredPorts.map((p) => ({ ...p })) };
  if (sql.includes('SELECT * FROM impositions WHERE id')) return { rows: db.imposition ? [db.imposition] : [] };
  if (sql.includes('FROM impositions')) return { rows: db.impositions };
  writes.push({ sql, params });
  return { rows: [] };
}

const wrote = (fragment) => writes.filter((w) => w.sql.includes(fragment));

describe('infamyController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db = freshDb();
    writes = [];
    order = [];
    client = { query: jest.fn(async (sql, params) => route(sql, params)) };
    dbUtils.executeQuery.mockImplementation(async (sql, params) => route(sql, params));
    dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
    campaignSettings.getCampaignSetting.mockResolvedValue('1');
    partyLevel.getPartyLevelInfo.mockResolvedValue({ apl: 3 }); // DC = 15 + 2*3 = 21
  });

  // ---------------------------------------------------------------
  // getInfamyStatus
  // ---------------------------------------------------------------
  describe('getInfamyStatus', () => {
    it('returns default infamy and creates the row when none exists', async () => {
      db.ship = null;
      const res = createMockRes();

      await infamyController.getInfamyStatus(createMockReq(), res);

      expect(order.some((sql) => sql.includes('INSERT INTO ship_infamy'))).toBe(true);
      expect(res.success).toHaveBeenCalledWith(
        { infamy: 0, disrepute: 0, threshold: 'None', favored_ports: [] },
        'Infamy status retrieved'
      );
    });

    it.each([
      [15, 'Disgraceful'],
      [25, 'Despicable'],
      [35, 'Notorious'],
      [45, 'Loathsome'],
      [60, 'Vile'],
    ])('reports the threshold for infamy %i as %s', async (infamy, threshold) => {
      db.ship = { infamy, disrepute: 10 };
      db.favoredPorts = [{ port_name: 'Port Peril', bonus: 2, id: 9 }];
      const res = createMockRes();

      await infamyController.getInfamyStatus(createMockReq(), res);

      expect(res.success).toHaveBeenCalledWith(
        { infamy, disrepute: 10, threshold, favored_ports: [{ port_name: 'Port Peril', bonus: 2 }] },
        'Infamy status retrieved'
      );
    });
  });

  // ---------------------------------------------------------------
  // adjustInfamy
  // ---------------------------------------------------------------
  describe('adjustInfamy', () => {
    const dmReq = (body, extra = {}) =>
      createMockReq({ body, user: { id: 1, role: 'DM' }, ...extra });

    it('lets a DM adjust infamy and disrepute with a reason', async () => {
      db.ship = { infamy: 10, disrepute: 8 };
      const res = createMockRes();

      await infamyController.adjustInfamy(
        dmReq({ infamyChange: 5, disreputeChange: 3, reason: 'Defeated a rival pirate' }), res
      );

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          previousInfamy: 10, newInfamy: 15, infamyChange: 5,
          previousDisrepute: 8, newDisrepute: 11, disreputeChange: 3,
        }),
        expect.any(String)
      );
      expect(wrote('INSERT INTO infamy_history')[0].params.slice(0, 3))
        .toEqual([5, 3, 'DM Adjustment: Defeated a rival pirate']);
    });

    it('locks the ship_infamy row inside one transaction', async () => {
      const res = createMockRes();
      await infamyController.adjustInfamy(dmReq({ infamyChange: 1, reason: 'x' }), res);
      expect(dbUtils.executeTransaction).toHaveBeenCalledTimes(1);
      expect(order.some((sql) => sql.includes('FROM ship_infamy') && sql.includes('FOR UPDATE'))).toBe(true);
    });

    it('rejects non-DM users', async () => {
      const res = createMockRes();
      await infamyController.adjustInfamy(
        createMockReq({ body: { infamyChange: 5, reason: 'Cheating' }, user: { id: 2, role: 'Player' } }), res
      );
      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can manually adjust infamy/disrepute');
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('rejects a user demoted to Player in the campaign even with a stale JWT DM role', async () => {
      const res = createMockRes();
      await infamyController.adjustInfamy(
        createMockReq({
          body: { infamyChange: 5, reason: 'Cheating' },
          user: { id: 2, role: 'DM' },
          campaignRole: 'Player',
        }), res
      );
      expect(res.forbidden).toHaveBeenCalledWith('Only DMs can manually adjust infamy/disrepute');
    });

    it('allows a superadmin whose JWT role is not DM', async () => {
      const res = createMockRes();
      await infamyController.adjustInfamy(
        createMockReq({
          body: { infamyChange: 5, reason: 'Story correction' },
          user: { id: 3, role: 'Player' },
          campaignRole: 'Player',
          isSuperadmin: true,
        }), res
      );
      expect(res.forbidden).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalled();
    });

    it('requires a reason', async () => {
      const res = createMockRes();
      await infamyController.adjustInfamy(dmReq({ infamyChange: 5 }), res);
      expect(res.validationError).toHaveBeenCalled();
    });

    it('requires at least one change', async () => {
      const res = createMockRes();
      await infamyController.adjustInfamy(dmReq({ reason: 'nothing' }), res);
      expect(res.validationError).toHaveBeenCalledWith(
        'At least one of infamyChange or disreputeChange must be provided'
      );
    });

    it('rejects a non-numeric change', async () => {
      const res = createMockRes();
      await infamyController.adjustInfamy(dmReq({ infamyChange: 'lots', reason: 'x' }), res);
      expect(res.validationError).toHaveBeenCalledWith('infamyChange must be a whole number');
    });

    it('clamps at 0 and records the change that actually happened', async () => {
      db.ship = { infamy: 10, disrepute: 3 };
      const res = createMockRes();

      await infamyController.adjustInfamy(
        dmReq({ infamyChange: -20, disreputeChange: -5, reason: 'Penalty' }), res
      );

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ newInfamy: 0, newDisrepute: 0, infamyChange: -10, disreputeChange: -3 }),
        'Infamy decreased by 10 and Disrepute decreased by 3'
      );
      expect(wrote('INSERT INTO infamy_history')[0].params.slice(0, 2)).toEqual([-10, -3]);
    });

    it('creates the initial record when none exists', async () => {
      db.ship = null;
      const res = createMockRes();
      await infamyController.adjustInfamy(dmReq({ infamyChange: 5, reason: 'Starting infamy' }), res);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ previousInfamy: 0, newInfamy: 5 }), expect.any(String)
      );
    });

    it('reports the threshold crossed', async () => {
      db.ship = { infamy: 8, disrepute: 5 };
      const res = createMockRes();
      await infamyController.adjustInfamy(dmReq({ infamyChange: 5, reason: 'Crossing' }), res);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ newThreshold: 'Disgraceful' }), expect.any(String)
      );
    });

    it('reports the highest threshold when one adjustment crosses several', async () => {
      db.ship = { infamy: 5, disrepute: 0 };
      const res = createMockRes();
      await infamyController.adjustInfamy(dmReq({ infamyChange: 20, reason: 'Big jump' }), res);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ newInfamy: 25, newThreshold: 'Despicable' }), expect.any(String)
      );
    });

    it('is rejected while the infamy system is disabled', async () => {
      campaignSettings.getCampaignSetting.mockResolvedValue('0');
      const res = createMockRes();
      await infamyController.adjustInfamy(dmReq({ infamyChange: 5, reason: 'x' }), res);
      expect(res.forbidden).toHaveBeenCalledWith('The infamy system is not enabled for this campaign');
    });
  });

  // ---------------------------------------------------------------
  // purchaseImposition
  // ---------------------------------------------------------------
  describe('purchaseImposition', () => {
    const purchaseReq = (body = { impositionId: 1 }) => createMockReq({ body, user: { id: 1 } });
    const imp = (overrides) => ({
      id: 1, name: 'Test', cost: 5, threshold_required: 10, effect: 'x', ...overrides,
    });

    it('purchases an imposition and deducts disrepute in one transaction', async () => {
      db.imposition = imp({ name: "Besmara's Blessing", effect: 'Gain a bonus' });
      db.ship = { infamy: 15, disrepute: 10 };
      const res = createMockRes();

      await infamyController.purchaseImposition(purchaseReq(), res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ costPaid: 5, newDisrepute: 5, effect: 'Gain a bonus' }),
        expect.stringContaining("Besmara's Blessing")
      );
      expect(wrote('UPDATE ship_infamy')[0].params).toEqual([0, -5]);
      expect(wrote('INSERT INTO imposition_uses')[0].params).toEqual([1, 5, 1]);
      expect(wrote('INSERT INTO infamy_history')[0].params.slice(0, 3))
        .toEqual([0, -5, "Purchased imposition: Besmara's Blessing"]);
      expect(dbUtils.executeTransaction).toHaveBeenCalledTimes(1);
      expect(order.some((sql) => sql.includes('FROM ship_infamy') && sql.includes('FOR UPDATE'))).toBe(true);
    });

    it('rejects when infamy is below the threshold requirement', async () => {
      db.imposition = imp({ threshold_required: 20 });
      db.ship = { infamy: 10, disrepute: 10 };
      const res = createMockRes();
      await infamyController.purchaseImposition(purchaseReq(), res);
      expect(res.validationError).toHaveBeenCalledWith('Your Infamy is too low to purchase this imposition');
      expect(wrote('UPDATE ship_infamy')).toHaveLength(0);
    });

    it('rejects when there is not enough disrepute', async () => {
      db.imposition = imp();
      db.ship = { infamy: 15, disrepute: 2 };
      const res = createMockRes();
      await infamyController.purchaseImposition(purchaseReq(), res);
      expect(res.validationError).toHaveBeenCalledWith('Not enough Disrepute to purchase this imposition');
      expect(wrote('UPDATE ship_infamy')).toHaveLength(0);
    });

    it('returns not found for an unknown imposition', async () => {
      db.imposition = null;
      const res = createMockRes();
      await infamyController.purchaseImposition(purchaseReq({ impositionId: 999 }), res);
      expect(res.notFound).toHaveBeenCalledWith('Imposition not found');
    });

    it('rejects when there is no infamy record', async () => {
      db.imposition = imp();
      db.ship = null;
      const res = createMockRes();
      await infamyController.purchaseImposition(purchaseReq(), res);
      expect(res.validationError).toHaveBeenCalledWith('No infamy record found');
    });

    it('halves Disgraceful impositions at Notorious (30+)', async () => {
      db.imposition = imp({ cost: 4 });
      db.ship = { infamy: 35, disrepute: 10 };
      const res = createMockRes();
      await infamyController.purchaseImposition(purchaseReq(), res);
      expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ costPaid: 2 }), expect.any(String));
    });

    it('makes Disgraceful impositions free at Vile (55+)', async () => {
      db.imposition = imp({ cost: 4 });
      db.ship = { infamy: 60, disrepute: 10 };
      const res = createMockRes();
      await infamyController.purchaseImposition(purchaseReq(), res);
      expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ costPaid: 0 }), expect.any(String));
    });

    it('requires impositionId', async () => {
      const res = createMockRes();
      await infamyController.purchaseImposition(purchaseReq({}), res);
      expect(res.validationError).toHaveBeenCalled();
    });

    it('rejects a non-numeric impositionId', async () => {
      const res = createMockRes();
      await infamyController.purchaseImposition(purchaseReq({ impositionId: 'abc' }), res);
      expect(res.validationError).toHaveBeenCalledWith('Imposition ID is required');
    });

    it('is rejected while the infamy system is disabled', async () => {
      campaignSettings.getCampaignSetting.mockResolvedValue('0');
      const res = createMockRes();
      await infamyController.purchaseImposition(purchaseReq(), res);
      expect(res.forbidden).toHaveBeenCalled();
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // sacrificeCrew
  // ---------------------------------------------------------------
  describe('sacrificeCrew', () => {
    const sacrificeReq = (body = { crewName: 'Scurvy Pete' }) => createMockReq({ body, user: { id: 1 } });
    let randomSpy;

    beforeEach(() => {
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5); // 1d3 -> 2
    });
    afterEach(() => randomSpy.mockRestore());

    it('sacrifices crew for 1d3 disrepute at Despicable', async () => {
      db.ship = { infamy: 25, disrepute: 10 };
      const res = createMockRes();

      await infamyController.sacrificeCrew(sacrificeReq(), res);

      expect(res.success).toHaveBeenCalledWith(
        { crewName: 'Scurvy Pete', disreputeGained: 2, newDisrepute: 12 },
        expect.stringContaining('Scurvy Pete')
      );
      expect(wrote('UPDATE ship_infamy')[0].params).toEqual([0, 2]);
      expect(wrote('INSERT INTO infamy_history')[0].params)
        .toEqual([0, 2, 'Sacrificed crew member: Scurvy Pete', null, 1, '4715-6-15']);
    });

    it('rejects below 20 infamy', async () => {
      db.ship = { infamy: 15, disrepute: 10 };
      const res = createMockRes();
      await infamyController.sacrificeCrew(sacrificeReq(), res);
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('20 Infamy'));
    });

    it('rejects a second sacrifice within the week', async () => {
      db.ship = { infamy: 25, disrepute: 10 };
      db.sacrificeDates = ['4715-6-10'];
      const res = createMockRes();
      await infamyController.sacrificeCrew(sacrificeReq(), res);
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('once per week'));
      expect(wrote('UPDATE ship_infamy')).toHaveLength(0);
    });

    it('compares dates numerically, not as text (unpadded month/day)', async () => {
      db.ship = { infamy: 25, disrepute: 10 };
      db.date = { year: 4712, month: 10, day: 12 };
      // 8 days ago: allowed. As strings '4712-10-4' > '4712-10-12' would wrongly block it.
      db.sacrificeDates = ['4712-10-4'];
      const res = createMockRes();
      await infamyController.sacrificeCrew(sacrificeReq(), res);
      expect(res.success).toHaveBeenCalled();
    });

    it('does not block months later because of a lexical compare', async () => {
      db.ship = { infamy: 25, disrepute: 10 };
      db.date = { year: 4712, month: 10, day: 13 };
      db.sacrificeDates = ['4712-9-1']; // string '4712-9-1' > '4712-10-6' lexically
      const res = createMockRes();
      await infamyController.sacrificeCrew(sacrificeReq(), res);
      expect(res.success).toHaveBeenCalled();
    });

    it('counts a sacrifice exactly 7 days ago as outside the cooldown', async () => {
      db.ship = { infamy: 25, disrepute: 10 };
      db.date = { year: 4715, month: 6, day: 15 };
      db.sacrificeDates = ['4715-6-8'];
      const res = createMockRes();
      await infamyController.sacrificeCrew(sacrificeReq(), res);
      expect(res.success).toHaveBeenCalled();
    });

    it('handles the cooldown across a month boundary', async () => {
      db.ship = { infamy: 25, disrepute: 10 };
      db.date = { year: 4715, month: 7, day: 2 };
      db.sacrificeDates = ['4715-6-28']; // 4 days ago (June has 30 days)
      const res = createMockRes();
      await infamyController.sacrificeCrew(sacrificeReq(), res);
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('once per week'));
    });

    it('rejects when there is no infamy record', async () => {
      db.ship = null;
      const res = createMockRes();
      await infamyController.sacrificeCrew(sacrificeReq(), res);
      expect(res.validationError).toHaveBeenCalledWith('No infamy record found');
    });

    it('fails when the calendar is not initialised', async () => {
      db.ship = { infamy: 25, disrepute: 10 };
      db.date = null;
      const res = createMockRes();
      await infamyController.sacrificeCrew(sacrificeReq(), res);
      expect(res.validationError).toHaveBeenCalledWith('Calendar system not initialized');
    });

    it('requires crewName', async () => {
      const res = createMockRes();
      await infamyController.sacrificeCrew(sacrificeReq({}), res);
      expect(res.validationError).toHaveBeenCalled();
    });

    it('rejects a non-string crewName', async () => {
      const res = createMockRes();
      await infamyController.sacrificeCrew(sacrificeReq({ crewName: 5 }), res);
      expect(res.validationError).toHaveBeenCalledWith('Crew member name is required');
    });
  });

  // ---------------------------------------------------------------
  // setFavoredPort
  // ---------------------------------------------------------------
  describe('setFavoredPort', () => {
    const favoredReq = (body = { port: 'Port Peril' }) => createMockReq({ body, user: { id: 1 } });

    it('adds the first favored port with +2 at Disgraceful', async () => {
      db.ship = { infamy: 15, disrepute: 0 };
      const res = createMockRes();
      await infamyController.setFavoredPort(favoredReq(), res);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ port: 'Port Peril', bonus: 2 }), expect.stringContaining('Port Peril')
      );
      expect(wrote('INSERT INTO favored_ports')[0].params).toEqual(['Port Peril', 2, 1]);
    });

    it('upgrades the first port to +4 when adding a second', async () => {
      db.ship = { infamy: 35, disrepute: 0 };
      db.favoredPorts = [{ port_name: 'Port Peril', bonus: 2 }];
      const res = createMockRes();
      await infamyController.setFavoredPort(favoredReq({ port: 'Rickety Squibs' }), res);
      expect(wrote('UPDATE favored_ports')).toEqual([
        expect.objectContaining({ params: [4, 'Port Peril'] }),
      ]);
    });

    it('upgrades to +6 and +4 when adding a third', async () => {
      db.ship = { infamy: 60, disrepute: 0 };
      db.favoredPorts = [
        { port_name: 'B', bonus: 2 },
        { port_name: 'A', bonus: 4 },
      ];
      const res = createMockRes();
      await infamyController.setFavoredPort(favoredReq({ port: 'C' }), res);
      expect(wrote('UPDATE favored_ports').map((w) => w.params)).toEqual([[6, 'A'], [4, 'B']]);
    });

    it('rejects a port that is already favored', async () => {
      db.ship = { infamy: 15, disrepute: 0 };
      db.favoredPorts = [{ port_name: 'Port Peril', bonus: 2 }];
      const res = createMockRes();
      await infamyController.setFavoredPort(favoredReq(), res);
      expect(res.validationError).toHaveBeenCalledWith('This port is already a favored port');
    });

    it('rejects when the maximum is reached', async () => {
      db.ship = { infamy: 15, disrepute: 0 };
      db.favoredPorts = [{ port_name: 'Port Peril', bonus: 2 }];
      const res = createMockRes();
      await infamyController.setFavoredPort(favoredReq({ port: 'New Port' }), res);
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('1 favored port'));
    });

    it('rejects below 10 infamy', async () => {
      db.ship = { infamy: 5, disrepute: 0 };
      const res = createMockRes();
      await infamyController.setFavoredPort(favoredReq(), res);
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('0 favored port'));
    });

    it('rejects when there is no infamy record', async () => {
      db.ship = null;
      const res = createMockRes();
      await infamyController.setFavoredPort(favoredReq(), res);
      expect(res.validationError).toHaveBeenCalledWith('No infamy record found');
    });

    it('requires port', async () => {
      const res = createMockRes();
      await infamyController.setFavoredPort(favoredReq({}), res);
      expect(res.validationError).toHaveBeenCalled();
    });

    it('rejects a non-string port', async () => {
      const res = createMockRes();
      await infamyController.setFavoredPort(favoredReq({ port: 7 }), res);
      expect(res.validationError).toHaveBeenCalledWith('Port name is required');
    });

    it('is rejected while the infamy system is disabled', async () => {
      campaignSettings.getCampaignSetting.mockResolvedValue('0');
      const res = createMockRes();
      await infamyController.setFavoredPort(favoredReq(), res);
      expect(res.forbidden).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // gainInfamy
  // ---------------------------------------------------------------
  describe('gainInfamy', () => {
    const gainReq = (body) => createMockReq({ body, user: { id: 1 }, campaignId: 1 });

    it('requires a port', async () => {
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ skillCheck: 25, plunderSpent: 0 }), res);
      expect(res.validationError).toHaveBeenCalled();
    });

    it('awards 3 infamy for success by 10 and records history and the port visit', async () => {
      const res = createMockRes();

      await infamyController.gainInfamy(
        gainReq({ port: 'Port Peril', skillCheck: 31, skillUsed: 'Intimidate', plunderSpent: 0 }), res
      );

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          infamyGained: 3, newInfamy: 8, newDisrepute: 8, dc: 21, skillCheck: 31, isRerollAttempt: false,
        }),
        'Gained 3 Infamy at Port Peril'
      );
      expect(wrote('INSERT INTO infamy_history')[0].params)
        .toEqual([3, 0, 'Boasting at port', 'Port Peril', 1, '4715-6-15']);
      expect(wrote('INSERT INTO port_visits')[0].params)
        .toEqual(['Port Peril', 0, 3, 'Intimidate', 0, 1]);
      expect(wrote('UPDATE ship_infamy')[0].params).toEqual([3, 3]);
    });

    it.each([
      [21, 1],
      [26, 2],
      [31, 3],
    ])('check %i against DC 21 gains %i', async (skillCheck, gained) => {
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck, plunderSpent: 0 }), res);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ infamyGained: gained }), expect.any(String)
      );
    });

    it('runs the whole flow in one transaction under a row lock', async () => {
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: 31, plunderSpent: 0 }), res);
      expect(dbUtils.executeTransaction).toHaveBeenCalledTimes(1);
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
      expect(order[0]).toContain('FOR UPDATE');
    });

    it('adds favored-port bonus and 2 per plunder to the check', async () => {
      db.favoredBonus = 2;
      db.plunder = [{ id: 1, quantity: 5 }];
      const res = createMockRes();

      await infamyController.gainInfamy(
        gainReq({ port: 'Port Peril', skillCheck: 10, skillUsed: 'Bluff', plunderSpent: 4 }), res
      );

      // 10 + 4*2 + 2 = 20 < 21 -> failure, but the attempt and plunder are committed
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ infamyGained: 0, skillCheck: 20, dc: 21 }),
        expect.stringContaining('Failed to gain Infamy')
      );
    });

    it('records a failed attempt, keeps the plunder spent and returns a success response', async () => {
      db.plunder = [{ id: 21, quantity: 5 }];
      const res = createMockRes();

      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: 1, plunderSpent: 2 }), res);

      expect(res.validationError).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ infamyGained: 0, newInfamy: 5, isRerollAttempt: false }),
        expect.stringContaining('Failed to gain Infamy')
      );
      expect(wrote('INSERT INTO infamy_history')[0].params.slice(0, 3)).toEqual([0, 0, 'Boasting at port']);
      expect(wrote('INSERT INTO port_visits')).toHaveLength(0);
      expect(wrote('UPDATE ship_infamy')).toHaveLength(0);
      expect(wrote('UPDATE loot SET quantity')).toHaveLength(1);
    });

    it('caps the gain so a port never exceeds 5 infamy per threshold', async () => {
      db.portTotal = 4;
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: 40, plunderSpent: 0 }), res);
      expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ infamyGained: 1 }), expect.any(String));
    });

    it('rejects a port that already reached its 5-infamy cap', async () => {
      db.portTotal = 5;
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: 40, plunderSpent: 0 }), res);
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('maximum Infamy contribution'));
    });

    it('rejects spending more plunder than available without changing anything', async () => {
      db.plunder = [{ id: 1, quantity: 2 }];
      const res = createMockRes();

      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: 20, plunderSpent: 5 }), res);

      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('Not enough plunder available'));
      expect(wrote('UPDATE loot')).toHaveLength(0);
      expect(wrote('INSERT INTO infamy_history')).toHaveLength(0);
    });

    it('consumes whole plunder stacks', async () => {
      db.plunder = [{ id: 11, quantity: 3 }, { id: 12, quantity: 4 }];
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: 30, plunderSpent: 3 }), res);
      expect(client.query).toHaveBeenCalledWith("UPDATE loot SET status = 'Spent on Infamy' WHERE id = $1", [11]);
      expect(wrote('UPDATE loot')).toHaveLength(1);
    });

    it('splits a stack when only part of it is spent', async () => {
      db.plunder = [{ id: 21, quantity: 5 }];
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: 30, plunderSpent: 2 }), res);
      expect(client.query).toHaveBeenCalledWith('UPDATE loot SET quantity = $1 WHERE id = $2', [3, 21]);
      expect(wrote('INSERT INTO loot')[0].params).toEqual(['Plunder', 7807, 2, 'Spent on Infamy', 1]);
    });

    it('rejects a second attempt the same day after a success', async () => {
      db.todayAttempts = [{ infamy_change: 1 }];
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: 30, plunderSpent: 0 }), res);
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('already gained Infamy today'));
    });

    it('rejects a retry after a failure without the reroll option', async () => {
      db.todayAttempts = [{ infamy_change: 0 }];
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: 30, plunderSpent: 0 }), res);
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('with the reroll option'));
    });

    it('requires 3 plunder for a reroll after a failed attempt', async () => {
      db.todayAttempts = [{ infamy_change: 0 }];
      const res = createMockRes();
      await infamyController.gainInfamy(
        gainReq({ port: 'P', skillCheck: 30, plunderSpent: 1, reroll: true }), res
      );
      expect(res.validationError).toHaveBeenCalledWith('Reroll requires at least 3 plunder to be spent.');
    });

    it('records a reroll under its own history reason', async () => {
      db.todayAttempts = [{ infamy_change: 0 }];
      db.plunder = [{ id: 1, quantity: 9 }];
      const res = createMockRes();
      await infamyController.gainInfamy(
        gainReq({ port: 'P', skillCheck: 30, plunderSpent: 3, reroll: true }), res
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ isRerollAttempt: true, infamyGained: 3 }),
        'Reroll successful! Gained 3 Infamy at P'
      );
      expect(wrote('INSERT INTO infamy_history')[0].params[2]).toBe('Reroll for Infamy');
    });

    it('rejects a second reroll the same day', async () => {
      db.todayAttempts = [{ infamy_change: 0 }];
      db.todayRerolls = [{ infamy_change: 0 }];
      const res = createMockRes();
      await infamyController.gainInfamy(
        gainReq({ port: 'P', skillCheck: 30, plunderSpent: 3, reroll: true }), res
      );
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('used your reroll'));
    });

    it('rejects a reroll on the first attempt of the day', async () => {
      const res = createMockRes();
      await infamyController.gainInfamy(
        gainReq({ port: 'P', skillCheck: 30, plunderSpent: 3, reroll: true }), res
      );
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('cannot use the reroll option'));
    });

    it('fails when the calendar is not initialised', async () => {
      db.date = null;
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: 30, plunderSpent: 0 }), res);
      expect(res.validationError).toHaveBeenCalledWith('Calendar system not initialized');
    });

    it('reports a threshold newly reached', async () => {
      db.ship = { infamy: 9, disrepute: 0 };
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: 21, plunderSpent: 0 }), res);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ newThreshold: 'Disgraceful', newInfamy: 10 }), expect.any(String)
      );
    });

    it('uses the numeric threshold of the current infamy for the port cap', async () => {
      db.ship = { infamy: 22, disrepute: 0 };
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: 21, plunderSpent: 0 }), res);
      expect(wrote('INSERT INTO port_visits')[0].params[1]).toBe(20);
    });

    describe('input validation', () => {
      it.each([
        ['skillCheck above 100', { skillCheck: 9999, plunderSpent: 0 }],
        ['negative skillCheck', { skillCheck: -5, plunderSpent: 0 }],
        ['fractional skillCheck', { skillCheck: 20.5, plunderSpent: 0 }],
        ['non-numeric skillCheck', { skillCheck: 'abc', plunderSpent: 0 }],
        ['negative plunderSpent', { skillCheck: 30, plunderSpent: -3 }],
        ['fractional plunderSpent', { skillCheck: 30, plunderSpent: 1.5 }],
        ['non-numeric plunderSpent', { skillCheck: 30, plunderSpent: 'lots' }],
      ])('rejects %s', async (_label, body) => {
        const res = createMockRes();
        await infamyController.gainInfamy(gainReq({ port: 'P', ...body }), res);
        expect(res.validationError).toHaveBeenCalled();
        expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
      });

      it('rejects a request with neither a skill check nor plunder (missing plunderSpent)', async () => {
        const res = createMockRes();
        await infamyController.gainInfamy(gainReq({ port: 'P' }), res);
        expect(res.validationError).toHaveBeenCalledWith('Skill check result or plunder spent is required');
        expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
      });

      it('accepts numeric strings', async () => {
        const res = createMockRes();
        await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: '31', plunderSpent: '0' }), res);
        expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ infamyGained: 3 }), expect.any(String));
      });

      it('rejects a port name longer than the column', async () => {
        const res = createMockRes();
        await infamyController.gainInfamy(gainReq({ port: 'x'.repeat(256), skillCheck: 30, plunderSpent: 0 }), res);
        expect(res.validationError).toHaveBeenCalled();
      });
    });

    it('is rejected while the infamy system is disabled', async () => {
      campaignSettings.getCampaignSetting.mockResolvedValue('0');
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'P', skillCheck: 30, plunderSpent: 0 }), res);
      expect(res.forbidden).toHaveBeenCalledWith('The infamy system is not enabled for this campaign');
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // Read handlers
  // ---------------------------------------------------------------
  describe('getAvailableImpositions', () => {
    it('returns the same grouped shape (empty arrays) when there is no infamy record', async () => {
      db.ship = null;
      const res = createMockRes();
      await infamyController.getAvailableImpositions(createMockReq(), res);
      expect(res.success).toHaveBeenCalledWith(
        {
          impositions: { disgraceful: [], despicable: [], notorious: [], loathsome: [], vile: [] },
          infamy: 0,
          disrepute: 0,
        },
        'No infamy yet'
      );
    });

    it('groups impositions by threshold, applying the Vile free-Disgraceful discount', async () => {
      db.ship = { infamy: 55, disrepute: 3 };
      db.impositions = [
        { id: 1, name: 'A', threshold_required: 10, cost: 4 },
        { id: 2, name: 'B', threshold_required: 30, cost: 10 },
        { id: 3, name: 'C', threshold_required: 55, cost: 20 },
      ];
      const res = createMockRes();

      await infamyController.getAvailableImpositions(createMockReq(), res);

      const data = res.success.mock.calls[0][0];
      expect(data.impositions.disgraceful[0]).toMatchObject({ displayCost: 0, isAvailable: true });
      expect(data.impositions.notorious[0]).toMatchObject({ displayCost: 5, isAvailable: false });
      expect(data.impositions.vile[0]).toMatchObject({ displayCost: 20, isAvailable: false });
    });

    it('charges the same cost it displays', async () => {
      db.ship = { infamy: 40, disrepute: 50 };
      const impo = { id: 1, name: 'A', threshold_required: 20, cost: 7 };
      db.impositions = [impo];
      db.imposition = impo;
      const listRes = createMockRes();
      await infamyController.getAvailableImpositions(createMockReq(), listRes);
      const shown = listRes.success.mock.calls[0][0].impositions.despicable[0].displayCost;

      const buyRes = createMockRes();
      await infamyController.purchaseImposition(createMockReq({ body: { impositionId: 1 }, user: { id: 1 } }), buyRes);
      expect(buyRes.success.mock.calls[0][0].costPaid).toBe(shown);
    });
  });

  describe('getInfamyHistory', () => {
    const histReq = (query) => createMockReq({ query });

    it('returns the page of history with pagination totals', async () => {
      db.history = [{ id: 1 }, { id: 2 }];
      db.historyTotal = 7;
      const res = createMockRes();

      await infamyController.getInfamyHistory(histReq({ limit: '2', offset: '4' }), res);

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([2, 4]);
      expect(res.success).toHaveBeenCalledWith(
        { history: [{ id: 1 }, { id: 2 }], pagination: { total: 7, limit: 2, offset: 4 } },
        'Infamy history retrieved'
      );
    });

    it('defaults to 20 entries from offset 0', async () => {
      const res = createMockRes();
      await infamyController.getInfamyHistory(histReq({}), res);
      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([20, 0]);
    });

    it('clamps limit to 100', async () => {
      const res = createMockRes();
      await infamyController.getInfamyHistory(histReq({ limit: '100000000' }), res);
      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([100, 0]);
    });

    it.each([
      [{ limit: 'abc' }],
      [{ limit: '0' }],
      [{ limit: '-5' }],
      [{ offset: '-1' }],
      [{ offset: 'x' }],
      [{ limit: '2.5' }],
    ])('rejects bad paging %j with a 400', async (query) => {
      const res = createMockRes();
      await infamyController.getInfamyHistory(histReq(query), res);
      expect(res.validationError).toHaveBeenCalled();
      expect(dbUtils.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('getPortVisits', () => {
    it('structures visits by port and threshold', async () => {
      db.portTotals = [
        { port_name: 'Port Peril', threshold: 0, total_gained: 3 },
        { port_name: 'Port Peril', threshold: 10, total_gained: 1 },
        { port_name: 'Quent', threshold: 0, total_gained: 5 },
      ];
      const res = createMockRes();

      await infamyController.getPortVisits(createMockReq(), res);

      expect(res.success).toHaveBeenCalledWith(
        { ports: [
          { name: 'Port Peril', thresholds: { 0: 3, 10: 1 } },
          { name: 'Quent', thresholds: { 0: 5 } },
        ] },
        'Port visits retrieved'
      );
    });
  });
});
