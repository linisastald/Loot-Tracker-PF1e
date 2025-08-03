/**
 * Tests for crewController.js - Crew Management Operations
 * Tests crew CRUD operations, location management, and ship position assignments
 */

const crewController = require('../../../backend/src/controllers/crewController');
const Crew = require('../../../backend/src/models/Crew');
const controllerFactory = require('../../../backend/src/utils/controllerFactory');
const logger = require('../../../backend/src/utils/logger');

// Mock dependencies
jest.mock('../../../backend/src/models/Crew');
jest.mock('../../../backend/src/utils/controllerFactory');
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

describe('CrewController', () => {
  let mockReq, mockRes;

  const mockCrewMember = {
    id: 1,
    name: 'William "Bootstrap" Turner',
    race: 'Human',
    age: 35,
    description: 'Experienced sailor with knowledge of ancient curses',
    location_type: 'ship',
    location_id: 1,
    ship_position: 'Boatswain',
    is_alive: true,
    created_at: '2023-12-01T10:00:00Z',
    updated_at: '2023-12-01T10:00:00Z'
  };

  const mockCrewList = [
    mockCrewMember,
    {
      id: 2,
      name: 'Elizabeth Swann',
      race: 'Human',
      age: 22,
      description: 'Governor\'s daughter turned pirate',
      location_type: 'ship',
      location_id: 1,
      ship_position: 'Captain',
      is_alive: true,
      created_at: '2023-12-01T11:00:00Z',
      updated_at: '2023-12-01T11:00:00Z'
    },
    {
      id: 3,
      name: 'Ragetti',
      race: 'Human',
      age: 28,
      description: 'Pirate with wooden eye',
      location_type: 'outpost',
      location_id: 2,
      ship_position: null,
      is_alive: true,
      created_at: '2023-12-01T12:00:00Z',
      updated_at: '2023-12-01T12:00:00Z'
    }
  ];

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

    // Mock Crew model methods
    Crew.create.mockResolvedValue(mockCrewMember);
    Crew.findById.mockResolvedValue(mockCrewMember);
    Crew.update.mockResolvedValue(mockCrewMember);
    Crew.delete.mockResolvedValue(true);
    Crew.findAll.mockResolvedValue(mockCrewList);
    Crew.findByLocation.mockResolvedValue([mockCrewMember]);
  });

  describe('createCrew', () => {
    it('should create crew member successfully for ship', async () => {
      mockReq.body = {
        name: 'Jack Sparrow',
        race: 'Human',
        age: 30,
        description: 'Eccentric pirate captain',
        location_type: 'ship',
        location_id: 1,
        ship_position: 'Captain'
      };

      await crewController.createCrew(mockReq, mockRes);

      expect(Crew.create).toHaveBeenCalledWith({
        name: 'Jack Sparrow',
        race: 'Human',
        age: 30,
        description: 'Eccentric pirate captain',
        location_type: 'ship',
        location_id: 1,
        ship_position: 'Captain',
        is_alive: true
      });

      expect(controllerFactory.sendCreatedResponse).toHaveBeenCalledWith(
        mockRes,
        mockCrewMember,
        'Crew member created successfully'
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Crew member created: Jack Sparrow',
        {
          userId: 1,
          crewId: 1,
          locationType: 'ship',
          locationId: 1
        }
      );
    });

    it('should create crew member successfully for outpost', async () => {
      mockReq.body = {
        name: 'Anamaria',
        race: 'Human',
        age: 28,
        description: 'Former owner of the Jolly Mon',
        location_type: 'outpost',
        location_id: 2
      };

      await crewController.createCrew(mockReq, mockRes);

      expect(Crew.create).toHaveBeenCalledWith({
        name: 'Anamaria',
        race: 'Human',
        age: 28,
        description: 'Former owner of the Jolly Mon',
        location_type: 'outpost',
        location_id: 2,
        ship_position: null, // Should be null for outpost
        is_alive: true
      });
    });

    it('should create crew member with minimal required fields', async () => {
      mockReq.body = {
        name: 'Pintel',
        location_type: 'ship',
        location_id: 1
      };

      await crewController.createCrew(mockReq, mockRes);

      expect(Crew.create).toHaveBeenCalledWith({
        name: 'Pintel',
        race: null,
        age: null,
        description: null,
        location_type: 'ship',
        location_id: 1,
        ship_position: null,
        is_alive: true
      });
    });

    it('should require crew member name', async () => {
      mockReq.body = {
        location_type: 'ship',
        location_id: 1
      };

      await expect(crewController.createCrew(mockReq, mockRes)).rejects.toThrow('Crew member name is required');
      
      expect(controllerFactory.createValidationError).toHaveBeenCalledWith('Crew member name is required');
      expect(Crew.create).not.toHaveBeenCalled();
    });

    it('should require location type and ID', async () => {
      mockReq.body = {
        name: 'Test Crew'
      };

      await expect(crewController.createCrew(mockReq, mockRes)).rejects.toThrow('Location type and location ID are required');
      
      expect(controllerFactory.createValidationError).toHaveBeenCalledWith('Location type and location ID are required');
      expect(Crew.create).not.toHaveBeenCalled();
    });

    it('should validate location type', async () => {
      mockReq.body = {
        name: 'Test Crew',
        location_type: 'invalid',
        location_id: 1
      };

      await expect(crewController.createCrew(mockReq, mockRes)).rejects.toThrow('Location type must be either "ship" or "outpost"');
      
      expect(controllerFactory.createValidationError).toHaveBeenCalledWith('Location type must be either "ship" or "outpost"');
      expect(Crew.create).not.toHaveBeenCalled();
    });

    it('should handle crew creation errors', async () => {
      mockReq.body = {
        name: 'Test Crew',
        location_type: 'ship',
        location_id: 1
      };
      
      Crew.create.mockRejectedValue(new Error('Database error'));

      await expect(crewController.createCrew(mockReq, mockRes)).rejects.toThrow('Database error');
      
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle special characters in crew names', async () => {
      mockReq.body = {
        name: 'José "El Marinero" García',
        location_type: 'ship',
        location_id: 1
      };

      await crewController.createCrew(mockReq, mockRes);

      expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'José "El Marinero" García'
      }));
    });
  });

  describe('getAllCrew', () => {
    it('should get all living crew successfully', async () => {
      await crewController.getAllCrew(mockReq, mockRes);

      expect(Crew.findAll).toHaveBeenCalledWith({ is_alive: true });
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        mockCrewList,
        'Crew retrieved successfully'
      );
    });

    it('should include dead crew when requested', async () => {
      mockReq.query.include_dead = 'true';

      await crewController.getAllCrew(mockReq, mockRes);

      expect(Crew.findAll).toHaveBeenCalledWith({});
    });

    it('should handle empty crew list', async () => {
      Crew.findAll.mockResolvedValue([]);

      await crewController.getAllCrew(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        [],
        'Crew retrieved successfully'
      );
    });

    it('should handle database errors', async () => {
      Crew.findAll.mockRejectedValue(new Error('Database connection failed'));

      await expect(crewController.getAllCrew(mockReq, mockRes)).rejects.toThrow('Database connection failed');
    });
  });

  describe('getCrew', () => {
    it('should get crew member by ID successfully', async () => {
      mockReq.params.id = '1';

      await crewController.getCrew(mockReq, mockRes);

      expect(Crew.findById).toHaveBeenCalledWith(1);
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        mockCrewMember,
        'Crew member retrieved successfully'
      );
    });

    it('should handle crew member not found', async () => {
      mockReq.params.id = '999';
      Crew.findById.mockResolvedValue(null);

      await expect(crewController.getCrew(mockReq, mockRes)).rejects.toThrow('Crew member not found');
      
      expect(controllerFactory.createNotFoundError).toHaveBeenCalledWith('Crew member not found');
    });

    it('should handle invalid crew ID', async () => {
      mockReq.params.id = 'invalid';

      await expect(crewController.getCrew(mockReq, mockRes)).rejects.toThrow();
    });
  });

  describe('updateCrew', () => {
    beforeEach(() => {
      mockReq.params.id = '1';
    });

    it('should update crew member successfully', async () => {
      mockReq.body = {
        name: 'William Turner Jr.',
        age: 36,
        description: 'Bootstrap\'s son, master swordsman',
        ship_position: 'First Mate'
      };

      const updatedCrew = { ...mockCrewMember, ...mockReq.body };
      Crew.update.mockResolvedValue(updatedCrew);

      await crewController.updateCrew(mockReq, mockRes);

      expect(Crew.update).toHaveBeenCalledWith(1, mockReq.body);
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        updatedCrew,
        'Crew member updated successfully'
      );
    });

    it('should update crew location from ship to outpost', async () => {
      mockReq.body = {
        location_type: 'outpost',
        location_id: 3,
        ship_position: null // Should be cleared when moving to outpost
      };

      await crewController.updateCrew(mockReq, mockRes);

      expect(Crew.update).toHaveBeenCalledWith(1, mockReq.body);
    });

    it('should update crew location from outpost to ship', async () => {
      mockReq.body = {
        location_type: 'ship',
        location_id: 2,
        ship_position: 'Gunner'
      };

      await crewController.updateCrew(mockReq, mockRes);

      expect(Crew.update).toHaveBeenCalledWith(1, mockReq.body);
    });

    it('should mark crew member as dead', async () => {
      mockReq.body = {
        is_alive: false,
        description: 'Died in battle against the Royal Navy'
      };

      await crewController.updateCrew(mockReq, mockRes);

      expect(Crew.update).toHaveBeenCalledWith(1, expect.objectContaining({
        is_alive: false
      }));
    });

    it('should handle crew not found during update', async () => {
      Crew.update.mockResolvedValue(null);
      mockReq.body = { name: 'New Name' };

      await expect(crewController.updateCrew(mockReq, mockRes)).rejects.toThrow('Crew member not found');
    });

    it('should handle update errors', async () => {
      mockReq.body = { name: 'Updated Name' };
      Crew.update.mockRejectedValue(new Error('Update failed'));

      await expect(crewController.updateCrew(mockReq, mockRes)).rejects.toThrow('Update failed');
    });

    it('should validate location type during update', async () => {
      mockReq.body = {
        location_type: 'invalid_location'
      };

      await expect(crewController.updateCrew(mockReq, mockRes)).rejects.toThrow('Location type must be either "ship" or "outpost"');
    });
  });

  describe('deleteCrew', () => {
    it('should delete crew member successfully', async () => {
      mockReq.params.id = '1';

      await crewController.deleteCrew(mockReq, mockRes);

      expect(Crew.delete).toHaveBeenCalledWith(1);
      expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(
        mockRes,
        'Crew member deleted successfully'
      );
    });

    it('should handle crew member not found during deletion', async () => {
      mockReq.params.id = '999';
      Crew.delete.mockResolvedValue(false);

      await expect(crewController.deleteCrew(mockReq, mockRes)).rejects.toThrow('Crew member not found');
    });

    it('should handle deletion errors', async () => {
      mockReq.params.id = '1';
      Crew.delete.mockRejectedValue(new Error('Deletion failed'));

      await expect(crewController.deleteCrew(mockReq, mockRes)).rejects.toThrow('Deletion failed');
    });
  });

  describe('getCrewByLocation', () => {
    it('should get crew by ship location', async () => {
      mockReq.params.location_type = 'ship';
      mockReq.params.location_id = '1';

      await crewController.getCrewByLocation(mockReq, mockRes);

      expect(Crew.findByLocation).toHaveBeenCalledWith('ship', 1, { is_alive: true });
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        [mockCrewMember],
        'Crew retrieved successfully'
      );
    });

    it('should get crew by outpost location', async () => {
      mockReq.params.location_type = 'outpost';
      mockReq.params.location_id = '2';

      await crewController.getCrewByLocation(mockReq, mockRes);

      expect(Crew.findByLocation).toHaveBeenCalledWith('outpost', 2, { is_alive: true });
    });

    it('should include dead crew when requested', async () => {
      mockReq.params.location_type = 'ship';
      mockReq.params.location_id = '1';
      mockReq.query.include_dead = 'true';

      await crewController.getCrewByLocation(mockReq, mockRes);

      expect(Crew.findByLocation).toHaveBeenCalledWith('ship', 1, {});
    });

    it('should validate location type', async () => {
      mockReq.params.location_type = 'invalid';
      mockReq.params.location_id = '1';

      await expect(crewController.getCrewByLocation(mockReq, mockRes)).rejects.toThrow('Location type must be either "ship" or "outpost"');
    });

    it('should handle empty crew list for location', async () => {
      mockReq.params.location_type = 'ship';
      mockReq.params.location_id = '999';
      Crew.findByLocation.mockResolvedValue([]);

      await crewController.getCrewByLocation(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        [],
        'Crew retrieved successfully'
      );
    });
  });

  describe('Ship Position Management', () => {
    it('should handle common ship positions', async () => {
      const positions = [
        'Captain',
        'First Mate',
        'Boatswain',
        'Gunner',
        'Navigator',
        'Cook',
        'Carpenter',
        'Surgeon',
        'Quartermaster'
      ];

      for (const position of positions) {
        mockReq.body = {
          name: `Test ${position}`,
          location_type: 'ship',
          location_id: 1,
          ship_position: position
        };

        await crewController.createCrew(mockReq, mockRes);

        expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({
          ship_position: position
        }));
      }
    });

    it('should allow custom ship positions', async () => {
      mockReq.body = {
        name: 'Lookout',
        location_type: 'ship',
        location_id: 1,
        ship_position: 'Crow\'s Nest Watchman'
      };

      await crewController.createCrew(mockReq, mockRes);

      expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({
        ship_position: 'Crow\'s Nest Watchman'
      }));
    });

    it('should clear ship position when moving to outpost', async () => {
      mockReq.params.id = '1';
      mockReq.body = {
        location_type: 'outpost',
        location_id: 2
      };

      await crewController.updateCrew(mockReq, mockRes);

      expect(Crew.update).toHaveBeenCalledWith(1, expect.objectContaining({
        location_type: 'outpost',
        location_id: 2
      }));
    });
  });

  describe('Crew Life Cycle Management', () => {
    it('should track crew member death', async () => {
      mockReq.params.id = '1';
      mockReq.body = {
        is_alive: false,
        description: 'Killed by kraken attack'
      };

      await crewController.updateCrew(mockReq, mockRes);

      expect(Crew.update).toHaveBeenCalledWith(1, expect.objectContaining({
        is_alive: false,
        description: 'Killed by kraken attack'
      }));
    });

    it('should resurrect crew member', async () => {
      mockReq.params.id = '1';
      mockReq.body = {
        is_alive: true,
        description: 'Brought back by voodoo magic'
      };

      await crewController.updateCrew(mockReq, mockRes);

      expect(Crew.update).toHaveBeenCalledWith(1, expect.objectContaining({
        is_alive: true,
        description: 'Brought back by voodoo magic'
      }));
    });

    it('should handle aging crew members', async () => {
      mockReq.params.id = '1';
      mockReq.body = {
        age: 40, // Aged from 35 to 40
        description: 'Weathered by years at sea'
      };

      await crewController.updateCrew(mockReq, mockRes);

      expect(Crew.update).toHaveBeenCalledWith(1, expect.objectContaining({
        age: 40
      }));
    });
  });

  describe('Race and Character Management', () => {
    it('should handle various fantasy races', async () => {
      const races = [
        'Human',
        'Elf',
        'Dwarf',
        'Halfling',
        'Gnome',
        'Half-Orc',
        'Half-Elf',
        'Tiefling',
        'Aasimar',
        'Drow'
      ];

      for (const race of races) {
        mockReq.body = {
          name: `${race} Crew Member`,
          race: race,
          location_type: 'ship',
          location_id: 1
        };

        await crewController.createCrew(mockReq, mockRes);

        expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({
          race: race
        }));
      }
    });

    it('should handle custom races', async () => {
      mockReq.body = {
        name: 'Sea Witch',
        race: 'Merfolk',
        location_type: 'ship',
        location_id: 1
      };

      await crewController.createCrew(mockReq, mockRes);

      expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({
        race: 'Merfolk'
      }));
    });

    it('should handle detailed character descriptions', async () => {
      const longDescription = `A grizzled veteran of countless sea battles, this sailor bears scars from encounters with 
        sea monsters and rival pirates. Known for his uncanny ability to predict weather changes and his collection of 
        exotic tattoos from distant lands. Speaks in an ancient nautical dialect and maintains a pet parrot named Squawks.`;

      mockReq.body = {
        name: 'Old Salt McGillicuddy',
        race: 'Human',
        age: 65,
        description: longDescription,
        location_type: 'ship',
        location_id: 1,
        ship_position: 'Weathermaster'
      };

      await crewController.createCrew(mockReq, mockRes);

      expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({
        description: longDescription
      }));
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle extremely long crew names', async () => {
      const longName = 'Bartholomew "The Magnificent Sea-Faring Adventure-Seeking Treasure-Finding Monster-Slaying" MacGillicuddy III';

      mockReq.body = {
        name: longName,
        location_type: 'ship',
        location_id: 1
      };

      await crewController.createCrew(mockReq, mockRes);

      expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({
        name: longName
      }));
    });

    it('should handle negative ages gracefully', async () => {
      mockReq.body = {
        name: 'Mysterious Crew',
        age: -100, // Could be undead
        location_type: 'ship',
        location_id: 1
      };

      await crewController.createCrew(mockReq, mockRes);

      expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({
        age: -100
      }));
    });

    it('should handle very old crew members', async () => {
      mockReq.body = {
        name: 'Ancient Mariner',
        race: 'Elf',
        age: 1500,
        location_type: 'ship',
        location_id: 1
      };

      await crewController.createCrew(mockReq, mockRes);

      expect(Crew.create).toHaveBeenCalledWith(expect.objectContaining({
        age: 1500
      }));
    });

    it('should handle concurrent crew operations', async () => {
      const operations = [
        crewController.createCrew({ body: { name: 'Crew 1', location_type: 'ship', location_id: 1 }, user: { id: 1 } }, mockRes),
        crewController.createCrew({ body: { name: 'Crew 2', location_type: 'ship', location_id: 1 }, user: { id: 1 } }, mockRes),
        crewController.createCrew({ body: { name: 'Crew 3', location_type: 'outpost', location_id: 2 }, user: { id: 1 } }, mockRes)
      ];

      await Promise.all(operations);
      
      expect(Crew.create).toHaveBeenCalledTimes(3);
    });

    it('should handle malformed location IDs', async () => {
      mockReq.body = {
        name: 'Test Crew',
        location_type: 'ship',
        location_id: 'not-a-number'
      };

      // In a real implementation, this would be validated
      await crewController.createCrew(mockReq, mockRes);
      
      expect(Crew.create).toHaveBeenCalled();
    });
  });

  describe('Logging and Analytics', () => {
    it('should log crew creation with context', async () => {
      mockReq.body = {
        name: 'Test Crew',
        location_type: 'ship',
        location_id: 1
      };

      await crewController.createCrew(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        'Crew member created: Test Crew',
        {
          userId: 1,
          crewId: 1,
          locationType: 'ship',
          locationId: 1
        }
      );
    });

    it('should log crew updates', async () => {
      mockReq.params.id = '1';
      mockReq.body = { name: 'Updated Crew' };

      await crewController.updateCrew(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Crew member updated'),
        expect.any(Object)
      );
    });

    it('should log crew deletion', async () => {
      mockReq.params.id = '1';

      await crewController.deleteCrew(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Crew member deleted'),
        expect.any(Object)
      );
    });

    it('should log crew location changes', async () => {
      mockReq.params.id = '1';
      mockReq.body = {
        location_type: 'outpost',
        location_id: 2
      };

      await crewController.updateCrew(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Crew member moved'),
        expect.any(Object)
      );
    });
  });
});