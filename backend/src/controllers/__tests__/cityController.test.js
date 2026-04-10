/**
 * Unit tests for cityController
 * Tests CRUD operations, search, and settlement size configuration
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

const validSizes = ['Thorp', 'Hamlet', 'Village', 'Small Town', 'Large Town', 'Small City', 'Large City', 'Metropolis'];

describe('cityController', () => {
  beforeEach(() => {
    // getValidSizes is called by create/update validation
    City.getValidSizes.mockReturnValue(validSizes);
  });

  // -------------------------------------------------------------------
  // getAllCities
  // -------------------------------------------------------------------
  describe('getAllCities', () => {
    it('should return all cities', async () => {
      const mockCities = [
        { id: 1, name: 'Sandpoint', size: 'Small Town' },
        { id: 2, name: 'Magnimar', size: 'Metropolis' },
      ];
      const req = createMockReq();
      const res = createMockRes();

      City.getAll.mockResolvedValue(mockCities);

      await cityController.getAllCities(req, res);

      expect(City.getAll).toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(mockCities, 'Cities retrieved successfully');
    });

    it('should return empty array when no cities exist', async () => {
      const req = createMockReq();
      const res = createMockRes();

      City.getAll.mockResolvedValue([]);

      await cityController.getAllCities(req, res);

      expect(res.success).toHaveBeenCalledWith([], 'Cities retrieved successfully');
    });
  });

  // -------------------------------------------------------------------
  // getCityById
  // -------------------------------------------------------------------
  describe('getCityById', () => {
    it('should return a city when found', async () => {
      const mockCity = { id: 1, name: 'Sandpoint', size: 'Small Town', base_value: 1000 };
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      City.findById.mockResolvedValue(mockCity);

      await cityController.getCityById(req, res);

      expect(City.findById).toHaveBeenCalledWith('1');
      expect(res.success).toHaveBeenCalledWith(mockCity, 'City retrieved successfully');
    });

    it('should return 404 when city not found', async () => {
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();

      City.findById.mockResolvedValue(null);

      await cityController.getCityById(req, res);

      expect(res.notFound).toHaveBeenCalledWith('City not found');
    });
  });

  // -------------------------------------------------------------------
  // searchCities
  // -------------------------------------------------------------------
  describe('searchCities', () => {
    it('should return matching cities for valid search query', async () => {
      const mockCities = [{ id: 1, name: 'Sandpoint', size: 'Small Town' }];
      const req = createMockReq({ query: { q: 'Sand' } });
      const res = createMockRes();

      City.search.mockResolvedValue(mockCities);

      await cityController.searchCities(req, res);

      expect(City.search).toHaveBeenCalledWith('Sand');
      expect(res.success).toHaveBeenCalledWith(mockCities, 'Found 1 cities');
    });

    it('should return empty array when search query is too short', async () => {
      const req = createMockReq({ query: { q: 'S' } });
      const res = createMockRes();

      await cityController.searchCities(req, res);

      expect(City.search).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith([], 'Search query too short');
    });

    it('should return empty array when no search query provided', async () => {
      const req = createMockReq({ query: {} });
      const res = createMockRes();

      await cityController.searchCities(req, res);

      expect(City.search).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith([], 'Search query too short');
    });

    it('should trim whitespace from search query', async () => {
      const req = createMockReq({ query: { q: '  Magnimar  ' } });
      const res = createMockRes();

      City.search.mockResolvedValue([]);

      await cityController.searchCities(req, res);

      expect(City.search).toHaveBeenCalledWith('Magnimar');
    });
  });

  // -------------------------------------------------------------------
  // createCity
  // -------------------------------------------------------------------
  describe('createCity', () => {
    it('should create a city with valid data', async () => {
      const req = createMockReq({
        body: { name: 'Sandpoint', size: 'Small Town', population: 1240, region: 'Varisia', alignment: 'NG' },
      });
      const res = createMockRes();

      City.findByName.mockResolvedValue(null); // no duplicate
      City.create.mockResolvedValue({
        id: 1, name: 'Sandpoint', size: 'Small Town',
        population: 1240, region: 'Varisia', alignment: 'NG',
      });

      await cityController.createCity(req, res);

      expect(City.findByName).toHaveBeenCalledWith('Sandpoint');
      expect(City.create).toHaveBeenCalledWith({
        name: 'Sandpoint', size: 'Small Town',
        population: 1240, region: 'Varisia', alignment: 'NG',
      });
      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, name: 'Sandpoint' }),
        'City created successfully'
      );
    });

    it('should reject creation when name is missing', async () => {
      const req = createMockReq({ body: { size: 'Small Town' } });
      const res = createMockRes();

      await cityController.createCity(req, res);

      expect(res.validationError).toHaveBeenCalledWith('City name is required');
    });

    it('should reject creation when name is empty string', async () => {
      const req = createMockReq({ body: { name: '   ', size: 'Small Town' } });
      const res = createMockRes();

      await cityController.createCity(req, res);

      expect(res.validationError).toHaveBeenCalledWith('City name is required');
    });

    it('should reject creation when size is missing', async () => {
      const req = createMockReq({ body: { name: 'Sandpoint' } });
      const res = createMockRes();

      await cityController.createCity(req, res);

      expect(res.validationError).toHaveBeenCalledWith('City size is required');
    });

    it('should reject creation with invalid size', async () => {
      const req = createMockReq({ body: { name: 'Sandpoint', size: 'Mega City' } });
      const res = createMockRes();

      await cityController.createCity(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid city size')
      );
    });

    it('should reject creation when city name already exists', async () => {
      const req = createMockReq({ body: { name: 'Sandpoint', size: 'Small Town' } });
      const res = createMockRes();

      City.findByName.mockResolvedValue({ id: 1, name: 'Sandpoint' });

      await cityController.createCity(req, res);

      expect(res.validationError).toHaveBeenCalledWith('A city with this name already exists');
    });

    it('should trim city name before creating', async () => {
      const req = createMockReq({ body: { name: '  Sandpoint  ', size: 'Small Town' } });
      const res = createMockRes();

      City.findByName.mockResolvedValue(null);
      City.create.mockResolvedValue({ id: 1, name: 'Sandpoint', size: 'Small Town' });

      await cityController.createCity(req, res);

      expect(City.findByName).toHaveBeenCalledWith('Sandpoint');
      expect(City.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Sandpoint' })
      );
    });
  });

  // -------------------------------------------------------------------
  // updateCity
  // -------------------------------------------------------------------
  describe('updateCity', () => {
    it('should update a city successfully', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { name: 'Sandpoint', size: 'Large Town', population: 2500, region: 'Varisia', alignment: 'NG' },
      });
      const res = createMockRes();

      City.findById.mockResolvedValue({ id: 1, name: 'Sandpoint', size: 'Small Town' });
      City.update.mockResolvedValue({ id: 1, name: 'Sandpoint', size: 'Large Town', population: 2500 });

      await cityController.updateCity(req, res);

      expect(City.findById).toHaveBeenCalledWith('1');
      expect(City.update).toHaveBeenCalledWith('1', expect.objectContaining({ size: 'Large Town' }));
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ size: 'Large Town' }),
        'City updated successfully'
      );
    });

    it('should return 404 when updating non-existent city', async () => {
      const req = createMockReq({
        params: { id: '999' },
        body: { name: 'Ghost Town', size: 'Small Town' },
      });
      const res = createMockRes();

      City.findById.mockResolvedValue(null);

      await cityController.updateCity(req, res);

      expect(res.notFound).toHaveBeenCalledWith('City not found');
    });

    it('should reject update when name is empty', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { name: '', size: 'Small Town' },
      });
      const res = createMockRes();

      City.findById.mockResolvedValue({ id: 1, name: 'Sandpoint' });

      await cityController.updateCity(req, res);

      expect(res.validationError).toHaveBeenCalledWith('City name is required');
    });

    it('should reject update with invalid size', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { name: 'Sandpoint', size: 'Invalid Size' },
      });
      const res = createMockRes();

      City.findById.mockResolvedValue({ id: 1, name: 'Sandpoint' });

      await cityController.updateCity(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid city size')
      );
    });

    it('should reject update when size is missing', async () => {
      const req = createMockReq({
        params: { id: '1' },
        body: { name: 'Sandpoint' },
      });
      const res = createMockRes();

      City.findById.mockResolvedValue({ id: 1, name: 'Sandpoint' });

      await cityController.updateCity(req, res);

      expect(res.validationError).toHaveBeenCalledWith('City size is required');
    });
  });

  // -------------------------------------------------------------------
  // deleteCity
  // -------------------------------------------------------------------
  describe('deleteCity', () => {
    it('should delete a city successfully', async () => {
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      City.findById.mockResolvedValue({ id: 1, name: 'Sandpoint' });
      City.delete.mockResolvedValue(true);

      await cityController.deleteCity(req, res);

      expect(City.delete).toHaveBeenCalledWith('1');
      expect(res.success).toHaveBeenCalledWith(null, 'City deleted successfully');
    });

    it('should return 404 when deleting non-existent city', async () => {
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();

      City.findById.mockResolvedValue(null);

      await cityController.deleteCity(req, res);

      expect(res.notFound).toHaveBeenCalledWith('City not found');
    });
  });

  // -------------------------------------------------------------------
  // getSettlementSizes
  // -------------------------------------------------------------------
  describe('getSettlementSizes', () => {
    it('should return settlement size configuration', async () => {
      const mockSizes = {
        'Thorp': { baseValue: 50 },
        'Metropolis': { baseValue: 16000 },
      };
      const req = createMockReq();
      const res = createMockRes();

      City.getSettlementSizes.mockReturnValue(mockSizes);

      await cityController.getSettlementSizes(req, res);

      expect(City.getSettlementSizes).toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(mockSizes, 'Settlement sizes retrieved');
    });
  });
});
