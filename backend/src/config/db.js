/**
 * Database connection configuration
 * This module provides a configured PostgreSQL pool for database connections
 */
const { Pool } = require('pg');
const logger = require('../utils/logger');
require('dotenv').config();

// Create a new PostgreSQL connection pool with configuration from environment variables
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    // Connection timeout in milliseconds
    connectionTimeoutMillis: 10000,
    // Maximum number of clients in the pool
    max: 20,
    // Idle timeout in milliseconds
    idleTimeoutMillis: 30000
});

// Log connection events for debugging
pool.on('connect', () => {
    logger.info('New client connected to PostgreSQL pool');
});

pool.on('error', (err) => {
    logger.error('Unexpected error on idle PostgreSQL client', err);
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
testConnection().catch(() => {
    logger.error('Initial database connection test failed. Check database configuration.');
});

module.exports = pool;