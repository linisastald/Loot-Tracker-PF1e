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

const dbUtils = require('../../utils/dbUtils');
const infamyController = require('../infamyController');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);

  res.success = jest.fn((data = null, message = 'Operation successful') => {
    res.status(200);
    res.json({ success: true, message, data });
    return res;
  });

  res.created = jest.fn((data = null, message = 'Resource created successfully') => {
    res.status(201);
    res.json({ success: true, message, data });
    return res;
  });

  res.error = jest.fn((message = 'An error occurred', statusCode = 500, errors = null) => {
    res.status(statusCode);
    res.json({ success: false, message, errors });
    return res;
  });

  res.validationError = jest.fn((errors) => {
    const message = typeof errors === 'string' ? errors : 'Validation error';
    res.status(400);
    res.json({ success: false, message });
    return res;
  });

  res.notFound = jest.fn((message = 'Resource not found') => {
    res.status(404);
    res.json({ success: false, message });
    return res;
  });

  res.forbidden = jest.fn((message = 'Access forbidden') => {
    res.status(403);
    res.json({ success: false, message });
    return res;
  });

  return res;
}

function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    cookies: {},
    user: { id: 1, role: 'Player' },
    ...overrides,
  };
}

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
      const originalRandom = Math.random;
      Math.random = jest.fn().mockReturnValue(0.5);

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [{ infamy: 25, disrepute: 10 }] })  // SELECT ship_infamy
        .mockResolvedValueOnce({ rows: [{ year: 4715, month: 6, day: 15 }] }) // golarion date
        .mockResolvedValueOnce({ rows: [] })  // last sacrifice check (none within week)
        .mockResolvedValueOnce({ rows: [] })  // UPDATE disrepute
        .mockResolvedValueOnce({ rows: [] }); // INSERT history

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

      Math.random = originalRandom;
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
});
