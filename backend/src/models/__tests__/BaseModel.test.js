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
  getMany: jest.fn(),
  updateById: jest.fn(),
  deleteById: jest.fn(),
  rowExists: jest.fn(),
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
      fields: ['id', 'name', 'status'],
      timestamps: { createdAt: false, updatedAt: false }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should fetch all records from table', async () => {
      const mockData = [
        { id: 1, name: 'Test 1' },
        { id: 2, name: 'Test 2' }
      ];

      dbUtils.getMany.mockResolvedValue({
        rows: mockData,
        count: 2
      });

      const result = await TestModel.findAll();

      expect(dbUtils.getMany).toHaveBeenCalledWith('test_table', {});
      expect(result).toEqual(mockData);
    });

    it('should pass options to dbUtils.getMany', async () => {
      const mockData = [{ id: 1, name: 'Test 1' }];
      const options = { limit: 10, offset: 0 };

      dbUtils.getMany.mockResolvedValue({
        rows: mockData,
        count: 1
      });

      const result = await TestModel.findAll(options);

      expect(dbUtils.getMany).toHaveBeenCalledWith('test_table', options);
      expect(result).toEqual(mockData);
    });
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

  describe('exists', () => {
    it('should return true if record exists', async () => {
      dbUtils.rowExists.mockResolvedValue(true);

      const result = await TestModel.exists('name', 'Test');

      expect(dbUtils.rowExists).toHaveBeenCalledWith('test_table', 'name', 'Test');
      expect(result).toBe(true);
    });

    it('should return false if record does not exist', async () => {
      dbUtils.rowExists.mockResolvedValue(false);

      const result = await TestModel.exists('name', 'NonExistent');

      expect(result).toBe(false);
    });
  });

  describe('query', () => {
    it('should execute custom query', async () => {
      const mockData = { rows: [{ id: 1, total: 100 }] };

      dbUtils.executeQuery.mockResolvedValue(mockData);

      const result = await TestModel.query(
        'SELECT id, SUM(amount) as total FROM test_table GROUP BY id',
        []
      );

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        'SELECT id, SUM(amount) as total FROM test_table GROUP BY id',
        []
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('transaction', () => {
    it('should execute callback within transaction', async () => {
      const mockResult = { id: 1, name: 'Test' };

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        return await callback();
      });

      const result = await TestModel.transaction(async () => {
        return mockResult;
      });

      expect(dbUtils.executeTransaction).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });

    it('should forward the callback to dbUtils.executeTransaction', async () => {
      const callback = async () => 'done';

      dbUtils.executeTransaction.mockResolvedValue('done');

      await TestModel.transaction(callback);

      expect(dbUtils.executeTransaction).toHaveBeenCalledWith(callback);
    });
  });

  describe('constructor', () => {
    it('should set default values for optional properties', async () => {
      const MinimalModel = new BaseModel({
        tableName: 'minimal_table'
      });

      expect(MinimalModel.tableName).toBe('minimal_table');
      expect(MinimalModel.primaryKey).toBe('id');
      expect(MinimalModel.fields).toEqual([]);
      expect(MinimalModel.timestamps).toEqual({ createdAt: false, updatedAt: false });
    });

    it('should use provided configuration values', async () => {
      const CustomModel = new BaseModel({
        tableName: 'custom_table',
        primaryKey: 'uuid',
        fields: ['uuid', 'title', 'description'],
        timestamps: { createdAt: true, updatedAt: true }
      });

      expect(CustomModel.tableName).toBe('custom_table');
      expect(CustomModel.primaryKey).toBe('uuid');
      expect(CustomModel.fields).toEqual(['uuid', 'title', 'description']);
      expect(CustomModel.timestamps).toEqual({ createdAt: true, updatedAt: true });
    });
  });
});