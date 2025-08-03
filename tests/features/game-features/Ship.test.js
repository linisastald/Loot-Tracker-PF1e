/**
 * Tests for Ship.js - Ship Model Operations
 * Tests ship database operations, crew associations, and ship-specific queries
 */

const Ship = require('../../../backend/src/models/Ship');
const dbUtils = require('../../../backend/src/utils/dbUtils');

// Mock dependencies
jest.mock('../../../backend/src/utils/dbUtils');

describe('Ship Model', () => {
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
      { position: 'Captain', name: 'Captain Redbeard', bonus: 2 }
    ],
    improvements: ['reinforced hull'],
    cargo_manifest: {
      items: ['rum', 'gunpowder'],
      passengers: [],
      impositions: []
    },
    ship_notes: 'Fast pirate vessel',
    captain_name: 'Captain Redbeard',
    flag_description: 'Black flag with crimson storm'
  };

  const mockCrewData = [
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllWithCrewCount', () => {
    it('should get all ships with crew count', async () => {
      const mockShipsWithCrew = [
        { ...mockShipData, crew_count: '3' },
        { 
          id: 2, 
          name: 'The Black Pearl', 
          status: 'Active', 
          crew_count: '15' 
        },
        { 
          id: 3, 
          name: 'Empty Vessel', 
          status: 'Docked', 
          crew_count: '0' 
        }
      ];

      dbUtils.executeQuery.mockResolvedValue({
        rows: mockShipsWithCrew
      });

      const result = await Ship.getAllWithCrewCount();

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT s.*')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(CASE WHEN c.location_type = \'ship\' AND c.is_alive = true THEN 1 END) as crew_count')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN crew c ON c.location_id = s.id')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY s.id')
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY s.name')
      );

      expect(result).toEqual(mockShipsWithCrew);
    });

    it('should handle empty ship list', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Ship.getAllWithCrewCount();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(Ship.getAllWithCrewCount()).rejects.toThrow('Database connection failed');
    });

    it('should correctly count living crew only', async () => {
      const mockResult = [
        { id: 1, name: 'Ship 1', crew_count: '5' }, // 5 living crew
        { id: 2, name: 'Ship 2', crew_count: '0' }  // No living crew
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: mockResult });

      const result = await Ship.getAllWithCrewCount();

      // Verify the query specifically filters for is_alive = true
      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('c.is_alive = true');
      expect(result[0].crew_count).toBe('5');
      expect(result[1].crew_count).toBe('0');
    });

    it('should exclude crew assigned to other location types', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [mockShipData]
      });

      await Ship.getAllWithCrewCount();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('c.location_type = \'ship\'');
    });
  });

  describe('getWithCrew', () => {
    it('should get ship with crew successfully', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockShipData] }) // Ship query
        .mockResolvedValueOnce({ rows: mockCrewData });   // Crew query

      const result = await Ship.getWithCrew(1);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM ships WHERE id = $1',
        [1]
      );
      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM crew'),
        [1]
      );

      expect(result).toEqual({
        ...mockShipData,
        crew: mockCrewData
      });
    });

    it('should return null when ship not found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Ship.getWithCrew(999);

      expect(result).toBeNull();
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1); // Only ship query, no crew query
    });

    it('should return ship with empty crew array when no crew found', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockShipData] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await Ship.getWithCrew(1);

      expect(result).toEqual({
        ...mockShipData,
        crew: []
      });
    });

    it('should order crew by hierarchy then name', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockShipData] })
        .mockResolvedValueOnce({ rows: mockCrewData });

      await Ship.getWithCrew(1);

      const crewQuery = dbUtils.executeQuery.mock.calls[1][0];
      expect(crewQuery).toContain('ORDER BY');
      expect(crewQuery).toContain('CASE ship_position');
      expect(crewQuery).toContain('WHEN \'captain\' THEN 1');
      expect(crewQuery).toContain('WHEN \'first mate\' THEN 2');
      expect(crewQuery).toContain('ELSE 3');
      expect(crewQuery).toContain('name');
    });

    it('should only include living crew members', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockShipData] })
        .mockResolvedValueOnce({ rows: mockCrewData });

      await Ship.getWithCrew(1);

      const crewQuery = dbUtils.executeQuery.mock.calls[1][0];
      expect(crewQuery).toContain('is_alive = true');
    });

    it('should filter crew by ship location type and ID', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockShipData] })
        .mockResolvedValueOnce({ rows: mockCrewData });

      await Ship.getWithCrew(1);

      const crewQuery = dbUtils.executeQuery.mock.calls[1][0];
      expect(crewQuery).toContain('location_type = \'ship\'');
      expect(crewQuery).toContain('location_id = $1');
      expect(dbUtils.executeQuery.mock.calls[1][1]).toEqual([1]);
    });

    it('should handle database errors for ship query', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Ship query failed'));

      await expect(Ship.getWithCrew(1)).rejects.toThrow('Ship query failed');
    });

    it('should handle database errors for crew query', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockShipData] })
        .mockRejectedValue(new Error('Crew query failed'));

      await expect(Ship.getWithCrew(1)).rejects.toThrow('Crew query failed');
    });

    it('should handle invalid ship ID gracefully', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await Ship.getWithCrew('invalid');

      expect(result).toBeNull();
    });
  });

  describe('Ship-Crew Relationship Management', () => {
    it('should handle ships with diverse crew positions', async () => {
      const diverseCrew = [
        { id: 1, name: 'Captain Hook', ship_position: 'captain' },
        { id: 2, name: 'Mr. Smee', ship_position: 'first mate' },
        { id: 3, name: 'Bosun Bill', ship_position: 'boatswain' },
        { id: 4, name: 'Cookie', ship_position: 'cook' },
        { id: 5, name: 'Doc', ship_position: 'surgeon' },
        { id: 6, name: 'Chips', ship_position: 'carpenter' },
        { id: 7, name: 'Powder Monkey', ship_position: 'gunner' },
        { id: 8, name: 'Sailor Sam', ship_position: null }
      ];

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockShipData] })
        .mockResolvedValueOnce({ rows: diverseCrew });

      const result = await Ship.getWithCrew(1);

      expect(result.crew).toEqual(diverseCrew);
      expect(result.crew).toHaveLength(8);
    });

    it('should handle crew with mixed case positions', async () => {
      const mixedCaseCrew = [
        { id: 1, name: 'Cap', ship_position: 'Captain' },
        { id: 2, name: 'Mate', ship_position: 'First Mate' },
        { id: 3, name: 'Bosun', ship_position: 'BOATSWAIN' }
      ];

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockShipData] })
        .mockResolvedValueOnce({ rows: mixedCaseCrew });

      const result = await Ship.getWithCrew(1);

      expect(result.crew).toEqual(mixedCaseCrew);
    });

    it('should handle crew members with null ship positions', async () => {
      const crewWithNulls = [
        { id: 1, name: 'Captain', ship_position: 'captain' },
        { id: 2, name: 'Sailor 1', ship_position: null },
        { id: 3, name: 'Sailor 2', ship_position: null }
      ];

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockShipData] })
        .mockResolvedValueOnce({ rows: crewWithNulls });

      const result = await Ship.getWithCrew(1);

      expect(result.crew).toEqual(crewWithNulls);
      // Verify ELSE case in ORDER BY handles null positions
      const crewQuery = dbUtils.executeQuery.mock.calls[1][0];
      expect(crewQuery).toContain('ELSE 3');
    });
  });

  describe('Ship Status and Type Filtering', () => {
    it('should include ships of all statuses in getAllWithCrewCount', async () => {
      const shipsWithVariousStatuses = [
        { id: 1, name: 'Active Ship', status: 'Active', crew_count: '10' },
        { id: 2, name: 'Docked Ship', status: 'Docked', crew_count: '5' },
        { id: 3, name: 'Lost Ship', status: 'Lost', crew_count: '0' },
        { id: 4, name: 'Sunk Ship', status: 'Sunk', crew_count: '0' },
        { id: 5, name: 'PC Active Ship', status: 'PC Active', crew_count: '8' }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: shipsWithVariousStatuses });

      const result = await Ship.getAllWithCrewCount();

      expect(result).toHaveLength(5);
      expect(result.map(ship => ship.status)).toEqual([
        'Active', 'Docked', 'Lost', 'Sunk', 'PC Active'
      ]);
    });

    it('should handle ships with different types', async () => {
      const shipsWithDifferentTypes = [
        { id: 1, name: 'Fast Sloop', ship_type: 'sloop', crew_count: '15' },
        { id: 2, name: 'Battle Frigate', ship_type: 'frigate', crew_count: '200' },
        { id: 3, name: 'Treasure Galleon', ship_type: 'galleon', crew_count: '500' },
        { id: 4, name: 'Custom Vessel', ship_type: 'custom', crew_count: '100' }
      ];

      dbUtils.executeQuery.mockResolvedValue({ rows: shipsWithDifferentTypes });

      const result = await Ship.getAllWithCrewCount();

      expect(result.map(ship => ship.ship_type)).toEqual([
        'sloop', 'frigate', 'galleon', 'custom'
      ]);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large crew counts efficiently', async () => {
      const largeCrew = Array.from({ length: 500 }, (_, i) => ({
        id: i + 1,
        name: `Crew Member ${i + 1}`,
        ship_position: i === 0 ? 'captain' : i === 1 ? 'first mate' : null,
        location_type: 'ship',
        location_id: 1,
        is_alive: true
      }));

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockShipData] })
        .mockResolvedValueOnce({ rows: largeCrew });

      const result = await Ship.getWithCrew(1);

      expect(result.crew).toHaveLength(500);
      expect(result.crew[0].ship_position).toBe('captain');
      expect(result.crew[1].ship_position).toBe('first mate');
    });

    it('should handle ships with zero crew', async () => {
      const shipWithoutCrew = {
        id: 1,
        name: 'Ghost Ship',
        status: 'Lost',
        crew_count: '0'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [shipWithoutCrew] });

      const result = await Ship.getAllWithCrewCount();

      expect(result[0].crew_count).toBe('0');
    });

    it('should handle multiple ships being queried concurrently', async () => {
      dbUtils.executeQuery
        .mockResolvedValue({ rows: [mockShipData] })
        .mockResolvedValue({ rows: mockCrewData });

      const promises = [
        Ship.getWithCrew(1),
        Ship.getWithCrew(2),
        Ship.getWithCrew(3)
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(6); // 2 queries per ship
    });

    it('should handle database connection timeouts gracefully', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Connection timeout'));

      await expect(Ship.getAllWithCrewCount()).rejects.toThrow('Connection timeout');
      await expect(Ship.getWithCrew(1)).rejects.toThrow('Connection timeout');
    });
  });

  describe('Data Integrity', () => {
    it('should preserve all ship properties in getWithCrew', async () => {
      const complexShipData = {
        ...mockShipData,
        complex_field: { nested: { data: 'value' } },
        array_field: [1, 2, 3, 'string'],
        null_field: null,
        boolean_field: true,
        number_field: 42.5
      };

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [complexShipData] })
        .mockResolvedValueOnce({ rows: mockCrewData });

      const result = await Ship.getWithCrew(1);

      expect(result).toEqual({
        ...complexShipData,
        crew: mockCrewData
      });
      expect(result.complex_field).toEqual({ nested: { data: 'value' } });
      expect(result.array_field).toEqual([1, 2, 3, 'string']);
      expect(result.null_field).toBeNull();
      expect(result.boolean_field).toBe(true);
      expect(result.number_field).toBe(42.5);
    });

    it('should handle malformed data gracefully', async () => {
      const malformedShipData = {
        id: 1,
        name: null, // Unexpected null
        status: undefined, // Unexpected undefined
        crew_count: 'invalid_number'
      };

      dbUtils.executeQuery.mockResolvedValue({ rows: [malformedShipData] });

      const result = await Ship.getAllWithCrewCount();

      expect(result[0]).toEqual(malformedShipData);
      expect(result[0].name).toBeNull();
      expect(result[0].status).toBeUndefined();
      expect(result[0].crew_count).toBe('invalid_number');
    });

    it('should handle special characters in ship and crew names', async () => {
      const specialCharShip = {
        id: 1,
        name: 'The "Sírén\'s Call" - Mañana',
        captain_name: 'José "El Capitán" García'
      };

      const specialCharCrew = [
        { id: 1, name: 'François "Le Terrible" Dubois', ship_position: 'captain' },
        { id: 2, name: 'María del Pilar Sánchez', ship_position: 'first mate' }
      ];

      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [specialCharShip] })
        .mockResolvedValueOnce({ rows: specialCharCrew });

      const result = await Ship.getWithCrew(1);

      expect(result.name).toBe('The "Sírén\'s Call" - Mañana');
      expect(result.crew[0].name).toBe('François "Le Terrible" Dubois');
      expect(result.crew[1].name).toBe('María del Pilar Sánchez');
    });
  });

  describe('Query Optimization', () => {
    it('should use efficient JOIN in getAllWithCrewCount', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      await Ship.getAllWithCrewCount();

      const query = dbUtils.executeQuery.mock.calls[0][0];
      expect(query).toContain('LEFT JOIN'); // Ensures all ships are included
      expect(query).toContain('GROUP BY s.id'); // Proper grouping
      expect(query).toContain('COUNT(CASE WHEN'); // Conditional counting
    });

    it('should make minimal database calls in getWithCrew', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockShipData] })
        .mockResolvedValueOnce({ rows: mockCrewData });

      await Ship.getWithCrew(1);

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2); // Exactly 2 queries
    });

    it('should optimize crew ordering query', async () => {
      dbUtils.executeQuery
        .mockResolvedValueOnce({ rows: [mockShipData] })
        .mockResolvedValueOnce({ rows: mockCrewData });

      await Ship.getWithCrew(1);

      const crewQuery = dbUtils.executeQuery.mock.calls[1][0];
      // Check for efficient ordering that puts officers first
      expect(crewQuery).toContain('CASE ship_position');
      expect(crewQuery).toContain('ORDER BY');
    });
  });
});