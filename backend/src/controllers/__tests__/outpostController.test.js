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
const { createMockRes, createMockReq } = require('../../../tests/utils/mockHttp');

describe('outpostController', () => {
  beforeEach(() => jest.clearAllMocks());

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

    it('should reject a blank or non-string name', async () => {
      const res = createMockRes();
      await outpostController.createOutpost(createMockReq({ body: { name: '  ' } }), res);
      await outpostController.createOutpost(createMockReq({ body: { name: 5 } }), res);
      expect(res.validationError).toHaveBeenCalledTimes(2);
      expect(Outpost.create).not.toHaveBeenCalled();
    });

    it('should reject an invalid access date', async () => {
      const res = createMockRes();
      await outpostController.createOutpost(
        createMockReq({ body: { name: 'Fort', access_date: 'tomorrow' } }), res
      );
      expect(res.validationError).toHaveBeenCalledWith('Access date must be a valid date (YYYY-MM-DD)');
      expect(Outpost.create).not.toHaveBeenCalled();
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
  // updateOutpost
  // -------------------------------------------------------------------
  describe('updateOutpost', () => {
    it('should update an outpost successfully', async () => {
      const updateData = { name: 'Fort Rannick (Reclaimed)', location: 'Hook Mountain' };
      const req = createMockReq({ params: { id: '1' }, body: updateData });
      const res = createMockRes();

      Outpost.update.mockResolvedValue({ id: 1, ...updateData });

      await outpostController.updateOutpost(req, res);

      expect(Outpost.update).toHaveBeenCalledWith(1, updateData);
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

    it('only passes the fields that were sent (partial update)', async () => {
      const req = createMockReq({ params: { id: '1' }, body: { location: 'Moved' } });
      const res = createMockRes();
      Outpost.update.mockResolvedValue({ id: 1, name: 'Fort', location: 'Moved' });

      await outpostController.updateOutpost(req, res);

      expect(Outpost.update).toHaveBeenCalledWith(1, { location: 'Moved' });
    });

    it('rejects a blank name', async () => {
      const req = createMockReq({ params: { id: '1' }, body: { name: '   ' } });
      const res = createMockRes();
      await outpostController.updateOutpost(req, res);
      expect(res.validationError).toHaveBeenCalledWith('Outpost name is required');
      expect(Outpost.update).not.toHaveBeenCalled();
    });

    it('rejects an invalid access date', async () => {
      const req = createMockReq({ params: { id: '1' }, body: { access_date: '2024-02-31' } });
      const res = createMockRes();
      await outpostController.updateOutpost(req, res);
      expect(res.validationError).toHaveBeenCalledWith('Access date must be a valid date (YYYY-MM-DD)');
    });

    it('accepts an ISO timestamp by keeping its date part', async () => {
      const req = createMockReq({ params: { id: '1' }, body: { access_date: '2024-05-10T00:00:00.000Z' } });
      const res = createMockRes();
      Outpost.update.mockResolvedValue({ id: 1, name: 'Fort' });
      await outpostController.updateOutpost(req, res);
      expect(Outpost.update).toHaveBeenCalledWith(1, { access_date: '2024-05-10' });
    });

    it('rejects a non-numeric id with a 400 instead of a database error', async () => {
      const req = createMockReq({ params: { id: 'abc' }, body: { name: 'X' } });
      const res = createMockRes();
      await outpostController.updateOutpost(req, res);
      expect(res.validationError).toHaveBeenCalled();
      expect(Outpost.update).not.toHaveBeenCalled();
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

      expect(Outpost.delete).toHaveBeenCalledWith(1);
      expect(res.success).toHaveBeenCalledWith(null, 'Outpost deleted successfully');
    });

    it('should return 404 when deleting non-existent outpost', async () => {
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();

      Outpost.delete.mockResolvedValue(false);

      await outpostController.deleteOutpost(req, res);

      expect(res.notFound).toHaveBeenCalledWith('Outpost not found');
    });

    it('rejects a non-numeric id', async () => {
      const req = createMockReq({ params: { id: 'abc' } });
      const res = createMockRes();
      await outpostController.deleteOutpost(req, res);
      expect(res.validationError).toHaveBeenCalled();
      expect(Outpost.delete).not.toHaveBeenCalled();
    });
  });
});
