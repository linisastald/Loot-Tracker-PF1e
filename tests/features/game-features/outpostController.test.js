/**
 * Tests for outpostController.js - Outpost Management Operations
 * Tests outpost CRUD operations, crew associations, and access date management
 */

const outpostController = require('../../../backend/src/controllers/outpostController');
const Outpost = require('../../../backend/src/models/Outpost');
const controllerFactory = require('../../../backend/src/utils/controllerFactory');
const logger = require('../../../backend/src/utils/logger');

// Mock dependencies
jest.mock('../../../backend/src/models/Outpost');
jest.mock('../../../backend/src/utils/controllerFactory');
jest.mock('../../../backend/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

describe('OutpostController', () => {
  let mockReq, mockRes;

  const mockOutpostData = {
    id: 1,
    name: 'Port Peril',
    location: 'Shackles',
    access_date: { year: 4723, month: 10, day: 15 },
    created_at: '2023-12-01T10:00:00Z',
    updated_at: '2023-12-01T10:00:00Z'
  };

  const mockOutpostList = [
    mockOutpostData,
    {
      id: 2,
      name: 'Tortuga',
      location: 'Caribbean',
      access_date: { year: 4723, month: 11, day: 20 },
      created_at: '2023-12-01T11:00:00Z',
      updated_at: '2023-12-01T11:00:00Z'
    },
    {
      id: 3,
      name: 'Bloodcove',
      location: 'Mwangi Expanse',
      access_date: null,
      created_at: '2023-12-01T12:00:00Z',
      updated_at: '2023-12-01T12:00:00Z'
    }
  ];

  const mockCrewData = [
    {
      id: 1,
      name: 'Quartermaster Quinn',
      race: 'Human',
      age: 40,
      description: 'Manages outpost supplies',
      location_type: 'outpost',
      location_id: 1,
      ship_position: null,
      is_alive: true
    },
    {
      id: 2,
      name: 'Merchant Mary',
      race: 'Halfling',
      age: 28,
      description: 'Handles trade negotiations',
      location_type: 'outpost',
      location_id: 1,
      ship_position: null,
      is_alive: true
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

    // Mock Outpost model methods
    Outpost.create.mockResolvedValue(mockOutpostData);
    Outpost.getAllWithCrewCount.mockResolvedValue(mockOutpostList);
    Outpost.getWithCrew.mockResolvedValue({ ...mockOutpostData, crew: mockCrewData });
    Outpost.update.mockResolvedValue(mockOutpostData);
    Outpost.delete.mockResolvedValue(true);
  });

  describe('createOutpost', () => {
    it('should create outpost successfully with all data', async () => {
      mockReq.body = {
        name: 'New Trading Post',
        location: 'Mwangi Expanse',
        access_date: { year: 4724, month: 1, day: 15 }
      };

      await outpostController.createOutpost(mockReq, mockRes);

      expect(Outpost.create).toHaveBeenCalledWith({
        name: 'New Trading Post',
        location: 'Mwangi Expanse',
        access_date: { year: 4724, month: 1, day: 15 }
      });

      expect(controllerFactory.sendCreatedResponse).toHaveBeenCalledWith(
        mockRes,
        mockOutpostData,
        'Outpost created successfully'
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Outpost created: New Trading Post',
        {
          userId: 1,
          outpostId: 1
        }
      );
    });

    it('should create outpost with minimal data', async () => {
      mockReq.body = {
        name: 'Simple Outpost'
      };

      await outpostController.createOutpost(mockReq, mockRes);

      expect(Outpost.create).toHaveBeenCalledWith({
        name: 'Simple Outpost',
        location: null,
        access_date: null
      });

      expect(controllerFactory.sendCreatedResponse).toHaveBeenCalledWith(
        mockRes,
        mockOutpostData,
        'Outpost created successfully'
      );
    });

    it('should require outpost name', async () => {
      mockReq.body = {
        location: 'Some Location'
      };

      await expect(outpostController.createOutpost(mockReq, mockRes)).rejects.toThrow('Outpost name is required');
      
      expect(controllerFactory.createValidationError).toHaveBeenCalledWith('Outpost name is required');
      expect(Outpost.create).not.toHaveBeenCalled();
    });

    it('should handle empty name', async () => {
      mockReq.body = {
        name: '',
        location: 'Test Location'
      };

      await expect(outpostController.createOutpost(mockReq, mockRes)).rejects.toThrow('Outpost name is required');
      
      expect(controllerFactory.createValidationError).toHaveBeenCalledWith('Outpost name is required');
      expect(Outpost.create).not.toHaveBeenCalled();
    });

    it('should handle whitespace-only name', async () => {
      mockReq.body = {
        name: '   ',
        location: 'Test Location'
      };

      await expect(outpostController.createOutpost(mockReq, mockRes)).rejects.toThrow('Outpost name is required');
      
      expect(controllerFactory.createValidationError).toHaveBeenCalledWith('Outpost name is required');
      expect(Outpost.create).not.toHaveBeenCalled();
    });

    it('should handle outpost creation errors', async () => {
      mockReq.body = {
        name: 'Test Outpost',
        location: 'Test Location'
      };
      
      Outpost.create.mockRejectedValue(new Error('Database error'));

      await expect(outpostController.createOutpost(mockReq, mockRes)).rejects.toThrow('Database error');
      
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle special characters in outpost names', async () => {
      mockReq.body = {
        name: 'Fort "El Conquistador" - Isla Española',
        location: 'Caribbean'
      };

      await outpostController.createOutpost(mockReq, mockRes);

      expect(Outpost.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Fort "El Conquistador" - Isla Española'
      }));
    });

    it('should handle complex access dates', async () => {
      mockReq.body = {
        name: 'Date Test Outpost',
        access_date: {
          year: 4724,
          month: 12,
          day: 31,
          hour: 23,
          minute: 59
        }
      };

      await outpostController.createOutpost(mockReq, mockRes);

      expect(Outpost.create).toHaveBeenCalledWith(expect.objectContaining({
        access_date: {
          year: 4724,
          month: 12,
          day: 31,
          hour: 23,
          minute: 59
        }
      }));
    });
  });

  describe('getAllOutposts', () => {
    it('should get all outposts successfully', async () => {
      await outpostController.getAllOutposts(mockReq, mockRes);

      expect(Outpost.getAllWithCrewCount).toHaveBeenCalled();
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        {
          outposts: mockOutpostList,
          count: mockOutpostList.length
        },
        'Outposts retrieved successfully'
      );
    });

    it('should handle empty outpost list', async () => {
      Outpost.getAllWithCrewCount.mockResolvedValue([]);

      await outpostController.getAllOutposts(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        {
          outposts: [],
          count: 0
        },
        'Outposts retrieved successfully'
      );
    });

    it('should handle database errors', async () => {
      Outpost.getAllWithCrewCount.mockRejectedValue(new Error('Database connection failed'));

      await expect(outpostController.getAllOutposts(mockReq, mockRes)).rejects.toThrow('Database connection failed');
    });

    it('should include crew count in response', async () => {
      const outpostsWithCrewCount = [
        { ...mockOutpostData, crew_count: '5' },
        { id: 2, name: 'Outpost 2', crew_count: '3' },
        { id: 3, name: 'Outpost 3', crew_count: '0' }
      ];

      Outpost.getAllWithCrewCount.mockResolvedValue(outpostsWithCrewCount);

      await outpostController.getAllOutposts(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        {
          outposts: outpostsWithCrewCount,
          count: 3
        },
        'Outposts retrieved successfully'
      );
    });
  });

  describe('getOutpostById', () => {
    it('should get outpost by ID successfully', async () => {
      mockReq.params.id = '1';

      await outpostController.getOutpostById(mockReq, mockRes);

      expect(Outpost.getWithCrew).toHaveBeenCalledWith('1');
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        { ...mockOutpostData, crew: mockCrewData },
        'Outpost retrieved successfully'
      );
    });

    it('should handle outpost not found', async () => {
      mockReq.params.id = '999';
      Outpost.getWithCrew.mockResolvedValue(null);

      await expect(outpostController.getOutpostById(mockReq, mockRes)).rejects.toThrow('Outpost not found');
      
      expect(controllerFactory.createNotFoundError).toHaveBeenCalledWith('Outpost not found');
    });

    it('should handle invalid outpost ID', async () => {
      mockReq.params.id = 'invalid';

      await expect(outpostController.getOutpostById(mockReq, mockRes)).rejects.toThrow();
    });

    it('should include crew data in response', async () => {
      mockReq.params.id = '1';
      const outpostWithCrew = {
        ...mockOutpostData,
        crew: mockCrewData
      };

      Outpost.getWithCrew.mockResolvedValue(outpostWithCrew);

      await outpostController.getOutpostById(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        outpostWithCrew,
        'Outpost retrieved successfully'
      );
    });

    it('should handle outpost with no crew', async () => {
      mockReq.params.id = '1';
      const outpostWithoutCrew = {
        ...mockOutpostData,
        crew: []
      };

      Outpost.getWithCrew.mockResolvedValue(outpostWithoutCrew);

      await outpostController.getOutpostById(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        outpostWithoutCrew,
        'Outpost retrieved successfully'
      );
    });
  });

  describe('updateOutpost', () => {
    beforeEach(() => {
      mockReq.params.id = '1';
    });

    it('should update outpost successfully', async () => {
      mockReq.body = {
        name: 'Updated Port Name',
        location: 'New Location',
        access_date: { year: 4724, month: 2, day: 20 }
      };

      const updatedOutpost = { ...mockOutpostData, ...mockReq.body };
      Outpost.update.mockResolvedValue(updatedOutpost);

      await outpostController.updateOutpost(mockReq, mockRes);

      expect(Outpost.update).toHaveBeenCalledWith('1', mockReq.body);
      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        updatedOutpost,
        'Outpost updated successfully'
      );
    });

    it('should log outpost update with context', async () => {
      mockReq.body = {
        name: 'Updated Port Name',
        location: 'New Location'
      };

      const updatedOutpost = { ...mockOutpostData, ...mockReq.body };
      Outpost.update.mockResolvedValue(updatedOutpost);

      await outpostController.updateOutpost(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        `Outpost updated: ${updatedOutpost.name}`,
        {
          userId: 1,
          outpostId: updatedOutpost.id,
          fields: ['name', 'location']
        }
      );
    });

    it('should handle partial updates', async () => {
      mockReq.body = {
        name: 'Just Name Update'
      };

      await outpostController.updateOutpost(mockReq, mockRes);

      expect(Outpost.update).toHaveBeenCalledWith('1', {
        name: 'Just Name Update'
      });
    });

    it('should handle null values in updates', async () => {
      mockReq.body = {
        name: 'Outpost with Nulls',
        location: null,
        access_date: null
      };

      await outpostController.updateOutpost(mockReq, mockRes);

      expect(Outpost.update).toHaveBeenCalledWith('1', mockReq.body);
    });

    it('should handle outpost not found during update', async () => {
      Outpost.update.mockResolvedValue(null);
      mockReq.body = { name: 'New Name' };

      await expect(outpostController.updateOutpost(mockReq, mockRes)).rejects.toThrow('Outpost not found');
      
      expect(controllerFactory.createNotFoundError).toHaveBeenCalledWith('Outpost not found');
    });

    it('should handle update errors', async () => {
      mockReq.body = { name: 'Updated Name' };
      Outpost.update.mockRejectedValue(new Error('Update failed'));

      await expect(outpostController.updateOutpost(mockReq, mockRes)).rejects.toThrow('Update failed');
    });

    it('should require outpost ID', async () => {
      mockReq.params.id = '';
      mockReq.body = { name: 'Test Name' };

      await expect(outpostController.updateOutpost(mockReq, mockRes)).rejects.toThrow('Outpost ID is required');
      
      expect(controllerFactory.createValidationError).toHaveBeenCalledWith('Outpost ID is required');
    });

    it('should handle empty update data', async () => {
      mockReq.body = {};

      await outpostController.updateOutpost(mockReq, mockRes);

      expect(Outpost.update).toHaveBeenCalledWith('1', {});
    });

    it('should handle complex access date updates', async () => {
      mockReq.body = {
        access_date: {
          year: 4724,
          month: 6,
          day: 15,
          notes: 'First successful contact'
        }
      };

      await outpostController.updateOutpost(mockReq, mockRes);

      expect(Outpost.update).toHaveBeenCalledWith('1', expect.objectContaining({
        access_date: {
          year: 4724,
          month: 6,
          day: 15,
          notes: 'First successful contact'
        }
      }));
    });
  });

  describe('deleteOutpost', () => {
    it('should delete outpost successfully', async () => {
      mockReq.params.id = '1';

      await outpostController.deleteOutpost(mockReq, mockRes);

      expect(Outpost.delete).toHaveBeenCalledWith('1');
      expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(
        mockRes,
        'Outpost deleted successfully'
      );
    });

    it('should log outpost deletion', async () => {
      mockReq.params.id = '1';

      await outpostController.deleteOutpost(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        'Outpost deleted',
        {
          userId: 1,
          outpostId: '1'
        }
      );
    });

    it('should handle outpost not found during deletion', async () => {
      mockReq.params.id = '999';
      Outpost.delete.mockResolvedValue(false);

      await expect(outpostController.deleteOutpost(mockReq, mockRes)).rejects.toThrow('Outpost not found');
      
      expect(controllerFactory.createNotFoundError).toHaveBeenCalledWith('Outpost not found');
    });

    it('should handle deletion errors', async () => {
      mockReq.params.id = '1';
      Outpost.delete.mockRejectedValue(new Error('Deletion failed'));

      await expect(outpostController.deleteOutpost(mockReq, mockRes)).rejects.toThrow('Deletion failed');
    });

    it('should require outpost ID', async () => {
      mockReq.params.id = '';

      await expect(outpostController.deleteOutpost(mockReq, mockRes)).rejects.toThrow('Outpost ID is required');
      
      expect(controllerFactory.createValidationError).toHaveBeenCalledWith('Outpost ID is required');
    });

    it('should handle null or undefined ID', async () => {
      mockReq.params.id = null;

      await expect(outpostController.deleteOutpost(mockReq, mockRes)).rejects.toThrow('Outpost ID is required');
      
      delete mockReq.params.id;

      await expect(outpostController.deleteOutpost(mockReq, mockRes)).rejects.toThrow('Outpost ID is required');
    });
  });

  describe('Outpost Data Management', () => {
    it('should handle outposts with extensive location details', async () => {
      mockReq.body = {
        name: 'Comprehensive Trading Hub',
        location: {
          region: 'Shackles',
          island: 'Port Peril Island',
          coordinates: { latitude: '5°N', longitude: '60°W' },
          climate: 'Tropical',
          population: 15000,
          government: 'Pirate Council'
        }
      };

      await outpostController.createOutpost(mockReq, mockRes);

      expect(Outpost.create).toHaveBeenCalledWith(expect.objectContaining({
        location: mockReq.body.location
      }));
    });

    it('should handle outposts with detailed access information', async () => {
      mockReq.body = {
        name: 'Secured Outpost',
        access_date: {
          year: 4723,
          month: 8,
          day: 10,
          method: 'Diplomatic negotiation',
          key_contacts: ['Captain Morgan', 'Trade Minister Lewis'],
          cost: '5000 gp in bribes',
          restrictions: 'No weapons in main district'
        }
      };

      await outpostController.createOutpost(mockReq, mockRes);

      expect(Outpost.create).toHaveBeenCalledWith(expect.objectContaining({
        access_date: mockReq.body.access_date
      }));
    });

    it('should handle outposts without access dates', async () => {
      mockReq.body = {
        name: 'Unknown Access Outpost',
        location: 'Mysterious Island'
      };

      await outpostController.createOutpost(mockReq, mockRes);

      expect(Outpost.create).toHaveBeenCalledWith(expect.objectContaining({
        access_date: null
      }));
    });

    it('should handle very long outpost names', async () => {
      const longName = 'The Grand Maritime Trading Post and Fortress of the Eastern Archipelago Established by the Royal Trading Company of the Seven Seas for the Purpose of Facilitating International Commerce';
      
      mockReq.body = {
        name: longName,
        location: 'Eastern Archipelago'
      };

      await outpostController.createOutpost(mockReq, mockRes);

      expect(Outpost.create).toHaveBeenCalledWith(expect.objectContaining({
        name: longName
      }));
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed request data', async () => {
      mockReq.body = {
        name: 'Test Outpost',
        location: { invalid: 'structure' },
        access_date: 'invalid-date-format'
      };

      await outpostController.createOutpost(mockReq, mockRes);

      // Controller should pass data as-is to model (validation happens at model/DB level)
      expect(Outpost.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Test Outpost',
        location: { invalid: 'structure' },
        access_date: 'invalid-date-format'
      }));
    });

    it('should handle concurrent outpost operations', async () => {
      const operations = [
        outpostController.createOutpost({ body: { name: 'Outpost 1' }, user: { id: 1 } }, mockRes),
        outpostController.createOutpost({ body: { name: 'Outpost 2' }, user: { id: 1 } }, mockRes),
        outpostController.updateOutpost({ params: { id: '1' }, body: { name: 'Updated' }, user: { id: 1 } }, mockRes)
      ];

      await Promise.all(operations);
      
      expect(Outpost.create).toHaveBeenCalledTimes(2);
      expect(Outpost.update).toHaveBeenCalledTimes(1);
    });

    it('should handle database timeouts gracefully', async () => {
      mockReq.body = { name: 'Test Outpost' };
      Outpost.create.mockRejectedValue(new Error('Connection timeout'));

      await expect(outpostController.createOutpost(mockReq, mockRes)).rejects.toThrow('Connection timeout');
    });

    it('should handle missing user context gracefully', async () => {
      mockReq.user = null;
      mockReq.body = { name: 'Test Outpost' };

      await expect(outpostController.createOutpost(mockReq, mockRes)).rejects.toThrow();
    });

    it('should handle extremely large location data', async () => {
      const hugeLocationData = {
        detailed_description: 'A'.repeat(10000), // Very long description
        maps: Array.from({ length: 100 }, (_, i) => `map_${i}.jpg`),
        resources: Array.from({ length: 500 }, (_, i) => ({ type: `resource_${i}`, quantity: i }))
      };

      mockReq.body = {
        name: 'Data Heavy Outpost',
        location: hugeLocationData
      };

      await outpostController.createOutpost(mockReq, mockRes);

      expect(Outpost.create).toHaveBeenCalledWith(expect.objectContaining({
        location: hugeLocationData
      }));
    });
  });

  describe('Logging and Analytics', () => {
    it('should log outpost creation with proper context', async () => {
      mockReq.body = {
        name: 'Analytics Test Outpost',
        location: 'Test Location'
      };

      await outpostController.createOutpost(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        'Outpost created: Analytics Test Outpost',
        {
          userId: 1,
          outpostId: 1
        }
      );
    });

    it('should log outpost updates with field tracking', async () => {
      mockReq.params.id = '1';
      mockReq.body = {
        name: 'Updated Name',
        location: 'Updated Location',
        access_date: { year: 4724, month: 1, day: 1 }
      };

      await outpostController.updateOutpost(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Outpost updated'),
        expect.objectContaining({
          userId: 1,
          outpostId: mockOutpostData.id,
          fields: ['name', 'location', 'access_date']
        })
      );
    });

    it('should log outpost deletion with context', async () => {
      mockReq.params.id = '1';

      await outpostController.deleteOutpost(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        'Outpost deleted',
        {
          userId: 1,
          outpostId: '1'
        }
      );
    });

    it('should handle logging when outpost name is very long', async () => {
      const veryLongName = 'A'.repeat(500);
      mockReq.body = { name: veryLongName };

      await outpostController.createOutpost(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        `Outpost created: ${veryLongName}`,
        expect.any(Object)
      );
    });
  });

  describe('Response Validation', () => {
    it('should return proper response structure for creation', async () => {
      mockReq.body = { name: 'Response Test Outpost' };

      await outpostController.createOutpost(mockReq, mockRes);

      expect(controllerFactory.sendCreatedResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({
          id: expect.any(Number),
          name: 'Port Peril'
        }),
        'Outpost created successfully'
      );
    });

    it('should return proper response structure for retrieval', async () => {
      await outpostController.getAllOutposts(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({
          outposts: expect.any(Array),
          count: expect.any(Number)
        }),
        'Outposts retrieved successfully'
      );
    });

    it('should return proper response structure for single outpost with crew', async () => {
      mockReq.params.id = '1';

      await outpostController.getOutpostById(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({
          id: expect.any(Number),
          name: expect.any(String),
          crew: expect.any(Array)
        }),
        'Outpost retrieved successfully'
      );
    });

    it('should return proper response structure for updates', async () => {
      mockReq.params.id = '1';
      mockReq.body = { name: 'Updated Outpost' };

      await outpostController.updateOutpost(mockReq, mockRes);

      expect(controllerFactory.sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        expect.objectContaining({
          id: expect.any(Number),
          name: expect.any(String)
        }),
        'Outpost updated successfully'
      );
    });

    it('should return proper response structure for deletion', async () => {
      mockReq.params.id = '1';

      await outpostController.deleteOutpost(mockReq, mockRes);

      expect(controllerFactory.sendSuccessMessage).toHaveBeenCalledWith(
        mockRes,
        'Outpost deleted successfully'
      );
    });
  });
});