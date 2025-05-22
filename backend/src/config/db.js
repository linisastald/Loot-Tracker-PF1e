/**
 * Database connection configuration
 * This module provides a configured PostgreSQL pool for database connections
 */
const { Pool } = require('pg');
const logger = require('../utils/logger');
const { DATABASE } = require('./constants');
require('dotenv').config();

// Create a new PostgreSQL connection pool with configuration from environment variables
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    // Connection timeout in milliseconds
    connectionTimeoutMillis: DATABASE.CONNECTION_TIMEOUT,
    // Maximum number of clients in the pool
    max: DATABASE.MAX_CONNECTIONS,
    // Idle timeout in milliseconds
    idleTimeoutMillis: DATABASE.IDLE_TIMEOUT
});

// Log connection events for debugging
pool.on('connect', (client) => {
    logger.debug('New client connected to PostgreSQL pool');
});

pool.on('acquire', (client) => {
    logger.debug('Client acquired from PostgreSQL pool');
});

pool.on('remove', (client) => {
    logger.debug('Client removed from PostgreSQL pool');
});

pool.on('error', (err, client) => {
    logger.error('Unexpected error on idle PostgreSQL client', {
        error: err.message,
        stack: err.stack,
        processId: client?.processID
    });
    
    // If this is a connection-related error, we might want to recreate the pool
    if (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        logger.warn('Connection-related error detected, pool may need attention');
    }
});

/**
 * Verify database connection
 * @return {Promise<boolean>} - Connection successful
 */
const testConnection = async () => {
    const client = await pool.connect();
    try {
        await client.query('SELECT NOW()');
        logger.info('Database connection successful');
        return true;
    } catch (error) {
        logger.error('Database connection error:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Test the connection when this module is first imported
// This can be commented out if you don't want automatic testing on import
testConnection().catch((error) => {
    logger.error('Initial database connection test failed. Check database configuration.', {
        error: error.message,
        stack: error.stack
    });
    // Don't exit process here, let the application handle it
});

module.exports = pool;

// Export pool methods for monitoring
module.exports.getPoolStatus = () => ({
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
});