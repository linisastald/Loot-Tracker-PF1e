/**
 * Shared pg Pool configuration for config/db.js (application pool) and
 * config/adminDb.js (owner pool for the migration runner), so connection
 * settings cannot drift between them. Only the credentials and pool size differ.
 */
const { DATABASE } = require('./constants');

/**
 * @param {Object} options
 * @param {string} options.user - Database role
 * @param {string} options.password - Password for that role
 * @param {number} options.max - Maximum clients in the pool
 * @returns {Object} - pg Pool configuration
 */
const buildPoolConfig = ({ user, password, max }) => ({
    user,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password,
    port: process.env.DB_PORT,
    connectionTimeoutMillis: DATABASE.CONNECTION_TIMEOUT,
    max,
    idleTimeoutMillis: DATABASE.IDLE_TIMEOUT
});

/**
 * Whether the app pool runs as the dedicated non-owner role (so row-level security is
 * enforced). Both variables must be set; otherwise config/db.js falls back to the
 * owner credentials. Shared with the production startup checks.
 * @param {Object} env - process.env (or a stand-in)
 * @returns {boolean}
 */
const usesAppRole = (env) => Boolean(env.DB_APP_USER && env.DB_APP_PASSWORD);

module.exports = { buildPoolConfig, usesAppRole };
