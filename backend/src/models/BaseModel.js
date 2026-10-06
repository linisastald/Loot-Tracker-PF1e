// src/models/BaseModel.js
const dbUtils = require('../utils/dbUtils');

/**
 * Base model class with common CRUD operations
 */
class BaseModel {
  /**
   * Constructor for BaseModel
   * @param {Object} config - Configuration for the model
   * @param {string} config.tableName - Name of the database table
   * @param {string} config.primaryKey - Name of the primary key column (default: 'id')
   * @param {Object} config.timestamps - Configuration for timestamps
   * @param {boolean} config.timestamps.createdAt - Whether to use a created_at column
   * @param {boolean} config.timestamps.updatedAt - Whether to use an updated_at column
   */
  constructor(config) {
    this.tableName = config.tableName;
    this.primaryKey = config.primaryKey || 'id';
    this.timestamps = config.timestamps || { createdAt: false, updatedAt: false };
  }

  /**
   * Create a new record
   * @param {Object} data - The data to insert
   * @return {Promise<Object>} - The created record
   */
  async create(data) {
    const insertData = { ...data };

    // Add timestamps if configured
    if (this.timestamps.createdAt) {
      insertData.created_at = new Date();
    }
    if (this.timestamps.updatedAt) {
      insertData.updated_at = new Date();
    }

    return await dbUtils.insert(this.tableName, insertData);
  }

  /**
   * Find a record by ID
   * @param {number|string} id - The ID to search for
   * @return {Promise<Object|null>} - The found record or null
   */
  async findById(id) {
    return await dbUtils.getById(this.tableName, id, this.primaryKey);
  }

  /**
   * Update a record
   * @param {number|string} id - The ID of the record to update
   * @param {Object} data - The data to update
   * @return {Promise<Object|null>} - The updated record or null
   */
  async update(id, data) {
    const updateData = { ...data };

    // Add updated timestamp if configured
    if (this.timestamps.updatedAt) {
      updateData.updated_at = new Date();
    }

    return await dbUtils.updateById(this.tableName, id, updateData, this.primaryKey);
  }

  /**
   * Delete a record
   * @param {number|string} id - The ID of the record to delete
   * @return {Promise<boolean>} - Whether the deletion was successful
   */
  async delete(id) {
    return await dbUtils.deleteById(this.tableName, id, this.primaryKey);
  }

}

module.exports = BaseModel;