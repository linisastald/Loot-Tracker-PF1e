/**
 * Tests for BaseModel - Core database operations
 * Tests CRUD operations, transactions, and model configuration
 */

const BaseModel = require('../../../backend/src/models/BaseModel');
const dbUtils = require('../../../backend/src/utils/dbUtils');

// Mock dbUtils
jest.mock('../../../backend/src/utils/dbUtils');

describe('BaseModel', () => {
  let model, mockConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      tableName: 'test_table',
      primaryKey: 'id',
      fields: ['name', 'email', 'status'],
      timestamps: {
        createdAt: true,
        updatedAt: true
      }
    };

    model = new BaseModel(mockConfig);
  });

  describe('Constructor', () => {
    it('should initialize with provided configuration', () => {
      expect(model.tableName).toBe('test_table');
      expect(model.primaryKey).toBe('id');
      expect(model.fields).toEqual(['name', 'email', 'status']);
      expect(model.timestamps).toEqual({
        createdAt: true,
        updatedAt: true
      });
    });

    it('should use default values when not provided', () => {
      const minimalConfig = {
        tableName: 'simple_table'
      };
      
      const simpleModel = new BaseModel(minimalConfig);

      expect(simpleModel.tableName).toBe('simple_table');
      expect(simpleModel.primaryKey).toBe('id');
      expect(simpleModel.fields).toEqual([]);
      expect(simpleModel.timestamps).toEqual({
        createdAt: false,
        updatedAt: false
      });
    });

    it('should handle custom primary key', () => {
      const customConfig = {
        tableName: 'custom_table',
        primaryKey: 'uuid'
      };
      
      const customModel = new BaseModel(customConfig);

      expect(customModel.primaryKey).toBe('uuid');
    });

    it('should handle partial timestamp configuration', () => {
      const partialTimestampConfig = {
        tableName: 'partial_table',
        timestamps: {
          createdAt: true
        }
      };
      
      const partialModel = new BaseModel(partialTimestampConfig);

      expect(partialModel.timestamps).toEqual({
        createdAt: true
      });
    });

    it('should handle empty fields array', () => {
      const emptyFieldsConfig = {
        tableName: 'empty_fields_table',
        fields: []
      };
      
      const emptyFieldsModel = new BaseModel(emptyFieldsConfig);

      expect(emptyFieldsModel.fields).toEqual([]);
    });
  });

  describe('create', () => {
    const mockRecord = {
      id: 1,
      name: 'Test Record',
      email: 'test@example.com',
      status: 'active'
    };

    beforeEach(() => {
      dbUtils.insert.mockResolvedValue(mockRecord);
    });

    it('should create a record with provided data', async () => {
      const inputData = {
        name: 'Test Record',
        email: 'test@example.com',
        status: 'active'
      };

      const result = await model.create(inputData);

      expect(dbUtils.insert).toHaveBeenCalledWith('test_table', {
        ...inputData,
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      });
      expect(result).toBe(mockRecord);
    });

    it('should add created_at timestamp when configured', async () => {
      const inputData = { name: 'Test' };
      
      await model.create(inputData);

      const calledData = dbUtils.insert.mock.calls[0][1];
      expect(calledData.created_at).toBeInstanceOf(Date);
    });

    it('should add updated_at timestamp when configured', async () => {
      const inputData = { name: 'Test' };
      
      await model.create(inputData);

      const calledData = dbUtils.insert.mock.calls[0][1];
      expect(calledData.updated_at).toBeInstanceOf(Date);
    });

    it('should not add timestamps when not configured', async () => {
      const noTimestampModel = new BaseModel({
        tableName: 'no_timestamp_table',
        timestamps: { createdAt: false, updatedAt: false }
      });

      const inputData = { name: 'Test' };
      
      await noTimestampModel.create(inputData);

      const calledData = dbUtils.insert.mock.calls[0][1];
      expect(calledData.created_at).toBeUndefined();
      expect(calledData.updated_at).toBeUndefined();
    });

    it('should handle empty data object', async () => {
      const emptyData = {};
      
      await model.create(emptyData);

      expect(dbUtils.insert).toHaveBeenCalledWith('test_table', {
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      });
    });

    it('should preserve existing data fields', async () => {
      const inputData = {
        name: 'Test Record',
        email: 'test@example.com',
        status: 'active',
        customField: 'custom value'
      };

      await model.create(inputData);

      const calledData = dbUtils.insert.mock.calls[0][1];
      expect(calledData.name).toBe('Test Record');
      expect(calledData.email).toBe('test@example.com');
      expect(calledData.status).toBe('active');
      expect(calledData.customField).toBe('custom value');
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      dbUtils.insert.mockRejectedValue(dbError);

      const inputData = { name: 'Test' };

      await expect(model.create(inputData)).rejects.toThrow('Database connection failed');
    });

    it('should not mutate original data object', async () => {
      const inputData = { name: 'Test Record' };
      const originalData = { ...inputData };

      await model.create(inputData);

      expect(inputData).toEqual(originalData);
      expect(inputData.created_at).toBeUndefined();
      expect(inputData.updated_at).toBeUndefined();
    });
  });

  describe('findById', () => {
    const mockRecord = {
      id: 1,
      name: 'Found Record',
      email: 'found@example.com'
    };

    beforeEach(() => {
      dbUtils.getById.mockResolvedValue(mockRecord);
    });

    it('should find a record by ID', async () => {
      const result = await model.findById(1);

      expect(dbUtils.getById).toHaveBeenCalledWith('test_table', 1, 'id');
      expect(result).toBe(mockRecord);
    });

    it('should handle string IDs', async () => {
      await model.findById('123');

      expect(dbUtils.getById).toHaveBeenCalledWith('test_table', '123', 'id');
    });

    it('should use custom primary key', async () => {
      const customModel = new BaseModel({
        tableName: 'custom_table',
        primaryKey: 'uuid'
      });

      await customModel.findById('uuid-123');

      expect(dbUtils.getById).toHaveBeenCalledWith('custom_table', 'uuid-123', 'uuid');
    });

    it('should handle record not found', async () => {
      dbUtils.getById.mockResolvedValue(null);

      const result = await model.findById(999);

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database query failed');
      dbUtils.getById.mockRejectedValue(dbError);

      await expect(model.findById(1)).rejects.toThrow('Database query failed');
    });

    it('should handle undefined ID', async () => {
      await model.findById(undefined);

      expect(dbUtils.getById).toHaveBeenCalledWith('test_table', undefined, 'id');
    });

    it('should handle null ID', async () => {
      await model.findById(null);

      expect(dbUtils.getById).toHaveBeenCalledWith('test_table', null, 'id');
    });
  });

  describe('findAll', () => {
    const mockRecords = [
      { id: 1, name: 'Record 1' },
      { id: 2, name: 'Record 2' },
      { id: 3, name: 'Record 3' }
    ];

    beforeEach(() => {
      dbUtils.getMany.mockResolvedValue({ rows: mockRecords });
    });

    it('should find all records without options', async () => {
      const result = await model.findAll();

      expect(dbUtils.getMany).toHaveBeenCalledWith('test_table', {});
      expect(result).toBe(mockRecords);
    });

    it('should pass options to dbUtils.getMany', async () => {
      const options = {
        limit: 10,
        offset: 5,
        orderBy: 'name ASC',
        where: { status: 'active' }
      };

      const result = await model.findAll(options);

      expect(dbUtils.getMany).toHaveBeenCalledWith('test_table', options);
      expect(result).toBe(mockRecords);
    });

    it('should handle empty results', async () => {
      dbUtils.getMany.mockResolvedValue({ rows: [] });

      const result = await model.findAll();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database query failed');
      dbUtils.getMany.mockRejectedValue(dbError);

      await expect(model.findAll()).rejects.toThrow('Database query failed');
    });

    it('should handle limit option', async () => {
      const options = { limit: 5 };

      await model.findAll(options);

      expect(dbUtils.getMany).toHaveBeenCalledWith('test_table', options);
    });

    it('should handle offset option', async () => {
      const options = { offset: 10 };

      await model.findAll(options);

      expect(dbUtils.getMany).toHaveBeenCalledWith('test_table', options);
    });

    it('should handle orderBy option', async () => {
      const options = { orderBy: 'created_at DESC' };

      await model.findAll(options);

      expect(dbUtils.getMany).toHaveBeenCalledWith('test_table', options);
    });

    it('should handle where option', async () => {
      const options = { where: { status: 'active', type: 'premium' } };

      await model.findAll(options);

      expect(dbUtils.getMany).toHaveBeenCalledWith('test_table', options);
    });

    it('should handle complex options', async () => {
      const options = {
        limit: 20,
        offset: 40,
        orderBy: 'name ASC, created_at DESC',
        where: { status: 'active', category: 'important' }
      };

      await model.findAll(options);

      expect(dbUtils.getMany).toHaveBeenCalledWith('test_table', options);
    });
  });

  describe('update', () => {
    const mockUpdatedRecord = {
      id: 1,
      name: 'Updated Record',
      email: 'updated@example.com',
      status: 'modified'
    };

    beforeEach(() => {
      dbUtils.updateById.mockResolvedValue(mockUpdatedRecord);
    });

    it('should update a record with provided data', async () => {
      const updateData = {
        name: 'Updated Record',
        email: 'updated@example.com'
      };

      const result = await model.update(1, updateData);

      expect(dbUtils.updateById).toHaveBeenCalledWith('test_table', 1, {
        ...updateData,
        updated_at: expect.any(Date)
      }, 'id');
      expect(result).toBe(mockUpdatedRecord);
    });

    it('should add updated_at timestamp when configured', async () => {
      const updateData = { name: 'Updated' };
      
      await model.update(1, updateData);

      const calledData = dbUtils.updateById.mock.calls[0][2];
      expect(calledData.updated_at).toBeInstanceOf(Date);
    });

    it('should not add updated_at timestamp when not configured', async () => {
      const noTimestampModel = new BaseModel({
        tableName: 'no_timestamp_table',
        timestamps: { createdAt: false, updatedAt: false }
      });

      const updateData = { name: 'Updated' };
      
      await noTimestampModel.update(1, updateData);

      const calledData = dbUtils.updateById.mock.calls[0][2];
      expect(calledData.updated_at).toBeUndefined();
    });

    it('should use custom primary key', async () => {
      const customModel = new BaseModel({
        tableName: 'custom_table',
        primaryKey: 'uuid'
      });

      const updateData = { name: 'Updated' };
      
      await customModel.update('uuid-123', updateData);

      expect(dbUtils.updateById).toHaveBeenCalledWith('custom_table', 'uuid-123', expect.any(Object), 'uuid');
    });

    it('should handle empty update data', async () => {
      const emptyData = {};
      
      await model.update(1, emptyData);

      expect(dbUtils.updateById).toHaveBeenCalledWith('test_table', 1, {
        updated_at: expect.any(Date)
      }, 'id');
    });

    it('should handle record not found', async () => {
      dbUtils.updateById.mockResolvedValue(null);

      const result = await model.update(999, { name: 'Updated' });

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database update failed');
      dbUtils.updateById.mockRejectedValue(dbError);

      await expect(model.update(1, { name: 'Updated' })).rejects.toThrow('Database update failed');
    });

    it('should not mutate original data object', async () => {
      const updateData = { name: 'Updated Record' };
      const originalData = { ...updateData };

      await model.update(1, updateData);

      expect(updateData).toEqual(originalData);
      expect(updateData.updated_at).toBeUndefined();
    });

    it('should preserve all data fields', async () => {
      const updateData = {
        name: 'Updated Record',
        email: 'updated@example.com',
        status: 'modified',
        customField: 'custom value'
      };

      await model.update(1, updateData);

      const calledData = dbUtils.updateById.mock.calls[0][2];
      expect(calledData.name).toBe('Updated Record');
      expect(calledData.email).toBe('updated@example.com');
      expect(calledData.status).toBe('modified');
      expect(calledData.customField).toBe('custom value');
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      dbUtils.deleteById.mockResolvedValue(true);
    });

    it('should delete a record by ID', async () => {
      const result = await model.delete(1);

      expect(dbUtils.deleteById).toHaveBeenCalledWith('test_table', 1, 'id');
      expect(result).toBe(true);
    });

    it('should handle string IDs', async () => {
      await model.delete('123');

      expect(dbUtils.deleteById).toHaveBeenCalledWith('test_table', '123', 'id');
    });

    it('should use custom primary key', async () => {
      const customModel = new BaseModel({
        tableName: 'custom_table',
        primaryKey: 'uuid'
      });

      await customModel.delete('uuid-123');

      expect(dbUtils.deleteById).toHaveBeenCalledWith('custom_table', 'uuid-123', 'uuid');
    });

    it('should handle record not found', async () => {
      dbUtils.deleteById.mockResolvedValue(false);

      const result = await model.delete(999);

      expect(result).toBe(false);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database delete failed');
      dbUtils.deleteById.mockRejectedValue(dbError);

      await expect(model.delete(1)).rejects.toThrow('Database delete failed');
    });

    it('should handle undefined ID', async () => {
      await model.delete(undefined);

      expect(dbUtils.deleteById).toHaveBeenCalledWith('test_table', undefined, 'id');
    });

    it('should handle null ID', async () => {
      await model.delete(null);

      expect(dbUtils.deleteById).toHaveBeenCalledWith('test_table', null, 'id');
    });
  });

  describe('exists', () => {
    beforeEach(() => {
      dbUtils.rowExists.mockResolvedValue(true);
    });

    it('should check if a record exists', async () => {
      const result = await model.exists('email', 'test@example.com');

      expect(dbUtils.rowExists).toHaveBeenCalledWith('test_table', 'email', 'test@example.com');
      expect(result).toBe(true);
    });

    it('should handle record does not exist', async () => {
      dbUtils.rowExists.mockResolvedValue(false);

      const result = await model.exists('email', 'nonexistent@example.com');

      expect(result).toBe(false);
    });

    it('should handle different column types', async () => {
      await model.exists('id', 123);
      expect(dbUtils.rowExists).toHaveBeenCalledWith('test_table', 'id', 123);

      await model.exists('status', 'active');
      expect(dbUtils.rowExists).toHaveBeenCalledWith('test_table', 'status', 'active');

      await model.exists('is_verified', true);
      expect(dbUtils.rowExists).toHaveBeenCalledWith('test_table', 'is_verified', true);
    });

    it('should handle null values', async () => {
      await model.exists('deleted_at', null);

      expect(dbUtils.rowExists).toHaveBeenCalledWith('test_table', 'deleted_at', null);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database query failed');
      dbUtils.rowExists.mockRejectedValue(dbError);

      await expect(model.exists('email', 'test@example.com')).rejects.toThrow('Database query failed');
    });
  });

  describe('query', () => {
    const mockQueryResult = {
      rows: [
        { id: 1, name: 'Query Result 1' },
        { id: 2, name: 'Query Result 2' }
      ],
      rowCount: 2
    };

    beforeEach(() => {
      dbUtils.executeQuery.mockResolvedValue(mockQueryResult);
    });

    it('should execute custom query without parameters', async () => {
      const sqlQuery = 'SELECT * FROM test_table WHERE status = \'active\'';

      const result = await model.query(sqlQuery);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(sqlQuery, []);
      expect(result).toBe(mockQueryResult);
    });

    it('should execute custom query with parameters', async () => {
      const sqlQuery = 'SELECT * FROM test_table WHERE status = $1 AND created_at > $2';
      const params = ['active', '2023-01-01'];

      const result = await model.query(sqlQuery, params);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(sqlQuery, params);
      expect(result).toBe(mockQueryResult);
    });

    it('should handle complex queries', async () => {
      const complexQuery = `
        SELECT t1.*, t2.category_name 
        FROM test_table t1 
        LEFT JOIN categories t2 ON t1.category_id = t2.id 
        WHERE t1.status = $1 
        ORDER BY t1.created_at DESC 
        LIMIT $2
      `;
      const params = ['active', 10];

      await model.query(complexQuery, params);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(complexQuery, params);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('SQL syntax error');
      dbUtils.executeQuery.mockRejectedValue(dbError);

      const sqlQuery = 'INVALID SQL QUERY';

      await expect(model.query(sqlQuery)).rejects.toThrow('SQL syntax error');
    });

    it('should handle empty parameters array', async () => {
      const sqlQuery = 'SELECT COUNT(*) FROM test_table';

      await model.query(sqlQuery, []);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(sqlQuery, []);
    });

    it('should handle various parameter types', async () => {
      const sqlQuery = 'SELECT * FROM test_table WHERE id = $1 AND active = $2 AND score > $3';
      const params = [123, true, 95.5];

      await model.query(sqlQuery, params);

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(sqlQuery, params);
    });
  });

  describe('transaction', () => {
    const mockTransactionResult = { success: true, recordsAffected: 3 };

    beforeEach(() => {
      dbUtils.executeTransaction.mockResolvedValue(mockTransactionResult);
    });

    it('should execute transaction with callback', async () => {
      const mockCallback = jest.fn().mockResolvedValue(mockTransactionResult);

      const result = await model.transaction(mockCallback);

      expect(dbUtils.executeTransaction).toHaveBeenCalledWith(mockCallback);
      expect(result).toBe(mockTransactionResult);
    });

    it('should handle transaction rollback', async () => {
      const transactionError = new Error('Transaction failed, rolling back');
      dbUtils.executeTransaction.mockRejectedValue(transactionError);

      const mockCallback = jest.fn();

      await expect(model.transaction(mockCallback)).rejects.toThrow('Transaction failed, rolling back');
    });

    it('should pass through callback result', async () => {
      const callbackResult = { customData: 'test', items: [1, 2, 3] };
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        return await callback();
      });

      const mockCallback = jest.fn().mockResolvedValue(callbackResult);

      const result = await model.transaction(mockCallback);

      expect(result).toBe(callbackResult);
    });

    it('should handle async callback functions', async () => {
      const asyncCallback = async (client) => {
        // Simulate async operations within transaction
        await new Promise(resolve => setTimeout(resolve, 10));
        return { processed: true };
      };

      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        const mockClient = { query: jest.fn() };
        return await callback(mockClient);
      });

      const result = await model.transaction(asyncCallback);

      expect(result).toEqual({ processed: true });
    });

    it('should handle callback errors', async () => {
      const callbackError = new Error('Callback execution failed');
      dbUtils.executeTransaction.mockImplementation(async (callback) => {
        throw callbackError;
      });

      const mockCallback = jest.fn();

      await expect(model.transaction(mockCallback)).rejects.toThrow('Callback execution failed');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing configuration', () => {
      expect(() => new BaseModel({})).not.toThrow();
      
      const emptyModel = new BaseModel({});
      expect(emptyModel.tableName).toBeUndefined();
      expect(emptyModel.primaryKey).toBe('id');
      expect(emptyModel.fields).toEqual([]);
    });

    it('should handle undefined configuration', () => {
      expect(() => new BaseModel(undefined)).toThrow();
    });

    it('should handle null configuration', () => {
      expect(() => new BaseModel(null)).toThrow();
    });

    it('should handle very large datasets', async () => {
      const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
        id: i + 1,
        name: `Record ${i + 1}`
      }));

      dbUtils.getMany.mockResolvedValue({ rows: largeDataset });

      const result = await model.findAll();

      expect(result).toHaveLength(10000);
      expect(result[0]).toEqual({ id: 1, name: 'Record 1' });
      expect(result[9999]).toEqual({ id: 10000, name: 'Record 10000' });
    });

    it('should handle concurrent operations', async () => {
      const mockRecords = [
        { id: 1, name: 'Record 1' },
        { id: 2, name: 'Record 2' },
        { id: 3, name: 'Record 3' }
      ];

      dbUtils.getById.mockImplementation((table, id) => {
        return Promise.resolve(mockRecords.find(r => r.id === id));
      });

      const concurrentPromises = [
        model.findById(1),
        model.findById(2),
        model.findById(3)
      ];

      const results = await Promise.all(concurrentPromises);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ id: 1, name: 'Record 1' });
      expect(results[1]).toEqual({ id: 2, name: 'Record 2' });
      expect(results[2]).toEqual({ id: 3, name: 'Record 3' });
    });

    it('should handle database connection timeouts', async () => {
      const timeoutError = new Error('Connection timeout');
      timeoutError.code = 'ETIMEDOUT';
      dbUtils.getById.mockRejectedValue(timeoutError);

      await expect(model.findById(1)).rejects.toThrow('Connection timeout');
    });

    it('should handle SQL constraint violations', async () => {
      const constraintError = new Error('Unique constraint violation');
      constraintError.code = '23505';
      dbUtils.insert.mockRejectedValue(constraintError);

      await expect(model.create({ email: 'duplicate@example.com' })).rejects.toThrow('Unique constraint violation');
    });

    it('should preserve data types in operations', async () => {
      const complexData = {
        stringField: 'text value',
        numberField: 42,
        booleanField: true,
        dateField: new Date('2023-01-01'),
        nullField: null,
        arrayField: [1, 2, 3],
        objectField: { nested: 'value' }
      };

      await model.create(complexData);

      const calledData = dbUtils.insert.mock.calls[0][1];
      expect(calledData.stringField).toBe('text value');
      expect(calledData.numberField).toBe(42);
      expect(calledData.booleanField).toBe(true);
      expect(calledData.dateField).toEqual(new Date('2023-01-01'));
      expect(calledData.nullField).toBeNull();
      expect(calledData.arrayField).toEqual([1, 2, 3]);
      expect(calledData.objectField).toEqual({ nested: 'value' });
    });
  });
});