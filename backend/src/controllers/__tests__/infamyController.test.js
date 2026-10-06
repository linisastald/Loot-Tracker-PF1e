/**
 * Unit tests for infamyController
 *
 * Tests the Skulls & Shackles infamy system:
 * - getInfamyStatus: current infamy/disrepute with threshold calculation
 * - adjustInfamy: DM-only manual adjustments with reason
 * - purchaseImposition: spend disrepute with threshold requirements and discounts
 * - sacrificeCrew: Despicable (20+) feature, once per week, 1d3 disrepute
 * - setFavoredPort: add ports with bonus cascade (+2/+4/+6)
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

const dbUtils = require('../../utils/dbUtils');
const partyLevel = require('../../utils/partyLevel');
const infamyController = require('../infamyController');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const { createMockRes, createMockReq } = require('../../../tests/utils/mockHttp');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('infamyController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dbUtils.executeQuery.mockResolvedValue({ rows: [] });
    dbUtils.executeTransaction.mockImplementation(async (cb) => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      return cb(mockClient);
    });
  });

  // ---------------------------------------------------------------
  // getInfamyStatus
  // ---------------------------------------------------------------
  describe('getInfamyStatus', () => {
    it('should return default infamy when no record exists and create one', async () => {
      const req = createMockReq();
      const res = createMockRes();

      // First call: SELECT from ship_infamy -> empty
      // Second call: INSERT default record
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })    // SELECT ship_infamy
        .mockResolvedValueOnce({ rows: [] });   // INSERT

      await infamyController.getInfamyStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          infamy: 0,
          disrepute: 0,
          threshold: 'None',
          favored_ports: [],
        }),
        'Infamy status retrieved'
      );
    });

    it('should return existing infamy with correct threshold - Disgraceful (10+)', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 15, disrepute: 10 }] })  // ship_infamy
        .mockResolvedValueOnce({ rows: [{ port_name: 'Port Peril', bonus: 2 }] }); // favored_ports

      await infamyController.getInfamyStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          infamy: 15,
          disrepute: 10,
          threshold: 'Disgraceful',
          favored_ports: [{ port_name: 'Port Peril', bonus: 2 }],
        }),
        'Infamy status retrieved'
      );
    });

    it('should return Despicable threshold for infamy 20-29', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 25, disrepute: 15 }] })
        .mockResolvedValueOnce({ rows: [] });

      await infamyController.getInfamyStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ threshold: 'Despicable' }),
        expect.any(String)
      );
    });

    it('should return Notorious threshold for infamy 30-39', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 35, disrepute: 20 }] })
        .mockResolvedValueOnce({ rows: [] });

      await infamyController.getInfamyStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ threshold: 'Notorious' }),
        expect.any(String)
      );
    });

    it('should return Loathsome threshold for infamy 40-54', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 45, disrepute: 30 }] })
        .mockResolvedValueOnce({ rows: [] });

      await infamyController.getInfamyStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ threshold: 'Loathsome' }),
        expect.any(String)
      );
    });

    it('should return Vile threshold for infamy 55+', async () => {
      const req = createMockReq();
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 60, disrepute: 40 }] })
        .mockResolvedValueOnce({ rows: [] });

      await infamyController.getInfamyStatus(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ threshold: 'Vile' }),
        expect.any(String)
      );
    });
  });

  // ---------------------------------------------------------------
  // adjustInfamy
  // ---------------------------------------------------------------
  describe('adjustInfamy', () => {
    it('should allow DM to increase infamy with reason', async () => {
      const req = createMockReq({
        body: { infamyChange: 5, disreputeChange: 3, reason: 'Defeated a rival pirate' },
        user: { id: 1, role: 'DM' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 10, disrepute: 8 }] })  // SELECT ship_infamy
        .mockResolvedValueOnce({ rows: [] })  // UPDATE ship_infamy
        .mockResolvedValueOnce({ rows: [] }); // INSERT infamy_history

      await infamyController.adjustInfamy(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          previousInfamy: 10,
          newInfamy: 15,
          previousDisrepute: 8,
          newDisrepute: 11,
        }),
        expect.any(String)
      );
    });

    it('should reject non-DM users', async () => {
      const req = createMockReq({
        body: { infamyChange: 5, reason: 'Cheating' },
        user: { id: 2, role: 'Player' },
      });
      const res = createMockRes();

      await infamyController.adjustInfamy(req, res);

      expect(res.forbidden).toHaveBeenCalledWith(
        'Only DMs can manually adjust infamy/disrepute'
      );
    });

    it('should reject a user demoted to Player in the campaign even with a stale JWT DM role', async () => {
      const req = createMockReq({
        body: { infamyChange: 5, reason: 'Cheating' },
        user: { id: 2, role: 'DM' },  // stale JWT role
        campaignRole: 'Player',        // per-campaign role wins
      });
      const res = createMockRes();

      await infamyController.adjustInfamy(req, res);

      expect(res.forbidden).toHaveBeenCalledWith(
        'Only DMs can manually adjust infamy/disrepute'
      );
    });

    it('should allow a superadmin whose JWT role is not DM', async () => {
      const req = createMockReq({
        body: { infamyChange: 5, reason: 'Story correction' },
        user: { id: 3, role: 'Player' },
        campaignRole: 'Player',
        isSuperadmin: true,
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 10, disrepute: 8 }] })  // SELECT ship_infamy
        .mockResolvedValueOnce({ rows: [] })  // UPDATE ship_infamy
        .mockResolvedValueOnce({ rows: [] }); // INSERT infamy_history

      await infamyController.adjustInfamy(req, res);

      expect(res.forbidden).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalled();
    });

    it('should require a reason', async () => {
      const req = createMockReq({
        body: { infamyChange: 5 },
        user: { id: 1, role: 'DM' },
      });
      const res = createMockRes();

      await infamyController.adjustInfamy(req, res);

      // The validation wrapper checks requiredFields: ['reason']
      expect(res.validationError).toHaveBeenCalled();
    });

    it('should not allow infamy to go below 0', async () => {
      const req = createMockReq({
        body: { infamyChange: -20, disreputeChange: -5, reason: 'Penalty' },
        user: { id: 1, role: 'DM' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 10, disrepute: 3 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await infamyController.adjustInfamy(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          newInfamy: 0,
          newDisrepute: 0,
        }),
        expect.any(String)
      );
    });

    it('should create initial record if none exists', async () => {
      const req = createMockReq({
        body: { infamyChange: 5, reason: 'Starting infamy' },
        user: { id: 1, role: 'DM' },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [] })    // SELECT ship_infamy -> empty
        .mockResolvedValueOnce({ rows: [] })    // INSERT default record
        .mockResolvedValueOnce({ rows: [] })    // UPDATE ship_infamy
        .mockResolvedValueOnce({ rows: [] });   // INSERT infamy_history

      await infamyController.adjustInfamy(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          previousInfamy: 0,
          newInfamy: 5,
        }),
        expect.any(String)
      );
    });

    it('should detect new threshold when crossing boundary', async () => {
      const req = createMockReq({
        body: { infamyChange: 5, reason: 'Crossing threshold' },
        user: { id: 1, role: 'DM' },
      });
      const res = createMockRes();

      // Start at 8 infamy, adding 5 should cross 10 -> Disgraceful
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 8, disrepute: 5 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await infamyController.adjustInfamy(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          newThreshold: 'Disgraceful',
        }),
        expect.any(String)
      );
    });
  });

  // ---------------------------------------------------------------
  // purchaseImposition
  // ---------------------------------------------------------------
  describe('purchaseImposition', () => {
    it('should purchase an imposition and deduct disrepute', async () => {
      const req = createMockReq({
        body: { impositionId: 1 },
        user: { id: 1 },
      });
      const res = createMockRes();

      const mockImposition = {
        id: 1,
        name: 'Besmara\'s Blessing',
        cost: 5,
        threshold_required: 10,
        effect: 'Gain a +2 bonus on Profession (sailor) checks',
      };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockImposition] })              // SELECT imposition
        .mockResolvedValueOnce({ rows: [{ infamy: 15, disrepute: 10 }] }) // SELECT ship_infamy
        .mockResolvedValueOnce({ rows: [] })  // UPDATE disrepute
        .mockResolvedValueOnce({ rows: [] })  // INSERT imposition_uses
        .mockResolvedValueOnce({ rows: [] }); // INSERT infamy_history

      await infamyController.purchaseImposition(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          costPaid: 5,
          newDisrepute: 5,
        }),
        expect.stringContaining('Besmara\'s Blessing')
      );
    });

    it('should reject if infamy is below threshold requirement', async () => {
      const req = createMockReq({
        body: { impositionId: 1 },
        user: { id: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test', cost: 5, threshold_required: 20, effect: 'x' }] })
        .mockResolvedValueOnce({ rows: [{ infamy: 10, disrepute: 10 }] });

      await infamyController.purchaseImposition(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Your Infamy is too low to purchase this imposition'
      );
    });

    it('should reject if not enough disrepute', async () => {
      const req = createMockReq({
        body: { impositionId: 1 },
        user: { id: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test', cost: 5, threshold_required: 10, effect: 'x' }] })
        .mockResolvedValueOnce({ rows: [{ infamy: 15, disrepute: 2 }] });

      await infamyController.purchaseImposition(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Not enough Disrepute to purchase this imposition'
      );
    });

    it('should return not found for invalid imposition ID', async () => {
      const req = createMockReq({
        body: { impositionId: 999 },
        user: { id: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] }); // imposition not found

      await infamyController.purchaseImposition(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Imposition not found');
    });

    it('should apply half-price discount at Notorious (30+) for Disgraceful impositions', async () => {
      const req = createMockReq({
        body: { impositionId: 1 },
        user: { id: 1 },
      });
      const res = createMockRes();

      // Disgraceful imposition (threshold_required <= 10) at Notorious infamy (30+)
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Cheap Trick', cost: 4, threshold_required: 10, effect: 'x' }] })
        .mockResolvedValueOnce({ rows: [{ infamy: 35, disrepute: 10 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await infamyController.purchaseImposition(req, res);

      // Cost 4 halved = 2
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ costPaid: 2 }),
        expect.any(String)
      );
    });

    it('should make Disgraceful impositions free at Vile (55+)', async () => {
      const req = createMockReq({
        body: { impositionId: 1 },
        user: { id: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Free Thing', cost: 4, threshold_required: 10, effect: 'x' }] })
        .mockResolvedValueOnce({ rows: [{ infamy: 60, disrepute: 10 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await infamyController.purchaseImposition(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ costPaid: 0 }),
        expect.any(String)
      );
    });

    it('should require impositionId field', async () => {
      const req = createMockReq({
        body: {},
        user: { id: 1 },
      });
      const res = createMockRes();

      await infamyController.purchaseImposition(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // sacrificeCrew
  // ---------------------------------------------------------------
  describe('sacrificeCrew', () => {
    it('should sacrifice crew and gain 1-3 disrepute at Despicable threshold', async () => {
      const req = createMockReq({
        body: { crewName: 'Scurvy Pete' },
        user: { id: 1 },
      });
      const res = createMockRes();

      // Mock Math.random to return a deterministic value (0.5 -> 1d3 = 2)
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 25, disrepute: 10 }] })  // SELECT ship_infamy
        .mockResolvedValueOnce({ rows: [{ year: 4715, month: 6, day: 15 }] }) // golarion date
        .mockResolvedValueOnce({ rows: [] })  // last sacrifice check (none within week)
        .mockResolvedValueOnce({ rows: [] })  // UPDATE disrepute
        .mockResolvedValueOnce({ rows: [] }); // INSERT history

      try {
        await infamyController.sacrificeCrew(req, res);

        // 0.5 * 3 = 1.5, floor = 1, +1 = 2
        expect(res.success).toHaveBeenCalledWith(
          expect.objectContaining({
            crewName: 'Scurvy Pete',
            disreputeGained: 2,
            newDisrepute: 12,
          }),
          expect.stringContaining('Scurvy Pete')
        );
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('should reject if infamy is below 20 (Despicable threshold)', async () => {
      const req = createMockReq({
        body: { crewName: 'Poor Sailor' },
        user: { id: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 15, disrepute: 10 }] });

      await infamyController.sacrificeCrew(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('20 Infamy')
      );
    });

    it('should reject if already sacrificed within the past week', async () => {
      const req = createMockReq({
        body: { crewName: 'Another Victim' },
        user: { id: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 25, disrepute: 10 }] })
        .mockResolvedValueOnce({ rows: [{ year: 4715, month: 6, day: 15 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, reason: 'Sacrificed crew member: Prev' }] }); // recent sacrifice

      await infamyController.sacrificeCrew(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('once per week')
      );
    });

    it('should reject if no infamy record exists', async () => {
      const req = createMockReq({
        body: { crewName: 'Nobody' },
        user: { id: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] }); // no ship_infamy

      await infamyController.sacrificeCrew(req, res);

      expect(res.validationError).toHaveBeenCalledWith('No infamy record found');
    });

    it('should require crewName field', async () => {
      const req = createMockReq({
        body: {},
        user: { id: 1 },
      });
      const res = createMockRes();

      await infamyController.sacrificeCrew(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // setFavoredPort (manageFavoredPorts)
  // ---------------------------------------------------------------
  describe('setFavoredPort', () => {
    it('should add first favored port with +2 bonus at Disgraceful (10+)', async () => {
      const req = createMockReq({
        body: { port: 'Port Peril' },
        user: { id: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 15 }] })       // ship_infamy
        .mockResolvedValueOnce({ rows: [] })                       // current favored ports (none)
        .mockResolvedValueOnce({ rows: [] })                       // INSERT new port
        .mockResolvedValueOnce({ rows: [{ port_name: 'Port Peril', bonus: 2 }] }); // re-fetch

      await infamyController.setFavoredPort(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 'Port Peril',
          bonus: 2,
        }),
        expect.stringContaining('Port Peril')
      );
    });

    it('should upgrade first port to +4 when adding second port', async () => {
      const req = createMockReq({
        body: { port: 'Rickety Squibs' },
        user: { id: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 35 }] })   // ship_infamy (Notorious = 2 max ports)
        .mockResolvedValueOnce({ rows: [{ port_name: 'Port Peril', bonus: 2 }] })  // existing ports
        .mockResolvedValueOnce({ rows: [] })                   // INSERT new port
        .mockResolvedValueOnce({ rows: [] })                   // UPDATE first port to +4
        .mockResolvedValueOnce({                                // re-fetch
          rows: [
            { port_name: 'Port Peril', bonus: 4 },
            { port_name: 'Rickety Squibs', bonus: 2 },
          ],
        });

      await infamyController.setFavoredPort(req, res);

      // Verify the UPDATE was called to bump first port to +4
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'UPDATE favored_ports SET bonus = $1 WHERE port_name = $2',
        [4, 'Port Peril']
      );
    });

    it('should reject if port is already a favored port', async () => {
      const req = createMockReq({
        body: { port: 'Port Peril' },
        user: { id: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 15 }] })
        .mockResolvedValueOnce({ rows: [{ port_name: 'Port Peril', bonus: 2 }] });

      await infamyController.setFavoredPort(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'This port is already a favored port'
      );
    });

    it('should reject if max favored ports reached', async () => {
      const req = createMockReq({
        body: { port: 'New Port' },
        user: { id: 1 },
      });
      const res = createMockRes();

      // infamy 15 = Disgraceful -> max 1 port, already have 1
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 15 }] })
        .mockResolvedValueOnce({ rows: [{ port_name: 'Port Peril', bonus: 2 }] });

      await infamyController.setFavoredPort(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('1 favored port')
      );
    });

    it('should reject if infamy too low for any favored ports (below 10)', async () => {
      const req = createMockReq({
        body: { port: 'Port Peril' },
        user: { id: 1 },
      });
      const res = createMockRes();

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 5 }] })
        .mockResolvedValueOnce({ rows: [] });

      await infamyController.setFavoredPort(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('0 favored port')
      );
    });

    it('should require port field', async () => {
      const req = createMockReq({
        body: {},
        user: { id: 1 },
      });
      const res = createMockRes();

      await infamyController.setFavoredPort(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // gainInfamy (W20: previously untested)
  // ---------------------------------------------------------------
  describe('gainInfamy', () => {
    // Route queries by SQL text so the test does not depend on call order.
    function mockGainQueries({
      date = { year: 4715, month: 6, day: 15 },
      todayAttempts = [],
      todayRerolls = [],
      infamy = { infamy: 5, disrepute: 5 },
      portTotal = 0,
      plunder = [],
      favoredBonus,
    } = {}) {
      const written = [];
      dbUtils.executeQuery.mockImplementation(async (sql, params) => {
        if (sql.includes('golarion_current_date')) return { rows: date ? [date] : [] };
        if (sql.includes("reason = 'Boasting at port'")) return { rows: todayAttempts };
        if (sql.includes("reason = 'Reroll for Infamy'")) return { rows: todayRerolls };
        if (sql.includes('SELECT * FROM ship_infamy')) return { rows: infamy ? [infamy] : [] };
        if (sql.includes('FROM port_visits')) return { rows: [{ total_gained: portTotal }] };
        if (sql.includes('FROM loot')) return { rows: plunder };
        if (sql.includes('FROM favored_ports')) {
          return { rows: favoredBonus === undefined ? [] : [{ bonus: favoredBonus }] };
        }
        written.push({ sql, params });
        return { rows: [] };
      });
      return written;
    }

    function mockClient() {
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      dbUtils.executeTransaction.mockImplementation(async (cb) => cb(client));
      return client;
    }

    beforeEach(() => {
      partyLevel.getPartyLevelInfo.mockResolvedValue({ apl: 3 }); // DC = 15 + 2*3 = 21
    });

    const gainReq = (body) => createMockReq({ body, user: { id: 1 }, campaignId: 1 });

    it('requires a port', async () => {
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ skillCheck: 25, plunderSpent: 0 }), res);
      expect(res.validationError).toHaveBeenCalled();
    });

    it('awards 1/2/3 infamy for success by 0/5/10 and records history and the port visit', async () => {
      const written = mockGainQueries();
      const res = createMockRes();

      await infamyController.gainInfamy(
        gainReq({ port: 'Port Peril', skillCheck: 31, skillUsed: 'Intimidate', plunderSpent: 0 }), res
      );

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ infamyGained: 3, newInfamy: 8, newDisrepute: 8, dc: 21, skillCheck: 31 }),
        expect.stringContaining('Gained 3 Infamy at Port Peril')
      );
      expect(written.some((w) => w.sql.includes('INSERT INTO infamy_history'))).toBe(true);
      expect(written.some((w) => w.sql.includes('INSERT INTO port_visits'))).toBe(true);
    });

    it('adds favored-port bonus and 2 per plunder to the check', async () => {
      mockGainQueries({ favoredBonus: 2, plunder: [{ id: 1, quantity: 5 }] });
      mockClient();
      const res = createMockRes();

      await infamyController.gainInfamy(
        gainReq({ port: 'Port Peril', skillCheck: 10, skillUsed: 'Bluff', plunderSpent: 4 }), res
      );

      // 10 + 4*2 + 2 = 20 < 21 -> failure
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('Failed to gain Infamy'));
    });

    it('caps the gain so a port never exceeds 5 infamy per threshold', async () => {
      mockGainQueries({ portTotal: 4 });
      const res = createMockRes();

      await infamyController.gainInfamy(
        gainReq({ port: 'Port Peril', skillCheck: 40, skillUsed: 'Intimidate', plunderSpent: 0 }), res
      );

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ infamyGained: 1 }), expect.any(String)
      );
    });

    it('rejects a port that already reached its 5-infamy cap', async () => {
      mockGainQueries({ portTotal: 5 });
      const res = createMockRes();

      await infamyController.gainInfamy(
        gainReq({ port: 'Port Peril', skillCheck: 40, plunderSpent: 0 }), res
      );

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('maximum Infamy contribution')
      );
    });

    it('rejects spending more plunder than available and does not open a transaction', async () => {
      mockGainQueries({ plunder: [{ id: 1, quantity: 2 }] });
      const res = createMockRes();

      await infamyController.gainInfamy(
        gainReq({ port: 'Port Peril', skillCheck: 20, plunderSpent: 5 }), res
      );

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('Not enough plunder available')
      );
      expect(dbUtils.executeTransaction).not.toHaveBeenCalled();
    });

    it('consumes a whole plunder stack inside the transaction', async () => {
      mockGainQueries({ plunder: [{ id: 11, quantity: 3 }, { id: 12, quantity: 4 }] });
      const client = mockClient();
      const res = createMockRes();

      await infamyController.gainInfamy(
        gainReq({ port: 'Port Peril', skillCheck: 30, plunderSpent: 3 }), res
      );

      expect(client.query).toHaveBeenCalledTimes(1);
      expect(client.query).toHaveBeenCalledWith(
        "UPDATE loot SET status = 'Spent on Infamy' WHERE id = $1", [11]
      );
    });

    it('splits a stack when only part of it is spent', async () => {
      mockGainQueries({ plunder: [{ id: 21, quantity: 5 }] });
      const client = mockClient();
      const res = createMockRes();

      await infamyController.gainInfamy(
        gainReq({ port: 'Port Peril', skillCheck: 30, plunderSpent: 2 }), res
      );

      expect(client.query).toHaveBeenCalledWith('UPDATE loot SET quantity = $1 WHERE id = $2', [3, 21]);
      const insert = client.query.mock.calls.find((c) => c[0].startsWith('INSERT INTO loot'));
      expect(insert[1]).toEqual(['Plunder', 7807, 2, 'Spent on Infamy', 1]);
    });

    it('rejects a second attempt the same day after a success', async () => {
      mockGainQueries({ todayAttempts: [{ infamy_change: 1 }] });
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'Port Peril', skillCheck: 30, plunderSpent: 0 }), res);
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('already gained Infamy today'));
    });

    it('requires 3 plunder for a reroll after a failed attempt', async () => {
      mockGainQueries({ todayAttempts: [{ infamy_change: 0 }] });
      const res = createMockRes();
      await infamyController.gainInfamy(
        gainReq({ port: 'Port Peril', skillCheck: 30, plunderSpent: 1, reroll: true }), res
      );
      expect(res.validationError).toHaveBeenCalledWith('Reroll requires at least 3 plunder to be spent.');
    });

    it('rejects a reroll on the first attempt of the day', async () => {
      mockGainQueries();
      const res = createMockRes();
      await infamyController.gainInfamy(
        gainReq({ port: 'Port Peril', skillCheck: 30, plunderSpent: 3, reroll: true }), res
      );
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('cannot use the reroll option'));
    });

    it('fails when the calendar is not initialised', async () => {
      mockGainQueries({ date: null });
      const res = createMockRes();
      await infamyController.gainInfamy(gainReq({ port: 'Port Peril', skillCheck: 30, plunderSpent: 0 }), res);
      expect(res.validationError).toHaveBeenCalledWith('Calendar system not initialized');
    });
  });

  // ---------------------------------------------------------------
  // Read handlers (W20: previously untested)
  // ---------------------------------------------------------------
  describe('getAvailableImpositions', () => {
    it('returns an empty set when there is no infamy record', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] });
      const res = createMockRes();
      await infamyController.getAvailableImpositions(createMockReq(), res);
      expect(res.success).toHaveBeenCalledWith(
        { impositions: [], infamy: 0, disrepute: 0 }, 'No infamy yet'
      );
    });

    it('groups impositions by threshold, applying the Vile free-Disgraceful discount', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 55, disrepute: 3 }] })
        .mockResolvedValueOnce({ rows: [
          { id: 1, name: 'A', threshold_required: 10, cost: 4 },
          { id: 2, name: 'B', threshold_required: 30, cost: 10 },
          { id: 3, name: 'C', threshold_required: 55, cost: 20 },
        ] });
      const res = createMockRes();

      await infamyController.getAvailableImpositions(createMockReq(), res);

      const data = res.success.mock.calls[0][0];
      expect(data.impositions.disgraceful[0]).toMatchObject({ displayCost: 0, isAvailable: true });
      expect(data.impositions.notorious[0]).toMatchObject({ displayCost: 5, isAvailable: false });
      expect(data.impositions.vile[0]).toMatchObject({ displayCost: 20, isAvailable: false });
    });
  });

  describe('getInfamyHistory', () => {
    it('returns the page of history with pagination totals', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })
        .mockResolvedValueOnce({ rows: [{ total: '7' }] });
      const res = createMockRes();

      await infamyController.getInfamyHistory(createMockReq({ query: { limit: '2', offset: '4' } }), res);

      expect(dbUtils.executeQuery.mock.calls[0][1]).toEqual([2, 4]);
      expect(res.success).toHaveBeenCalledWith(
        { history: [{ id: 1 }, { id: 2 }], pagination: { total: 7, limit: 2, offset: 4 } },
        'Infamy history retrieved'
      );
    });
  });

  describe('getPortVisits', () => {
    it('structures visits by port and threshold', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [
        { port_name: 'Port Peril', threshold: 0, total_gained: 3 },
        { port_name: 'Port Peril', threshold: 10, total_gained: 1 },
        { port_name: 'Quent', threshold: 0, total_gained: 5 },
      ] });
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
