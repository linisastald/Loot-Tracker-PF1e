/**
 * Tests for Crew.js - Crew Model Operations
 * Tests crew database operations, location management, and crew lifecycle
 */

const Crew = require('../../../backend/src/models/Crew');
const dbUtils = require('../../../backend/src/utils/dbUtils');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');

describe('Crew Model', () => {
  const mockCrewData = {
    id: 1,
    name: 'William "Bootstrap" Turner',
    race: 'Human',
    age: 35,
    description: 'Experienced sailor with knowledge of ancient curses',
    location_type: 'ship',
    location_id: 1,
    ship_position: 'Boatswain',
    is_alive: true,
    death_date: null,
    departure_date: null,
    departure_reason: null,
    created_at: '2023-12-01T10:00:00Z',
    updated_at: '2023-12-01T10:00:00Z'
  };

  const mockShipCrew = [
    {
      id: 1,
      name: 'Captain Redbeard',
      race: 'Human',
      age: 45,
      ship_position: 'captain',
      location_type: 'ship',
      location_id: 1,
      is_alive: true
    },
    {
      id: 2,
      name: 'First Mate Anne',
      race: 'Human',
      age: 32,
      ship_position: 'first mate',
      location_type: 'ship',
      location_id: 1,
      is_alive: true
    },
    {
      id: 3,
      name: 'Gunner Pete',
      race: 'Dwarf',
      age: 67,
      ship_position: 'gunner',
      location_type: 'ship',
      location_id: 1,
      is_alive: true
    }
  ];

  const mockOutpostCrew = [
    {
      id: 4,
      name: 'Quartermaster Quinn',
      race: 'Human',
      age: 40,
      ship_position: null,
      location_type: 'outpost',
      location_id: 2,
      is_alive: true
    },
    {
      id: 5,
      name: 'Merchant Mary',
      race: 'Halfling',
      age: 28,
      ship_position: null,
      location_type: 'outpost',
      location_id: 2,
      is_alive: true
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllWithLocation', () => {
    it('should get all living crew with location names', async () => {
      const mockCrewWithLocation = [
        { ...mockCrewData, location_name: 'The Crimson Storm' },
        { 
          id: 2, 
          name: 'Anne Bonny', 
          location_type: 'ship', 
          location_id: 1, 
          location_name: 'The Crimson Storm',
          is_alive: true
        },
        { 
          id: 3, 
          name: 'Calico Jack', 
          location_type: 'outpost', 
          location_id: 2, 
          location_name: 'Tortuga',
          is_alive: true
        }
      ];

      dbUtils.executeQuery.mockResolvedValue({
        rows: mockCrewWithLocation
      });

      const result = await Crew.getAllWithLocation();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT c.*')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('CASE')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHEN c.location_type = \'ship\' THEN s.name')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHEN c.location_type = \'outpost\' THEN o.name')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN ships s ON')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN outposts o ON')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE c.is_alive = true')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY c.name')
      );

      expect(result).toEqual(mockCrewWithLocation);
    });

    it('should handle empty crew list', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Crew.getAllWithLocation();

      expect(result).toEqual([]);
    });

    it('should handle crew without location names', async () => {
      const crewWithoutLocation = [
        { ...mockCrewData, location_name: null }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: crewWithoutLocation });

      const result = await Crew.getAllWithLocation();

      expect(result[0].location_name).toBeNull();
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(Crew.getAllWithLocation()).rejects.toThrow('Database connection failed');
    });

    it('should only include living crew members', async () => {
      const mixedCrew = [
        { ...mockCrewData, is_alive: true, location_name: 'Ship A' },
        { ...mockCrewData, id: 2, is_alive: false, location_name: 'Ship B' }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: [mixedCrew[0]] });

      const result = await Crew.getAllWithLocation();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('c.is_alive = true');
      expect(result).toHaveLength(1);
      expect(result[0].is_alive).toBe(true);
    });
  });

  describe('getByLocation', () => {
    it('should get crew by ship location with hierarchy ordering', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockShipCrew });

      const result = await Crew.getByLocation('ship', 1);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE location_type = $1 AND location_id = $2 AND is_alive = true'),
        ['ship', 1]
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('CASE')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHEN $1 = \'ship\' AND ship_position = \'captain\' THEN 1')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHEN $1 = \'ship\' AND ship_position = \'first mate\' THEN 2')
      );

      expect(result).toEqual(mockShipCrew);
    });

    it('should get crew by outpost location', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockOutpostCrew });

      const result = await Crew.getByLocation('outpost', 2);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['outpost', 2]
      );

      expect(result).toEqual(mockOutpostCrew);
    });

    it('should handle empty location', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Crew.getByLocation('ship', 999);

      expect(result).toEqual([]);
    });

    it('should order ship crew by hierarchy then name', async () => {
      const hierarchicalCrew = [
        { id: 1, name: 'Zed Captain', ship_position: 'captain' },
        { id: 2, name: 'Alpha First Mate', ship_position: 'first mate' },
        { id: 3, name: 'Beta Sailor', ship_position: 'sailor' },
        { id: 4, name: 'Charlie Sailor', ship_position: 'sailor' }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: hierarchicalCrew });

      await Crew.getByLocation('ship', 1);

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('ORDER BY');
      expect(query).toContain('CASE');
      expect(query).toContain('name');
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Location query failed'));

      await expect(Crew.getByLocation('ship', 1)).rejects.toThrow('Location query failed');
    });

    it('should only include living crew at location', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: mockShipCrew });

      await Crew.getByLocation('ship', 1);

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('is_alive = true');
    });
  });

  describe('getDeceased', () => {
    it('should get all deceased/departed crew with last known locations', async () => {
      const mockDeceasedCrew = [
        {
          id: 1,
          name: 'Poor Tom',
          is_alive: false,
          death_date: '2023-11-15T12:00:00Z',
          departure_date: null,
          departure_reason: null,
          last_known_location: 'The Black Pearl'
        },
        {
          id: 2,
          name: 'Deserter Dan',
          is_alive: false,
          death_date: null,
          departure_date: '2023-11-20T08:00:00Z',
          departure_reason: 'Mutiny',
          last_known_location: 'Port Royal'
        }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: mockDeceasedCrew });

      const result = await Crew.getDeceased();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE c.is_alive = false')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('COALESCE(c.death_date, c.departure_date) DESC')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('last_known_location')
      );

      expect(result).toEqual(mockDeceasedCrew);
    });

    it('should handle empty deceased crew list', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Crew.getDeceased();

      expect(result).toEqual([]);
    });

    it('should order by death/departure date descending', async () => {
      const orderedDeceased = [
        { id: 1, name: 'Recent Death', death_date: '2023-12-01T10:00:00Z' },
        { id: 2, name: 'Old Death', death_date: '2023-10-01T10:00:00Z' }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: orderedDeceased });

      await Crew.getDeceased();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('COALESCE(c.death_date, c.departure_date) DESC');
    });

    it('should handle crew without known locations', async () => {
      const crewWithoutLocation = [
        { id: 1, name: 'Unknown Death', is_alive: false, last_known_location: null }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: crewWithoutLocation });

      const result = await Crew.getDeceased();

      expect(result[0].last_known_location).toBeNull();
    });
  });

  describe('create', () => {
    it('should create crew member for ship successfully', async () => {
      const newCrewData = {
        name: 'Jack Sparrow',
        race: 'Human',
        age: 30,
        description: 'Eccentric pirate captain',
        location_type: 'ship',
        location_id: 1,
        ship_position: 'Captain'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...newCrewData, id: 1 }] });

      const result = await Crew.create(newCrewData);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO crew'),
        [
          'Jack Sparrow',
          'Human',
          30,
          'Eccentric pirate captain',
          'ship',
          1,
          'Captain',
          true
        ]
      );

      expect(result.id).toBe(1);
      expect(result.name).toBe('Jack Sparrow');
    });

    it('should create crew member for outpost successfully', async () => {
      const newCrewData = {
        name: 'Anamaria',
        race: 'Human',
        age: 28,
        description: 'Former owner of the Jolly Mon',
        location_type: 'outpost',
        location_id: 2
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...newCrewData, id: 2 }] });

      const result = await Crew.create(newCrewData);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [
          'Anamaria',
          'Human',
          28,
          'Former owner of the Jolly Mon',
          'outpost',
          2,
          null, // ship_position should be null for outpost
          true
        ]
      );

      expect(result.id).toBe(2);
    });

    it('should create crew member with minimal data', async () => {
      const minimalCrewData = {
        name: 'Simple Sailor',
        location_type: 'ship',
        location_id: 1
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...minimalCrewData, id: 3 }] });

      const result = await Crew.create(minimalCrewData);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [
          'Simple Sailor',
          null, // race
          null, // age
          null, // description
          'ship',
          1,
          null, // ship_position (not provided)
          true
        ]
      );

      expect(result.name).toBe('Simple Sailor');
    });

    it('should handle crew creation errors', async () => {
      const crewData = {
        name: 'Test Crew',
        location_type: 'ship',
        location_id: 1
      };

      dbUtils.executeQuery.mockRejectedValue(new Error('Crew creation failed'));

      await expect(Crew.create(crewData)).rejects.toThrow('Crew creation failed');
    });

    it('should set ship_position to null for outpost crew', async () => {
      const outpostCrewData = {
        name: 'Outpost Worker',
        location_type: 'outpost',
        location_id: 2,
        ship_position: 'captain' // This should be ignored
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...outpostCrewData, id: 4 }] });

      await Crew.create(outpostCrewData);

      const callArgs = dbUtils.executeQuery.mock.calls[0][1];
      expect(callArgs[6]).toBeNull(); // ship_position should be null
    });

    it('should handle special characters in crew data', async () => {
      const specialCharCrew = {
        name: 'José "El Marinero" García',
        race: 'Español',
        description: 'Marinero con experiência única',
        location_type: 'ship',
        location_id: 1
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...specialCharCrew, id: 5 }] });

      const result = await Crew.create(specialCharCrew);

      expect(result.name).toBe('José "El Marinero" García');
    });
  });

  describe('update', () => {
    it('should update crew member successfully', async () => {
      const updateData = {
        name: 'William Turner Jr.',
        race: 'Human',
        age: 36,
        description: 'Bootstrap\'s son, master swordsman',
        location_type: 'ship',
        location_id: 1,
        ship_position: 'First Mate'
      };

      const updatedCrew = { ...mockCrewData, ...updateData };
      dbUtils.executeQuery.mockResolvedValue({ rows: [updatedCrew] });

      const result = await Crew.update(1, updateData);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE crew'),
        [
          'William Turner Jr.',
          'Human',
          36,
          'Bootstrap\'s son, master swordsman',
          'ship',
          1,
          'First Mate',
          1
        ]
      );

      expect(result).toEqual(updatedCrew);
    });

    it('should move crew from ship to outpost', async () => {
      const updateData = {
        name: 'Bootstrap Bill',
        race: 'Human',
        age: 45,
        description: 'Retiring to outpost',
        location_type: 'outpost',
        location_id: 3,
        ship_position: 'captain' // Should be ignored
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...mockCrewData, ...updateData }] });

      await Crew.update(1, updateData);

      const callArgs = dbUtils.executeQuery.mock.calls[0][1];
      expect(callArgs[6]).toBeNull(); // ship_position should be null for outpost
    });

    it('should move crew from outpost to ship', async () => {
      const updateData = {
        name: 'Returnee',
        race: 'Human',
        age: 30,
        description: 'Returning to sea',
        location_type: 'ship',
        location_id: 2,
        ship_position: 'Gunner'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...mockCrewData, ...updateData }] });

      await Crew.update(1, updateData);

      const callArgs = dbUtils.executeQuery.mock.calls[0][1];
      expect(callArgs[6]).toBe('Gunner'); // ship_position should be preserved
    });

    it('should return null when crew not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Crew.update(999, { name: 'Non-existent' });

      expect(result).toBeNull();
    });

    it('should handle update errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Update failed'));

      await expect(Crew.update(1, { name: 'Test' })).rejects.toThrow('Update failed');
    });

    it('should update timestamp', async () => {
      const updateData = { name: 'Updated Name' };
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockCrewData] });

      await Crew.update(1, updateData);

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('updated_at = CURRENT_TIMESTAMP');
    });
  });

  describe('markDead', () => {
    it('should mark crew member as dead with custom date', async () => {
      const deathDate = new Date('2023-11-15T12:00:00Z');
      const deadCrew = { ...mockCrewData, is_alive: false, death_date: deathDate };

      dbUtils.executeQuery.mockResolvedValue({ rows: [deadCrew] });

      const result = await Crew.markDead(1, deathDate);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE crew'),
        [deathDate, 1]
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_alive = false, death_date = $1')
      );

      expect(result.is_alive).toBe(false);
      expect(result.death_date).toEqual(deathDate);
    });

    it('should mark crew member as dead with default date', async () => {
      const deadCrew = { ...mockCrewData, is_alive: false };
      dbUtils.executeQuery.mockResolvedValue({ rows: [deadCrew] });

      const result = await Crew.markDead(1);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [expect.any(Date), 1]
      );

      expect(result.is_alive).toBe(false);
    });

    it('should return null when crew not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Crew.markDead(999);

      expect(result).toBeNull();
    });

    it('should handle mark dead errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Mark dead failed'));

      await expect(Crew.markDead(1)).rejects.toThrow('Mark dead failed');
    });

    it('should update timestamp when marking dead', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockCrewData] });

      await Crew.markDead(1);

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('updated_at = CURRENT_TIMESTAMP');
    });
  });

  describe('markDeparted', () => {
    it('should mark crew member as departed with details', async () => {
      const departureDate = new Date('2023-11-20T08:00:00Z');
      const reason = 'Seeking new adventures';
      const departedCrew = { 
        ...mockCrewData, 
        is_alive: false, 
        departure_date: departureDate,
        departure_reason: reason
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [departedCrew] });

      const result = await Crew.markDeparted(1, departureDate, reason);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE crew'),
        [departureDate, reason, 1]
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_alive = false, departure_date = $1, departure_reason = $2')
      );

      expect(result.is_alive).toBe(false);
      expect(result.departure_date).toEqual(departureDate);
      expect(result.departure_reason).toBe(reason);
    });

    it('should mark crew member as departed with defaults', async () => {
      const departedCrew = { ...mockCrewData, is_alive: false };
      dbUtils.executeQuery.mockResolvedValue({ rows: [departedCrew] });

      const result = await Crew.markDeparted(1);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        [expect.any(Date), null, 1]
      );

      expect(result.is_alive).toBe(false);
    });

    it('should return null when crew not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Crew.markDeparted(999);

      expect(result).toBeNull();
    });

    it('should handle mark departed errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Mark departed failed'));

      await expect(Crew.markDeparted(1)).rejects.toThrow('Mark departed failed');
    });

    it('should handle long departure reasons', async () => {
      const longReason = 'Left to pursue a legendary treasure map found in his father\'s belongings, seeking to restore his family\'s honor and fortune through perilous adventures across the seven seas';
      
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockCrewData] });

      await Crew.markDeparted(1, new Date(), longReason);

      const callArgs = dbUtils.executeQuery.mock.calls[0][1];
      expect(callArgs[1]).toBe(longReason);
    });
  });

  describe('moveToLocation', () => {
    it('should move crew to new ship location with position', async () => {
      const movedCrew = {
        ...mockCrewData,
        location_type: 'ship',
        location_id: 2,
        ship_position: 'Navigator'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [movedCrew] });

      const result = await Crew.moveToLocation(1, 'ship', 2, 'Navigator');

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE crew'),
        ['ship', 2, 'Navigator', 1]
      );

      expect(result.location_type).toBe('ship');
      expect(result.location_id).toBe(2);
      expect(result.ship_position).toBe('Navigator');
    });

    it('should move crew to outpost location clearing position', async () => {
      const movedCrew = {
        ...mockCrewData,
        location_type: 'outpost',
        location_id: 3,
        ship_position: null
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [movedCrew] });

      const result = await Crew.moveToLocation(1, 'outpost', 3);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['outpost', 3, null, 1]
      );

      expect(result.location_type).toBe('outpost');
      expect(result.ship_position).toBeNull();
    });

    it('should return null when crew not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Crew.moveToLocation(999, 'ship', 1);

      expect(result).toBeNull();
    });

    it('should handle move errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Move failed'));

      await expect(Crew.moveToLocation(1, 'ship', 1)).rejects.toThrow('Move failed');
    });

    it('should update timestamp when moving', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockCrewData] });

      await Crew.moveToLocation(1, 'ship', 2);

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('updated_at = CURRENT_TIMESTAMP');
    });
  });

  describe('delete', () => {
    it('should delete crew member successfully', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 1 });

      const result = await Crew.delete(1);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'DELETE FROM crew WHERE id = $1',
        [1]
      );

      expect(result).toBe(true);
    });

    it('should return false when crew not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rowCount: 0 });

      const result = await Crew.delete(999);

      expect(result).toBe(false);
    });

    it('should handle deletion errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Deletion failed'));

      await expect(Crew.delete(1)).rejects.toThrow('Deletion failed');
    });
  });

  describe('findById', () => {
    it('should find crew member by ID successfully', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockCrewData] });

      const result = await Crew.findById(1);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM crew WHERE id = $1',
        [1]
      );

      expect(result).toEqual(mockCrewData);
    });

    it('should return null when crew not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Crew.findById(999);

      expect(result).toBeNull();
    });

    it('should handle find errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Find failed'));

      await expect(Crew.findById(1)).rejects.toThrow('Find failed');
    });

    it('should handle invalid ID types gracefully', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Crew.findById('invalid');

      expect(result).toBeNull();
    });
  });

  describe('Crew Lifecycle Management', () => {
    it('should handle crew aging progression', async () => {
      const agingData = { age: 46 }; // Aged from 35 to 46
      const agedCrew = { ...mockCrewData, age: 46 };

      dbUtils.executeQuery.mockResolvedValue({ rows: [agedCrew] });

      const result = await Crew.update(1, agingData);

      expect(result.age).toBe(46);
    });

    it('should handle crew promotion progression', async () => {
      const promotionData = {
        ship_position: 'First Mate',
        description: 'Promoted for exemplary service'
      };
      const promotedCrew = { ...mockCrewData, ...promotionData };

      dbUtils.executeQuery.mockResolvedValue({ rows: [promotedCrew] });

      const result = await Crew.update(1, promotionData);

      expect(result.ship_position).toBe('First Mate');
      expect(result.description).toContain('Promoted for exemplary service');
    });

    it('should handle crew resurrection scenarios', async () => {
      // First mark as dead
      const deadCrew = { ...mockCrewData, is_alive: false, death_date: new Date() };
      dbUtils.executeQuery.mockResolvedValue({ rows: [deadCrew] });

      await Crew.markDead(1);

      // Then resurrect by updating is_alive directly (if such functionality exists)
      const resurrectedData = {
        ...mockCrewData,
        description: 'Brought back by voodoo magic',
        // Note: Real resurrection would need special handling in actual implementation
      };
      dbUtils.executeQuery.mockResolvedValue({ rows: [resurrectedData] });

      const result = await Crew.update(1, resurrectedData);

      expect(result.description).toContain('voodoo magic');
    });
  });

  describe('Data Integrity and Edge Cases', () => {
    it('should handle crew with null values', async () => {
      const nullValueCrew = {
        id: 1,
        name: 'Minimal Crew',
        race: null,
        age: null,
        description: null,
        location_type: 'ship',
        location_id: 1,
        ship_position: null,
        is_alive: true
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [nullValueCrew] });

      const result = await Crew.findById(1);

      expect(result.race).toBeNull();
      expect(result.age).toBeNull();
      expect(result.description).toBeNull();
      expect(result.ship_position).toBeNull();
    });

    it('should handle extremely long crew names', async () => {
      const longNameCrew = {
        name: 'Bartholomew "The Magnificent Sea-Faring Adventure-Seeking Treasure-Finding Monster-Slaying Dragon-Battling Storm-Weathering Ocean-Mastering Legendary" MacGillicuddy the Third of the Northern Seas',
        location_type: 'ship',
        location_id: 1
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...longNameCrew, id: 1 }] });

      const result = await Crew.create(longNameCrew);

      expect(result.name).toBe(longNameCrew.name);
    });

    it('should handle extreme ages', async () => {
      const extremeAgeCrew = [
        { ...mockCrewData, age: -100 }, // Undead
        { ...mockCrewData, age: 2000 }, // Ancient elf
        { ...mockCrewData, age: 0 } // Newborn somehow
      ];

      for (const crew of extremeAgeCrew) {
        dbUtils.executeQuery.mockResolvedValue({ rows: [crew] });
        const result = await Crew.update(1, { age: crew.age });
        expect(result.age).toBe(crew.age);
      }
    });

    it('should handle malformed location data gracefully', async () => {
      const malformedData = {
        name: 'Test Crew',
        location_type: 'ship',
        location_id: 'not-a-number'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...malformedData, id: 1 }] });

      // The model doesn't validate - it passes data to DB as-is
      const result = await Crew.create(malformedData);

      expect(result.location_id).toBe('not-a-number');
    });

    it('should preserve complex character descriptions', async () => {
      const complexDescription = `A weathered veteran of countless battles across the treacherous waters of the Inner Sea. 
        Bears intricate tattoos that tell the story of each voyage: a kraken's tentacle wrapped around his left arm 
        commemorating the Battle of Tempest Bay, a mermaid's silhouette on his right shoulder from his time in the 
        Shackles, and a compass rose on his chest pointing toward his homeland. Known to speak in ancient nautical 
        riddles and maintains a collection of rare coins from distant shores. Has a peculiar habit of predicting 
        weather changes by the ache in his bones, a skill that has saved the crew countless times.`;

      const crewWithComplexDescription = {
        name: 'Old Salt McGillicuddy',
        description: complexDescription,
        location_type: 'ship',
        location_id: 1
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ ...crewWithComplexDescription, id: 1 }] });

      const result = await Crew.create(crewWithComplexDescription);

      expect(result.description).toBe(complexDescription);
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent crew operations', async () => {
      const concurrentOperations = [
        Crew.create({ name: 'Crew 1', location_type: 'ship', location_id: 1 }),
        Crew.create({ name: 'Crew 2', location_type: 'ship', location_id: 2 }),
        Crew.update(1, { name: 'Updated Crew 1' }),
        Crew.findById(2),
        Crew.getByLocation('ship', 1)
      ];

      // Mock all operations to succeed
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockCrewData] });

      await Promise.all(concurrentOperations);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(5);
    });

    it('should handle large crew datasets efficiently', async () => {
      const largeCrew = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        name: `Crew Member ${i + 1}`,
        location_type: 'ship',
        location_id: Math.floor(i / 100) + 1,
        is_alive: true
      }));

      dbUtils.executeQuery.mockResolvedValue({ rows: largeCrew });

      const result = await Crew.getAllWithLocation();

      expect(result).toHaveLength(1000);
    });

    it('should handle database connection timeouts', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Connection timeout'));

      await expect(Crew.getAllWithLocation()).rejects.toThrow('Connection timeout');
      await expect(Crew.create({ name: 'Test', location_type: 'ship', location_id: 1 })).rejects.toThrow('Connection timeout');
      await expect(Crew.update(1, { name: 'Test' })).rejects.toThrow('Connection timeout');
    });
  });

  describe('Query Optimization', () => {
    it('should use efficient JOINs in getAllWithLocation', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Crew.getAllWithLocation();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('LEFT JOIN ships s'); // Efficient joining
      expect(query).toContain('LEFT JOIN outposts o'); // Covers both location types
      expect(query).toContain('CASE'); // Conditional selection
    });

    it('should make minimal database calls per operation', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockCrewData] });

      await Crew.findById(1);
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);

      await Crew.create({ name: 'Test', location_type: 'ship', location_id: 1 });
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);

      await Crew.update(1, { name: 'Updated' });
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(3);
    });

    it('should use parameterized queries for security', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [mockCrewData] });

      await Crew.findById(1);
      await Crew.getByLocation('ship', 1);
      await Crew.update(1, { name: 'Test' });

      // All calls should use parameterized queries (second argument is array)
      dbUtils.executeQuery.mock.calls.forEach(call => {
        if (call[1]) { // If parameters exist
          expect(Array.isArray(call[1])).toBe(true);
        }
      });
    });
  });
});