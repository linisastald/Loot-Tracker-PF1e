/**
 * Tests for dbUtils.js - Database utilities
 * Tests SQL injection prevention, CRUD operations, transactions, and validation
 */

const dbUtils = require('../../../backend/src/utils/dbUtils');
const pool = require('../../../backend/src/config/db');
const logger = require('../../../backend/src/utils/logger');

// Mock dependencies
jest.mock('../../../backend/src/config/db');
jest.mock('../../../backend/src/utils/logger');
jest.mock('../../../backend/src/config/constants', () => ({
  DATABASE: {
    SLOW_QUERY_THRESHOLD: 1000
  }
}));

describe('DbUtils', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    pool.connect.mockResolvedValue(mockClient);

    logger.error = jest.fn();
    logger.warn = jest.fn();
    logger.info = jest.fn();
  });

  describe('Validation Functions', () => {
    describe('validateTableName', () => {
      it('should validate allowed table names', () => {
        const allowedTables = ['users', 'characters', 'loot', 'gold'];
        
        allowedTables.forEach(table => {
          expect(() => dbUtils.validateTableName(table)).not.toThrow();
          expect(dbUtils.validateTableName(table)).toBe(table);
        });
      });

      it('should reject unauthorized table names', () => {
        const unauthorizedTables = ['admin', 'secrets', 'config'];
        
        unauthorizedTables.forEach(table => {
          expect(() => dbUtils.validateTableName(table)).toThrow('Invalid table name');
          expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Attempted to access unauthorized table')
          );
        });
      });

      it('should handle case insensitivity', () => {
        expect(() => dbUtils.validateTableName('USERS')).not.toThrow();
        expect(dbUtils.validateTableName('Users')).toBe('users');
        expect(dbUtils.validateTableName('  LOOT  ')).toBe('loot');
      });

      it('should reject invalid table name formats', () => {
        const invalidNames = ['user-table', 'user table', 'user;DROP', '1users', ''];
        
        invalidNames.forEach(name => {
          expect(() => dbUtils.validateTableName(name)).toThrow();
        });
      });

      it('should reject non-string inputs', () => {
        const invalidInputs = [null, undefined, 123, {}, []];
        
        invalidInputs.forEach(input => {
          expect(() => dbUtils.validateTableName(input)).toThrow('Invalid table name: must be a non-empty string');
        });
      });

      it('should handle SQL injection attempts', () => {
        const sqlInjectionAttempts = [
          'users; DROP TABLE users;',
          'users/*comment*/',
          'users--comment',
          'users\' OR 1=1'
        ];
        
        sqlInjectionAttempts.forEach(attempt => {
          expect(() => dbUtils.validateTableName(attempt)).toThrow();
        });
      });
    });

    describe('validateColumnName', () => {
      it('should validate allowed column names in strict mode', () => {
        const allowedColumns = ['id', 'user_id', 'name', 'email'];
        
        allowedColumns.forEach(column => {
          expect(() => dbUtils.validateColumnName(column, true)).not.toThrow();
          expect(dbUtils.validateColumnName(column, true)).toBe(column);
        });
      });

      it('should allow any valid format in non-strict mode', () => {
        const validColumns = ['custom_field', 'data123', 'some_column'];
        
        validColumns.forEach(column => {
          expect(() => dbUtils.validateColumnName(column, false)).not.toThrow();
          expect(dbUtils.validateColumnName(column, false)).toBe(column);
        });
      });

      it('should reject unauthorized column names in strict mode', () => {
        const unauthorizedColumns = ['password_hash', 'secret_key'];
        
        unauthorizedColumns.forEach(column => {
          expect(() => dbUtils.validateColumnName(column, true)).toThrow('Invalid column name');
          expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Attempted to access unauthorized column')
          );
        });
      });

      it('should reject invalid column name formats', () => {
        const invalidNames = ['col-name', 'col name', 'col;DROP', 'col/**/'];
        
        invalidNames.forEach(name => {
          expect(() => dbUtils.validateColumnName(name)).toThrow('Invalid column name format');
          expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Invalid column name format')
          );
        });
      });

      it('should handle case insensitivity and trimming', () => {
        expect(dbUtils.validateColumnName('  ID  ', true)).toBe('id');
        expect(dbUtils.validateColumnName('USER_ID', true)).toBe('user_id');
      });

      it('should default to strict mode', () => {
        expect(() => dbUtils.validateColumnName('unauthorized_column')).toThrow('Invalid column name');
      });
    });

    describe('validateColumnNames', () => {
      it('should validate array of column names', () => {
        const columns = ['id', 'name', 'email'];
        const result = dbUtils.validateColumnNames(columns, true);
        expect(result).toEqual(columns);
      });

      it('should reject non-array input', () => {
        expect(() => dbUtils.validateColumnNames('not-array')).toThrow('Columns must be an array');
        expect(() => dbUtils.validateColumnNames(null)).toThrow('Columns must be an array');
      });

      it('should validate each column in the array', () => {
        const columns = ['id', 'invalid-column'];
        expect(() => dbUtils.validateColumnNames(columns, false)).toThrow('Invalid column name format');
      });
    });
  });

  describe('executeQuery', () => {
    it('should execute query successfully', async () => {
      const mockResult = { rows: [{ id: 1, name: 'Test' }] };
      mockClient.query.mockResolvedValue(mockResult);

      const result = await dbUtils.executeQuery('SELECT * FROM users', []);

      expect(pool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM users', []);
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe(mockResult);
    });

    it('should handle query parameters', async () => {
      const mockResult = { rows: [{ id: 1 }] };
      mockClient.query.mockResolvedValue(mockResult);

      await dbUtils.executeQuery('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
    });

    it('should log slow queries', async () => {
      const mockResult = { rows: [] };
      mockClient.query.mockImplementation(async () => {
        // Simulate slow query
        await new Promise(resolve => setTimeout(resolve, 1100));
        return mockResult;
      });

      await dbUtils.executeQuery('SELECT * FROM users');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Slow query')
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Connection failed');
      dbError.position = '15';
      mockClient.query.mockRejectedValue(dbError);

      await expect(dbUtils.executeQuery('SELECT * FROM users')).rejects.toThrow('Connection failed');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Database query error: Connection failed')
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle client release errors', async () => {
      const mockResult = { rows: [] };
      mockClient.query.mockResolvedValue(mockResult);
      mockClient.release.mockImplementation(() => {
        throw new Error('Release failed');
      });

      const result = await dbUtils.executeQuery('SELECT * FROM users');

      expect(result).toBe(mockResult);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to release database client')
      );
    });

    it('should use custom error message', async () => {
      const dbError = new Error('Custom error');
      mockClient.query.mockRejectedValue(dbError);

      await expect(
        dbUtils.executeQuery('SELECT * FROM users', [], 'Custom operation failed')
      ).rejects.toThrow('Custom error');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Custom operation failed: Custom error')
      );
    });

    it('should handle empty query parameters', async () => {
      const mockResult = { rows: [] };
      mockClient.query.mockResolvedValue(mockResult);

      await dbUtils.executeQuery('SELECT 1');

      expect(mockClient.query).toHaveBeenCalledWith('SELECT 1', []);
    });

    it('should truncate long queries in error logs', async () => {
      const longQuery = 'SELECT * FROM users WHERE ' + 'column = value AND '.repeat(50);
      const dbError = new Error('Query error');
      mockClient.query.mockRejectedValue(dbError);

      await expect(dbUtils.executeQuery(longQuery)).rejects.toThrow('Query error');

      const logCall = logger.error.mock.calls[0][0];
      expect(logCall).toContain('Query: ');
      expect(logCall.length).toBeLessThan(longQuery.length + 100); // Should be truncated
    });
  });

  describe('executeTransaction', () => {
    it('should execute transaction successfully', async () => {
      const mockCallback = jest.fn().mockResolvedValue({ success: true });
      mockClient.query.mockResolvedValue({}); // For BEGIN and COMMIT

      const result = await dbUtils.executeTransaction(mockCallback);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockCallback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should rollback on callback error', async () => {
      const callbackError = new Error('Callback failed');
      const mockCallback = jest.fn().mockRejectedValue(callbackError);
      mockClient.query.mockResolvedValue({}); // For BEGIN, ROLLBACK

      await expect(dbUtils.executeTransaction(mockCallback)).rejects.toThrow('Callback failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(logger.info).toHaveBeenCalledWith('Transaction rolled back successfully');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Transaction error: Callback failed')
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle rollback errors', async () => {
      const callbackError = new Error('Callback failed');
      const rollbackError = new Error('Rollback failed');
      const mockCallback = jest.fn().mockRejectedValue(callbackError);
      
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(rollbackError); // ROLLBACK fails

      await expect(dbUtils.executeTransaction(mockCallback)).rejects.toThrow('Callback failed');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to rollback transaction: Rollback failed')
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle client release errors in transaction', async () => {
      const mockCallback = jest.fn().mockResolvedValue({ success: true });
      mockClient.query.mockResolvedValue({});
      mockClient.release.mockImplementation(() => {
        throw new Error('Release failed');
      });

      const result = await dbUtils.executeTransaction(mockCallback);

      expect(result).toEqual({ success: true });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to release database client')
      );
    });

    it('should use custom error message', async () => {
      const callbackError = new Error('Custom error');
      const mockCallback = jest.fn().mockRejectedValue(callbackError);
      mockClient.query.mockResolvedValue({});

      await expect(
        dbUtils.executeTransaction(mockCallback, 'Custom transaction failed')
      ).rejects.toThrow('Custom error');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Custom transaction failed: Custom error')
      );
    });
  });

  describe('rowExists', () => {
    it('should return true when row exists', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ exists: true }] });

      const result = await dbUtils.rowExists('users', 'email', 'test@example.com');

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT EXISTS(SELECT 1 FROM "users" WHERE "email" = $1)',
        ['test@example.com']
      );
      expect(result).toBe(true);
    });

    it('should return false when row does not exist', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ exists: false }] });

      const result = await dbUtils.rowExists('users', 'email', 'nonexistent@example.com');

      expect(result).toBe(false);
    });

    it('should validate table and column names', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ exists: false }] });

      expect(() => dbUtils.rowExists('invalid_table', 'id', 1)).toThrow('Invalid table name');
      expect(() => dbUtils.rowExists('users', 'invalid-column', 1)).toThrow('Invalid column name format');
    });

    it('should handle different value types', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ exists: false }] });

      await dbUtils.rowExists('users', 'id', 123);
      await dbUtils.rowExists('users', 'active', true);
      await dbUtils.rowExists('users', 'name', null);

      expect(mockClient.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('getById', () => {
    it('should return row when found', async () => {
      const mockRow = { id: 1, name: 'Test User', email: 'test@example.com' };
      mockClient.query.mockResolvedValue({ rows: [mockRow] });

      const result = await dbUtils.getById('users', 1);

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "id" = $1',
        [1]
      );
      expect(result).toBe(mockRow);
    });

    it('should return null when not found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await dbUtils.getById('users', 999);

      expect(result).toBeNull();
    });

    it('should use custom id column', async () => {
      const mockRow = { uuid: 'abc-123', name: 'Test' };
      mockClient.query.mockResolvedValue({ rows: [mockRow] });

      await dbUtils.getById('users', 'abc-123', 'uuid');

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "uuid" = $1',
        ['abc-123']
      );
    });

    it('should validate inputs', async () => {
      expect(() => dbUtils.getById('invalid_table', 1)).toThrow('Invalid table name');
      expect(() => dbUtils.getById('users', 1, 'invalid-column')).toThrow('Invalid column name format');
    });
  });

  describe('updateById', () => {
    it('should update row successfully', async () => {
      const updateData = { name: 'Updated Name', email: 'updated@example.com' };
      const updatedRow = { id: 1, ...updateData };
      mockClient.query.mockResolvedValue({ rows: [updatedRow] });

      const result = await dbUtils.updateById('users', 1, updateData);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "users"'),
        [1, 'Updated Name', 'updated@example.com']
      );
      expect(result).toBe(updatedRow);
    });

    it('should filter out undefined values', async () => {
      const updateData = { name: 'Updated Name', email: undefined, status: 'active' };
      const updatedRow = { id: 1, name: 'Updated Name', status: 'active' };
      mockClient.query.mockResolvedValue({ rows: [updatedRow] });

      await dbUtils.updateById('users', 1, updateData);

      const query = mockClient.query.mock.calls[0][0];
      expect(query).not.toContain('email');
      expect(query).toContain('name');
      expect(query).toContain('status');
    });

    it('should return existing row when no data to update', async () => {
      const existingRow = { id: 1, name: 'Existing' };
      mockClient.query.mockResolvedValue({ rows: [existingRow] });

      const result = await dbUtils.updateById('users', 1, {});

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" WHERE "id" = $1',
        [1]
      );
      expect(result).toBe(existingRow);
    });

    it('should return null when row not found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await dbUtils.updateById('users', 999, { name: 'Test' });

      expect(result).toBeNull();
    });

    it('should use custom id column', async () => {
      const updatedRow = { uuid: 'abc-123', name: 'Updated' };
      mockClient.query.mockResolvedValue({ rows: [updatedRow] });

      await dbUtils.updateById('users', 'abc-123', { name: 'Updated' }, 'uuid');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE "uuid" = $1'),
        ['abc-123', 'Updated']
      );
    });

    it('should validate inputs', async () => {
      expect(() => dbUtils.updateById('invalid_table', 1, {})).toThrow('Invalid table name');
      expect(() => dbUtils.updateById('users', 1, {}, 'invalid-column')).toThrow('Invalid column name format');
    });
  });

  describe('insert', () => {
    it('should insert row successfully', async () => {
      const insertData = { name: 'New User', email: 'new@example.com' };
      const insertedRow = { id: 1, ...insertData };
      mockClient.query.mockResolvedValue({ rows: [insertedRow] });

      const result = await dbUtils.insert('users', insertData);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "users"'),
        ['New User', 'new@example.com']
      );
      expect(result).toBe(insertedRow);
    });

    it('should handle empty data', async () => {
      await expect(dbUtils.insert('users', {})).rejects.toThrow('No data provided for insert');
    });

    it('should quote column names properly', async () => {
      const insertData = { user_name: 'test', user_email: 'test@example.com' };
      const insertedRow = { id: 1, ...insertData };
      mockClient.query.mockResolvedValue({ rows: [insertedRow] });

      await dbUtils.insert('users', insertData);

      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain('"user_name"');
      expect(query).toContain('"user_email"');
    });

    it('should validate table name', async () => {
      expect(() => dbUtils.insert('invalid_table', { name: 'test' })).toThrow('Invalid table name');
    });

    it('should validate column names', async () => {
      expect(() => dbUtils.insert('users', { 'invalid-column': 'test' })).toThrow('Invalid column name format');
    });
  });

  describe('deleteById', () => {
    it('should delete row successfully', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });

      const result = await dbUtils.deleteById('users', 1);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM "users"'),
        [1]
      );
      expect(result).toBe(true);
    });

    it('should return false when row not found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await dbUtils.deleteById('users', 999);

      expect(result).toBe(false);
    });

    it('should use custom id column', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ uuid: 'abc-123' }] });

      await dbUtils.deleteById('users', 'abc-123', 'uuid');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE "uuid" = $1'),
        ['abc-123']
      );
    });

    it('should validate inputs', async () => {
      expect(() => dbUtils.deleteById('invalid_table', 1)).toThrow('Invalid table name');
      expect(() => dbUtils.deleteById('users', 1, 'invalid-column')).toThrow('Invalid column name format');
    });
  });

  describe('getMany', () => {
    it('should get multiple rows with default options', async () => {
      const mockRows = [{ id: 1, name: 'User 1' }, { id: 2, name: 'User 2' }];
      mockClient.query
        .mockResolvedValueOnce({ rows: mockRows })
        .mockResolvedValueOnce({ rows: [{ count: '10' }] });

      const result = await dbUtils.getMany('users');

      expect(result).toEqual({
        rows: mockRows,
        count: 10
      });
    });

    it('should apply limit and offset', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await dbUtils.getMany('users', { limit: 25, offset: 50 });

      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain('LIMIT $1 OFFSET $2');
      expect(mockClient.query.mock.calls[0][1]).toEqual([25, 50]);
    });

    it('should apply order by', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await dbUtils.getMany('users', { 
        orderBy: { column: 'name', direction: 'DESC' }
      });

      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain('ORDER BY "name" DESC');
    });

    it('should apply where conditions', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await dbUtils.getMany('users', { 
        where: { status: 'active', role: 'player' }
      });

      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain('WHERE "status" = $3 AND "role" = $4');
      expect(mockClient.query.mock.calls[0][1]).toEqual([50, 0, 'active', 'player']);
    });

    it('should validate order by direction', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await dbUtils.getMany('users', { 
        orderBy: { column: 'id', direction: 'INVALID' }
      });

      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain('ORDER BY "id" ASC'); // Should default to ASC
    });

    it('should validate table name', async () => {
      expect(() => dbUtils.getMany('invalid_table')).toThrow('Invalid table name');
    });

    it('should validate column names in orderBy and where', async () => {
      expect(() => dbUtils.getMany('users', { 
        orderBy: { column: 'invalid-column', direction: 'ASC' }
      })).toThrow('Invalid column name format');

      expect(() => dbUtils.getMany('users', { 
        where: { 'invalid-column': 'value' }
      })).toThrow('Invalid column name format');
    });

    it('should handle empty where conditions', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await dbUtils.getMany('users', { where: {} });

      const query = mockClient.query.mock.calls[0][0];
      expect(query).not.toContain('WHERE');
    });
  });

  describe('Security and Edge Cases', () => {
    it('should prevent SQL injection in table names', async () => {
      const maliciousTable = 'users; DROP TABLE users; --';
      expect(() => dbUtils.getById(maliciousTable, 1)).toThrow('Invalid table name format');
    });

    it('should prevent SQL injection in column names', async () => {
      const maliciousColumn = 'id; DROP TABLE users; --';
      expect(() => dbUtils.getById('users', 1, maliciousColumn)).toThrow('Invalid column name format');
    });

    it('should handle special characters in data values safely', async () => {
      const insertData = {
        name: "O'Reilly",
        description: 'Text with "quotes" and <tags>',
        unicode: 'Unicode: ñáéíóú 中文'
      };
      const insertedRow = { id: 1, ...insertData };
      mockClient.query.mockResolvedValue({ rows: [insertedRow] });

      const result = await dbUtils.insert('users', insertData);

      expect(result).toBe(insertedRow);
      // Values should be passed as parameters, not interpolated
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        Object.values(insertData)
      );
    });

    it('should handle null and undefined values correctly', async () => {
      const insertData = {
        name: 'Test',
        optional_field: null,
        undefined_field: undefined
      };
      
      // Update should filter out undefined
      mockClient.query.mockResolvedValue({ rows: [] });
      await dbUtils.updateById('users', 1, insertData);
      
      const updateQuery = mockClient.query.mock.calls[0][0];
      expect(updateQuery).toContain('name');
      expect(updateQuery).toContain('optional_field');
      expect(updateQuery).not.toContain('undefined_field');
    });

    it('should handle large datasets efficiently', async () => {
      const largeResult = Array.from({ length: 10000 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` }));
      mockClient.query
        .mockResolvedValueOnce({ rows: largeResult })
        .mockResolvedValueOnce({ rows: [{ count: '10000' }] });

      const result = await dbUtils.getMany('users', { limit: 10000 });

      expect(result.rows).toHaveLength(10000);
      expect(result.count).toBe(10000);
    });

    it('should handle concurrent database operations', async () => {
      const mockResults = [
        { rows: [{ id: 1, name: 'User 1' }] },
        { rows: [{ id: 2, name: 'User 2' }] },
        { rows: [{ id: 3, name: 'User 3' }] }
      ];

      mockClient.query
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1])
        .mockResolvedValueOnce(mockResults[2]);

      const promises = [
        dbUtils.getById('users', 1),
        dbUtils.getById('users', 2),
        dbUtils.getById('users', 3)
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results[0]).toBe(mockResults[0].rows[0]);
      expect(results[1]).toBe(mockResults[1].rows[0]);
      expect(results[2]).toBe(mockResults[2].rows[0]);
    });

    it('should handle database connection failures gracefully', async () => {
      pool.connect.mockRejectedValue(new Error('Connection pool exhausted'));

      await expect(dbUtils.getById('users', 1)).rejects.toThrow('Connection pool exhausted');
    });

    it('should validate exported constants', () => {
      expect(dbUtils.ALLOWED_TABLES).toBeInstanceOf(Set);
      expect(dbUtils.ALLOWED_COLUMNS).toBeInstanceOf(Set);
      expect(dbUtils.ALLOWED_TABLES.has('users')).toBe(true);
      expect(dbUtils.ALLOWED_COLUMNS.has('id')).toBe(true);
    });
  });
});