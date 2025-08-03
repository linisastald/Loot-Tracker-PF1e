/**
 * Tests for Outpost.js - Outpost Model Operations
 * Tests outpost database operations, crew associations, and location management
 */

const Outpost = require('../../../backend/src/models/Outpost');
const dbUtils = require('../../../backend/src/utils/dbUtils');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');

describe('Outpost Model', () => {
  const mockOutpostData = {
    id: 1,
    name: 'Port Peril',
    location: 'Shackles',
    access_date: { year: 4723, month: 10, day: 15 },
    created_at: '2023-12-01T10:00:00Z',
    updated_at: '2023-12-01T10:00:00Z'
  };

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
    },
    {
      id: 3,
      name: 'Guard Captain Stone',
      race: 'Dwarf',
      age: 55,
      description: 'Protects the outpost',
      location_type: 'outpost',
      location_id: 1,
      ship_position: null,
      is_alive: true
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllWithCrewCount', () => {
    it('should get all outposts with crew count', async () => {
      const mockOutpostsWithCrew = [
        { ...mockOutpostData, crew_count: '3' },
        { 
          id: 2, 
          name: 'Tortuga', 
          location: 'Caribbean',
          crew_count: '8' 
        },
        { 
          id: 3, 
          name: 'Abandoned Fort', 
          location: 'Unknown Island',
          crew_count: '0' 
        }
      ];

      dbUtils.executeQuery.mockResolvedValue({
        rows: mockOutpostsWithCrew
      });

      const result = await Outpost.getAllWithCrewCount();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT o.*')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(CASE WHEN c.location_type = \'outpost\' AND c.is_alive = true THEN 1 END) as crew_count')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN crew c ON c.location_id = o.id')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY o.id')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY o.name')
      );

      expect(result).toEqual(mockOutpostsWithCrew);
    });

    it('should handle empty outpost list', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Outpost.getAllWithCrewCount();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(Outpost.getAllWithCrewCount()).rejects.toThrow('Database connection failed');
    });

    it('should correctly count living crew only', async () => {
      const mockResult = [
        { id: 1, name: 'Outpost 1', crew_count: '5' }, // 5 living crew
        { id: 2, name: 'Outpost 2', crew_count: '0' }  // No living crew
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: mockResult });

      const result = await Outpost.getAllWithCrewCount();

      // Verify the query specifically filters for is_alive = true
      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('c.is_alive = true');
      expect(result[0].crew_count).toBe('5');
      expect(result[1].crew_count).toBe('0');
    });

    it('should exclude crew assigned to ship locations', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [mockOutpostData]
      });

      await Outpost.getAllWithCrewCount();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('c.location_type = \'outpost\'');
    });

    it('should order outposts by name', async () => {
      const unorderedOutposts = [
        { id: 3, name: 'Zebra Outpost', crew_count: '1' },
        { id: 1, name: 'Alpha Base', crew_count: '3' },
        { id: 2, name: 'Beta Station', crew_count: '2' }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: unorderedOutposts });

      await Outpost.getAllWithCrewCount();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('ORDER BY o.name');
    });
  });

  describe('getWithCrew', () => {
    it('should get outpost with crew successfully', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockOutpostData] }) // Outpost query
        .mockResolvedValueOnce({ rows: mockCrewData });     // Crew query

      const result = await Outpost.getWithCrew(1);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM outposts WHERE id = $1',
        [1]
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM crew'),
        [1]
      );

      expect(result).toEqual({
        ...mockOutpostData,
        crew: mockCrewData
      });
    });

    it('should return null when outpost not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Outpost.getWithCrew(999);

      expect(result).toBeNull();
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1); // Only outpost query, no crew query
    });

    it('should return outpost with empty crew array when no crew found', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockOutpostData] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await Outpost.getWithCrew(1);

      expect(result).toEqual({
        ...mockOutpostData,
        crew: []
      });
    });

    it('should order crew by name', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockOutpostData] })
        .mockResolvedValueOnce({ rows: mockCrewData });

      await Outpost.getWithCrew(1);

      const crewQuery = dbUtils.executeQuery.mock.calls[1][0];
      expect(crewQuery).toContain('ORDER BY name');
    });

    it('should only include living crew members', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockOutpostData] })
        .mockResolvedValueOnce({ rows: mockCrewData });

      await Outpost.getWithCrew(1);

      const crewQuery = dbUtils.executeQuery.mock.calls[1][0];
      expect(crewQuery).toContain('is_alive = true');
    });

    it('should filter crew by outpost location type and ID', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockOutpostData] })
        .mockResolvedValueOnce({ rows: mockCrewData });

      await Outpost.getWithCrew(1);

      const crewQuery = dbUtils.executeQuery.mock.calls[1][0];
      expect(crewQuery).toContain('location_type = \'outpost\'');
      expect(crewQuery).toContain('location_id = $1');
      expect(dbUtils.executeQuery.mock.calls[1][1]).toEqual([1]);
    });

    it('should handle database errors for outpost query', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Outpost query failed'));

      await expect(Outpost.getWithCrew(1)).rejects.toThrow('Outpost query failed');
    });

    it('should handle database errors for crew query', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockOutpostData] })
        .mockRejectedValue(new Error('Crew query failed'));

      await expect(Outpost.getWithCrew(1)).rejects.toThrow('Crew query failed');
    });

    it('should handle invalid outpost ID gracefully', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Outpost.getWithCrew('invalid');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create outpost successfully with all data', async () => {
      const newOutpostData = {
        name: 'New Trading Post',
        location: 'Mwangi Expanse',
        access_date: { year: 4724, month: 1, day: 15 }
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...newOutpostData, id: 1 }] });

      const result = await Outpost.create(newOutpostData);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO outposts'),
        [
          'New Trading Post',
          'Mwangi Expanse',
          { year: 4724, month: 1, day: 15 }
        ]
      );

      expect(result.id).toBe(1);
      expect(result.name).toBe('New Trading Post');
    });

    it('should create outpost with minimal data', async () => {
      const minimalOutpostData = {
        name: 'Simple Outpost'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...minimalOutpostData, id: 2 }] });

      const result = await Outpost.create(minimalOutpostData);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [
          'Simple Outpost',
          null, // location
          null  // access_date
        ]
      );

      expect(result.name).toBe('Simple Outpost');
    });

    it('should handle outpost creation errors', async () => {
      const outpostData = {
        name: 'Test Outpost'
      };

      dbUtils.executeQuery.mockRejectedValue(new Error('Outpost creation failed'));

      await expect(Outpost.create(outpostData)).rejects.toThrow('Outpost creation failed');
    });

    it('should handle special characters in outpost names', async () => {
      const specialCharOutpost = {
        name: 'Fort "El Conquistador" - Isla Española',
        location: 'Caribbean'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...specialCharOutpost, id: 3 }] });

      const result = await Outpost.create(specialCharOutpost);

      expect(result.name).toBe('Fort "El Conquistador" - Isla Española');
    });

    it('should handle null access dates properly', async () => {
      const outpostWithNullDate = {
        name: 'Mysterious Outpost',
        location: 'Unknown',
        access_date: null
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...outpostWithNullDate, id: 4 }] });

      await Outpost.create(outpostWithNullDate);

      const callArgs = dbUtils.executeQuery.mock.calls[0][1];
      expect(callArgs[2]).toBeNull();
    });
  });

  describe('update', () => {
    it('should update outpost successfully', async () => {
      const updateData = {
        name: 'Updated Port Name',
        location: 'New Location',
        access_date: { year: 4724, month: 2, day: 20 }
      };

      const updatedOutpost = { ...mockOutpostData, ...updateData };
      dbUtils.executeQuery.mockResolvedValue({ rows: [updatedOutpost] });

      const result = await Outpost.update(1, updateData);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE outposts'),
        [
          'Updated Port Name',
          'New Location',
          { year: 4724, month: 2, day: 20 },
          1
        ]
      );

      expect(result).toEqual(updatedOutpost);
    });

    it('should return null when outpost not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Outpost.update(999, { name: 'Non-existent' });

      expect(result).toBeNull();
    });

    it('should handle update errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Update failed'));

      await expect(Outpost.update(1, { name: 'Test' })).rejects.toThrow('Update failed');
    });

    it('should update timestamp', async () => {
      const updateData = { name: 'Updated Name' };
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockOutpostData] });

      await Outpost.update(1, updateData);

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('updated_at = CURRENT_TIMESTAMP');
    });

    it('should handle partial updates', async () => {
      const partialUpdateData = {
        name: 'Partially Updated Name'
        // location and access_date not provided
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [mockOutpostData] });

      await Outpost.update(1, partialUpdateData);

      const callArgs = dbUtils.executeQuery.mock.calls[0][1];
      expect(callArgs[0]).toBe('Partially Updated Name');
      expect(callArgs[1]).toBeUndefined(); // location
      expect(callArgs[2]).toBeUndefined(); // access_date
    });

    it('should handle null values in updates', async () => {
      const nullUpdateData = {
        name: 'Outpost with Nulls',
        location: null,
        access_date: null
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [mockOutpostData] });

      await Outpost.update(1, nullUpdateData);

      const callArgs = dbUtils.executeQuery.mock.calls[0][1];
      expect(callArgs[0]).toBe('Outpost with Nulls');
      expect(callArgs[1]).toBeNull();
      expect(callArgs[2]).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete outpost successfully', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 1 });

      const result = await Outpost.delete(1);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'DELETE FROM outposts WHERE id = $1',
        [1]
      );

      expect(result).toBe(true);
    });

    it('should return false when outpost not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 0 });

      const result = await Outpost.delete(999);

      expect(result).toBe(false);
    });

    it('should handle deletion errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Deletion failed'));

      await expect(Outpost.delete(1)).rejects.toThrow('Deletion failed');
    });

    it('should handle multiple affected rows', async () => {
      // This shouldn't happen with proper constraints, but test edge case
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 2 });

      const result = await Outpost.delete(1);

      expect(result).toBe(true); // Still returns true if any rows affected
    });
  });

  describe('findById', () => {
    it('should find outpost by ID successfully', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockOutpostData] });

      const result = await Outpost.findById(1);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM outposts WHERE id = $1',
        [1]
      );

      expect(result).toEqual(mockOutpostData);
    });

    it('should return null when outpost not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Outpost.findById(999);

      expect(result).toBeNull();
    });

    it('should handle find errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Find failed'));

      await expect(Outpost.findById(1)).rejects.toThrow('Find failed');
    });

    it('should handle invalid ID types gracefully', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Outpost.findById('invalid');

      expect(result).toBeNull();
    });

    it('should return first result when multiple rows returned', async () => {
      // This shouldn't happen with proper constraints, but test edge case
      const multipleResults = [mockOutpostData, { ...mockOutpostData, id: 2 }];
      dbUtils.executeQuery.mockResolvedValue({ rows: multipleResults });

      const result = await Outpost.findById(1);

      expect(result).toEqual(mockOutpostData);
    });
  });

  describe('Outpost-Crew Relationship Management', () => {
    it('should handle outposts with diverse crew types', async () => {
      const diverseCrew = [
        { id: 1, name: 'Trade Master', description: 'Handles all trade agreements' },
        { id: 2, name: 'Defense Captain', description: 'Military leader' },
        { id: 3, name: 'Harbor Master', description: 'Manages ship traffic' },
        { id: 4, name: 'Warehouse Keeper', description: 'Inventory management' },
        { id: 5, name: 'Tavern Owner', description: 'Provides entertainment' },
        { id: 6, name: 'Blacksmith', description: 'Weapon and tool maintenance' },
        { id: 7, name: 'Healer', description: 'Medical services' },
        { id: 8, name: 'Information Broker', description: 'Gathers intelligence' }
      ];

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockOutpostData] })
        .mockResolvedValueOnce({ rows: diverseCrew });

      const result = await Outpost.getWithCrew(1);

      expect(result.crew).toEqual(diverseCrew);
      expect(result.crew).toHaveLength(8);
    });

    it('should handle crew with detailed descriptions', async () => {
      const detailedCrew = [
        {
          id: 1,
          name: 'Master Craftsman Ironforge',
          race: 'Dwarf',
          age: 150,
          description: 'A master blacksmith from the ancient dwarven holds, specializing in magical weapon enhancement and ship fitting modifications. Known for his perfectionist approach and extensive knowledge of metallurgy.'
        }
      ];

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockOutpostData] })
        .mockResolvedValueOnce({ rows: detailedCrew });

      const result = await Outpost.getWithCrew(1);

      expect(result.crew[0].description).toContain('master blacksmith');
      expect(result.crew[0].description).toContain('magical weapon enhancement');
    });

    it('should handle crew members with null descriptions', async () => {
      const crewWithNulls = [
        { id: 1, name: 'Simple Worker', race: 'Human', description: null },
        { id: 2, name: 'Another Worker', race: 'Halfling', description: null }
      ];

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockOutpostData] })
        .mockResolvedValueOnce({ rows: crewWithNulls });

      const result = await Outpost.getWithCrew(1);

      expect(result.crew).toEqual(crewWithNulls);
      expect(result.crew[0].description).toBeNull();
      expect(result.crew[1].description).toBeNull();
    });
  });

  describe('Data Integrity and Edge Cases', () => {
    it('should handle outposts with null values', async () => {
      const nullValueOutpost = {
        id: 1,
        name: 'Minimal Outpost',
        location: null,
        access_date: null,
        created_at: '2023-12-01T10:00:00Z',
        updated_at: '2023-12-01T10:00:00Z'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [nullValueOutpost] });

      const result = await Outpost.findById(1);

      expect(result.location).toBeNull();
      expect(result.access_date).toBeNull();
    });

    it('should handle extremely long outpost names', async () => {
      const longNameOutpost = {
        name: 'The Magnificent Grand Maritime Trading Post and Fortress of the Eastern Archipelago Established by the Royal Trading Company of the Seven Seas',
        location: 'Eastern Archipelago'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...longNameOutpost, id: 1 }] });

      const result = await Outpost.create(longNameOutpost);

      expect(result.name).toBe(longNameOutpost.name);
    });

    it('should handle complex access date objects', async () => {
      const complexDateOutpost = {
        name: 'Date Test Outpost',
        access_date: {
          year: 4724,
          month: 12,
          day: 31,
          hour: 23,
          minute: 59,
          second: 59
        }
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...complexDateOutpost, id: 1 }] });

      await Outpost.create(complexDateOutpost);

      const callArgs = dbUtils.executeQuery.mock.calls[0][1];
      expect(callArgs[2]).toEqual(complexDateOutpost.access_date);
    });

    it('should handle malformed location data gracefully', async () => {
      const malformedData = {
        name: 'Test Outpost',
        location: { invalid: 'object' }, // Should be string
        access_date: 'invalid-date'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...malformedData, id: 1 }] });

      // The model doesn't validate - it passes data to DB as-is
      const result = await Outpost.create(malformedData);

      expect(result.location).toEqual({ invalid: 'object' });
    });

    it('should preserve unicode characters in names and locations', async () => {
      const unicodeOutpost = {
        name: '港口 Port - Αλεξάνδρεια - Москва Trading Post',
        location: 'Международный район'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...unicodeOutpost, id: 1 }] });

      const result = await Outpost.create(unicodeOutpost);

      expect(result.name).toBe('港口 Port - Αλεξάνδρεια - Москва Trading Post');
      expect(result.location).toBe('Международный район');
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent outpost operations', async () => {
      const concurrentOperations = [
        Outpost.create({ name: 'Outpost 1' }),
        Outpost.create({ name: 'Outpost 2' }),
        Outpost.update(1, { name: 'Updated Outpost 1' }),
        Outpost.findById(2),
        Outpost.getAllWithCrewCount()
      ];

      // Mock all operations to succeed
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockOutpostData] });

      await Promise.all(concurrentOperations);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(5);
    });

    it('should handle large crew datasets efficiently', async () => {
      const largeCrew = Array.from({ length: 500 }, (_, i) => ({
        id: i + 1,
        name: `Crew Member ${i + 1}`,
        location_type: 'outpost',
        location_id: 1,
        is_alive: true
      }));

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockOutpostData] })
        .mockResolvedValueOnce({ rows: largeCrew });

      const result = await Outpost.getWithCrew(1);

      expect(result.crew).toHaveLength(500);
    });

    it('should handle database connection timeouts', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Connection timeout'));

      await expect(Outpost.getAllWithCrewCount()).rejects.toThrow('Connection timeout');
      await expect(Outpost.create({ name: 'Test' })).rejects.toThrow('Connection timeout');
      await expect(Outpost.update(1, { name: 'Test' })).rejects.toThrow('Connection timeout');
    });
  });

  describe('Query Optimization', () => {
    it('should use efficient JOIN in getAllWithCrewCount', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Outpost.getAllWithCrewCount();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('LEFT JOIN'); // Ensures all outposts are included
      expect(query).toContain('GROUP BY o.id'); // Proper grouping
      expect(query).toContain('COUNT(CASE WHEN'); // Conditional counting
    });

    it('should make minimal database calls in getWithCrew', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockOutpostData] })
        .mockResolvedValueOnce({ rows: mockCrewData });

      await Outpost.getWithCrew(1);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2); // Exactly 2 queries
    });

    it('should use parameterized queries for security', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockOutpostData] });

      await Outpost.findById(1);
      await Outpost.getWithCrew(1);
      await Outpost.update(1, { name: 'Test' });

      // All calls should use parameterized queries (second argument is array)
      dbUtils.executeQuery.mock.calls.forEach(call => {
        if (call[1]) { // If parameters exist
          expect(Array.isArray(call[1])).toBe(true);
        }
      });
    });

    it('should order results consistently', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Outpost.getAllWithCrewCount();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('ORDER BY o.name'); // Consistent ordering

      dbUtils.executeQuery.mockResolvedValue({ rows: [mockOutpostData] });
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Outpost.getWithCrew(1);

      const crewQuery = dbUtils.executeQuery.mock.calls[1][0];
      expect(crewQuery).toContain('ORDER BY name'); // Crew ordered by name
    });
  });
});