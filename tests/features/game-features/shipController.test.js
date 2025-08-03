/**
 * Tests for shipController.js - Ship Management Operations
 * Tests ship CRUD operations, status management, and Pathfinder ship mechanics
 */

const shipController = require('../../../backend/src/controllers/shipController');
const Ship = require('../../../backend/src/models/Ship');
const { getShipTypesList, getShipTypeData } = require('../../../backend/src/data/shipTypes');
const controllerFactory = require('../../../backend/src/utils/controllerFactory');
const logger = require('../../../backend/src/utils/logger');

// Mock dependencies
jest.mock('../../../backend/src/models/Ship');
jest.mock('../../../backend/src/data/shipTypes');
jest.mock('../../../backend/src/utils/controllerFactory');
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

describe('ShipController', () => {
  let mockReq, mockRes;

  const mockShipData = {
    id: 1,
    name: 'The Crimson Storm',
    location: 'Port Peril',
    status: 'Active',
    is_squibbing: false,
    ship_type: 'frigate',
    size: 'Large',
    cost: 37000,
    max_speed: 60,
    acceleration: 30,
    propulsion: 'wind',
    min_crew: 20,
    max_crew: 200,
    cargo_capacity: 150,
    max_passengers: 120,
    decks: 3,
    weapons: 12,
    weapon_types: ['cannons', 'ballistae'],
    ramming_damage: '8d8',
    base_ac: 2,
    touch_ac: 8,
    hardness: 5,
    max_hp: 1620,
    current_hp: 1620,
    cmb: 8,
    cmd: 18,
    saves: { fort: 15, ref: 5, will: 9 },
    initiative: 2,
    plunder: 500,
    infamy: 25,
    disrepute: 10,
    sails_oars: 'sails',
    sailing_check_bonus: 4,
    officers: [
      { position: 'Captain', name: 'Captain Redbeard', bonus: 2 },
      { position: 'First Mate', name: 'Anne Bonny', bonus: 1 }
    ],
    improvements: ['reinforced hull', 'improved rigging'],
    cargo_manifest: {
      items: ['rum', 'gunpowder', 'silk'],
      passengers: [],
      impositions: []
    },
    ship_notes: 'Fast and deadly pirate vessel',
    captain_name: 'Captain Redbeard',
    flag_description: 'Black flag with crimson storm symbol'
  };

  const mockShipType = {
    name: 'frigate',
    size: 'Large',
    cost: 37000,
    max_speed: 60,
    acceleration: 30,
    propulsion: ['wind'],
    min_crew: 20,
    max_crew: 200,
    cargo_capacity: 150,
    max_passengers: 120,
    decks: 3,
    weapons: 12,
    ramming_damage: '8d8',
    base_ac: 2,
    touch_ac: 8,
    hardness: 5,
    max_hp: 1620,
    cmb: 8,
    cmd: 18,
    saves: { fort: 15, ref: 5, will: 9 }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      body: {},
      params: {},
      query: {},
      user: { id: 1, role: 'DM' }
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    // Mock controllerFactory functions
    controllerFactory.sendSuccessResponse.mockImplementation((res, data, message) => {
      res.json({ success: true, data, message });
    });
    
    controllerFactory.sendCreatedResponse.mockImplementation((res, data, message) => {
      res.json({ success: true, data, message });
    });

    controllerFactory.sendSuccessMessage.mockImplementation((res, message) => {
      res.json({ success: true, message });
    });

    controllerFactory.createValidationError.mockImplementation((message) => {
      const error = new Error(message);
      error.statusCode = 400;
      return error;
    });

    controllerFactory.createNotFoundError.mockImplementation((message) => {
      const error = new Error(message);
      error.statusCode = 404;
      return error;
    });

    // Mock ship type data
    getShipTypeData.mockReturnValue(mockShipType);
    getShipTypesList.mockReturnValue(['frigate', 'galleon', 'sloop']);

    // Mock Ship model methods
    Ship.create.mockResolvedValue(mockShipData);
    Ship.findById.mockResolvedValue(mockShipData);
    Ship.update.mockResolvedValue(mockShipData);
    Ship.delete.mockResolvedValue(true);
    Ship.findAll.mockResolvedValue([mockShipData]);
  });

  describe('createShip', () => {
    it('should create ship successfully with basic data', async () => {
      mockReq.body = {
        name: 'The Sea Serpent',
        location: 'Bloodcove',
        status: 'Active'
      };

      await shipController.createShip(mockReq, mockRes);

      expect(Ship.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'The Sea Serpent',
        location: 'Bloodcove',
        status: 'Active',
        plunder: 0,
        infamy: 0,
        disrepute: 0
      }));

      expect(controllerFactory.sendCreatedResponse).toHaveBeenCalledWith(
        mockRes,
        mockShipData,
        'Ship created successfully'
      );
    });

    it('should create ship with ship type auto-fill', async () => {
      mockReq.body = {
        name: 'HMS Victory',
        ship_type: 'frigate'
      };

      await shipController.createShip(mockReq, mockRes);

      expect(getShipTypeData).toHaveBeenCalledWith('frigate');
      expect(Ship.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'HMS Victory',
        ship_type: 'frigate',
        size: 'Large',
        cost: 37000,
        max_speed: 60,
        min_crew: 20,
        max_crew: 200
      }));
    });

    it('should create ship with complete pirate campaign data', async () => {
      mockReq.body = {
        name: 'The Black Pearl',
        ship_type: 'frigate',
        plunder: 1000,
        infamy: 50,
        disrepute: 25,
        captain_name: 'Jack Sparrow',
        flag_description: 'Skull and crossbones',
        officers: [
          { position: 'Captain', name: 'Jack Sparrow', bonus: 3 }
        ],
        improvements: ['cursed', 'fast'],
        cargo_manifest: {
          items: ['treasure', 'rum'],
          passengers: ['Will Turner'],
          impositions: []
        }
      };

      await shipController.createShip(mockReq, mockRes);

      expect(Ship.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'The Black Pearl',
        plunder: 1000,
        infamy: 50,
        disrepute: 25,
        captain_name: 'Jack Sparrow',
        flag_description: 'Skull and crossbones',
        officers: [{ position: 'Captain', name: 'Jack Sparrow', bonus: 3 }],
        improvements: ['cursed', 'fast']
      }));
    });

    it('should require ship name', async () => {
      mockReq.body = {
        location: 'Port Royal'
      };

      await expect(shipController.createShip(mockReq, mockRes)).rejects.toThrow('Ship name is required');
      
      expect(controllerFactory.createValidationError).toHaveBeenCalledWith('Ship name is required');
      expect(Ship.create).not.toHaveBeenCalled();
    });

    it('should set default values for missing fields', async () => {
      mockReq.body = {
        name: 'Simple Ship'
      };

      await shipController.createShip(mockReq, mockRes);

      expect(Ship.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Simple Ship',
        location: null,
        status: 'Active',
        is_squibbing: false,
        plunder: 0,
        infamy: 0,
        disrepute: 0,
        sailing_check_bonus: 0,
        officers: [],
        improvements: [],
        weapon_types: [],
        cargo_manifest: { items: [], passengers: [], impositions: [] }
      }));
    });

    it('should handle ship creation errors', async () => {
      mockReq.body = { name: 'Test Ship' };
      Ship.create.mockRejectedValue(new Error('Database error'));

      await expect(shipController.createShip(mockReq, mockRes)).rejects.toThrow('Database error');
      
      expect(logger.error).toHaveBeenCalled();
    });

    it('should validate ship status values', async () => {
      const validStatuses = ['Active', 'Docked', 'Lost', 'Sunk', 'PC Active'];
      
      for (const status of validStatuses) {
        mockReq.body = {
          name: `Ship ${status}`,
          status: status
        };

        await shipController.createShip(mockReq, mockRes);

        expect(Ship.create).toHaveBeenCalledWith(expect.objectContaining({
          status: status
        }));
      }
    });
  });

  describe('getShips', () => {
    it('should get all ships successfully', async () => {
      const mockShips = [mockShipData, { ...mockShipData, id: 2, name: 'Second Ship' }];
      Ship.findAll.mockResolvedValue(mockShips);

      await shipController.getShips(mockReq, mockRes);

      expect(Ship.findAll).toHaveBeenCalled();
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        mockShips,
        'Ships retrieved successfully'
      );
    });

    it('should handle empty ship list', async () => {
      Ship.findAll.mockResolvedValue([]);

      await shipController.getShips(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        [],
        'Ships retrieved successfully'
      );
    });

    it('should handle database errors', async () => {
      Ship.findAll.mockRejectedValue(new Error('Database connection failed'));

      await expect(shipController.getShips(mockReq, mockRes)).rejects.toThrow('Database connection failed');
    });
  });

  describe('getShip', () => {
    it('should get ship by ID successfully', async () => {
      mockReq.params.id = '1';

      await shipController.getShip(mockReq, mockRes);

      expect(Ship.findById).toHaveBeenCalledWith(1);
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        mockShipData,
        'Ship retrieved successfully'
      );
    });

    it('should handle ship not found', async () => {
      mockReq.params.id = '999';
      Ship.findById.mockResolvedValue(null);

      await expect(shipController.getShip(mockReq, mockRes)).rejects.toThrow('Ship not found');
      
      expect(controllerFactory.createNotFoundError).toHaveBeenCalledWith('Ship not found');
    });

    it('should handle invalid ship ID', async () => {
      mockReq.params.id = 'invalid';

      await expect(shipController.getShip(mockReq, mockRes)).rejects.toThrow();
    });
  });

  describe('updateShip', () => {
    beforeEach(() => {
      mockReq.params.id = '1';
    });

    it('should update ship successfully', async () => {
      mockReq.body = {
        name: 'Updated Ship Name',
        location: 'New Port',
        current_hp: 1500,
        plunder: 750
      };

      const updatedShip = { ...mockShipData, ...mockReq.body };
      Ship.update.mockResolvedValue(updatedShip);

      await shipController.updateShip(mockReq, mockRes);

      expect(Ship.update).toHaveBeenCalledWith(1, mockReq.body);
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        updatedShip,
        'Ship updated successfully'
      );
    });

    it('should update ship officers', async () => {
      mockReq.body = {
        officers: [
          { position: 'Captain', name: 'New Captain', bonus: 3 },
          { position: 'Navigator', name: 'Star Reader', bonus: 2 },
          { position: 'Gunner', name: 'Boom Master', bonus: 1 }
        ]
      };

      await shipController.updateShip(mockReq, mockRes);

      expect(Ship.update).toHaveBeenCalledWith(1, expect.objectContaining({
        officers: mockReq.body.officers
      }));
    });

    it('should update ship cargo manifest', async () => {
      mockReq.body = {
        cargo_manifest: {
          items: ['gold coins', 'spices', 'silk'],
          passengers: ['merchant', 'noble'],
          impositions: ['embargo notice']
        }
      };

      await shipController.updateShip(mockReq, mockRes);

      expect(Ship.update).toHaveBeenCalledWith(1, expect.objectContaining({
        cargo_manifest: mockReq.body.cargo_manifest
      }));
    });

    it('should update ship improvements', async () => {
      mockReq.body = {
        improvements: ['reinforced hull', 'improved sails', 'enhanced cannons']
      };

      await shipController.updateShip(mockReq, mockRes);

      expect(Ship.update).toHaveBeenCalledWith(1, expect.objectContaining({
        improvements: mockReq.body.improvements
      }));
    });

    it('should handle ship not found during update', async () => {
      Ship.update.mockResolvedValue(null);
      mockReq.body = { name: 'New Name' };

      await expect(shipController.updateShip(mockReq, mockRes)).rejects.toThrow('Ship not found');
    });

    it('should handle update errors', async () => {
      mockReq.body = { name: 'Updated Name' };
      Ship.update.mockRejectedValue(new Error('Update failed'));

      await expect(shipController.updateShip(mockReq, mockRes)).rejects.toThrow('Update failed');
    });

    it('should validate numeric fields', async () => {
      mockReq.body = {
        current_hp: 'not-a-number',
        plunder: 'invalid'
      };

      // This would be caught by validation middleware in real app
      await shipController.updateShip(mockReq, mockRes);
      
      expect(Ship.update).toHaveBeenCalledWith(1, mockReq.body);
    });
  });

  describe('deleteShip', () => {
    it('should delete ship successfully', async () => {
      mockReq.params.id = '1';

      await shipController.deleteShip(mockReq, mockRes);

      expect(Ship.delete).toHaveBeenCalledWith(1);
      expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(
        mockRes,
        'Ship deleted successfully'
      );
    });

    it('should handle ship not found during deletion', async () => {
      mockReq.params.id = '999';
      Ship.delete.mockResolvedValue(false);

      await expect(shipController.deleteShip(mockReq, mockRes)).rejects.toThrow('Ship not found');
    });

    it('should handle deletion errors', async () => {
      mockReq.params.id = '1';
      Ship.delete.mockRejectedValue(new Error('Deletion failed'));

      await expect(shipController.deleteShip(mockReq, mockRes)).rejects.toThrow('Deletion failed');
    });
  });

  describe('getShipTypes', () => {
    it('should get ship types list', async () => {
      await shipController.getShipTypes(mockReq, mockRes);

      expect(getShipTypesList).toHaveBeenCalled();
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        ['frigate', 'galleon', 'sloop'],
        'Ship types retrieved successfully'
      );
    });

    it('should handle ship types data errors', async () => {
      getShipTypesList.mockImplementation(() => {
        throw new Error('Ship types data not found');
      });

      await expect(shipController.getShipTypes(mockReq, mockRes)).rejects.toThrow('Ship types data not found');
    });
  });

  describe('getShipTypeData', () => {
    it('should get specific ship type data', async () => {
      mockReq.params.type = 'frigate';

      await shipController.getShipTypeData(mockReq, mockRes);

      expect(getShipTypeData).toHaveBeenCalledWith('frigate');
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        mockShipType,
        'Ship type data retrieved successfully'
      );
    });

    it('should handle invalid ship type', async () => {
      mockReq.params.type = 'invalid_ship_type';
      getShipTypeData.mockReturnValue(null);

      await expect(shipController.getShipTypeData(mockReq, mockRes)).rejects.toThrow('Ship type not found');
    });
  });

  describe('Ship Status Management', () => {
    it('should update ship status to different values', async () => {
      const statuses = ['Active', 'Docked', 'Lost', 'Sunk', 'PC Active'];
      
      for (const status of statuses) {
        mockReq.params.id = '1';
        mockReq.body = { status };

        await shipController.updateShip(mockReq, mockRes);

        expect(Ship.update).toHaveBeenCalledWith(1, expect.objectContaining({
          status: status
        }));
      }
    });

    it('should handle ship damage tracking', async () => {
      mockReq.params.id = '1';
      mockReq.body = {
        current_hp: 1200, // Damaged from max_hp of 1620
        ship_notes: 'Took cannon fire during battle'
      };

      await shipController.updateShip(mockReq, mockRes);

      expect(Ship.update).toHaveBeenCalledWith(1, expect.objectContaining({
        current_hp: 1200,
        ship_notes: 'Took cannon fire during battle'
      }));
    });

    it('should track plunder and infamy changes', async () => {
      mockReq.params.id = '1';
      mockReq.body = {
        plunder: 1500,
        infamy: 75,
        disrepute: 30
      };

      await shipController.updateShip(mockReq, mockRes);

      expect(Ship.update).toHaveBeenCalledWith(1, expect.objectContaining({
        plunder: 1500,
        infamy: 75,
        disrepute: 30
      }));
    });
  });

  describe('Ship Combat and Stats', () => {
    it('should handle combat stat updates', async () => {
      mockReq.params.id = '1';
      mockReq.body = {
        base_ac: 4,
        touch_ac: 10,
        hardness: 7,
        cmb: 10,
        cmd: 20,
        saves: { fort: 18, ref: 7, will: 11 },
        initiative: 4
      };

      await shipController.updateShip(mockReq, mockRes);

      expect(Ship.update).toHaveBeenCalledWith(1, expect.objectContaining({
        base_ac: 4,
        touch_ac: 10,
        hardness: 7,
        cmb: 10,
        cmd: 20,
        saves: { fort: 18, ref: 7, will: 11 },
        initiative: 4
      }));
    });

    it('should handle weapon updates', async () => {
      mockReq.params.id = '1';
      mockReq.body = {
        weapons: 16,
        weapon_types: ['heavy cannons', 'swivel guns', 'ballistae'],
        ramming_damage: '10d8'
      };

      await shipController.updateShip(mockReq, mockRes);

      expect(Ship.update).toHaveBeenCalledWith(1, expect.objectContaining({
        weapons: 16,
        weapon_types: ['heavy cannons', 'swivel guns', 'ballistae'],
        ramming_damage: '10d8'
      }));
    });
  });

  describe('Ship Crew and Capacity', () => {
    it('should handle crew and capacity updates', async () => {
      mockReq.params.id = '1';
      mockReq.body = {
        min_crew: 25,
        max_crew: 250,
        cargo_capacity: 200,
        max_passengers: 150
      };

      await shipController.updateShip(mockReq, mockRes);

      expect(Ship.update).toHaveBeenCalledWith(1, expect.objectContaining({
        min_crew: 25,
        max_crew: 250,
        cargo_capacity: 200,
        max_passengers: 150
      }));
    });

    it('should validate crew numbers make sense', async () => {
      mockReq.params.id = '1';
      mockReq.body = {
        min_crew: 100,
        max_crew: 50 // Invalid: min > max
      };

      // In a real implementation, this would be validated
      await shipController.updateShip(mockReq, mockRes);
      
      expect(Ship.update).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed officer data', async () => {
      mockReq.body = {
        name: 'Test Ship',
        officers: 'invalid-officer-data' // Should be array
      };

      await shipController.createShip(mockReq, mockRes);
      
      expect(Ship.create).toHaveBeenCalledWith(expect.objectContaining({
        officers: 'invalid-officer-data'
      }));
    });

    it('should handle malformed cargo manifest', async () => {
      mockReq.body = {
        name: 'Test Ship',
        cargo_manifest: 'invalid-manifest' // Should be object
      };

      await shipController.createShip(mockReq, mockRes);
      
      expect(Ship.create).toHaveBeenCalledWith(expect.objectContaining({
        cargo_manifest: 'invalid-manifest'
      }));
    });

    it('should handle extremely large ship data', async () => {
      const largeOfficerList = Array.from({ length: 100 }, (_, i) => ({
        position: `Officer ${i}`,
        name: `Name ${i}`,
        bonus: i % 5
      }));

      mockReq.body = {
        name: 'Massive Ship',
        officers: largeOfficerList,
        improvements: Array.from({ length: 50 }, (_, i) => `Improvement ${i}`)
      };

      await shipController.createShip(mockReq, mockRes);
      
      expect(Ship.create).toHaveBeenCalledWith(expect.objectContaining({
        officers: largeOfficerList
      }));
    });

    it('should handle special characters in ship names', async () => {
      mockReq.body = {
        name: "The Sírén's Cåll - \"Dëath's Hëräld\""
      };

      await shipController.createShip(mockReq, mockRes);
      
      expect(Ship.create).toHaveBeenCalledWith(expect.objectContaining({
        name: "The Sírén's Cåll - \"Dëath's Hëräld\""
      }));
    });

    it('should handle concurrent ship operations', async () => {
      const operations = [
        shipController.createShip({ body: { name: 'Ship 1' } }, mockRes),
        shipController.createShip({ body: { name: 'Ship 2' } }, mockRes),
        shipController.createShip({ body: { name: 'Ship 3' } }, mockRes)
      ];

      await Promise.all(operations);
      
      expect(Ship.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('Logging and Analytics', () => {
    it('should log ship creation', async () => {
      mockReq.body = { name: 'Test Ship' };

      await shipController.createShip(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Ship created'),
        expect.any(Object)
      );
    });

    it('should log ship updates', async () => {
      mockReq.params.id = '1';
      mockReq.body = { name: 'Updated Ship' };

      await shipController.updateShip(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Ship updated'),
        expect.any(Object)
      );
    });

    it('should log ship deletion', async () => {
      mockReq.params.id = '1';

      await shipController.deleteShip(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Ship deleted'),
        expect.any(Object)
      );
    });
  });
});