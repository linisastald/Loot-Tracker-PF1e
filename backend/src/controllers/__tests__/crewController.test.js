/**
 * Unit tests for crewController
 *
 * Tests the Skulls & Shackles crew management system:
 * - getAllCrew: returns crew list with location details
 * - createCrew: valid creation, missing required fields, invalid location type
 * - updateCrew: valid update, crew not found, location type validation
 * - moveCrewToLocation: move between ship/outpost, validation
 * - markCrewDead: mark as dead with date
 * - markCrewDeparted: mark as departed with reason
 */

jest.mock('../../models/Crew');
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const Crew = require('../../models/Crew');
const crewController = require('../crewController');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const { createMockRes, createMockReq } = require('../../../tests/utils/mockHttp');

const mockCrew = {
  id: 1,
  name: 'Sandara Quinn',
  race: 'Human',
  age: 28,
  description: 'A priestess of Besmara',
  location_type: 'ship',
  location_id: 1,
  ship_position: 'Cleric',
  is_alive: true,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('crewController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Crew.locationExists.mockResolvedValue(true);
  });

  // ---------------------------------------------------------------
  // getAllCrew
  // ---------------------------------------------------------------
  describe('getAllCrew', () => {
    it('should return all living crew with location details', async () => {
      const req = createMockReq();
      const res = createMockRes();

      const crewList = [
        { ...mockCrew, location_name: 'The Wormwood' },
        { id: 2, name: 'Rosie Cusswell', location_type: 'ship', location_id: 1, location_name: 'The Wormwood', is_alive: true },
        { id: 3, name: 'Owlbear Hartshorn', location_type: 'outpost', location_id: 1, location_name: 'Tidewater Rock', is_alive: true },
      ];

      Crew.getAllWithLocation.mockResolvedValue(crewList);

      await crewController.getAllCrew(req, res);

      expect(Crew.getAllWithLocation).toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          crew: crewList,
          count: 3,
        }),
        'Crew retrieved successfully'
      );
    });

    it('should return empty array when no crew exist', async () => {
      const req = createMockReq();
      const res = createMockRes();

      Crew.getAllWithLocation.mockResolvedValue([]);

      await crewController.getAllCrew(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          crew: [],
          count: 0,
        }),
        'Crew retrieved successfully'
      );
    });
  });

  // ---------------------------------------------------------------
  // createCrew
  // ---------------------------------------------------------------
  describe('createCrew', () => {
    it('should create a crew member on a ship', async () => {
      const req = createMockReq({
        body: {
          name: 'Sandara Quinn',
          race: 'Human',
          age: 28,
          description: 'A priestess of Besmara',
          location_type: 'ship',
          location_id: 1,
          ship_position: 'Cleric',
        },
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.create.mockResolvedValue({ ...mockCrew });

      await crewController.createCrew(req, res);

      expect(Crew.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sandara Quinn',
          location_type: 'ship',
          location_id: 1,
          ship_position: 'Cleric',
          is_alive: true,
        })
      );
      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Sandara Quinn' }),
        'Crew member created successfully'
      );
    });

    it('should create a crew member at an outpost with null ship_position', async () => {
      const req = createMockReq({
        body: {
          name: 'Guard Bob',
          location_type: 'outpost',
          location_id: 2,
          ship_position: 'Bosun',  // should be nullified for outpost
        },
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.create.mockResolvedValue({
        id: 5,
        name: 'Guard Bob',
        location_type: 'outpost',
        location_id: 2,
        ship_position: null,
        is_alive: true,
      });

      await crewController.createCrew(req, res);

      expect(Crew.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ship_position: null, // cleared for outpost
        })
      );
    });

    it('should reject if required fields are missing (name)', async () => {
      const req = createMockReq({
        body: { location_type: 'ship', location_id: 1 },
        user: { id: 1 },
      });
      const res = createMockRes();

      await crewController.createCrew(req, res);

      // The validation wrapper checks requiredFields: ['name', 'location_type', 'location_id']
      expect(res.validationError).toHaveBeenCalled();
    });

    it('should reject if required fields are missing (location_type, location_id)', async () => {
      const req = createMockReq({
        body: { name: 'Lonely Sailor' },
        user: { id: 1 },
      });
      const res = createMockRes();

      await crewController.createCrew(req, res);

      expect(res.validationError).toHaveBeenCalled();
    });

    it('should reject invalid location_type', async () => {
      const req = createMockReq({
        body: {
          name: 'Test Crew',
          location_type: 'tavern',
          location_id: 1,
        },
        user: { id: 1 },
      });
      const res = createMockRes();

      await crewController.createCrew(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Location type must be either "ship" or "outpost"'
      );
    });
  });

  // ---------------------------------------------------------------
  // updateCrew
  // ---------------------------------------------------------------
  describe('updateCrew', () => {
    it('should update crew member successfully', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { name: 'Sandara Quinn (Promoted)', ship_position: 'First Mate' },
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.update.mockResolvedValue({
        ...mockCrew,
        name: 'Sandara Quinn (Promoted)',
        ship_position: 'First Mate',
      });

      await crewController.updateCrew(req, res);

      expect(Crew.update).toHaveBeenCalledWith('1', expect.objectContaining({
        name: 'Sandara Quinn (Promoted)',
        ship_position: 'First Mate',
      }));
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Sandara Quinn (Promoted)' }),
        'Crew member updated successfully'
      );
    });

    it('should return not found for non-existent crew member', async () => {
      const req = createMockReq({
        params: { id: '999' },
        body: { name: 'Ghost Pirate' },
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.update.mockResolvedValue(null);

      await crewController.updateCrew(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Crew member not found');
    });

    it('should reject invalid location_type in update', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { location_type: 'island' },
        user: { id: 1 },
      });
      const res = createMockRes();

      await crewController.updateCrew(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Location type must be either "ship" or "outpost"'
      );
    });

    it('should clear ship_position when moving to outpost via update', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { location_type: 'outpost', location_id: 2, ship_position: 'Bosun' },
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.update.mockResolvedValue({
        ...mockCrew,
        location_type: 'outpost',
        location_id: 2,
        ship_position: null,
      });

      await crewController.updateCrew(req, res);

      // The controller should set ship_position to null before calling update
      expect(Crew.update).toHaveBeenCalledWith('1', expect.objectContaining({
        ship_position: null,
      }));
    });
  });

  // ---------------------------------------------------------------
  // moveCrewToLocation
  // ---------------------------------------------------------------
  describe('moveCrewToLocation', () => {
    it('should move crew member to a different ship', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { location_type: 'ship', location_id: 2, ship_position: 'Bosun' },
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.moveToLocation.mockResolvedValue({
        ...mockCrew,
        location_type: 'ship',
        location_id: 2,
        ship_position: 'Bosun',
      });

      await crewController.moveCrewToLocation(req, res);

      expect(Crew.moveToLocation).toHaveBeenCalledWith('1', 'ship', 2, 'Bosun');
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ location_id: 2 }),
        'Crew member moved successfully'
      );
    });

    it('should move crew member to an outpost', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { location_type: 'outpost', location_id: 3 },
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.moveToLocation.mockResolvedValue({
        ...mockCrew,
        location_type: 'outpost',
        location_id: 3,
        ship_position: null,
      });

      await crewController.moveCrewToLocation(req, res);

      expect(Crew.moveToLocation).toHaveBeenCalledWith('1', 'outpost', 3, undefined);
    });

    it('should return not found for non-existent crew member', async () => {
      const req = createMockReq({
        params: { id: '999' },
        body: { location_type: 'ship', location_id: 1 },
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.moveToLocation.mockResolvedValue(null);

      await crewController.moveCrewToLocation(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Crew member not found');
    });

    it('should reject missing location_type and location_id', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: {},
        user: { id: 1 },
      });
      const res = createMockRes();

      await crewController.moveCrewToLocation(req, res);

      // The validation wrapper checks requiredFields: ['location_type', 'location_id']
      expect(res.validationError).toHaveBeenCalled();
    });

    it('should reject invalid location_type', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { location_type: 'cave', location_id: 1 },
        user: { id: 1 },
      });
      const res = createMockRes();

      await crewController.moveCrewToLocation(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'Location type must be either "ship" or "outpost"'
      );
    });
  });

  // ---------------------------------------------------------------
  // markCrewDead
  // ---------------------------------------------------------------
  describe('markCrewDead', () => {
    it('should mark crew member as dead', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { death_date: '4715-06-15' },
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.markDead.mockResolvedValue({
        ...mockCrew,
        is_alive: false,
        death_date: '4715-06-15',
      });

      await crewController.markCrewDead(req, res);

      expect(Crew.markDead).toHaveBeenCalledWith('1', expect.any(Date));
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ is_alive: false }),
        'Crew member marked as deceased'
      );
    });

    it('should use current date when no death_date provided', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: {},
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.markDead.mockResolvedValue({ ...mockCrew, is_alive: false });

      await crewController.markCrewDead(req, res);

      expect(Crew.markDead).toHaveBeenCalledWith('1', expect.any(Date));
    });

    it('should return not found for non-existent crew member', async () => {
      const req = createMockReq({
        params: { id: '999' },
        body: {},
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.markDead.mockResolvedValue(null);

      await crewController.markCrewDead(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Crew member not found');
    });
  });

  // ---------------------------------------------------------------
  // markCrewDeparted
  // ---------------------------------------------------------------
  describe('markCrewDeparted', () => {
    it('should mark crew member as departed with reason', async () => {
      const req = createMockReq({
        params: { id: '2' },
        body: {
          departure_date: '4715-07-01',
          departure_reason: 'Deserted at port',
        },
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.markDeparted.mockResolvedValue({
        id: 2,
        name: 'Crimson Cogward',
        is_alive: true,
        departure_date: '4715-07-01',
        departure_reason: 'Deserted at port',
      });

      await crewController.markCrewDeparted(req, res);

      expect(Crew.markDeparted).toHaveBeenCalledWith('2', expect.any(Date), 'Deserted at port');
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ departure_reason: 'Deserted at port' }),
        'Crew member marked as departed'
      );
    });

    it('should return not found for non-existent crew member', async () => {
      const req = createMockReq({
        params: { id: '999' },
        body: {},
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.markDeparted.mockResolvedValue(null);

      await crewController.markCrewDeparted(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Crew member not found');
    });
  });

  // ---------------------------------------------------------------
  // deleteCrew
  // ---------------------------------------------------------------
  describe('deleteCrew', () => {
    it('should delete crew member successfully', async () => {
      const req = createMockReq({
        params: { id: '1' },
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.delete.mockResolvedValue(true);

      await crewController.deleteCrew(req, res);

      expect(Crew.delete).toHaveBeenCalledWith('1');
      expect(res.success).toHaveBeenCalledWith(null, 'Crew member deleted successfully');
    });

    it('should return not found for non-existent crew member', async () => {
      const req = createMockReq({
        params: { id: '999' },
        user: { id: 1 },
      });
      const res = createMockRes();

      Crew.delete.mockResolvedValue(false);

      await crewController.deleteCrew(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Crew member not found');
    });
  });

  // ---------------------------------------------------------------
  // Read handlers and input validation (W20)
  // ---------------------------------------------------------------
  describe('getCrewByLocation', () => {
    it('rejects a missing location', async () => {
      const res = createMockRes();
      await crewController.getCrewByLocation(createMockReq({ query: {} }), res);
      expect(res.validationError).toHaveBeenCalledWith('Location type and location ID are required');
    });

    it('rejects an unknown location type', async () => {
      const res = createMockRes();
      await crewController.getCrewByLocation(
        createMockReq({ query: { location_type: 'tavern', location_id: '1' } }), res
      );
      expect(res.validationError).toHaveBeenCalledWith('Location type must be either "ship" or "outpost"');
    });

    it('returns crew at the location', async () => {
      const res = createMockRes();
      Crew.getByLocation.mockResolvedValue([mockCrew]);
      await crewController.getCrewByLocation(
        createMockReq({ query: { location_type: 'ship', location_id: '1' } }), res
      );
      expect(Crew.getByLocation).toHaveBeenCalledWith('ship', 1);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ count: 1 }), 'Crew retrieved successfully'
      );
    });
  });

  describe('getDeceasedCrew', () => {
    it('returns the deceased/departed list with a count', async () => {
      const res = createMockRes();
      Crew.getDeceased.mockResolvedValue([{ id: 9, is_alive: false }]);
      await crewController.getDeceasedCrew(createMockReq(), res);
      expect(res.success).toHaveBeenCalledWith(
        { crew: [{ id: 9, is_alive: false }], count: 1 },
        'Deceased/departed crew retrieved successfully'
      );
    });
  });

  describe('input validation', () => {
    it('createCrew rejects a non-integer location_id', async () => {
      const res = createMockRes();
      await crewController.createCrew(
        createMockReq({ body: { name: 'X', location_type: 'ship', location_id: 'abc' } }), res
      );
      expect(res.validationError).toHaveBeenCalledWith('Location ID must be a positive integer');
      expect(Crew.create).not.toHaveBeenCalled();
    });

    it('createCrew rejects a location that does not exist', async () => {
      const res = createMockRes();
      Crew.locationExists.mockResolvedValue(false);
      await crewController.createCrew(
        createMockReq({ body: { name: 'X', location_type: 'ship', location_id: 99 } }), res
      );
      expect(res.validationError).toHaveBeenCalledWith('Selected ship does not exist');
      expect(Crew.create).not.toHaveBeenCalled();
    });

    it('moveCrewToLocation rejects a location that does not exist', async () => {
      const res = createMockRes();
      Crew.locationExists.mockResolvedValue(false);
      await crewController.moveCrewToLocation(
        createMockReq({ params: { id: '1' }, body: { location_type: 'outpost', location_id: 99 } }), res
      );
      expect(res.validationError).toHaveBeenCalledWith('Selected outpost does not exist');
      expect(Crew.moveToLocation).not.toHaveBeenCalled();
    });

    // Opus review L-11: a partial location update is validated against the stored other half
    describe('updateCrew with only one of location_type / location_id', () => {
      beforeEach(() => {
        Crew.findById.mockResolvedValue({ ...mockCrew, location_type: 'ship', location_id: 4 });
      });

      it('checks the new type against the stored id (ship 4 is not outpost 4)', async () => {
        Crew.locationExists.mockResolvedValue(false);
        const res = createMockRes();
        await crewController.updateCrew(
          createMockReq({ params: { id: '1' }, body: { location_type: 'outpost' }, user: { id: 1 } }), res);
        expect(Crew.locationExists).toHaveBeenCalledWith('outpost', 4);
        expect(res.validationError).toHaveBeenCalledWith('Selected outpost does not exist');
        expect(Crew.update).not.toHaveBeenCalled();
      });

      it('checks a new id against the stored type', async () => {
        Crew.locationExists.mockResolvedValue(false);
        const res = createMockRes();
        await crewController.updateCrew(
          createMockReq({ params: { id: '1' }, body: { location_id: 77 }, user: { id: 1 } }), res);
        expect(Crew.locationExists).toHaveBeenCalledWith('ship', 77);
        expect(res.validationError).toHaveBeenCalledWith('Selected ship does not exist');
        expect(Crew.update).not.toHaveBeenCalled();
      });

      it('lets a valid single-field move through', async () => {
        Crew.locationExists.mockResolvedValue(true);
        Crew.update.mockResolvedValue({ ...mockCrew, location_id: 5 });
        const res = createMockRes();
        await crewController.updateCrew(
          createMockReq({ params: { id: '1' }, body: { location_id: 5 }, user: { id: 1 } }), res);
        expect(Crew.locationExists).toHaveBeenCalledWith('ship', 5);
        expect(Crew.update).toHaveBeenCalled();
      });

      it('does no location lookup when neither field is sent', async () => {
        Crew.update.mockResolvedValue(mockCrew);
        await crewController.updateCrew(
          createMockReq({ params: { id: '1' }, body: { name: 'New' }, user: { id: 1 } }), createMockRes());
        expect(Crew.findById).not.toHaveBeenCalled();
        expect(Crew.locationExists).not.toHaveBeenCalled();
      });

      it('answers not found for a missing crew member instead of validating a location', async () => {
        Crew.findById.mockResolvedValue(null);
        const res = createMockRes();
        await crewController.updateCrew(
          createMockReq({ params: { id: '999' }, body: { location_id: 5 }, user: { id: 1 } }), res);
        expect(res.notFound).toHaveBeenCalledWith('Crew member not found');
      });
    });

    it('markCrewDead rejects an invalid date', async () => {
      const res = createMockRes();
      await crewController.markCrewDead(
        createMockReq({ params: { id: '1' }, body: { death_date: 'not-a-date' } }), res
      );
      expect(res.validationError).toHaveBeenCalledWith('death_date is not a valid date');
      expect(Crew.markDead).not.toHaveBeenCalled();
    });

    it('markCrewDeparted rejects an invalid date', async () => {
      const res = createMockRes();
      await crewController.markCrewDeparted(
        createMockReq({ params: { id: '1' }, body: { departure_date: '4715-13-45' } }), res
      );
      expect(res.validationError).toHaveBeenCalledWith('departure_date is not a valid date');
      expect(Crew.markDeparted).not.toHaveBeenCalled();
    });

    it('updateCrew rejects a blank name', async () => {
      const res = createMockRes();
      await crewController.updateCrew(
        createMockReq({ params: { id: '1' }, body: { name: '  ' } }), res
      );
      expect(res.validationError).toHaveBeenCalledWith('Crew member name cannot be blank');
      expect(Crew.update).not.toHaveBeenCalled();
    });

    it('updateCrew passes a partial body through untouched (no nulling of omitted fields)', async () => {
      const res = createMockRes();
      Crew.update.mockResolvedValue({ ...mockCrew, name: 'New' });
      await crewController.updateCrew(
        createMockReq({ params: { id: '1' }, body: { name: 'New' } }), res
      );
      expect(Crew.update).toHaveBeenCalledWith('1', { name: 'New' });
    });
  });

  describe('getCrewById route removal', () => {
    it('no longer exports getCrewById (endpoint had no caller)', () => {
      expect(crewController.getCrewById).toBeUndefined();
    });
  });
});
