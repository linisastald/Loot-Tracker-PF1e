/**
 * Unit tests for outpostController
 * Tests CRUD operations for outpost management
 */

jest.mock('../../models/Outpost');
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const Outpost = require('../../models/Outpost');
const outpostController = require('../outpostController');

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

describe('outpostController', () => {
  // -------------------------------------------------------------------
  // createOutpost
  // -------------------------------------------------------------------
  describe('createOutpost', () => {
    it('should create an outpost with all fields', async () => {
      const req = createMockReq({
        body: { name: 'Fort Rannick', location: 'Hook Mountain', access_date: '4712-03-15' },
      });
      const res = createMockRes();

      Outpost.create.mockResolvedValue({
        id: 1,
        name: 'Fort Rannick',
        location: 'Hook Mountain',
        access_date: '4712-03-15',
      });

      await outpostController.createOutpost(req, res);

      expect(Outpost.create).toHaveBeenCalledWith({
        name: 'Fort Rannick',
        location: 'Hook Mountain',
        access_date: '4712-03-15',
      });
      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, name: 'Fort Rannick' }),
        'Outpost created successfully'
      );
    });

    it('should create an outpost with only name (optional fields null)', async () => {
      const req = createMockReq({ body: { name: 'Thistletop' } });
      const res = createMockRes();

      Outpost.create.mockResolvedValue({ id: 2, name: 'Thistletop', location: null, access_date: null });

      await outpostController.createOutpost(req, res);

      expect(Outpost.create).toHaveBeenCalledWith({
        name: 'Thistletop',
        location: null,
        access_date: null,
      });
      expect(res.created).toHaveBeenCalled();
    });

    it('should reject creation when name is missing', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await outpostController.createOutpost(req, res);

      // The controllerFactory validation for requiredFields catches 'name'
      expect(res.validationError).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // getAllOutposts
  // -------------------------------------------------------------------
  describe('getAllOutposts', () => {
    it('should return all outposts with crew count', async () => {
      const mockOutposts = [
        { id: 1, name: 'Fort Rannick', crew_count: 3 },
        { id: 2, name: 'Thistletop', crew_count: 0 },
      ];
      const req = createMockReq();
      const res = createMockRes();

      Outpost.getAllWithCrewCount.mockResolvedValue(mockOutposts);

      await outpostController.getAllOutposts(req, res);

      expect(Outpost.getAllWithCrewCount).toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        { outposts: mockOutposts, count: 2 },
        'Outposts retrieved successfully'
      );
    });

    it('should return empty array when no outposts exist', async () => {
      const req = createMockReq();
      const res = createMockRes();

      Outpost.getAllWithCrewCount.mockResolvedValue([]);

      await outpostController.getAllOutposts(req, res);

      expect(res.success).toHaveBeenCalledWith(
        { outposts: [], count: 0 },
        'Outposts retrieved successfully'
      );
    });
  });

  // -------------------------------------------------------------------
  // getOutpostById
  // -------------------------------------------------------------------
  describe('getOutpostById', () => {
    it('should return an outpost with crew when found', async () => {
      const mockOutpost = {
        id: 1,
        name: 'Fort Rannick',
        crew: [{ id: 10, name: 'Guard' }],
      };
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      Outpost.getWithCrew.mockResolvedValue(mockOutpost);

      await outpostController.getOutpostById(req, res);

      expect(Outpost.getWithCrew).toHaveBeenCalledWith('1');
      expect(res.success).toHaveBeenCalledWith(mockOutpost, 'Outpost retrieved successfully');
    });

    it('should return 404 when outpost not found', async () => {
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();

      Outpost.getWithCrew.mockResolvedValue(null);

      await outpostController.getOutpostById(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Outpost not found');
    });
  });

  // -------------------------------------------------------------------
  // updateOutpost
  // -------------------------------------------------------------------
  describe('updateOutpost', () => {
    it('should update an outpost successfully', async () => {
      const updateData = { name: 'Fort Rannick (Reclaimed)', location: 'Hook Mountain' };
      const req = createMockReq({ params: { id: '1' }, body: updateData });
      const res = createMockRes();

      Outpost.update.mockResolvedValue({ id: 1, ...updateData });

      await outpostController.updateOutpost(req, res);

      expect(Outpost.update).toHaveBeenCalledWith('1', updateData);
      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, name: 'Fort Rannick (Reclaimed)' }),
        'Outpost updated successfully'
      );
    });

    it('should return 404 when updating non-existent outpost', async () => {
      const req = createMockReq({ params: { id: '999' }, body: { name: 'Ghost Fort' } });
      const res = createMockRes();

      Outpost.update.mockResolvedValue(null);

      await outpostController.updateOutpost(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Outpost not found');
    });
  });

  // -------------------------------------------------------------------
  // deleteOutpost
  // -------------------------------------------------------------------
  describe('deleteOutpost', () => {
    it('should delete an outpost successfully', async () => {
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      Outpost.delete.mockResolvedValue(true);

      await outpostController.deleteOutpost(req, res);

      expect(Outpost.delete).toHaveBeenCalledWith('1');
      expect(res.success).toHaveBeenCalledWith(null, 'Outpost deleted successfully');
    });

    it('should return 404 when deleting non-existent outpost', async () => {
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();

      Outpost.delete.mockResolvedValue(false);

      await outpostController.deleteOutpost(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Outpost not found');
    });
  });
});
