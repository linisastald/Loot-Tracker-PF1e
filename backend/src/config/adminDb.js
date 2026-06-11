/**
 * Admin (owner) database connection for the migration runner.
 *
 * Migrations must run as the database owner (DDL, RLS policy management),
 * while the application pool (config/db.js) may run as a restricted app role
 * so row-level security is enforced. This module ALWAYS uses the owner
 * credentials (DB_USER / DB_PASSWORD) regardless of DB_APP_USER settings, and
 * is deliberately never tenant-scoped — do not route it through dbUtils.
 *
 * The pool is created lazily on first use so merely requiring this module
 * (e.g. in unit tests) opens no connections. It exposes a pool-like facade
 * (query/connect/end) used only by the migration runner at startup.
 */
const { Pool } = require('pg');
const logger = require('../utils/logger');
const { DATABASE } = require('./constants');
require('dotenv').config();

/** Migrations run sequentially at startup; a few connections are plenty. */
const ADMIN_MAX_CONNECTIONS = 3;

let adminPool = null;

/**
 * Get (lazily creating) the admin connection pool.
 * @returns {Pool} - pg Pool connected with owner credentials
 */
const getAdminPool = () => {
    if (!adminPool) {
        adminPool = new Pool({
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT,
            connectionTimeoutMillis: DATABASE.CONNECTION_TIMEOUT,
            max: ADMIN_MAX_CONNECTIONS,
            idleTimeoutMillis: DATABASE.IDLE_TIMEOUT
        });

        adminPool.on('error', (err) => {
            logger.error('Unexpected error on idle admin PostgreSQL client', {
                error: err.message,
                stack: err.stack
            });
        });

        logger.info('Admin database pool created (owner credentials, migration runner only)');
    }
    return adminPool;
};

module.exports = {
    getAdminPool,
    /**
     * Run a query on the admin pool.
     * @param {...any} args - Same arguments as pg Pool#query
     * @returns {Promise<Object>} - Query result
     */
    query: (...args) => getAdminPool().query(...args),
    /**
     * Check out a client from the admin pool. Caller must release it.
     * @returns {Promise<Object>} - pg client
     */
    connect: () => getAdminPool().connect(),
    /**
     * Close the admin pool if it was created.
     * @returns {Promise<void>}
     */
    end: () => (adminPool ? adminPool.end() : Promise.resolve())
};
