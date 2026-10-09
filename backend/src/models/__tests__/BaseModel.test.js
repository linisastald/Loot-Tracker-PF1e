/**
 * Unit tests for BaseModel
 * Tests the base database model that all other models inherit from
 */

const dbUtils = require('../../utils/dbUtils');

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: jest.fn(),
  executeTransaction: jest.fn(),
  insert: jest.fn(),
  getById: jest.fn(),
  updateById: jest.fn(),
  deleteById: jest.fn(),
}));

// Must require after mocks are set up
const BaseModel = require('../BaseModel');

describe('BaseModel', () => {
  let TestModel;

  beforeAll(() => {
    // Create a test model that extends BaseModel
    TestModel = new BaseModel({
      tableName: 'test_table',
      primaryKey: 'id',
      timestamps: { createdAt: false, updatedAt: false }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should find record by primary key', async () => {
      const mockData = { id: 1, name: 'Test Item' };

      dbUtils.getById.mockResolvedValue(mockData);

      const result = await TestModel.findById(1);

      expect(dbUtils.getById).toHaveBeenCalledWith('test_table', 1, 'id');
      expect(result).toEqual(mockData);
    });

    it('should return null if record not found', async () => {
      dbUtils.getById.mockResolvedValue(null);

      const result = await TestModel.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should insert new record and return it', async () => {
      const newData = { name: 'New Item', status: 'pending' };
      const mockCreated = { id: 3, ...newData };

      dbUtils.insert.mockResolvedValue(mockCreated);

      const result = await TestModel.create(newData);

      expect(dbUtils.insert).toHaveBeenCalledWith('test_table', newData);
      expect(result).toEqual(mockCreated);
    });

    it('should add timestamps if configured', async () => {
      // Create a model with timestamps enabled
      const TimestampModel = new BaseModel({
        tableName: 'timestamped_table',
        primaryKey: 'id',
        timestamps: { createdAt: true, updatedAt: true }
      });

      const newData = { name: 'New Item' };
      const mockCreated = { id: 1, name: 'New Item' };

      dbUtils.insert.mockResolvedValue(mockCreated);

      await TimestampModel.create(newData);

      expect(dbUtils.insert).toHaveBeenCalledWith('timestamped_table', {
        name: 'New Item',
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      });
    });
  });

  describe('update', () => {
    it('should update record by id', async () => {
      const updateData = { name: 'Updated Name', status: 'active' };
      const mockUpdated = { id: 1, ...updateData };

      dbUtils.updateById.mockResolvedValue(mockUpdated);

      const result = await TestModel.update(1, updateData);

      expect(dbUtils.updateById).toHaveBeenCalledWith('test_table', 1, updateData, 'id');
      expect(result).toEqual(mockUpdated);
    });

    it('should add updated timestamp if configured', async () => {
      // Create a model with timestamps enabled
      const TimestampModel = new BaseModel({
        tableName: 'timestamped_table',
        primaryKey: 'id',
        timestamps: { createdAt: false, updatedAt: true }
      });

      const updateData = { name: 'Updated Name' };
      const mockUpdated = { id: 1, name: 'Updated Name' };

      dbUtils.updateById.mockResolvedValue(mockUpdated);

      await TimestampModel.update(1, updateData);

      expect(dbUtils.updateById).toHaveBeenCalledWith('timestamped_table', 1, {
        name: 'Updated Name',
        updated_at: expect.any(Date)
      }, 'id');
    });

    it('should return null if record not found', async () => {
      dbUtils.updateById.mockResolvedValue(null);

      const result = await TestModel.update(999, { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete record by id', async () => {
      dbUtils.deleteById.mockResolvedValue(true);

      const result = await TestModel.delete(1);

      expect(dbUtils.deleteById).toHaveBeenCalledWith('test_table', 1, 'id');
      expect(result).toBe(true);
    });

    it('should return false if record not found', async () => {
      dbUtils.deleteById.mockResolvedValue(false);

      const result = await TestModel.delete(999);

      expect(result).toBe(false);
    });
  });

  describe('constructor', () => {
    it('should set default values for optional properties', async () => {
      const MinimalModel = new BaseModel({
        tableName: 'minimal_table'
      });

      expect(MinimalModel.tableName).toBe('minimal_table');
      expect(MinimalModel.primaryKey).toBe('id');
      expect(MinimalModel.timestamps).toEqual({ createdAt: false, updatedAt: false });
    });

    it('should use provided configuration values', async () => {
      const CustomModel = new BaseModel({
        tableName: 'custom_table',
        primaryKey: 'uuid',
        timestamps: { createdAt: true, updatedAt: true }
      });

      expect(CustomModel.tableName).toBe('custom_table');
      expect(CustomModel.primaryKey).toBe('uuid');
      expect(CustomModel.timestamps).toEqual({ createdAt: true, updatedAt: true });
    });
  });
});