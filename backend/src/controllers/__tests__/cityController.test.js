/**
 * Unit tests for cityController
 * Only GET /cities exists: cities are created implicitly through
 * City.getOrCreate (item search / spellcasting), never by direct CRUD.
 */

jest.mock('../../models/City');
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const City = require('../../models/City');
const cityController = require('../cityController');

function createMockRes() {
  return {
    success: jest.fn(),
    error: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

describe('cityController', () => {
  it('exposes only the read handler (the CRUD endpoints were removed)', () => {
    expect(Object.keys(cityController)).toEqual(['getAllCities']);
  });

  describe('getAllCities', () => {
    it('should return all cities', async () => {
      const mockCities = [
        { id: 1, name: 'Sandpoint', size: 'Small Town' },
        { id: 2, name: 'Magnimar', size: 'Metropolis' },
      ];
      const res = createMockRes();
      City.getAll.mockResolvedValue(mockCities);

      await cityController.getAllCities({ user: { id: 1 } }, res);

      expect(City.getAll).toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(mockCities, 'Cities retrieved successfully');
    });

    it('should return empty array when no cities exist', async () => {
      const res = createMockRes();
      City.getAll.mockResolvedValue([]);

      await cityController.getAllCities({ user: { id: 1 } }, res);

      expect(res.success).toHaveBeenCalledWith([], 'Cities retrieved successfully');
    });

    it('reports a server error when the query fails', async () => {
      const res = createMockRes();
      City.getAll.mockRejectedValue(new Error('db down'));

      await cityController.getAllCities({ user: { id: 1 } }, res);

      expect(res.success).not.toHaveBeenCalled();
      expect(res.error).toHaveBeenCalled();
    });
  });
});
