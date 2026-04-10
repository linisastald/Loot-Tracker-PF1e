/**
 * Unit tests for spellcastingController
 * Tests spellcasting service availability, cost calculation, CRUD operations, and spell search
 */

jest.mock('../../models/SpellcastingService');
jest.mock('../../models/City');
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

const SpellcastingService = require('../../models/SpellcastingService');
const City = require('../../models/City');
const dbUtils = require('../../utils/dbUtils');
const spellcastingController = require('../spellcastingController');

function createMockRes() {
  return {
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    forbidden: jest.fn(),
    error: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 1 },
    ...overrides,
  };
}

const mockCity = {
  id: 1,
  name: 'Magnimar',
  size: 'Metropolis',
  base_value: 16000,
  max_spell_level: 9,
};

const baseSpellBody = {
  spell_name: 'Cure Light Wounds',
  spell_level: 1,
  caster_level: 1,
  city_name: 'Magnimar',
  city_size: 'Metropolis',
};

describe('spellcastingController', () => {
  // -------------------------------------------------------------------
  // checkSpellcastingService
  // -------------------------------------------------------------------
  describe('checkSpellcastingService', () => {
    beforeEach(() => {
      // Mock Golarion date
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ year: 4712, month: 6, day: 1 }],
      });
      City.getOrCreate.mockResolvedValue(mockCity);
    });

    // -- Validation tests --

    it('should reject when spell_name is missing', async () => {
      const req = createMockReq({
        body: { spell_level: 1, caster_level: 1, city_name: 'Magnimar', city_size: 'Metropolis' },
      });
      const res = createMockRes();

      await spellcastingController.checkSpellcastingService(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Spell name is required');
    });

    it('should reject when spell_level is missing', async () => {
      const req = createMockReq({
        body: { spell_name: 'Fireball', caster_level: 5, city_name: 'Magnimar', city_size: 'Metropolis' },
      });
      const res = createMockRes();

      await spellcastingController.checkSpellcastingService(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Spell level is required');
    });

    it('should reject when caster_level is missing or zero', async () => {
      const req = createMockReq({
        body: { spell_name: 'Fireball', spell_level: 3, caster_level: 0, city_name: 'Magnimar', city_size: 'Metropolis' },
      });
      const res = createMockRes();

      await spellcastingController.checkSpellcastingService(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Valid caster level is required (minimum 1)');
    });

    it('should reject when city_name is missing', async () => {
      const req = createMockReq({
        body: { spell_name: 'Fireball', spell_level: 3, caster_level: 5, city_size: 'Metropolis' },
      });
      const res = createMockRes();

      await spellcastingController.checkSpellcastingService(req, res);

      expect(res.validationError).toHaveBeenCalledWith('City name is required');
    });

    it('should reject when city_size is missing', async () => {
      const req = createMockReq({
        body: { spell_name: 'Fireball', spell_level: 3, caster_level: 5, city_name: 'Magnimar' },
      });
      const res = createMockRes();

      await spellcastingController.checkSpellcastingService(req, res);

      expect(res.validationError).toHaveBeenCalledWith('City size is required');
    });

    it('should reject spell_level out of range (negative)', async () => {
      const req = createMockReq({
        body: { ...baseSpellBody, spell_level: -1 },
      });
      const res = createMockRes();

      await spellcastingController.checkSpellcastingService(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Spell level must be between 0 and 9');
    });

    it('should reject spell_level out of range (above 9)', async () => {
      const req = createMockReq({
        body: { ...baseSpellBody, spell_level: 10 },
      });
      const res = createMockRes();

      await spellcastingController.checkSpellcastingService(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Spell level must be between 0 and 9');
    });

    // -- Available spell tests --

    it('should return available spell with cost (no purchase)', async () => {
      const req = createMockReq({ body: baseSpellBody });
      const res = createMockRes();

      SpellcastingService.isSpellAvailable.mockReturnValue({
        available: true,
        reason: 'available',
      });
      SpellcastingService.calculateCost.mockReturnValue(10);

      await spellcastingController.checkSpellcastingService(req, res);

      expect(SpellcastingService.isSpellAvailable).toHaveBeenCalledWith(1, 9);
      expect(SpellcastingService.calculateCost).toHaveBeenCalledWith(1, 1);
      expect(SpellcastingService.create).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          available: true,
          cost: 10,
          spell_name: 'Cure Light Wounds',
          service: null,
        }),
        'Spellcasting availability checked'
      );
    });

    it('should record a purchase when purchase=true', async () => {
      const req = createMockReq({
        body: { ...baseSpellBody, purchase: true, character_id: 5, notes: 'For the party' },
      });
      const res = createMockRes();

      SpellcastingService.isSpellAvailable.mockReturnValue({
        available: true,
        reason: 'available',
      });
      SpellcastingService.calculateCost.mockReturnValue(10);
      SpellcastingService.create.mockResolvedValue({ id: 1, cost: 10 });

      await spellcastingController.checkSpellcastingService(req, res);

      expect(SpellcastingService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          spell_name: 'Cure Light Wounds',
          spell_level: 1,
          caster_level: 1,
          city_id: 1,
          character_id: 5,
          notes: 'For the party',
          golarion_date: '4712-06-01',
        })
      );
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          available: true,
          service: expect.objectContaining({ id: 1 }),
        }),
        'Spellcasting service purchased'
      );
    });

    // -- Unavailable spell tests --

    it('should return unavailable when spell exceeds city max level', async () => {
      const smallTownCity = { ...mockCity, id: 2, name: 'Sandpoint', max_spell_level: 1 };
      City.getOrCreate.mockResolvedValue(smallTownCity);

      const req = createMockReq({
        body: { ...baseSpellBody, spell_name: 'Fireball', spell_level: 3, caster_level: 5, city_name: 'Sandpoint', city_size: 'Small Town' },
      });
      const res = createMockRes();

      SpellcastingService.isSpellAvailable.mockReturnValue({
        available: false,
        reason: 'exceeds_max_level',
      });

      await spellcastingController.checkSpellcastingService(req, res);

      expect(SpellcastingService.calculateCost).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          available: false,
          message: expect.stringContaining('not available'),
        }),
        expect.any(String)
      );
    });

    it('should return unavailable for village with no spellcasters', async () => {
      const villageCity = { ...mockCity, id: 3, name: 'Thistletop', max_spell_level: 0 };
      City.getOrCreate.mockResolvedValue(villageCity);

      const req = createMockReq({
        body: { ...baseSpellBody, spell_name: 'Fireball', spell_level: 3, caster_level: 5, city_name: 'Thistletop', city_size: 'Village' },
      });
      const res = createMockRes();

      SpellcastingService.isSpellAvailable.mockReturnValue({
        available: false,
        reason: 'no_spellcasters',
      });

      await spellcastingController.checkSpellcastingService(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          available: false,
          message: expect.stringContaining('no spellcasters'),
        }),
        expect.any(String)
      );
    });

    it('should return unavailable for village failed wandering spellcaster roll', async () => {
      const villageCity = { ...mockCity, id: 3, name: 'Thistletop', max_spell_level: 0 };
      City.getOrCreate.mockResolvedValue(villageCity);

      const req = createMockReq({
        body: { ...baseSpellBody, spell_level: 1, caster_level: 1, city_name: 'Thistletop', city_size: 'Village' },
      });
      const res = createMockRes();

      SpellcastingService.isSpellAvailable.mockReturnValue({
        available: false,
        reason: 'village_no_spellcaster',
        roll: 50,
        threshold: 5,
      });

      await spellcastingController.checkSpellcastingService(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          available: false,
          message: expect.stringContaining('no spellcaster capable'),
        }),
        expect.any(String)
      );
    });

    it('should return unavailable for level 9 spell failed roll', async () => {
      const req = createMockReq({
        body: { ...baseSpellBody, spell_name: 'Wish', spell_level: 9, caster_level: 17 },
      });
      const res = createMockRes();

      SpellcastingService.isSpellAvailable.mockReturnValue({
        available: false,
        reason: 'level_9_not_found',
        roll: 50,
        threshold: 1,
      });

      await spellcastingController.checkSpellcastingService(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          available: false,
          message: expect.stringContaining('9th level spell'),
        }),
        expect.any(String)
      );
    });

    // -- Special success messages --

    it('should include village spellcaster found message', async () => {
      const villageCity = { ...mockCity, id: 3, name: 'Thistletop', max_spell_level: 0 };
      City.getOrCreate.mockResolvedValue(villageCity);

      const req = createMockReq({
        body: { ...baseSpellBody, spell_level: 1, caster_level: 1, city_name: 'Thistletop', city_size: 'Village' },
      });
      const res = createMockRes();

      SpellcastingService.isSpellAvailable.mockReturnValue({
        available: true,
        reason: 'village_spellcaster_found',
        roll: 3,
        threshold: 5,
      });
      SpellcastingService.calculateCost.mockReturnValue(10);

      await spellcastingController.checkSpellcastingService(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          available: true,
          message: expect.stringContaining('Lucky find'),
        }),
        expect.any(String)
      );
    });

    it('should include level 9 found message', async () => {
      const req = createMockReq({
        body: { ...baseSpellBody, spell_name: 'Wish', spell_level: 9, caster_level: 17 },
      });
      const res = createMockRes();

      SpellcastingService.isSpellAvailable.mockReturnValue({
        available: true,
        reason: 'level_9_found',
        roll: 1,
        threshold: 1,
      });
      SpellcastingService.calculateCost.mockReturnValue(1530);

      await spellcastingController.checkSpellcastingService(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          available: true,
          message: expect.stringContaining('9th level spell'),
        }),
        expect.any(String)
      );
    });

    it('should handle 0-level spell formula display', async () => {
      const req = createMockReq({
        body: { ...baseSpellBody, spell_name: 'Detect Magic', spell_level: 0, caster_level: 1 },
      });
      const res = createMockRes();

      SpellcastingService.isSpellAvailable.mockReturnValue({
        available: true,
        reason: 'available',
      });
      SpellcastingService.calculateCost.mockReturnValue(10);

      await spellcastingController.checkSpellcastingService(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          formula: expect.stringContaining('5 gp'),
        }),
        expect.any(String)
      );
    });

    it('should handle missing Golarion date gracefully', async () => {
      dbUtils.executeQuery.mockResolvedValueOnce({ rows: [] }); // no golarion date

      const req = createMockReq({
        body: { ...baseSpellBody, purchase: true },
      });
      const res = createMockRes();

      SpellcastingService.isSpellAvailable.mockReturnValue({
        available: true,
        reason: 'available',
      });
      SpellcastingService.calculateCost.mockReturnValue(10);
      SpellcastingService.create.mockResolvedValue({ id: 1 });

      await spellcastingController.checkSpellcastingService(req, res);

      expect(SpellcastingService.create).toHaveBeenCalledWith(
        expect.objectContaining({ golarion_date: null })
      );
    });
  });

  // -------------------------------------------------------------------
  // getAllServices
  // -------------------------------------------------------------------
  describe('getAllServices', () => {
    it('should return all services with no filters', async () => {
      const mockServices = [{ id: 1 }, { id: 2 }];
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      SpellcastingService.getAll.mockResolvedValue(mockServices);

      await spellcastingController.getAllServices(req, res);

      expect(SpellcastingService.getAll).toHaveBeenCalledWith({});
      expect(res.success).toHaveBeenCalledWith(mockServices, 'Services retrieved');
    });

    it('should pass filter options correctly', async () => {
      const req = createMockReq({
        query: { city_id: '1', character_id: '5', limit: '20', date: '4712-06-01' },
      });
      const res = createMockRes();

      SpellcastingService.getAll.mockResolvedValue([]);

      await spellcastingController.getAllServices(req, res);

      expect(SpellcastingService.getAll).toHaveBeenCalledWith({
        city_id: 1,
        character_id: 5,
        limit: 20,
        date: '4712-06-01',
      });
    });
  });

  // -------------------------------------------------------------------
  // getServiceById
  // -------------------------------------------------------------------
  describe('getServiceById', () => {
    it('should return a service when found', async () => {
      const mockService = { id: 1, spell_name: 'Cure Light Wounds', cost: 10 };
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      SpellcastingService.findById.mockResolvedValue(mockService);

      await spellcastingController.getServiceById(req, res);

      expect(SpellcastingService.findById).toHaveBeenCalledWith('1');
      expect(res.success).toHaveBeenCalledWith(mockService, 'Service retrieved');
    });

    it('should return 404 when service not found', async () => {
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();

      SpellcastingService.findById.mockResolvedValue(null);

      await spellcastingController.getServiceById(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Service record not found');
    });
  });

  // -------------------------------------------------------------------
  // deleteService
  // -------------------------------------------------------------------
  describe('deleteService', () => {
    it('should delete a service record successfully', async () => {
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      SpellcastingService.findById.mockResolvedValue({ id: 1 });
      SpellcastingService.delete.mockResolvedValue(true);

      await spellcastingController.deleteService(req, res);

      expect(SpellcastingService.delete).toHaveBeenCalledWith('1');
      expect(res.success).toHaveBeenCalledWith(null, 'Service record deleted successfully');
    });

    it('should return 404 when deleting non-existent service', async () => {
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();

      SpellcastingService.findById.mockResolvedValue(null);

      await spellcastingController.deleteService(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Service record not found');
    });
  });

  // -------------------------------------------------------------------
  // getAvailableSpells
  // -------------------------------------------------------------------
  describe('getAvailableSpells', () => {
    it('should return spells with no filters', async () => {
      const mockSpells = [
        { id: 1, name: 'Fireball', spelllevel: 3, school: 'Evocation', class: 'Wizard' },
      ];
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: mockSpells });

      await spellcastingController.getAvailableSpells(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name, spelllevel, school, class FROM spells'),
        []
      );
      expect(res.success).toHaveBeenCalledWith(mockSpells, 'Found 1 spells');
    });

    it('should filter spells by search term', async () => {
      const req = createMockReq({ query: { search: 'Fire' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await spellcastingController.getAvailableSpells(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(name) LIKE LOWER'),
        ['%Fire%']
      );
    });

    it('should filter spells by max_level', async () => {
      const req = createMockReq({ query: { max_level: '3' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await spellcastingController.getAvailableSpells(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('spelllevel <= $'),
        [3]
      );
    });

    it('should filter by both search and max_level', async () => {
      const req = createMockReq({ query: { search: 'Cure', max_level: '5' } });
      const res = createMockRes();

      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await spellcastingController.getAvailableSpells(req, res);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIKE LOWER'),
        ['%Cure%', 5]
      );
    });
  });
});
